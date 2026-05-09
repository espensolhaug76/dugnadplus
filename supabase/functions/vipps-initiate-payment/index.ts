// vipps-initiate-payment
// =============================================================
// Steg 1 i Vipps ePayment-flyt:
//   1. Validér input + lotteri
//   2. Generer vipps_reference
//   3. INSERT lottery_sales-rad med status='CREATED'
//   4. Kall Vipps POST /epayment/v1/payments
//   5. Returnér redirectUrl til frontend
//
// Fail-fast: Hvis Vipps returnerer 401/403 (ugyldig MSN eller
// manglende ePayment-tilgang), markerer vi lotteriet med
// vipps_validation_error, sender push-varsel til DA, og
// returnerer { valid: false, reason: 'merchant_invalid' } slik
// at frontend kan vise "Lotteriet er midlertidig utilgjengelig".
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { vippsFetch, corsResponse, handleOptions } from '../_shared/vipps-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const FRONTEND_BASE_URL =
  Deno.env.get('FRONTEND_BASE_URL') || 'https://dugnadpluss.netlify.app';

interface InitiateInput {
  lottery_id: string;
  seller_family_id: string | null;
  buyer_name: string;
  buyer_phone: string;
  tickets: number;
  amount_nok: number;
}

function validateInput(b: any): InitiateInput | { error: string } {
  if (!b || typeof b !== 'object') return { error: 'Body må være JSON-objekt' };
  if (typeof b.lottery_id !== 'string' || !b.lottery_id) return { error: 'lottery_id mangler' };
  if (typeof b.buyer_name !== 'string' || !b.buyer_name.trim()) return { error: 'buyer_name mangler' };
  if (typeof b.buyer_phone !== 'string' || !/^\d{8}$/.test(b.buyer_phone))
    return { error: 'buyer_phone må være 8 sifre' };
  if (!Number.isInteger(b.tickets) || b.tickets <= 0)
    return { error: 'tickets må være positivt heltall' };
  if (!Number.isFinite(b.amount_nok) || b.amount_nok <= 0)
    return { error: 'amount_nok må være > 0' };
  return {
    lottery_id: b.lottery_id,
    seller_family_id: typeof b.seller_family_id === 'string' && b.seller_family_id ? b.seller_family_id : null,
    buyer_name: b.buyer_name.trim(),
    buyer_phone: b.buyer_phone,
    tickets: b.tickets,
    amount_nok: b.amount_nok,
  };
}

// Sender push-varsel til alle koordinatorer for klubben.
// Bruker eksisterende send-push Edge Function.
async function notifyCoordinatorOfFailure(teamId: string | null, lotteryName: string) {
  if (!teamId) return;
  try {
    const { data: members } = await supabase
      .from('team_members')
      .select('auth_user_id, family_id')
      .eq('team_id', teamId)
      .in('role', ['coordinator', 'club_admin']);

    if (!members || members.length === 0) return;

    const familyIds = Array.from(new Set(members.map((m: any) => m.family_id).filter(Boolean)));
    const title = 'Vipps-betaling feilet';
    const body =
      `Vipps-nummeret på lotteriet "${lotteryName}" fungerer ikke. ` +
      `Sjekk at det er riktig 5–7-sifret Salgssted-nummer med ` +
      `Payment Integration aktivert.`;

    await Promise.allSettled(
      familyIds.map((family_id) =>
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ family_id, title, body, url: '/lottery-admin' }),
        })
      )
    );
  } catch (e) {
    console.error('[initiate] notifyCoordinator failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return corsResponse({ error: 'Method not allowed' }, 405);

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return corsResponse({ error: 'Invalid JSON' }, 400);
  }

  const v = validateInput(raw);
  if ('error' in v) return corsResponse({ error: v.error }, 400);

  // Hent lotteri (service_role, bypasser RLS)
  const { data: lottery, error: lotteryErr } = await supabase
    .from('lotteries')
    .select('id, name, ticket_price, vipps_number, is_active, team_id, vipps_validation_failed_at')
    .eq('id', v.lottery_id)
    .maybeSingle();

  if (lotteryErr || !lottery) {
    return corsResponse({ error: 'Lotteriet finnes ikke' }, 404);
  }
  if (!lottery.is_active) {
    return corsResponse({ error: 'Lotteriet er ikke aktivt' }, 400);
  }
  if (!lottery.vipps_number) {
    return corsResponse({ error: 'Lotteriet mangler Vipps-nummer' }, 400);
  }
  if (lottery.vipps_validation_failed_at) {
    return corsResponse({
      error: 'Lotteriet er midlertidig utilgjengelig. Klubben er varslet.',
      reason: 'merchant_invalid',
    }, 503);
  }

  // Validér beløp
  const expected = lottery.ticket_price * v.tickets;
  if (expected !== v.amount_nok) {
    return corsResponse({
      error: `Beløp stemmer ikke. Forventet ${expected} NOK for ${v.tickets} lodd.`,
    }, 400);
  }

  // Generer reference og INSERT rad
  const vippsReference = `lottery-${crypto.randomUUID()}`;
  const { error: insertErr } = await supabase
    .from('lottery_sales')
    .insert({
      lottery_id: v.lottery_id,
      seller_family_id: v.seller_family_id,
      buyer_name: v.buyer_name,
      buyer_phone: v.buyer_phone,
      tickets: v.tickets,
      amount: v.amount_nok,
      status: 'CREATED',
      vipps_reference: vippsReference,
      payment_method: 'vipps',
    });

  if (insertErr) {
    console.error('[initiate] insert failed:', insertErr);
    return corsResponse({ error: 'Kunne ikke registrere kjøpet' }, 500);
  }

  // Bygg returnUrl tilbake til lottery-shop med reference
  const sellerParam = v.seller_family_id ? `&seller=${v.seller_family_id}` : '';
  const returnUrl =
    `${FRONTEND_BASE_URL}/lottery-shop?reference=${vippsReference}${sellerParam}`;

  // Kall Vipps ePayment
  const vippsBody = {
    amount: { value: v.amount_nok * 100, currency: 'NOK' },
    paymentMethod: { type: 'WALLET' },
    reference: vippsReference,
    userFlow: 'WEB_REDIRECT',
    returnUrl,
    paymentDescription: `Lodd ${v.buyer_name}`.slice(0, 100),
    customer: { phoneNumber: '47' + v.buyer_phone },
  };

  const vippsResp = await vippsFetch('/epayment/v1/payments', 'POST', {
    msn: lottery.vipps_number,
    idempotencyKey: vippsReference,
    body: vippsBody,
  });

  // Fail-fast: 401/403 betyr ugyldig MSN eller manglende ePayment-tilgang
  if (vippsResp.status === 401 || vippsResp.status === 403) {
    const reason = `Vipps avviste MSN ${lottery.vipps_number}: HTTP ${vippsResp.status}`;
    console.error('[initiate] merchant_invalid:', reason, vippsResp.data);

    // Marker lotteri + oppdater rad til FAILED
    await supabase
      .from('lotteries')
      .update({
        vipps_validation_failed_at: new Date().toISOString(),
        vipps_validation_error: reason,
      })
      .eq('id', lottery.id);

    await supabase
      .from('lottery_sales')
      .update({
        status: 'FAILED',
        failure_reason: reason,
      })
      .eq('vipps_reference', vippsReference);

    // Logg event for sporbarhet
    await supabase.from('vipps_webhook_events').insert({
      vipps_reference: vippsReference,
      event_name: 'validation_failed',
      payload: { status: vippsResp.status, response: vippsResp.data },
      result: 'merchant_invalid',
    });

    // Notify DA via push (fire-and-forget)
    notifyCoordinatorOfFailure(lottery.team_id, lottery.name).catch((e) =>
      console.error('[initiate] push failed:', e)
    );

    return corsResponse({
      error: 'Lotteriet er midlertidig utilgjengelig. Klubben er varslet og fikser saken.',
      reason: 'merchant_invalid',
    }, 503);
  }

  if (!vippsResp.ok) {
    const reason = `Vipps API-feil: HTTP ${vippsResp.status}`;
    console.error('[initiate] vipps error:', reason, vippsResp.data);

    await supabase
      .from('lottery_sales')
      .update({
        status: 'FAILED',
        failure_reason: reason,
      })
      .eq('vipps_reference', vippsReference);

    return corsResponse({
      error: 'Kunne ikke starte Vipps-betaling. Prøv igjen om litt.',
      reason: 'vipps_error',
      details: vippsResp.data,
    }, 502);
  }

  const { redirectUrl } = vippsResp.data;
  if (!redirectUrl) {
    return corsResponse({ error: 'Vipps returnerte ingen redirectUrl' }, 502);
  }

  return corsResponse({
    redirectUrl,
    vipps_reference: vippsReference,
  });
});
