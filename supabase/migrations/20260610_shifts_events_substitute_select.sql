-- =============================================================
-- shifts/events SELECT-policies for vikar
-- =============================================================
-- Dato: 2026-06-10
-- Avhengighet: Fase 5 (assignments.substitute_id, auth_user_substitute_id)
--
-- BAKGRUNN
-- MySubstituteJobsPage gjør:
--   .from('assignments').select('id, status, shift:shifts(..., event:events(...))')
--     .eq('substitute_id', sub.id)
--
-- Eksisterende RLS:
--   shifts_select_team:  EXISTS(events e WHERE e.team_id = ANY(auth_user_team_ids()))
--   events_select_team:  team_id = ANY(auth_user_team_ids())
--
-- Vikar er klubbløs (Fase 4) → auth_user_team_ids() returnerer tom array
-- → ingen SELECT-tilgang til shifts/events → joinen returnerer null for
-- hver assignment → MySubstituteJobsPage krasjer stille på a.shift.id
-- → UI viser "Du har ingen aktive oppdrag" selv om assignment finnes.
--
-- FIKS
-- To nye permissive policies som OR-kombineres med eksisterende:
--   shifts_select_substitute_assigned:  vikar ser shifts hvor de har
--                                       en assignment
--   events_select_substitute_assigned:  vikar ser events hvor de har
--                                       en assignment på en shift
--
-- Vikar får KUN tilgang til shifts/events de er tildelt, ikke alle på
-- laget. Snevrere enn assignments_select_substitute_own.
-- =============================================================

BEGIN;

CREATE POLICY shifts_select_substitute_assigned ON public.shifts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.shift_id = shifts.id
        AND a.substitute_id = public.auth_user_substitute_id()
    )
  );

CREATE POLICY events_select_substitute_assigned ON public.events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shifts s
      JOIN public.assignments a ON a.shift_id = s.id
      WHERE s.event_id = events.id
        AND a.substitute_id = public.auth_user_substitute_id()
    )
  );


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'shifts_select_substitute_assigned') THEN
    RAISE EXCEPTION 'shifts_select_substitute_assigned ikke opprettet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'events_select_substitute_assigned') THEN
    RAISE EXCEPTION 'events_select_substitute_assigned ikke opprettet';
  END IF;
  RAISE NOTICE '✅ Vikar har nå SELECT-tilgang til shifts/events de er tildelt.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS events_select_substitute_assigned ON public.events;
-- DROP POLICY IF EXISTS shifts_select_substitute_assigned ON public.shifts;
-- COMMIT;
