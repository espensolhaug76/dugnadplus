-- =============================================================
-- substitute_bids — RLS
-- =============================================================
-- Dato: 2026-06-12
-- Avhengighet: 20260612_multi_bid_01_table.sql
--
-- B1: vikarer ser KUN egne bud. Vi har ingen "list alle bud per
-- request"-policy for vikar — kun for familien som eier requesten.
--
-- All skriving (INSERT/UPDATE/DELETE) går via SECURITY DEFINER-RPCer
-- (place/accept/withdraw_bid). Ingen permissive write-policies →
-- Postgres avviser direkte skriveforsøk fra authenticated/anon.
--
-- Familie-SELECT bruker EXISTS-subquery mot requests. requests har
-- ikke noen policy som peker tilbake til substitute_bids, så ingen
-- rekursjon-risiko.
-- =============================================================

BEGIN;

ALTER TABLE public.substitute_bids ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- SELECT for familie (eier requesten)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS substitute_bids_select_family ON public.substitute_bids;
CREATE POLICY substitute_bids_select_family
  ON public.substitute_bids
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = substitute_bids.request_id
        AND r.from_family_id = auth_user_family_id()
    )
  );

-- ------------------------------------------------------------
-- SELECT for vikar (egne bud)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS substitute_bids_select_substitute ON public.substitute_bids;
CREATE POLICY substitute_bids_select_substitute
  ON public.substitute_bids
  FOR SELECT
  TO authenticated
  USING (substitute_id = auth_user_substitute_id());

-- ------------------------------------------------------------
-- Ingen INSERT/UPDATE/DELETE-policies — kun via RPCer.
-- ------------------------------------------------------------


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_policy_count int;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'substitute_bids';

  RAISE NOTICE 'substitute_bids har % policies etter migrasjon.', v_policy_count;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='substitute_bids'
                   AND policyname='substitute_bids_select_family') THEN
    RAISE EXCEPTION 'substitute_bids_select_family mangler';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='substitute_bids'
                   AND policyname='substitute_bids_select_substitute') THEN
    RAISE EXCEPTION 'substitute_bids_select_substitute mangler';
  END IF;
END $$;

COMMIT;
