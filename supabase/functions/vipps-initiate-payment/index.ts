// vipps-initiate-payment
// =============================================================
// Steg 1 i Vipps ePayment-flyt for lottery, kiosk og salgskampanje:
//   1. Validér input + kilde-spesifikk lookup (lottery_id / team_id /
//      campaign_id)
//   2. Generer vipps_reference med kilde-prefiks
//      (lottery- / kiosk- / campaign-)
//   3. INSERT i kilde-spesifikk tabell
//      (lottery_sales / kiosk_sales / campaign_sales)
//      med status='CREATED'
//   4. Kall Vipps POST /epayment/v1/payments
//   5. Returnér redirectUrl til frontend
//
// Source-parameterisert siden 2026-05-10 (kiosk-migrering steg 2).
// Campaign-support lagt til 2026-05-11 (salgskampanje steg 2).
// Backward compat: requests uten 'source' defaulter til 'lottery'.
//
// Fail-fast: Hvis Vipps returnerer 401/403 (ugyldig MSN eller
// manglende ePayment-tilgang), markerer vi kilde-konfig
// (lotteries.vipps_validation_failed_at / kiosk_settings.*) og sender
// push-varsel til DA. Frontend ser 'merchant_invalid' og viser
// "midlertidig utilgjengelig".
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { vippsFetch, corsResponse, handleOptions } from '../_shared/vipps-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const FRONTEND_BASE_URL =
  Deno.env.get('FRONTEND_BASE_URL') || 'https://dugnadpluss.netlify.app';

// =============================================================
// Input-typer
// =============================================================

type Source = 'lottery' | 'kiosk' | 'campaign';

interface KioskItem {
  name: string;
  emoji?: string;
  price: number;
  qty: number;
}

interface LotteryInput {
  source: 'lottery';
  lottery_id: string;
  seller_family_id: string | null;
  tickets: number;
  buyer_name: string;
  buyer_phone: string;
  amount_nok: number;
}

interface KioskInput {
  source: 'kiosk';
  team_id: string;
  items: KioskItem[];
  buyer_name: string;
  buyer_phone: string;
  amount_nok: number;
}

interface CampaignInput {
  source: 'campaign';
  campaign_id: string;
  seller_family_id: string | null;
  quantity: number;
  buyer_name: string;
  buyer_phone: string;
  amount_nok: number;
}

type Input = LotteryInput | KioskInput | CampaignInput;

function validateInput(b: any): Input | { error: string } {
  if (!b || typeof b !== 'object') return { error: 'Body må være JSON-objekt' };

  // Backward compat: default source='lottery' for eksisterende clients
  // som ikke har blitt oppdatert til å sende source eksplisitt.
  const source: Source =
    b.source === 'kiosk' ? 'kiosk' :
    b.source === 'campaign' ? 'campaign' :
    'lottery';

  // Felles felter
  if (typeof b.buyer_name !== 'string' || !b.buyer_name.trim())
    return { error: 'buyer_name mangler' };
  if (typeof b.buyer_phone !== 'string' || !/^\d{8}$/.test(b.buyer_phone))
    return { error: 'buyer_phone må være 8 sifre' };
  if (!Number.isFinite(b.amount_nok) || b.amount_nok <= 0)
    return { error: 'amount_nok må være > 0' };

  if (source === 'lottery') {
    if (typeof b.lottery_id !== 'string' || !b.lottery_id)
      return { error: 'lottery_id mangler' };
    if (!Number.isInteger(b.tickets) || b.tickets <= 0)
      return { error: 'tickets må være positivt heltall' };
    return {
      source: 'lottery',
      lottery_id: b.lottery_id,
      seller_family_id: typeof b.seller_family_id === 'string' && b.seller_family_id ? b.seller_family_id : null,
      tickets: b.tickets,
      buyer_name: b.buyer_name.trim(),
      buyer_phone: b.buyer_phone,
      amount_nok: b.amount_nok,
    };
  }

  if (source === 'kiosk') {
    if (typeof b.team_id !== 'string' || !b.team_id)
      return { error: 'team_id mangler' };
    if (!Array.isArray(b.items) || b.items.length === 0)
      return { error: 'items må være ikke-tom array' };
    for (const item of b.items) {
      if (!item || typeof item !== 'object') return { error: 'items har ugyldig element' };
      if (typeof item.name !== 'string' || !item.name) return { error: 'items: name mangler' };
      if (!Number.isInteger(item.price) || item.price < 0) return { error: 'items: price må være positivt heltall' };
      if (!Number.isInteger(item.qty) || item.qty <= 0) return { error: 'items: qty må være positivt heltall' };
    }
    return {
      source: 'kiosk',
      team_id: b.team_id,
      items: b.items.map((i: any) => ({
        name: String(i.name),
        emoji: typeof i.emoji === 'string' ? i.emoji : undefined,
        price: i.price,
        qty: i.qty,
      })),
      buyer_name: b.buyer_name.trim(),
      buyer_phone: b.buyer_phone,
      amount_nok: b.amount_nok,
    };
  }

  // campaign
  if (typeof b.campaign_id !== 'string' || !b.campaign_id)
    return { error: 'campaign_id mangler' };
  if (!Number.isInteger(b.quantity) || b.quantity <= 0)
    return { error: 'quantity må være positivt heltall' };
  return {
    source: 'campaign',
    campaign_id: b.campaign_id,
    seller_family_id: typeof b.seller_family_id === 'string' && b.seller_family_id ? b.seller_family_id : null,
    quantity: b.quantity,
    buyer_name: b.buyer_name.trim(),
    buyer_phone: b.buyer_phone,
    amount_nok: b.amount_nok,
  };
}

// =============================================================
// Sender push-varsel til alle koordinatorer for klubben.
// Generisk over kilde — tekst varierer per source.
// =============================================================
async function notifyCoordinatorOfFailure(
  teamId: string | null,
  sourceLabel: string,         // f.eks. "lotteriet 'Vipps Test 1'" eller "kiosken"
  redirectPath: string,        // f.eks. "/lottery-admin" eller "/kiosk-admin"
) {
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
      `Vipps-nummeret på ${sourceLabel} fungerer ikke. ` +
      `Sjekk at det er riktig 4–7-sifret Salgssted-nummer med ` +
      `Payment Integration aktivert.`;

    await Promise.allSettled(
      familyIds.map((family_id) =>
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ family_id, title, body, url: redirectPath }),
        })
      )
    );
  } catch (e) {
    console.error('[initiate] notifyCoordinator failed:', e);
  }
}

// =============================================================
// SourceHandler — encapsulates all kilde-spesifikk logikk
// =============================================================

interface SourceHandler {
  msn: string;
  teamId: string | null;
  displayName: string;       // for push-varsel
  paymentDescription: string;
  referencePrefix: string;   // 'lottery-' eller 'kiosk-'
  adminPath: string;         // for push-varsel-deeplink
  buildReturnUrl: (vippsRef: string) => string;
  insertSaleRow: (vippsRef: string) => Promise<{ error: any }>;
  markSaleFailed: (vippsRef: string, reason: string) => Promise<void>;
  markConfigFailed: (reason: string) => Promise<void>;
}

type ResolveResult = SourceHandler | { error: string; status: number; reason?: string };

async function resolveLottery(v: LotteryInput): Promise<ResolveResult> {
  const { data: lottery, error } = await supabase
    .from('lotteries')
    .select('id, name, ticket_price, vipps_number, is_active, team_id, vipps_validation_failed_at')
    .eq('id', v.lottery_id)
    .maybeSingle();

  if (error || !lottery) return { error: 'Lotteriet finnes ikke', status: 404 };
  if (!lottery.is_active) return { error: 'Lotteriet er ikke aktivt', status: 400 };
  if (!lottery.vipps_number) return { error: 'Lotteriet mangler Vipps-nummer', status: 400 };
  if (lottery.vipps_validation_failed_at) {
    return {
      error: 'Lotteriet er midlertidig utilgjengelig. Klubben er varslet.',
      reason: 'merchant_invalid',
      status: 503,
    };
  }

  const expected = lottery.ticket_price * v.tickets;
  if (expected !== v.amount_nok) {
    return {
      error: `Beløp stemmer ikke. Forventet ${expected} NOK for ${v.tickets} lodd.`,
      status: 400,
    };
  }

  return {
    msn: lottery.vipps_number,
    teamId: lottery.team_id,
    displayName: `lotteriet "${lottery.name}"`,
    paymentDescription: `Lodd ${v.buyer_name}`.slice(0, 100),
    referencePrefix: 'lottery-',
    adminPath: '/lottery-admin',
    buildReturnUrl: (vippsRef) => {
      const sellerParam = v.seller_family_id ? `&seller=${v.seller_family_id}` : '';
      return `${FRONTEND_BASE_URL}/lottery-shop?reference=${vippsRef}${sellerParam}`;
    },
    insertSaleRow: (vippsRef) => supabase
      .from('lottery_sales')
      .insert({
        lottery_id: v.lottery_id,
        seller_family_id: v.seller_family_id,
        buyer_name: v.buyer_name,
        buyer_phone: v.buyer_phone,
        tickets: v.tickets,
        amount: v.amount_nok,
        status: 'CREATED',
        vipps_reference: vippsRef,
        payment_method: 'vipps',
      })
      .then((r) => ({ error: r.error })),
    markSaleFailed: async (vippsRef, reason) => {
      await supabase.from('lottery_sales')
        .update({ status: 'FAILED', failure_reason: reason })
        .eq('vipps_reference', vippsRef);
    },
    markConfigFailed: async (reason) => {
      await supabase.from('lotteries')
        .update({
          vipps_validation_failed_at: new Date().toISOString(),
          vipps_validation_error: reason,
        })
        .eq('id', lottery.id);
    },
  };
}

async function resolveKiosk(v: KioskInput): Promise<ResolveResult> {
  const { data: settings, error } = await supabase
    .from('kiosk_settings')
    .select('team_id, vipps_number, vipps_validation_failed_at')
    .eq('team_id', v.team_id)
    .maybeSingle();

  if (error) return { error: 'DB-feil ved oppslag', status: 500 };
  if (!settings || !settings.vipps_number) {
    return { error: 'Kiosken mangler Vipps-nummer', status: 400 };
  }
  if (settings.vipps_validation_failed_at) {
    return {
      error: 'Kiosken er midlertidig utilgjengelig. Klubben er varslet.',
      reason: 'merchant_invalid',
      status: 503,
    };
  }

  // Validér at amount_nok matcher items-sum (server-side beregning,
  // tillit-grense mot manipulert frontend).
  const expected = v.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  if (expected !== v.amount_nok) {
    return {
      error: `Beløp stemmer ikke. Forventet ${expected} NOK for varekurv.`,
      status: 400,
    };
  }

  // Snapshot items for INSERT (matche eksisterende kiosk_sales.items
  // jsonb-format som frontend bruker)
  const itemsSnapshot = v.items.map((i) => ({
    name: i.name,
    emoji: i.emoji || '🛒',
    price: i.price,
    qty: i.qty,
  }));

  return {
    msn: settings.vipps_number,
    teamId: settings.team_id,
    displayName: 'kiosken',
    paymentDescription: `Kiosk ${v.buyer_name}`.slice(0, 100),
    referencePrefix: 'kiosk-',
    adminPath: '/kiosk-admin',
    buildReturnUrl: (vippsRef) =>
      `${FRONTEND_BASE_URL}/kiosk-shop?reference=${vippsRef}&team=${encodeURIComponent(v.team_id)}`,
    insertSaleRow: (vippsRef) => supabase
      .from('kiosk_sales')
      .insert({
        team_id: v.team_id,
        items: itemsSnapshot,
        total_amount: v.amount_nok,
        vipps_number: settings.vipps_number,
        buyer_name: v.buyer_name,
        buyer_phone: v.buyer_phone,
        status: 'CREATED',
        vipps_reference: vippsRef,
      })
      .then((r) => ({ error: r.error })),
    markSaleFailed: async (vippsRef, reason) => {
      await supabase.from('kiosk_sales')
        .update({ status: 'FAILED', failure_reason: reason })
        .eq('vipps_reference', vippsRef);
    },
    markConfigFailed: async (reason) => {
      await supabase.from('kiosk_settings')
        .update({
          vipps_validation_failed_at: new Date().toISOString(),
          vipps_validation_error: reason,
        })
        .eq('team_id', v.team_id);
    },
  };
}

async function resolveCampaign(v: CampaignInput): Promise<ResolveResult> {
  const { data: campaign, error } = await supabase
    .from('sales_campaigns')
    .select('id, title, product_name, unit_price, vipps_number, status, team_id, vipps_validation_failed_at')
    .eq('id', v.campaign_id)
    .maybeSingle();

  if (error || !campaign) return { error: 'Kampanjen finnes ikke', status: 404 };
  if (campaign.status !== 'active') return { error: 'Kampanjen er ikke aktiv', status: 400 };
  if (!campaign.vipps_number) return { error: 'Kampanjen mangler Vipps-nummer', status: 400 };
  if (campaign.vipps_validation_failed_at) {
    return {
      error: 'Kampanjen er midlertidig utilgjengelig. Klubben er varslet.',
      reason: 'merchant_invalid',
      status: 503,
    };
  }

  // Validér at amount_nok matcher quantity × unit_price (server-side
  // beregning, tillit-grense mot manipulert frontend).
  const expected = campaign.unit_price * v.quantity;
  if (expected !== v.amount_nok) {
    return {
      error: `Beløp stemmer ikke. Forventet ${expected} NOK for ${v.quantity} × ${campaign.product_name}.`,
      status: 400,
    };
  }

  return {
    msn: campaign.vipps_number,
    teamId: campaign.team_id,
    displayName: `kampanjen "${campaign.title}"`,
    paymentDescription: `${campaign.product_name} ${v.buyer_name}`.slice(0, 100),
    referencePrefix: 'campaign-',
    adminPath: '/sales-campaign',
    buildReturnUrl: (vippsRef) => {
      const sellerParam = v.seller_family_id ? `&seller=${v.seller_family_id}` : '';
      return `${FRONTEND_BASE_URL}/campaign-shop?reference=${vippsRef}${sellerParam}`;
    },
    insertSaleRow: (vippsRef) => supabase
      .from('campaign_sales')
      .insert({
        campaign_id: v.campaign_id,
        seller_family_id: v.seller_family_id,
        buyer_name: v.buyer_name,
        buyer_phone: v.buyer_phone,
        quantity: v.quantity,
        amount: v.amount_nok,
        payment_method: 'vipps',
        status: 'CREATED',
        vipps_reference: vippsRef,
        // paid:boolean settes til false av DB-default; trigger
        // (sync_campaign_sales_paid) oppdaterer den når status går
        // til AUTHORIZED/CAPTURED via webhook.
      })
      .then((r) => ({ error: r.error })),
    markSaleFailed: async (vippsRef, reason) => {
      await supabase.from('campaign_sales')
        .update({ status: 'FAILED', failure_reason: reason })
        .eq('vipps_reference', vippsRef);
    },
    markConfigFailed: async (reason) => {
      await supabase.from('sales_campaigns')
        .update({
          vipps_validation_failed_at: new Date().toISOString(),
          vipps_validation_error: reason,
        })
        .eq('id', campaign.id);
    },
  };
}

// =============================================================
// Main handler
// =============================================================

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

  const ctx =
    v.source === 'lottery'  ? await resolveLottery(v) :
    v.source === 'kiosk'    ? await resolveKiosk(v) :
                              await resolveCampaign(v);
  if ('error' in ctx) {
    return corsResponse(
      { error: ctx.error, ...(ctx.reason ? { reason: ctx.reason } : {}) },
      ctx.status,
    );
  }

  // Generer reference og INSERT initial rad
  const vippsReference = `${ctx.referencePrefix}${crypto.randomUUID()}`;
  const { error: insertErr } = await ctx.insertSaleRow(vippsReference);

  if (insertErr) {
    console.error('[initiate] insert failed:', insertErr);
    return corsResponse({ error: 'Kunne ikke registrere kjøpet' }, 500);
  }

  // Kall Vipps ePayment
  const vippsBody = {
    amount: { value: v.amount_nok * 100, currency: 'NOK' },
    paymentMethod: { type: 'WALLET' },
    reference: vippsReference,
    userFlow: 'WEB_REDIRECT',
    returnUrl: ctx.buildReturnUrl(vippsReference),
    paymentDescription: ctx.paymentDescription,
    customer: { phoneNumber: '47' + v.buyer_phone },
  };

  const vippsResp = await vippsFetch('/epayment/v1/payments', 'POST', {
    msn: ctx.msn,
    idempotencyKey: vippsReference,
    body: vippsBody,
  });

  // Fail-fast: 401/403 betyr ugyldig MSN eller manglende ePayment-tilgang
  if (vippsResp.status === 401 || vippsResp.status === 403) {
    const reason = `Vipps avviste MSN ${ctx.msn}: HTTP ${vippsResp.status}`;
    console.error('[initiate] merchant_invalid:', reason, vippsResp.data);

    await ctx.markConfigFailed(reason);
    await ctx.markSaleFailed(vippsReference, reason);

    // Logg event for sporbarhet (felles tabell, prefiks viser kilde)
    await supabase.from('vipps_webhook_events').insert({
      vipps_reference: vippsReference,
      event_name: 'validation_failed',
      payload: { status: vippsResp.status, response: vippsResp.data },
      result: 'merchant_invalid',
    });

    // Notify DA via push (fire-and-forget — vi kan ikke bruke
    // EdgeRuntime.waitUntil her siden vi ikke ønsker å forsinke
    // brukerens 503-respons; push er sekundært.)
    notifyCoordinatorOfFailure(ctx.teamId, ctx.displayName, ctx.adminPath).catch((e) =>
      console.error('[initiate] push failed:', e)
    );

    return corsResponse({
      error: `${ctx.displayName.charAt(0).toUpperCase() + ctx.displayName.slice(1)} er midlertidig utilgjengelig. Klubben er varslet og fikser saken.`,
      reason: 'merchant_invalid',
    }, 503);
  }

  if (!vippsResp.ok) {
    const reason = `Vipps API-feil: HTTP ${vippsResp.status}`;
    console.error('[initiate] vipps error:', reason, vippsResp.data);

    await ctx.markSaleFailed(vippsReference, reason);

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
