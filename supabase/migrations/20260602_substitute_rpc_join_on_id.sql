-- =============================================================
-- Fase 4B-prep — Bytte RPC-join til substitutes.id
-- =============================================================
-- Dato: 2026-06-02
-- Avhengighet: 20260601_substitutes_table.sql (4A)
--
-- BAKGRUNN
-- I 4A laget vi get_substitute_public_profile() med joinen
--
--   WHERE r.bid_family_id = s.auth_user_id
--
-- fordi den eksisterende vikar-koden skrev auth.uid() direkte til
-- requests.bid_family_id (legacy fra families.id = auth.uid()-
-- mønsteret).
--
-- I Fase 4B går vi bort fra det mønsteret: vikar-frontend skal
-- skrive substitutes.id i bid_family_id (og assignments.family_id),
-- slik at substitutes.id blir den kanoniske aktør-referansen for
-- vikar.
--
-- Denne migrasjonen oppdaterer joinen tilsvarende. Trygt fordi
-- count(substitutes) = 0 og dermed ingen eksisterende
-- vikar-bud-rader i requests.bid_family_id å rebinde.
--
-- POLYMORFI-GJELD (eksplisitt dokumentert)
-- Etter Fase 4B inneholder requests.bid_family_id én av to ting:
--   1. En families.id (forelder som byr på swap mellom familier)
--   2. En substitutes.id (vikar som byr på en åpen request)
-- Samme kolonne, to mulige tabeller. Bevisst midlertidig gjeld.
-- Ryddes i Fase 5 ved å splitte til actor_kind + actor_id.
--
-- Samme polymorfi gjelder for:
--   - assignments.family_id (families.id ELLER substitutes.id)
--   - requests.from_family_id, to_family_id, target_family_id,
--     bid_family_id
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
  RETURNS TABLE(
    substitute_id     uuid,
    name              text,
    age               integer,
    experience        text,
    is_active         boolean,
    available_dates   date[]
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    s.id                                                      AS substitute_id,
    s.name                                                    AS name,
    s.age                                                     AS age,
    s.experience                                              AS experience,
    s.is_active                                               AS is_active,
    COALESCE(
      (SELECT array_agg(sa.date ORDER BY sa.date)
         FROM substitute_availability sa
        WHERE sa.substitute_id = s.id),
      '{}'::date[]
    )                                                         AS available_dates
  FROM substitutes s
  WHERE s.id = p_substitute_id
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM requests r
      JOIN shifts sh ON sh.id = r.shift_id
      JOIN events e ON e.id = sh.event_id
      -- Polymorfi-gjeld (Fase 4B → Fase 5): bid_family_id kan
      -- inneholde enten families.id eller substitutes.id. Vi
      -- joiner på s.id for å matche vikarens kanoniske referanse
      -- (oppdatert fra s.auth_user_id i 4A). Splittes til
      -- actor_kind + actor_id i Fase 5.
      WHERE r.bid_family_id = s.id
        AND r.is_active = true
        AND e.team_id = ANY(auth_user_team_ids())
    );
$$;

COMMENT ON FUNCTION public.get_substitute_public_profile(uuid) IS
  'GDPR-minimerende public profile for vikar. Returnerer navn, alder, '
  'erfaring, is_active og availability-datoer. IKKE telefon eller e-post. '
  'Tilgang: vikaren må ha lagt aktivt bud på en request tilhørende et '
  'lag caller er medlem av. Joiner på substitutes.id = requests.bid_family_id '
  '(polymorfi-gjeld — Fase 5 splitter til actor_kind + actor_id). '
  'SECURITY DEFINER + SET search_path = public.';


-- ============================================================
-- VERIFIKASJON
-- ============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  -- Hent funksjonsdefinisjonen og verifiser at joinen er oppdatert
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_substitute_public_profile';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'get_substitute_public_profile finnes ikke';
  END IF;

  IF v_def NOT ILIKE '%r.bid_family_id = s.id%' THEN
    RAISE EXCEPTION 'RPC ble ikke oppdatert til å joine på s.id — sjekk om CREATE OR REPLACE feilet';
  END IF;

  IF v_def ILIKE '%r.bid_family_id = s.auth_user_id%' THEN
    RAISE EXCEPTION 'RPC inneholder fortsatt gammel join på s.auth_user_id';
  END IF;

  RAISE NOTICE '✅ get_substitute_public_profile joiner nå på substitutes.id (oppdatert fra auth_user_id).';
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK — gjenopprett 4A-versjonen (join på s.auth_user_id)
-- ============================================================
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
--   RETURNS TABLE(
--     substitute_id     uuid,
--     name              text,
--     age               integer,
--     experience        text,
--     is_active         boolean,
--     available_dates   date[]
--   )
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
--   SELECT
--     s.id, s.name, s.age, s.experience, s.is_active,
--     COALESCE(
--       (SELECT array_agg(sa.date ORDER BY sa.date)
--          FROM substitute_availability sa WHERE sa.substitute_id = s.id),
--       '{}'::date[]
--     )
--   FROM substitutes s
--   WHERE s.id = p_substitute_id
--     AND auth.uid() IS NOT NULL
--     AND EXISTS (
--       SELECT 1 FROM requests r
--       JOIN shifts sh ON sh.id = r.shift_id
--       JOIN events e ON e.id = sh.event_id
--       WHERE r.bid_family_id = s.auth_user_id
--         AND r.is_active = true
--         AND e.team_id = ANY(auth_user_team_ids())
--     );
-- $$;
-- COMMIT;
