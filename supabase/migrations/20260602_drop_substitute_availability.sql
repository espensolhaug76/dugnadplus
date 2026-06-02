-- =============================================================
-- Fase 4D-A — Drop substitute_availability, behov-drevet modell
-- =============================================================
-- Dato: 2026-06-02
-- Avhengighet: 20260601_substitutes_table.sql,
--              20260602_substitute_rpc_join_on_id.sql
--
-- BAKGRUNN
-- Tilgjengelighet som frie datoer (vikar krysser av når de har tid)
-- viste seg å være feil modell — i Fase 4C-undersøkelsen ble det
-- avklart at vikar-børsen skal være behov-drevet: vikar ser åpne
-- vakter i sin kommune og responderer der det matcher. Frie datoer
-- gir både falske positiver (vikar ledig men ingen vakt finnes)
-- og falske negativer (vikar glemmer å krysse av men kunne tatt
-- vakta likevel).
--
-- 0 vikar-rader, 0 availability-rader. Migrasjon er trygg.
--
-- Endring:
-- 1. DROP TABLE substitute_availability (policies følger med)
-- 2. DROP og CREATE get_substitute_public_profile uten
--    available_dates (RETURNS TABLE-signatur endres → CREATE OR
--    REPLACE virker ikke for dette)
-- =============================================================

BEGIN;

DROP TABLE IF EXISTS public.substitute_availability;

DROP FUNCTION IF EXISTS public.get_substitute_public_profile(uuid);

CREATE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
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
      -- Polymorfi-gjeld: bid_family_id kan holde families.id eller
      -- substitutes.id. Joiner på s.id som kanonisk vikar-referanse.
      -- Splittes til actor_kind + actor_id i Fase 5.
      WHERE r.bid_family_id = s.id
        AND r.is_active = true
        AND e.team_id = ANY(auth_user_team_ids())
    );
$$;

COMMENT ON FUNCTION public.get_substitute_public_profile(uuid) IS
  'GDPR-minimerende public profile for vikar. Returnerer navn, alder, '
  'erfaring, is_active. IKKE telefon eller e-post. IKKE availability '
  '(behov-drevet modell fra Fase 4D — frie datoer er fjernet). '
  'Tilgang: vikaren må ha lagt aktivt bud på en request tilhørende et '
  'lag caller er medlem av. SECURITY DEFINER + SET search_path = public.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_result_type text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'substitute_availability'
  ) THEN
    RAISE EXCEPTION 'substitute_availability ble ikke droppet';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_substitute_public_profile'
  ) THEN
    RAISE EXCEPTION 'get_substitute_public_profile finnes ikke etter rebuild';
  END IF;

  SELECT pg_get_function_result(p.oid) INTO v_result_type
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_substitute_public_profile';

  IF v_result_type ILIKE '%available_dates%' THEN
    RAISE EXCEPTION 'RPC har fortsatt available_dates i return-typen';
  END IF;

  IF v_result_type NOT ILIKE '%substitute_id%'
     OR v_result_type NOT ILIKE '%is_active%' THEN
    RAISE EXCEPTION 'RPC mangler forventede kolonner: %', v_result_type;
  END IF;

  RAISE NOTICE '✅ substitute_availability droppet. get_substitute_public_profile har 5 kolonner (uten available_dates).';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK — gjenopprett availability-tabell + RPC-versjon med
-- available_dates (4A→4B→4C-state).
-- =============================================================
-- BEGIN;
-- CREATE TABLE public.substitute_availability (
--   substitute_id uuid NOT NULL REFERENCES public.substitutes(id) ON DELETE CASCADE,
--   date          date NOT NULL,
--   PRIMARY KEY (substitute_id, date)
-- );
-- CREATE INDEX substitute_availability_date_idx ON public.substitute_availability(date);
-- ALTER TABLE public.substitute_availability ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY substitute_availability_select_own ON public.substitute_availability
--   FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM substitutes s WHERE s.id = substitute_availability.substitute_id AND s.auth_user_id = auth.uid()));
-- CREATE POLICY substitute_availability_insert_own ON public.substitute_availability
--   FOR INSERT TO authenticated
--   WITH CHECK (EXISTS (SELECT 1 FROM substitutes s WHERE s.id = substitute_availability.substitute_id AND s.auth_user_id = auth.uid()));
-- CREATE POLICY substitute_availability_update_own ON public.substitute_availability
--   FOR UPDATE TO authenticated
--   USING (EXISTS (SELECT 1 FROM substitutes s WHERE s.id = substitute_availability.substitute_id AND s.auth_user_id = auth.uid()))
--   WITH CHECK (EXISTS (SELECT 1 FROM substitutes s WHERE s.id = substitute_availability.substitute_id AND s.auth_user_id = auth.uid()));
-- CREATE POLICY substitute_availability_delete_own ON public.substitute_availability
--   FOR DELETE TO authenticated
--   USING (EXISTS (SELECT 1 FROM substitutes s WHERE s.id = substitute_availability.substitute_id AND s.auth_user_id = auth.uid()));
--
-- DROP FUNCTION public.get_substitute_public_profile(uuid);
-- CREATE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
--   RETURNS TABLE(substitute_id uuid, name text, age integer, experience text, is_active boolean, available_dates date[])
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$
--   SELECT s.id, s.name, s.age, s.experience, s.is_active,
--     COALESCE((SELECT array_agg(sa.date ORDER BY sa.date) FROM substitute_availability sa WHERE sa.substitute_id = s.id), '{}'::date[])
--   FROM substitutes s
--   WHERE s.id = p_substitute_id AND auth.uid() IS NOT NULL
--     AND EXISTS (SELECT 1 FROM requests r JOIN shifts sh ON sh.id = r.shift_id JOIN events e ON e.id = sh.event_id
--                  WHERE r.bid_family_id = s.id AND r.is_active = true AND e.team_id = ANY(auth_user_team_ids()));
-- $$;
-- COMMIT;
