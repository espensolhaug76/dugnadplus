-- =============================================================
-- Utvid resolve_join_code med family_id, family_name, subgroup
-- =============================================================
-- 2026-05-20:
-- Funksjonen ble laget i april (Steg E) som SECURITY DEFINER-RPC
-- for pre-auth /join-flow. Den returnerte minimum-sett (barnets
-- fornavn, lagets slug, family_member-ID) under et strengt
-- GDPR-minimerings-prinsipp.
--
-- Reevaluert 2026-05-20: join-kode er privat (delt direkte med
-- en spesifikk forelder), ikke en offentlig delelink. For at
-- forelder skal kunne disambiguere mellom to barn med samme
-- fornavn på samme lag, må fullt navn vises. Familienavn og
-- subgroup gir ekstra kontekst som UI allerede henter via en
-- direkte query. RPC erstatter den direkte queryen.
--
-- Endringer:
-- 1. RETURNS TABLE utvides fra 3 → 6 kolonner:
--    family_member_id, child_name, family_id, family_name,
--    subgroup, team_display_name
-- 2. child_name returnerer fm.name rått (fullt navn), ikke
--    split_part() — nødvendig for disambiguering
-- 3. team_display_name forblir families.team_id slug — frontend
--    kaller displayTeamName() der det vises (CoordinatorLayout,
--    ClaimFamilyPage). Eksisterende mønster, ingen ny dupliserings-
--    logikk i SQL.
-- 4. SECURITY DEFINER + SET search_path = public uendret
-- 5. LOWER()-matching av join_code uendret (case-insensitive)
-- 6. role = 'child'-filter uendret
--
-- NB: RETURNS TABLE-signatur kan ikke endres via CREATE OR
-- REPLACE — Postgres avviser endring av antall/typer kolonner.
-- Vi må DROP først.
-- =============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.resolve_join_code(text);

CREATE FUNCTION public.resolve_join_code(p_code text)
  RETURNS TABLE(
    family_member_id  uuid,
    child_name        text,
    family_id         uuid,
    family_name       text,
    subgroup          text,
    team_display_name text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    fm.id                    AS family_member_id,
    fm.name                  AS child_name,
    fm.family_id             AS family_id,
    f.name                   AS family_name,
    fm.subgroup              AS subgroup,
    COALESCE(f.team_id, '')  AS team_display_name
  FROM family_members fm
  JOIN families f ON f.id = fm.family_id
  WHERE LOWER(fm.join_code) = LOWER(p_code)
    AND fm.role = 'child'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_join_code(text) IS
  'Slår opp join-kode (privat, delt direkte med forelder) og '
  'returnerer barnets fulle navn, family_member-ID, family_id, '
  'familienavn, subgroup og team_id-slug. Frontend (JoinPage) '
  'bruker dette i pre-auth /join-flow for å bekrefte rett barn '
  'og INSERTe pending_parents med family_id. '
  'SECURITY DEFINER + SET search_path = public.';

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_test_code text;
  v_rec record;
BEGIN
  -- Finn en eksisterende child-rad med join_code for å smoke-teste
  SELECT join_code INTO v_test_code
  FROM family_members
  WHERE role = 'child' AND join_code IS NOT NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_test_code IS NULL THEN
    RAISE NOTICE 'Ingen child med join_code funnet — hopper over smoke-test.';
  ELSE
    SELECT * INTO v_rec FROM resolve_join_code(v_test_code);

    IF v_rec IS NULL THEN
      RAISE EXCEPTION 'resolve_join_code(%) returnerte 0 rader — forventet 1', v_test_code;
    END IF;

    RAISE NOTICE 'Smoke-test for kode "%":', v_test_code;
    RAISE NOTICE '  family_member_id  = %', v_rec.family_member_id;
    RAISE NOTICE '  child_name        = %', v_rec.child_name;
    RAISE NOTICE '  family_id         = %', v_rec.family_id;
    RAISE NOTICE '  family_name       = %', v_rec.family_name;
    RAISE NOTICE '  subgroup          = %', v_rec.subgroup;
    RAISE NOTICE '  team_display_name = %', v_rec.team_display_name;
  END IF;

  -- Sanity: bekreft at funksjonen har 6-kolonners returtype
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'resolve_join_code'
      AND p.pronargs = 1
      AND pg_get_function_result(p.oid) ILIKE '%family_member_id%'
      AND pg_get_function_result(p.oid) ILIKE '%family_name%'
      AND pg_get_function_result(p.oid) ILIKE '%subgroup%'
  ) THEN
    RAISE EXCEPTION 'resolve_join_code har ikke forventet 6-kolonners returtype';
  END IF;

  RAISE NOTICE '✅ resolve_join_code utvidet med family_id, family_name, subgroup.';
END $$;

COMMIT;

-- =============================================================
-- ROLLBACK — gjenopprett tidligere 3-kolonners variant
-- =============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.resolve_join_code(text);
-- CREATE FUNCTION public.resolve_join_code(p_code text)
--   RETURNS TABLE(child_name text, team_display_name text, family_member_id uuid)
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
--   SELECT
--     split_part(fm.name, ' ', 1)  AS child_name,
--     COALESCE(f.team_id, '')      AS team_display_name,
--     fm.id                        AS family_member_id
--   FROM family_members fm
--   JOIN families f ON f.id = fm.family_id
--   WHERE LOWER(fm.join_code) = LOWER(p_code)
--     AND fm.role = 'child'
--   LIMIT 1;
-- $$;
-- COMMIT;
