-- =============================================================
-- Fase 5-B — RPC-oppdateringer for separate substitute_id-kolonner
-- =============================================================
-- Dato: 2026-06-04
-- Avhengighet: 20260604_substitute_actor_01_columns.sql
--
-- BAKGRUNN
-- Fase 5-A introduserte target_substitute_id og bid_substitute_id
-- på requests, og substitute_id på assignments. RPC-ene som ble
-- skrevet i Fase 4 antok at substitutes-referansen lå i de
-- generiske *_family_id-feltene. Nå må de bytte til de nye
-- type-spesifikke kolonnene.
--
-- ENDRINGER
-- 1. get_substitute_public_profile: join på r.bid_substitute_id = s.id
--    (var: r.bid_family_id = s.id). Signatur uendret → CREATE OR REPLACE.
-- 2. list_open_substitute_jobs: legg til target_substitute_id og
--    bid_substitute_id i RETURNS TABLE. Frontend (Del 2) bytter
--    sammenligning fra _family_id til _substitute_id.
--    RETURNS TABLE-signatur endres (19 → 21 kolonner) → DROP + CREATE.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. get_substitute_public_profile — bytt join-kolonne
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
  RETURNS TABLE(
    substitute_id  uuid,
    name           text,
    age            integer,
    experience     text,
    is_active      boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    s.id          AS substitute_id,
    s.name        AS name,
    s.age         AS age,
    s.experience  AS experience,
    s.is_active   AS is_active
  FROM substitutes s
  WHERE s.id = p_substitute_id
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM requests r
      JOIN shifts sh ON sh.id = r.shift_id
      JOIN events e ON e.id = sh.event_id
      WHERE r.bid_substitute_id = s.id    -- ENDRET fra r.bid_family_id
        AND r.is_active = true
        AND e.team_id = ANY(auth_user_team_ids())
    );
$$;

COMMENT ON FUNCTION public.get_substitute_public_profile(uuid) IS
  'GDPR-minimerende public profile for vikar. Returnerer navn, alder, '
  'erfaring, is_active. IKKE telefon eller e-post. '
  'Tilgang: vikaren må ha lagt aktivt bud (bid_substitute_id) på en '
  'request tilhørende et lag caller er medlem av. '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 2. list_open_substitute_jobs — utvid RETURNS TABLE
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_open_substitute_jobs(text);

CREATE FUNCTION public.list_open_substitute_jobs(p_municipality text DEFAULT NULL)
  RETURNS TABLE(
    event_id              uuid,
    event_name            text,
    event_date            date,
    event_location        text,
    event_sport           text,
    event_team_id         text,
    event_municipality    text,
    shift_id              uuid,
    shift_name            text,
    start_time            time,
    end_time              time,
    request_id            uuid,
    target_family_id      uuid,
    target_substitute_id  uuid,
    from_family_id        uuid,
    from_family_name      text,
    bid_amount            integer,
    bid_message           text,
    bid_family_id         uuid,
    bid_substitute_id     uuid,
    bid_status            text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    e.id            AS event_id,
    e.name          AS event_name,
    e.date          AS event_date,
    e.location      AS event_location,
    e.sport         AS event_sport,
    e.team_id       AS event_team_id,
    (
      SELECT c.municipality
      FROM team_members tm
      JOIN clubs c ON c.id = tm.club_id
      WHERE tm.team_id = e.team_id
        AND c.municipality IS NOT NULL
      LIMIT 1
    )               AS event_municipality,
    sh.id           AS shift_id,
    sh.name         AS shift_name,
    sh.start_time,
    sh.end_time,
    r.id            AS request_id,
    r.target_family_id,
    r.target_substitute_id,
    r.from_family_id,
    f.name          AS from_family_name,
    r.bid_amount,
    r.bid_message,
    r.bid_family_id,
    r.bid_substitute_id,
    r.bid_status
  FROM events e
  JOIN shifts sh ON sh.event_id = e.id
  JOIN requests r ON r.shift_id = sh.id
  LEFT JOIN families f ON f.id = r.from_family_id
  WHERE r.type = 'substitute'
    AND r.is_active = true
    AND e.date >= CURRENT_DATE
    AND auth.uid() IS NOT NULL
    AND (
      p_municipality IS NULL
      OR btrim(p_municipality) = ''
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        JOIN clubs c ON c.id = tm.club_id
        WHERE tm.team_id = e.team_id
          AND c.municipality = p_municipality
      )
    )
  ORDER BY e.date, sh.start_time;
$$;

COMMENT ON FUNCTION public.list_open_substitute_jobs(text) IS
  'Vikar-børs: returnerer åpne substitute-requests filtrert på '
  'kommune. p_municipality NULL/tom → ingen filtrering. RETURN inkluderer '
  'både *_family_id og *_substitute_id (Fase 5-A polymorfi-rydding). '
  'Frontend filtrerer på target_substitute_id / bid_substitute_id mot '
  'innlogget vikars substitute.id. Krever authenticated caller. '
  'SECURITY DEFINER + SET search_path = public.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_profile_def text;
  v_jobs_def    text;
BEGIN
  -- get_substitute_public_profile bruker bid_substitute_id
  SELECT pg_get_functiondef(p.oid) INTO v_profile_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_substitute_public_profile';

  IF v_profile_def NOT ILIKE '%r.bid_substitute_id = s.id%' THEN
    RAISE EXCEPTION 'get_substitute_public_profile joiner ikke på bid_substitute_id';
  END IF;
  IF v_profile_def ILIKE '%r.bid_family_id = s.id%' THEN
    RAISE EXCEPTION 'get_substitute_public_profile har fortsatt bid_family_id-join';
  END IF;

  -- list_open_substitute_jobs har de nye kolonnene
  SELECT pg_get_function_result(p.oid) INTO v_jobs_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'list_open_substitute_jobs';

  IF v_jobs_def IS NULL THEN
    RAISE EXCEPTION 'list_open_substitute_jobs mangler';
  END IF;
  IF v_jobs_def NOT ILIKE '%target_substitute_id%' THEN
    RAISE EXCEPTION 'list_open_substitute_jobs return mangler target_substitute_id';
  END IF;
  IF v_jobs_def NOT ILIKE '%bid_substitute_id%' THEN
    RAISE EXCEPTION 'list_open_substitute_jobs return mangler bid_substitute_id';
  END IF;
  IF v_jobs_def NOT ILIKE '%bid_family_id%' THEN
    RAISE EXCEPTION 'list_open_substitute_jobs return mangler bid_family_id (skal være med begge kolonner)';
  END IF;

  RAISE NOTICE '✅ Fase 5-B OK — get_substitute_public_profile joiner på bid_substitute_id; list_open_substitute_jobs returnerer både family- og substitute-kolonner.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK — gjenopprett Fase 4D-versjoner
-- =============================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
--   RETURNS TABLE(substitute_id uuid, name text, age integer, experience text, is_active boolean)
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
--   SELECT s.id, s.name, s.age, s.experience, s.is_active
--   FROM substitutes s
--   WHERE s.id = p_substitute_id AND auth.uid() IS NOT NULL
--     AND EXISTS (SELECT 1 FROM requests r
--                 JOIN shifts sh ON sh.id = r.shift_id
--                 JOIN events e ON e.id = sh.event_id
--                 WHERE r.bid_family_id = s.id  -- (gammel join)
--                   AND r.is_active = true AND e.team_id = ANY(auth_user_team_ids()));
-- $$;
--
-- DROP FUNCTION IF EXISTS public.list_open_substitute_jobs(text);
-- -- (gjenopprett 19-kolonners versjon — se 20260602_list_open_substitute_jobs_rpc.sql)
-- COMMIT;
