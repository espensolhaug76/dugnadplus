-- =============================================================
-- Steg 8 cleanup: Tighten campaign_sales_insert_anon policy
-- =============================================================
-- 2026-05-11:
-- Etter CampaignShop-omskrivingen (steg 6) går alle nye INSERTs til
-- campaign_sales gjennom vipps-initiate-payment Edge Function, som
-- bruker SUPABASE_SERVICE_ROLE_KEY og dermed bypasser RLS. Edge
-- Function genererer alltid vipps_reference = 'campaign-<uuid>' og
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
--   - Eneste INSERT-path til campaign_sales i kodebasen er
--     supabase/functions/vipps-initiate-payment/index.ts:400-416
--     (resolveCampaign.insertSaleRow), som ALLTID setter:
--       status: 'CREATED'
--       vipps_reference: `campaign-${crypto.randomUUID()}`
--   - Edge Function bruker service_role → bypasser RLS, så
--     tightening påvirker ikke happy-path.
--   - Frontend (CampaignShop, SalesCampaignPage) gjør kun
--     SELECT/UPDATE — ingen INSERTs.
--   - campaign_sales_update_coordinator (separat policy for DA
--     som markerer levert) er uberørt.
-- =============================================================

DROP POLICY IF EXISTS campaign_sales_insert_anon ON public.campaign_sales;
CREATE POLICY campaign_sales_insert_anon ON public.campaign_sales
  FOR INSERT
  WITH CHECK (
    status = 'CREATED'
    AND vipps_reference IS NOT NULL
    AND vipps_reference LIKE 'campaign-%'
  );

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_sales'
      AND policyname = 'campaign_sales_insert_anon'
      AND with_check ILIKE '%CREATED%'
      AND with_check ILIKE '%campaign-%%'
  ) THEN
    RAISE EXCEPTION 'campaign_sales_insert_anon policy er ikke tightenet — sjekk pg_policies manuelt';
  END IF;

  RAISE NOTICE '✅ campaign_sales_insert_anon er nå begrenset til status=CREATED + vipps_reference LIKE ''campaign-%%''. Anon-clients kan ikke lenger lage rader uten Vipps-referanse.';
END $$;

-- =============================================================
-- ROLLBACK (hvis frontend-deploy må rulles tilbake)
-- =============================================================
-- DROP POLICY IF EXISTS campaign_sales_insert_anon ON public.campaign_sales;
-- CREATE POLICY campaign_sales_insert_anon ON public.campaign_sales
--   FOR INSERT WITH CHECK (true);
