-- =============================================================
-- Fase 4A — Vikar-tabeller (substitutes + substitute_availability)
-- =============================================================
-- Dato: 2026-06-01
-- Avhengigheter: Steg E (auth_user_team_ids), eksisterende
--                shifts/events/requests-tabeller.
--
-- BAKGRUNN
-- Audit (april 2026) viste at vikar-koden bruker legacy-mønsteret
-- families.id = auth.uid(), som ble fjernet for vanlige foreldre
-- da team_members ble innført. Vikar har null domeneoverlapp med
-- familie (ingen barn, ingen team, ingen dugnad-forpliktelse), så
-- families.is_substitute=true er et type-discriminator-anti-
-- pattern i en tabell der ~20 av 26 kolonner er meningsløse for
-- typen. Vi splitter vikar ut i egen tabell nå mens count = 0.
--
-- KLUBBLØS: substitutes har ingen team_id eller club_id. Vikar er
-- frittstående aktør på tvers av klubber ("bestefar i Lillestrøm
-- hjelper lag i Kongsvinger" — avklart april 2026).
--
-- POLYMORFI-GJELD: requests.bid_family_id og assignments.family_id
-- er fortsatt uuid-felt som peker enten på families.id eller
-- (for vikar) auth.users.id direkte. Fase 5 splitter til
-- actor_kind + actor_id. I denne migrasjonen joiner vi via
-- substitutes.auth_user_id = requests.bid_family_id som
-- midlertidig kobling.
--
-- GDPR PÅ PROFIL-LESING
-- Vikarens telefonnummer skal IKKE eksponeres før et bud er
-- akseptert. Postgres støtter ikke kolonne-nivå begrensning i en
-- SELECT-policy (RLS er row-level), så vi løser dette via en
-- SECURITY DEFINER-RPC get_substitute_public_profile() som
-- returnerer kun navn, alder, erfaring, is_active og en
-- availability-array. Telefon eksponeres via en separat RPC
-- senere når bud-aksept-flowen formaliseres (Fase 5+). Ingen
-- permissive _select_for_open_request-policy på base-tabellen.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. substitutes
-- ------------------------------------------------------------

CREATE TABLE public.substitutes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  age           integer,
  phone         text,
  experience    text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.substitutes IS
  'Vikar-identitet. Klubbløs, ingen team-tilknytning. '
  '1:1 med auth.users via auth_user_id. '
  'Telefon eksponeres kun til vikaren selv eller via dedikert RPC '
  'etter bud-aksept (ikke implementert ennå).';

CREATE INDEX substitutes_auth_user_id_idx ON public.substitutes(auth_user_id);

ALTER TABLE public.substitutes ENABLE ROW LEVEL SECURITY;

-- Vikar leser egen rad
CREATE POLICY substitutes_select_own ON public.substitutes
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Vikar oppretter egen rad
CREATE POLICY substitutes_insert_own ON public.substitutes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Vikar oppdaterer egen rad
CREATE POLICY substitutes_update_own ON public.substitutes
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- NB: Ingen DELETE-policy. Vikar deaktiverer via is_active=false.
-- NB: Ingen permissive SELECT for andre — alle ikke-eier-lesninger
--     går via get_substitute_public_profile()-RPC (under).


-- ------------------------------------------------------------
-- 2. substitute_availability
-- ------------------------------------------------------------

CREATE TABLE public.substitute_availability (
  substitute_id uuid NOT NULL REFERENCES public.substitutes(id) ON DELETE CASCADE,
  date          date NOT NULL,
  PRIMARY KEY (substitute_id, date)
);

COMMENT ON TABLE public.substitute_availability IS
  'Normalisert tilgjengelighet. Én rad per (vikar, dato). '
  'Vikar styrer egne rader; andre leser kun via '
  'get_substitute_public_profile()-RPC som inkluderer datoer.';

CREATE INDEX substitute_availability_date_idx ON public.substitute_availability(date);

ALTER TABLE public.substitute_availability ENABLE ROW LEVEL SECURITY;

-- Vikar leser egne availability-rader
CREATE POLICY substitute_availability_select_own ON public.substitute_availability
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM substitutes s
      WHERE s.id = substitute_availability.substitute_id
        AND s.auth_user_id = auth.uid()
    )
  );

-- Vikar legger til
CREATE POLICY substitute_availability_insert_own ON public.substitute_availability
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM substitutes s
      WHERE s.id = substitute_availability.substitute_id
        AND s.auth_user_id = auth.uid()
    )
  );

-- Vikar oppdaterer (sjelden brukt — PK er (substitute_id, date))
CREATE POLICY substitute_availability_update_own ON public.substitute_availability
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM substitutes s
      WHERE s.id = substitute_availability.substitute_id
        AND s.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM substitutes s
      WHERE s.id = substitute_availability.substitute_id
        AND s.auth_user_id = auth.uid()
    )
  );

-- Vikar sletter (toggle off på dato)
CREATE POLICY substitute_availability_delete_own ON public.substitute_availability
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM substitutes s
      WHERE s.id = substitute_availability.substitute_id
        AND s.auth_user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 3. get_substitute_public_profile(p_substitute_id uuid)
--
-- GDPR-minimerende lesefunksjon for andre enn vikaren selv.
-- Returnerer KUN trygge felter — IKKE telefon eller e-post.
-- Telefon eksponeres senere via dedikert RPC etter bud-aksept.
--
-- Tilgangsbetingelse: caller må være authenticated OG vikaren
-- må ha lagt et aktivt bud på en request som tilhører et lag
-- caller er medlem av.
--
-- POLYMORFI-NOTAT: requests.bid_family_id inneholder i dag
-- auth.users.id direkte (legacy fra eksisterende vikar-flow),
-- så vi joiner via substitutes.auth_user_id. Fase 5 splitter
-- requests til actor_kind + actor_id og denne joinen blir
-- type-trygg.
-- ------------------------------------------------------------

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
      WHERE r.bid_family_id = s.auth_user_id
        AND r.is_active = true
        AND e.team_id = ANY(auth_user_team_ids())
    );
$$;

COMMENT ON FUNCTION public.get_substitute_public_profile(uuid) IS
  'GDPR-minimerende public profile for vikar. Returnerer navn, alder, '
  'erfaring, is_active og availability-datoer. IKKE telefon eller e-post. '
  'Tilgang: vikaren må ha lagt aktivt bud på en request tilhørende et '
  'lag caller er medlem av. SECURITY DEFINER + SET search_path = public.';


-- ============================================================
-- VERIFIKASJON
-- ============================================================
DO $$
DECLARE
  v_count integer;
BEGIN
  -- Tabell-eksistens
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'substitutes'
  ) THEN
    RAISE EXCEPTION 'substitutes-tabellen ble ikke opprettet';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'substitute_availability'
  ) THEN
    RAISE EXCEPTION 'substitute_availability-tabellen ble ikke opprettet';
  END IF;

  -- RLS enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'substitutes'
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS er ikke aktivert på substitutes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'substitute_availability'
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS er ikke aktivert på substitute_availability';
  END IF;

  -- Policy-count
  SELECT count(*) INTO v_count
  FROM pg_policy
  WHERE polrelid = 'public.substitutes'::regclass;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Forventet 3 policies på substitutes, fant %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policy
  WHERE polrelid = 'public.substitute_availability'::regclass;

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Forventet 4 policies på substitute_availability, fant %', v_count;
  END IF;

  -- RPC-eksistens og signatur
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_substitute_public_profile'
      AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'get_substitute_public_profile-RPC mangler eller har feil signatur';
  END IF;

  RAISE NOTICE '✅ Fase 4A OK — substitutes (3 policies) + substitute_availability (4 policies) + get_substitute_public_profile-RPC opprettet.';
  RAISE NOTICE '   NB: families.is_substitute er IKKE droppet ennå — det skjer etter Fase 4B (frontend-refactor).';
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (kjør for å fjerne alt fra Fase 4A)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.get_substitute_public_profile(uuid);
-- DROP TABLE IF EXISTS public.substitute_availability;
-- DROP TABLE IF EXISTS public.substitutes;
-- COMMIT;
