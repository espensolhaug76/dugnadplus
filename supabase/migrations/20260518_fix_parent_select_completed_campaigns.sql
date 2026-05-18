-- =============================================================
-- Fix: foreldre kan ikke lese completed/draft salgskampanjer
-- =============================================================
-- 2026-05-18:
-- Bug: når en forelder åpner /my-campaign/:id for en avsluttet
-- kampanje (typisk via gammel delt lenke), henger siden på
-- "Laster..." og UI redirecter til /my-campaigns. Rotårsak er
-- RLS-policies på sales_campaigns:
--
--   sales_campaigns_select_anon       USING (status = 'active')
--   sales_campaigns_select_coordinator USING (auth_user_role_in(team_id) IN (...))
--
-- Innloggede foreldre treffer ingen av disse for en completed-
-- kampanje. Den eksisterende anon-policyen er gated på 'active',
-- og foreldre er ikke coordinator/club_admin. Resultat: SELECT
-- returnerer null + ingen error, frontend tolker det som
-- "kampanje finnes ikke" og redirecter.
--
-- Sammenligning: lotteries har allerede en lotteries_select_parent
-- med qual `team_id = ANY(auth_user_team_ids())`. Den ble lagt til
-- under Steg F men tilsvarende ble glemt for sales_campaigns.
--
-- Fix: legg til sales_campaigns_select_parent med samme mønster.
-- Foreldre får da lese ALLE statuser (active/completed/draft/
-- archived) fra sitt eget lag, samme som de allerede kan for
-- lotteries.
--
-- VERIFIKASJON før kjøring (utført 2026-05-18):
--   - pg_policies har 5 policies for sales_campaigns, ingen
--     med rolle 'authenticated' for parent-tilgang
--   - lotteries har 6 policies inkl. lotteries_select_parent
--     (samme mønster vi mirror her)
--   - auth_user_team_ids() funksjonen finnes (verifisert via
--     pg_proc)
--   - Andre parent-leste tabeller (kiosk_items, kiosk_settings,
--     prizes) bruker USING(true) og har ikke samme bug
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS sales_campaigns_select_parent ON public.sales_campaigns;
CREATE POLICY sales_campaigns_select_parent
  ON public.sales_campaigns
  FOR SELECT
  TO authenticated
  USING (team_id = ANY(auth_user_team_ids()));

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'sales_campaigns'
    AND policyname = 'sales_campaigns_select_parent';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'sales_campaigns_select_parent ble ikke opprettet (count=%)', v_count;
  END IF;

  RAISE NOTICE '✅ sales_campaigns_select_parent opprettet. Foreldre kan nå lese alle statuser (active/completed/draft) fra eget lag — samme mønster som lotteries_select_parent.';
END $$;

-- Sanity: bekreft total policy-count for sporing
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('sales_campaigns', 'lotteries')
GROUP BY tablename
ORDER BY tablename;

COMMIT;

-- =============================================================
-- ROLLBACK (hvis fix må reverteres)
-- =============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS sales_campaigns_select_parent ON public.sales_campaigns;
-- COMMIT;
