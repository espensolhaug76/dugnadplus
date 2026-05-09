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

// HMAC-SHA256 verifisering per Vipps Webhooks v1 spec.
// Vipps signerer ikke rå body, men en konstruert signatureText:
//   POST\n{pathAndQuery}\n{x-ms-date};{host};{contentHash}
// hvor contentHash = base64(SHA-256(rawBody)).
//
// Selve signaturen kommer i Authorization-headeren, ikke X-Ms-Signature
// (som ikke finnes). Format: "HMAC-SHA256 SignedHeaders=...&Signature={base64}"
//
// Returnerer { valid, reason } så vi kan logge konkret feilårsak
// (debugging på tvers av pilot-test-runder).

interface SigResult { valid: boolean; reason?: string; }

// Vipps signerer mot den EKSTERNE URL-en webhooken ble registrert med:
//   https://<ref>.functions.supabase.co/vipps-webhook
// dvs. path = "/vipps-webhook" (uten /functions/v1-prefiks).
//
// Inni Edge Function kan req.url returnere enten den interne formen
// (/functions/v1/vipps-webhook) eller eksterne (/vipps-webhook)
// avhengig av hvordan Supabase' gateway proxy-er. Vi prøver derfor
// EXPECTED_PATH først, og req.url-pathen som fallback.
const EXPECTED_PATH = '/vipps-webhook';

async function sha256Base64(input: Uint8Array | string): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Constant-time string compare for å unngå timing-leakage på secret.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Trekk ut Signature={base64} fra "HMAC-SHA256 SignedHeaders=...&Signature=XYZ"
function extractSignatureFromAuth(auth: string): string | null {
  const m = auth.match(/Signature=([A-Za-z0-9+/=]+)/);
  return m ? m[1] : null;
}

async function verifyVippsSignature(
  req: Request,
  rawBody: string
): Promise<SigResult> {
  if (!WEBHOOK_SECRET) return { valid: false, reason: 'no_secret_configured' };

  const date = req.headers.get('x-ms-date');
  const contentHashHeader = req.headers.get('x-ms-content-sha256');
  const auth = req.headers.get('authorization');
  if (!date || !contentHashHeader || !auth) {
    return { valid: false, reason: 'missing_headers' };
  }

  const providedSig = extractSignatureFromAuth(auth);
  if (!providedSig) return { valid: false, reason: 'malformed_authorization' };

  // Verifiser at contentHash matcher body
  const computedHash = await sha256Base64(rawBody);
  if (!constantTimeEqual(computedHash, contentHashHeader)) {
    console.error('[webhook] content hash mismatch', { computedHash, header: contentHashHeader });
    return { valid: false, reason: 'content_hash_mismatch' };
  }

  // Host: behold preferering x-forwarded-host > host > url.host.
  // Skal IKKE hardkodes — kommer fra request-headerne så koden
  // overlever URL-/prosjekt-flytting.
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host')
            || req.headers.get('host')
            || url.host;

  // Prøv EXPECTED_PATH først (det Vipps registrerte mot), deretter
  // req.url-pathen som fallback. Tar med search hvis req.url har det.
  const reqPath = url.pathname + url.search;
  const candidatePaths = [EXPECTED_PATH];
  if (reqPath !== EXPECTED_PATH) candidatePaths.push(reqPath);

  let lastExpected = '';
  for (const path of candidatePaths) {
    const signatureText = `POST\n${path}\n${date};${host};${contentHashHeader}`;
    const expected = await hmacSha256Base64(WEBHOOK_SECRET, signatureText);
    lastExpected = expected;
    if (constantTimeEqual(expected, providedSig)) {
      console.log(`[webhook] signature OK using path="${path}" host="${host}"`);
      return { valid: true };
    }
  }

  // Ingen path matchet. Logg alt vi har for første-runde-debugging.
  const trunc = (s: string) => s.slice(0, 16);
  const debug =
    `signature_mismatch:expected=${trunc(lastExpected)}:received=${trunc(providedSig)}` +
    `:path=${reqPath}:host=${host}:date=${date}`;
  console.error('[webhook]', debug, {
    tried_paths: candidatePaths,
    expected_len: lastExpected.length,
    provided_len: providedSig.length,
  });
  return { valid: false, reason: debug };
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
  // Logg hele Authorization-headeren (inneholder SignedHeaders + Signature)
  // for debugging. Se verifyVippsSignature for hvordan den parses.
  const authHeader = req.headers.get('authorization') || '';

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Logg likevel for debugging
    await supabase.from('vipps_webhook_events').insert({
      vipps_reference: 'unknown',
      event_name: 'parse_error',
      payload: { raw: rawBody.slice(0, 1000) },
      signature: authHeader,
      signature_valid: false,
      result: 'invalid_json',
    });
    return corsResponse({ error: 'Invalid JSON' }, 400);
  }

  const reference: string = payload?.reference || 'unknown';
  const eventName: string = payload?.name || payload?.eventName || 'unknown';

  // Verifisér signatur. Logg uansett (også ved invalid).
  const sigCheck = await verifyVippsSignature(req, rawBody);

  // Logg eventet før vi prosesserer (for debugging selv ved feil)
  const { data: eventLog } = await supabase
    .from('vipps_webhook_events')
    .insert({
      vipps_reference: reference,
      event_name: eventName,
      payload,
      signature: authHeader,
      signature_valid: sigCheck.valid,
      result: 'pending',
    })
    .select('id')
    .single();

  const updateLog = (result: string) =>
    eventLog?.id
      ? supabase.from('vipps_webhook_events').update({ result }).eq('id', eventLog.id)
      : Promise.resolve();

  if (!sigCheck.valid) {
    // Konkret årsak istedenfor generisk 'invalid_signature'
    await updateLog(sigCheck.reason || 'invalid_signature');
    return corsResponse({ error: 'Invalid signature', reason: sigCheck.reason }, 401);
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
