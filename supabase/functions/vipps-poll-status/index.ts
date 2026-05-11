// vipps-poll-status
// =============================================================
// Frontend-poll umiddelbart etter retur fra Vipps. Webhook er
// sannhetskilde, men kan ta noen sekunder — denne funksjonen
// gir snappere UX.
//
// Strategi:
//   - Hvis status er allerede "endelig" (AUTHORIZED/CAPTURED/etc):
//     returnér fra DB.
//   - Hvis status er CREATED og det har gått > 30 sek: spør Vipps
//     direkte og oppdater DB.
//
// Source-routet siden 2026-05-10 (kiosk-migrering steg 4): ruter på
// reference-prefiks (lottery-/kiosk-) og returnerer generisk shape
// så frontend kan bruke samme polling-logikk uavhengig av kilde.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { vippsFetch, corsResponse, handleOptions } from '../_shared/vipps-auth.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const TERMINAL_STATUSES = new Set([
  'AUTHORIZED', 'CAPTURED', 'CANCELLED', 'EXPIRED',
  'TERMINATED', 'REFUNDED', 'FAILED',
]);

function vippsStateToStatus(vState: string): string {
  switch ((vState || '').toUpperCase()) {
    case 'AUTHORIZED': return 'AUTHORIZED';
    case 'CAPTURED':
    case 'CHARGED': return 'CAPTURED';
    case 'ABORTED':
    case 'CANCELLED': return 'CANCELLED';
    case 'EXPIRED': return 'EXPIRED';
    case 'TERMINATED': return 'TERMINATED';
    case 'REFUNDED': return 'REFUNDED';
    case 'CREATED': return 'CREATED';
    default: return 'CREATED';
  }
}

// =============================================================
// Reference-prefix routing — speiler vipps-webhook-mønsteret.
//   'lottery-<uuid>'  → lottery_sales (amount, tickets, lotteries-FK)
//   'kiosk-<uuid>'    → kiosk_sales (total_amount, separat oppslag
//                       mot kiosk_settings for vipps_number)
//   'campaign-<uuid>' → campaign_sales (amount, sales_campaigns-FK
//                       for vipps_number — samme mønster som lottery)
//   Ukjent prefiks    → null (gir 404 til frontend)
// =============================================================

interface SaleContext {
  id: string;
  status: string;
  amount: number;             // normalisert: amount (lottery/campaign) / total_amount (kiosk)
  tickets: number | null;     // kun lottery — kiosk og campaign har ikke "tickets"
  created_at: string;
  failure_reason: string | null;
  msn: string | null;         // for direct Vipps-oppslag
  table: 'lottery_sales' | 'kiosk_sales' | 'campaign_sales';
}

async function fetchSaleByReference(reference: string): Promise<SaleContext | null> {
  if (reference.startsWith('lottery-')) {
    const { data } = await supabase
      .from('lottery_sales')
      .select('id, status, amount, tickets, created_at, failure_reason, lottery_id, lotteries(vipps_number)')
      .eq('vipps_reference', reference)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      status: data.status,
      amount: data.amount,
      tickets: data.tickets,
      created_at: data.created_at,
      failure_reason: data.failure_reason,
      msn: (data as any).lotteries?.vipps_number ?? null,
      table: 'lottery_sales',
    };
  }

  if (reference.startsWith('kiosk-')) {
    const { data: sale } = await supabase
      .from('kiosk_sales')
      .select('id, status, total_amount, created_at, failure_reason, team_id')
      .eq('vipps_reference', reference)
      .maybeSingle();
    if (!sale) return null;

    // Ingen FK fra kiosk_sales.team_id → kiosk_settings.team_id, så
    // vi gjør et eksplisitt oppslag for å hente vipps_number.
    let msn: string | null = null;
    if (sale.team_id) {
      const { data: settings } = await supabase
        .from('kiosk_settings')
        .select('vipps_number')
        .eq('team_id', sale.team_id)
        .maybeSingle();
      msn = settings?.vipps_number ?? null;
    }

    return {
      id: sale.id,
      status: sale.status,
      amount: sale.total_amount,
      tickets: null,
      created_at: sale.created_at,
      failure_reason: sale.failure_reason,
      msn,
      table: 'kiosk_sales',
    };
  }

  if (reference.startsWith('campaign-')) {
    const { data } = await supabase
      .from('campaign_sales')
      .select('id, status, amount, created_at, failure_reason, campaign_id, sales_campaigns(vipps_number)')
      .eq('vipps_reference', reference)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      status: data.status,
      amount: data.amount,
      tickets: null,
      created_at: data.created_at,
      failure_reason: data.failure_reason,
      msn: (data as any).sales_campaigns?.vipps_number ?? null,
      table: 'campaign_sales',
    };
  }

  return null;
}

// Generisk respons-shape — frontend bruker samme polling-logikk for
// begge kilder. tickets er valgfritt (kun lottery har det).
function buildResponse(sale: SaleContext, reference: string, statusOverride?: string) {
  const body: Record<string, unknown> = {
    status: statusOverride ?? sale.status,
    amount: sale.amount,
    reference,
  };
  if (sale.tickets !== null) body.tickets = sale.tickets;
  if (sale.failure_reason) body.failure_reason = sale.failure_reason;
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'GET') return corsResponse({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const reference = url.searchParams.get('reference');
  if (!reference) {
    return corsResponse({ error: 'reference mangler' }, 400);
  }

  let sale: SaleContext | null;
  try {
    sale = await fetchSaleByReference(reference);
  } catch (e) {
    console.error('[poll] DB error:', e);
    return corsResponse({ error: 'DB-feil' }, 500);
  }
  if (!sale) {
    // Dekker både ukjent prefiks og kjent prefiks med slettet rad
    return corsResponse({ error: 'Ukjent reference' }, 404);
  }

  const ageMs = Date.now() - new Date(sale.created_at).getTime();

  // Allerede endelig — returnér fra DB
  if (TERMINAL_STATUSES.has(sale.status)) {
    console.log('[poll]', JSON.stringify({
      reference,
      ageMs,
      db_status: sale.status,
      vipps_direct_called: false,
      vipps_state: null,
      returned_status: sale.status,
    }));
    return corsResponse(buildResponse(sale, reference));
  }

  // CREATED og > 10 sek — spør Vipps direkte for autoritativt svar.
  // 10s-terskel: webhook leverer typisk på 5-8s i happy-path, så vi
  // unngår unødvendige Vipps-kall i normaltilfellet. Retry-runden
  // (frontend "Sjekk på nytt"-knapp) starter tidligst ~15s etter sale
  // opprettet, så den får alltid autoritativt svar fra Vipps —
  // korrekt route til cancelled/expired/failed selv om webhook er
  // treig. (Tidligere terskel 30s ga race-vindu der avbrutte
  // betalinger viste seg som "Takk for handelen".)
  let vippsDirectCalled = false;
  let vippsState: string | null = null;

  if (sale.status === 'CREATED' && ageMs > 10 * 1000 && sale.msn) {
    vippsDirectCalled = true;
    const resp = await vippsFetch(`/epayment/v1/payments/${reference}`, 'GET', { msn: sale.msn });
    if (resp.ok && resp.data?.state) {
      vippsState = String(resp.data.state);
      const mappedStatus = vippsStateToStatus(resp.data.state);
      if (mappedStatus !== sale.status) {
        const update: Record<string, any> = { status: mappedStatus };
        const nowIso = new Date().toISOString();
        if (mappedStatus === 'AUTHORIZED') update.authorized_at = nowIso;
        if (mappedStatus === 'CAPTURED') update.captured_at = nowIso;
        if (mappedStatus === 'CANCELLED' || mappedStatus === 'TERMINATED')
          update.cancelled_at = nowIso;
        if (resp.data.pspReference) update.vipps_psp_reference = resp.data.pspReference;
        if (resp.data.paymentMethod?.type)
          update.vipps_payment_method = resp.data.paymentMethod.type;

        // sale.table er typed union — trygt mot injection.
        await supabase.from(sale.table).update(update).eq('vipps_reference', reference);
        console.log('[poll]', JSON.stringify({
          reference,
          ageMs,
          db_status: sale.status,
          vipps_direct_called: true,
          vipps_state: vippsState,
          returned_status: mappedStatus,
        }));
        return corsResponse(buildResponse(sale, reference, mappedStatus));
      }
    }
  }

  // Ikke noe nytt
  console.log('[poll]', JSON.stringify({
    reference,
    ageMs,
    db_status: sale.status,
    vipps_direct_called: vippsDirectCalled,
    vipps_state: vippsState,
    returned_status: sale.status,
  }));
  return corsResponse(buildResponse(sale, reference));
});
