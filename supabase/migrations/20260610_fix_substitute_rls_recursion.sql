-- =============================================================
-- Fiks RLS-rekursjon i shifts/events substitute-policies
-- =============================================================
-- Dato: 2026-06-10
-- Avhengighet: 20260610_shifts_events_substitute_select.sql
--
-- PROBLEM
-- Forrige migrasjon (samme dato) la til policies på shifts/events
-- med EXISTS-subquery mot assignments. Postgres-logger viser:
--   ERROR: infinite recursion detected in policy for relation "events"
--
-- Årsak: rekursiv sirkel via RLS-evaluering:
--   events_select_substitute_assigned (ny)  → shifts → assignments
--   shifts_select_substitute_assigned (ny)  → assignments
--   assignments_select_team (eksisterende)  → shifts → events
--   ...evig løkke
--
-- LØSNING
-- SECURITY DEFINER-helpers som returnerer uuid-arrays. Funksjonene
-- bypasser RLS internt (definer-rettigheter), så ingen rekursjon.
-- Policies bruker = ANY(array) istedenfor EXISTS-subquery.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop de problematiske policiene
-- ------------------------------------------------------------

DROP POLICY IF EXISTS events_select_substitute_assigned ON public.events;
DROP POLICY IF EXISTS shifts_select_substitute_assigned ON public.shifts;


-- ------------------------------------------------------------
-- 2. SECURITY DEFINER-helpers
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.substitute_assigned_shift_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(array_agg(shift_id), '{}'::uuid[])
  FROM assignments
  WHERE substitute_id = auth_user_substitute_id();
$$;

COMMENT ON FUNCTION public.substitute_assigned_shift_ids() IS
  'Returnerer shift-IDer der innlogget vikar har en assignment. '
  'SECURITY DEFINER bypasser RLS internt → trygt for bruk i RLS-policies '
  'uten å lage rekursjon.';

CREATE OR REPLACE FUNCTION public.substitute_assigned_event_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.event_id), '{}'::uuid[])
  FROM assignments a
  JOIN shifts s ON s.id = a.shift_id
  WHERE a.substitute_id = auth_user_substitute_id();
$$;

COMMENT ON FUNCTION public.substitute_assigned_event_ids() IS
  'Returnerer event-IDer der innlogget vikar har en assignment. '
  'SECURITY DEFINER bypasser RLS internt → trygt for bruk i RLS-policies '
  'uten å lage rekursjon.';


-- ------------------------------------------------------------
-- 3. Nye policies (uten EXISTS-subquery)
-- ------------------------------------------------------------

CREATE POLICY shifts_select_substitute_assigned ON public.shifts
  FOR SELECT
  TO authenticated
  USING (id = ANY(public.substitute_assigned_shift_ids()));

CREATE POLICY events_select_substitute_assigned ON public.events
  FOR SELECT
  TO authenticated
  USING (id = ANY(public.substitute_assigned_event_ids()));


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'substitute_assigned_shift_ids') THEN
    RAISE EXCEPTION 'substitute_assigned_shift_ids() mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'substitute_assigned_event_ids') THEN
    RAISE EXCEPTION 'substitute_assigned_event_ids() mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'shifts_select_substitute_assigned') THEN
    RAISE EXCEPTION 'shifts_select_substitute_assigned mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'events_select_substitute_assigned') THEN
    RAISE EXCEPTION 'events_select_substitute_assigned mangler';
  END IF;
  RAISE NOTICE '✅ RLS-rekursjon fikset — vikar har nå trygg SELECT-tilgang til shifts/events de er tildelt.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS events_select_substitute_assigned ON public.events;
-- DROP POLICY IF EXISTS shifts_select_substitute_assigned ON public.shifts;
-- DROP FUNCTION IF EXISTS public.substitute_assigned_event_ids();
-- DROP FUNCTION IF EXISTS public.substitute_assigned_shift_ids();
-- COMMIT;
