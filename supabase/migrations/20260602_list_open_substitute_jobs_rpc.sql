-- =============================================================
-- Fase 4D-C — list_open_substitute_jobs RPC
-- =============================================================
-- Dato: 2026-06-02
-- Avhengighet: events, shifts, requests, team_members, clubs,
--              families. Ingen avhengighet til substitutes.county/
--              municipality — RPC tar p_municipality som argument.
--
-- BAKGRUNN
-- Vikar-børsen filtreres på kommune. Koblingen
--   events.team_id (slug) → team_members.club_id (uuid) → clubs.municipality
-- er 2-hop og kan ikke uttrykkes i én Supabase REST-spørring.
-- Denne RPC-en gjør joinen server-side, og frontend kaller den
-- istedenfor en rå events-query.
--
-- NULL/TOM KOMMUNE
-- Hvis p_municipality IS NULL eller tom streng: filtreres IKKE på
-- kommune. Vikar uten registrert hjemkommune skal se alle åpne
-- vakter, ikke en tom liste. Avklart 2026-06-02 — børsen skal
-- aldri være tom bare fordi profilen er ufullstendig.
--
-- POLYMORFI-GJELD (Fase 4B → Fase 5)
-- requests.target_family_id og bid_family_id kan holde families.id
-- eller substitutes.id. RPC returnerer dem rått — frontend
-- sammenligner mot substitutes.id (vikar-kontekst). Ryddes til
-- actor_kind + actor_id i Fase 5.
--
-- families-JOIN på from_family_id: i praksis er from_family_id
-- alltid en families.id (familier oppretter substitute-requests
-- via MyShiftsPage), så LEFT JOIN families gir alltid match. Hvis
-- det noensinne settes substitutes.id der, returneres NULL navn
-- og frontend må vise fallback.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.list_open_substitute_jobs(p_municipality text DEFAULT NULL)
  RETURNS TABLE(
    event_id            uuid,
    event_name          text,
    event_date          date,
    event_location      text,
    event_sport         text,
    event_team_id       text,
    event_municipality  text,
    shift_id            uuid,
    shift_name          text,
    start_time          time,
    end_time            time,
    request_id          uuid,
    target_family_id    uuid,
    from_family_id      uuid,
    from_family_name    text,
    bid_amount          integer,
    bid_message         text,
    bid_family_id       uuid,
    bid_status          text
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
    -- Slå opp kommunen via team_members → clubs. team_id-slug peker
    -- 1:1 på én club i prod-data (verifisert 2026-06-02), men vi
    -- bruker LIMIT 1 for å sikre én rad uavhengig av evt. duplikater.
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
    r.from_family_id,
    f.name          AS from_family_name,
    r.bid_amount,
    r.bid_message,
    r.bid_family_id,
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
  'kommune. p_municipality NULL/tom → ingen filtrering. 2-hop-join '
  'events → team_members → clubs.municipality. Krever authenticated '
  'caller. SECURITY DEFINER + SET search_path = public.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_result_type text;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_result_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'list_open_substitute_jobs';

  IF v_result_type IS NULL THEN
    RAISE EXCEPTION 'list_open_substitute_jobs ble ikke opprettet';
  END IF;

  -- Sjekk noen forventede kolonner i return-typen
  IF v_result_type NOT ILIKE '%event_id%'
     OR v_result_type NOT ILIKE '%request_id%'
     OR v_result_type NOT ILIKE '%event_municipality%'
     OR v_result_type NOT ILIKE '%target_family_id%' THEN
    RAISE EXCEPTION 'list_open_substitute_jobs mangler forventede kolonner: %', v_result_type;
  END IF;

  -- Signatur-sjekk: ett tekst-argument (med default NULL)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'list_open_substitute_jobs'
      AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'list_open_substitute_jobs har feil antall argumenter';
  END IF;

  RAISE NOTICE '✅ list_open_substitute_jobs(p_municipality text) opprettet med 2-hop join til clubs.municipality.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.list_open_substitute_jobs(text);
-- COMMIT;
