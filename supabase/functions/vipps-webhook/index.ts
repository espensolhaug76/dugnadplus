// vipps-webhook
// =============================================================
// Vipps kaller dette endepunktet ved status-endringer på betaling.
//
// Sannhetskilde: webhook-events oppdaterer lottery_sales.status
// idempotent (status går aldri "tilbake" — CAPTURED skal ikke
// overskrives av AUTHORIZED hvis events kommer i feil rekkefølge).
//
// Når vi mottar AUTHORIZED, trigger vi auto-capture umiddelbart
// (forretnings-beslutning A2 — dugnad-loddsalg har ingen
// returperiode). Vipps sender deretter en separat CAPTURED-webhook.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { vippsFetch, corsResponse, handleOptions } from '../_shared/vipps-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const WEBHOOK_SECRET = Deno.env.get('VIPPS_WEBHOOK_SECRET') || '';

// Status-rangering: høyere tall er "lenger fremme" i flyten.
// CAPTURED skal ikke overskrives av AUTHORIZED.
const STATUS_RANK: Record<string, number> = {
  CREATED: 0,
  AUTHORIZED: 10,
  CAPTURED: 20,
  REFUNDED: 25,
  CANCELLED: 30,
  EXPIRED: 30,
  TERMINATED: 30,
  FAILED: 30,
};

// Vipps event_name → vår status
function mapVippsEvent(eventName: string): string | null {
  // Eventer kommer som "epayments.payment.authorized.v1" — ta nest siste segment
  const parts = eventName.split('.');
  const action = parts.length >= 2 ? parts[parts.length - 2].toUpperCase() : eventName.toUpperCase();
  switch (action) {
    case 'AUTHORIZED': return 'AUTHORIZED';
    case 'CAPTURED': return 'CAPTURED';
    case 'CANCELLED':
    case 'ABORTED': return 'CANCELLED';
    case 'EXPIRED': return 'EXPIRED';
    case 'TERMINATED': return 'TERMINATED';
    case 'REFUNDED': return 'REFUNDED';
    case 'CREATED': return 'CREATED';
    default: return null;
  }
}

// HMAC-SHA256 verifisering. Vipps signerer body med shared secret.
async function verifyHmacSignature(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    // Constant-time-ish sammenligning
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (e) {
    console.error('[webhook] HMAC verify error:', e);
    return false;
  }
}

async function autoCapture(
  vippsReference: string,
  msn: string,
  amountMinor: number
): Promise<void> {
  console.log(`[webhook] auto-capture for ${vippsReference}`);
  const resp = await vippsFetch(
    `/epayment/v1/payments/${vippsReference}/capture`,
    'POST',
    {
      msn,
      idempotencyKey: `${vippsReference}-capture`,
      body: { modificationAmount: { value: amountMinor, currency: 'NOK' } },
    }
  );
  if (!resp.ok) {
    console.warn(`[webhook] capture failed for ${vippsReference}: HTTP ${resp.status}`, resp.data);
    // Vi gjør ingenting — AUTHORIZED-status beholdes, manuell capture
    // kan håndteres senere fra DA-admin.
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return corsResponse({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get('X-Ms-Signature') || req.headers.get('x-ms-signature') || '';

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Logg likevel for debugging
    await supabase.from('vipps_webhook_events').insert({
      vipps_reference: 'unknown',
      event_name: 'parse_error',
      payload: { raw: rawBody.slice(0, 1000) },
      signature,
      signature_valid: false,
      result: 'invalid_json',
    });
    return corsResponse({ error: 'Invalid JSON' }, 400);
  }

  const reference: string = payload?.reference || 'unknown';
  const eventName: string = payload?.name || payload?.eventName || 'unknown';

  // Verifisér signatur. Logg uansett (også ved invalid).
  const sigValid = await verifyHmacSignature(rawBody, signature);

  // Logg eventet før vi prosesserer (for debugging selv ved feil)
  const { data: eventLog } = await supabase
    .from('vipps_webhook_events')
    .insert({
      vipps_reference: reference,
      event_name: eventName,
      payload,
      signature,
      signature_valid: sigValid,
      result: 'pending',
    })
    .select('id')
    .single();

  const updateLog = (result: string) =>
    eventLog?.id
      ? supabase.from('vipps_webhook_events').update({ result }).eq('id', eventLog.id)
      : Promise.resolve();

  if (!sigValid) {
    await updateLog('invalid_signature');
    return corsResponse({ error: 'Invalid signature' }, 401);
  }

  const newStatus = mapVippsEvent(eventName);
  if (!newStatus) {
    await updateLog('unknown_event');
    return corsResponse({ ok: true, ignored: true });
  }

  // Slå opp eksisterende rad
  const { data: sale } = await supabase
    .from('lottery_sales')
    .select('id, status, amount, lottery_id, lotteries(vipps_number)')
    .eq('vipps_reference', reference)
    .maybeSingle();

  if (!sale) {
    await updateLog('unknown_reference');
    // Vipps krever 2xx for ikke å retry — vi har logget for debug
    return corsResponse({ ok: true, ignored: true });
  }

  // Idempotens: bare oppdater hvis ny status er "fremover"
  const currentRank = STATUS_RANK[sale.status] ?? -1;
  const newRank = STATUS_RANK[newStatus] ?? -1;

  if (newRank < currentRank) {
    await updateLog('no_change');
    return corsResponse({ ok: true, no_change: true });
  }

  // Bygg UPDATE-payload
  const update: Record<string, any> = { status: newStatus };
  const pspRef = payload?.pspReference;
  if (pspRef) update.vipps_psp_reference = pspRef;
  if (payload?.paymentMethod?.type) update.vipps_payment_method = payload.paymentMethod.type;

  const nowIso = new Date().toISOString();
  if (newStatus === 'AUTHORIZED') update.authorized_at = nowIso;
  if (newStatus === 'CAPTURED') update.captured_at = nowIso;
  if (newStatus === 'CANCELLED' || newStatus === 'TERMINATED') update.cancelled_at = nowIso;

  const { error: updErr } = await supabase
    .from('lottery_sales')
    .update(update)
    .eq('vipps_reference', reference);

  if (updErr) {
    console.error('[webhook] update failed:', updErr);
    await updateLog('error');
    return corsResponse({ error: 'DB update failed' }, 500);
  }

  await updateLog('updated');

  // Auto-capture ved AUTHORIZED
  if (newStatus === 'AUTHORIZED' && sale.status !== 'CAPTURED') {
    const msn = (sale as any).lotteries?.vipps_number;
    if (msn) {
      // Fire-and-forget — Vipps sender egen CAPTURED-webhook ved suksess
      autoCapture(reference, msn, sale.amount * 100).catch((e) =>
        console.error('[webhook] auto-capture error:', e)
      );
    } else {
      console.warn(`[webhook] no MSN for auto-capture of ${reference}`);
    }
  }

  return corsResponse({ ok: true, status: newStatus });
});
