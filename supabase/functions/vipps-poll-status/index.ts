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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'GET') return corsResponse({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const reference = url.searchParams.get('reference');
  if (!reference || !reference.startsWith('lottery-')) {
    return corsResponse({ error: 'reference mangler eller er ugyldig' }, 400);
  }

  const { data: sale, error } = await supabase
    .from('lottery_sales')
    .select('id, status, amount, tickets, created_at, failure_reason, lottery_id, lotteries(vipps_number)')
    .eq('vipps_reference', reference)
    .maybeSingle();

  if (error) {
    console.error('[poll] DB error:', error);
    return corsResponse({ error: 'DB-feil' }, 500);
  }
  if (!sale) {
    return corsResponse({ error: 'Ukjent reference' }, 404);
  }

  // Allerede endelig — returnér fra DB
  if (TERMINAL_STATUSES.has(sale.status)) {
    return corsResponse({
      status: sale.status,
      amount: sale.amount,
      tickets: sale.tickets,
      reference,
      failure_reason: sale.failure_reason,
    });
  }

  // CREATED og > 30 sek — spør Vipps direkte
  const ageMs = Date.now() - new Date(sale.created_at).getTime();
  if (sale.status === 'CREATED' && ageMs > 30 * 1000) {
    const msn = (sale as any).lotteries?.vipps_number;
    if (msn) {
      const resp = await vippsFetch(`/epayment/v1/payments/${reference}`, 'GET', { msn });
      if (resp.ok && resp.data?.state) {
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

          await supabase.from('lottery_sales').update(update).eq('vipps_reference', reference);
          return corsResponse({
            status: mappedStatus,
            amount: sale.amount,
            tickets: sale.tickets,
            reference,
          });
        }
      }
    }
  }

  // Ikke noe nytt
  return corsResponse({
    status: sale.status,
    amount: sale.amount,
    tickets: sale.tickets,
    reference,
  });
});
