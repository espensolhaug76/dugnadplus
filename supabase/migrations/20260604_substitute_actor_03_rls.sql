-- =============================================================
-- Fase 5-C — RLS-policyer for vikar på requests + assignments
-- =============================================================
-- Dato: 2026-06-04
-- Avhengighet: 20260604_substitute_actor_01_columns.sql
--
-- BAKGRUNN
-- Eksisterende RLS på requests og assignments er bygget rundt
-- auth_user_family_id(). Vikar har ingen team_members-rad → den
-- returnerer NULL → alle SELECT/INSERT/UPDATE fra vikar avvises
-- av RLS. Sammen med FK-feilen til families(id) (fikset i 5-A)
-- var dette den andre sperren mot at vikar-flyten kunne fungere.
--
-- INKLUDERER FIX FOR assignments_select_team-BUG
-- assignments_select_team gir kun team-medlemmer tilgang. Vikar
-- er klubbløs → ser ikke egne assignments. Den nye permissive
-- policyen assignments_select_substitute_own OR-kombineres med
-- eksisterende og fikser bugen.
--
-- DESIGN
-- 1. Helper-funksjon auth_user_substitute_id() RETURNS uuid
--    (symmetrisk med auth_user_family_id()).
-- 2. assignments: nye permissive policyer for vikar (insert,
--    select, update, delete på egen rad).
-- 3. requests: nye permissive policyer for vikar (select + update
--    egne bud). Ingen INSERT — vikar initierer ikke requests
--    (bekreftet 2026-06-04, from_family_id forblir family-only).
--
-- POLICY-COUNT etter migrasjonen:
--   assignments: 7 eksisterende + 4 nye = 11
--   requests:    6 eksisterende + 2 nye = 8
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helper-funksjon
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_substitute_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT s.id
  FROM substitutes s
  WHERE s.auth_user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_user_substitute_id() IS
  'Fase 5 helper — returnerer substitutes.id for innlogget vikar. '
  'NULL hvis brukeren ikke er vikar. Symmetrisk med auth_user_family_id(). '
  'Brukes i RLS-policyer: substitute_id = auth_user_substitute_id(). '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 2. assignments — nye vikar-policyer
-- ------------------------------------------------------------

-- Vikar inserter assignment når de aksepterer en vakt (acceptJob).
CREATE POLICY assignments_insert_substitute ON public.assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (substitute_id = auth_user_substitute_id());

-- Vikar ser EGNE assignments. ORes med assignments_select_team så
-- vikar (som er team-løs) likevel får tilgang til vakta de tok.
-- Dette fikser assignments_select_team-bugen.
CREATE POLICY assignments_select_substitute_own ON public.assignments
  FOR SELECT
  TO authenticated
  USING (substitute_id = auth_user_substitute_id());

-- Vikar oppdaterer egen status (eks. confirmed).
CREATE POLICY assignments_update_substitute ON public.assignments
  FOR UPDATE
  TO authenticated
  USING (substitute_id = auth_user_substitute_id())
  WITH CHECK (substitute_id = auth_user_substitute_id());

-- Vikar trekker seg fra egen vakt.
CREATE POLICY assignments_delete_substitute ON public.assignments
  FOR DELETE
  TO authenticated
  USING (substitute_id = auth_user_substitute_id());


-- ------------------------------------------------------------
-- 3. requests — nye vikar-policyer
-- ------------------------------------------------------------
-- Ingen INSERT-policy: vikar oppretter ikke requests (familien
-- ber, vikar responderer). UPDATE dekker bud-skriving og avslag.

-- Vikar ser requests rettet mot dem (target_substitute_id) eller
-- der de har lagt bud (bid_substitute_id).
CREATE POLICY requests_select_substitute_own ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    target_substitute_id = auth_user_substitute_id()
    OR bid_substitute_id = auth_user_substitute_id()
  );

-- Vikar legger/oppdaterer eget bud. USING-betingelsen tillater
-- også UPDATE på rader der bud ikke er satt ennå men vikar setter
-- det nå (auth_user_substitute_id() matcher post-update via
-- WITH CHECK).
CREATE POLICY requests_update_substitute_bid ON public.requests
  FOR UPDATE
  TO authenticated
  USING (
    bid_substitute_id IS NULL
    OR bid_substitute_id = auth_user_substitute_id()
  )
  WITH CHECK (bid_substitute_id = auth_user_substitute_id());


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Helper finnes
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_substitute_id' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'auth_user_substitute_id mangler eller har feil signatur';
  END IF;

  -- assignments: 11 policyer totalt (7 eksisterende + 4 nye)
  SELECT count(*) INTO v_count FROM pg_policy WHERE polrelid = 'public.assignments'::regclass;
  IF v_count <> 11 THEN
    RAISE EXCEPTION 'Forventet 11 policyer på assignments, fant %', v_count;
  END IF;

  -- requests: 8 policyer totalt (6 eksisterende + 2 nye)
  SELECT count(*) INTO v_count FROM pg_policy WHERE polrelid = 'public.requests'::regclass;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'Forventet 8 policyer på requests, fant %', v_count;
  END IF;

  -- De nye policy-navnene
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'assignments_insert_substitute') THEN
    RAISE EXCEPTION 'assignments_insert_substitute mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'assignments_select_substitute_own') THEN
    RAISE EXCEPTION 'assignments_select_substitute_own mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'assignments_update_substitute') THEN
    RAISE EXCEPTION 'assignments_update_substitute mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'assignments_delete_substitute') THEN
    RAISE EXCEPTION 'assignments_delete_substitute mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'requests_select_substitute_own') THEN
    RAISE EXCEPTION 'requests_select_substitute_own mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'requests_update_substitute_bid') THEN
    RAISE EXCEPTION 'requests_update_substitute_bid mangler';
  END IF;

  RAISE NOTICE '✅ Fase 5-C OK — auth_user_substitute_id() + 4 assignments-policyer + 2 requests-policyer. assignments_select_team-bug fikset via OR med assignments_select_substitute_own.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS requests_update_substitute_bid     ON public.requests;
-- DROP POLICY IF EXISTS requests_select_substitute_own     ON public.requests;
-- DROP POLICY IF EXISTS assignments_delete_substitute      ON public.assignments;
-- DROP POLICY IF EXISTS assignments_update_substitute      ON public.assignments;
-- DROP POLICY IF EXISTS assignments_select_substitute_own  ON public.assignments;
-- DROP POLICY IF EXISTS assignments_insert_substitute      ON public.assignments;
-- DROP FUNCTION IF EXISTS public.auth_user_substitute_id();
-- COMMIT;
