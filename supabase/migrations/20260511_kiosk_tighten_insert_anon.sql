-- =============================================================
-- Steg 8 cleanup: Tighten kiosk_sales_insert_anon policy
-- =============================================================
-- 2026-05-11:
-- Etter KioskShop-omskrivingen (steg 6) går alle nye INSERTs til
-- kiosk_sales gjennom vipps-initiate-payment Edge Function, som
-- bruker SUPABASE_SERVICE_ROLE_KEY og dermed bypasser RLS. Edge
-- Function genererer alltid vipps_reference = 'kiosk-<uuid>' og
-- setter status='CREATED' før Vipps-kallet.
--
-- Anon-policyen er nå kun en forsvarslinje mot direkte INSERT fra
-- klient (f.eks. gamle cachede PWA-versjoner, manipulerte
-- requester, eller fremtidige feilkonfigurerte clients). Vi
-- strammer den til å avvise rader som ikke matcher det Edge
-- Function genererer.
--
-- Migrasjonen er IDEMPOTENT (DROP IF EXISTS + CREATE) og kan
-- kjøres flere ganger uten feil.
--
-- VERIFIKASJON før kjøring (utført 2026-05-11):
--   - Eneste INSERT-path til kiosk_sales i kodebasen er
--     supabase/functions/vipps-initiate-payment/index.ts:300-311
--     (insertSaleRow), som ALLTID setter:
--       status: 'CREATED'
--       vipps_reference: `kiosk-${crypto.randomUUID()}`
--   - Edge Function bruker service_role → bypasser RLS, så
--     tightening påvirker ikke happy-path.
--   - kiosk_sales_insert_coordinator (separat policy for evt.
--     kontantsalg fra DA) er uberørt.
-- =============================================================

DROP POLICY IF EXISTS kiosk_sales_insert_anon ON public.kiosk_sales;
CREATE POLICY kiosk_sales_insert_anon ON public.kiosk_sales
  FOR INSERT
  WITH CHECK (
    status = 'CREATED'
    AND vipps_reference IS NOT NULL
    AND vipps_reference LIKE 'kiosk-%'
  );

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kiosk_sales'
      AND policyname = 'kiosk_sales_insert_anon'
      AND with_check ILIKE '%CREATED%'
      AND with_check ILIKE '%kiosk-%%'
  ) THEN
    RAISE EXCEPTION 'kiosk_sales_insert_anon policy er ikke tightenet — sjekk pg_policies manuelt';
  END IF;

  RAISE NOTICE '✅ kiosk_sales_insert_anon er nå begrenset til status=CREATED + vipps_reference LIKE ''kiosk-%%''. Anon-clients kan ikke lenger lage rader uten Vipps-referanse.';
END $$;

-- =============================================================
-- ROLLBACK (hvis frontend-deploy må rulles tilbake)
-- =============================================================
-- DROP POLICY IF EXISTS kiosk_sales_insert_anon ON public.kiosk_sales;
-- CREATE POLICY kiosk_sales_insert_anon ON public.kiosk_sales
--   FOR INSERT WITH CHECK (true);
