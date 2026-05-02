-- =============================================================
-- bootstrap_first_coordinator — kollisjons-bevisst slug-resolusjon
-- =============================================================
-- Pilot 2026-05-02: en helt ny koordinator i en ny klubb fikk
-- 400 fra `bootstrap_first_coordinator` med "Team already has at
-- least one coordinator" når de prøvde å opprette
-- football-gutter-2016 — fordi en koordinator i Kongsvinger IL
-- allerede har samme slug. Dvs. den globale eksistens-sjekken
-- på team_id alene blokkerte multi-tenant-bruk.
--
-- Forretningskravet: flere klubber skal kunne ha "et 2016-lag".
--
-- Sikkerhetsbegrensning: hele RLS-laget i Steg F (auth_user_role_in,
-- auth_user_team_ids og 50+ policies) antar at team_id er globalt
-- unik. Hvis to klubber faktisk fikk samme team_id ville en
-- coordinator i klubb A få RLS-tilgang til klubb B's data via
-- f.eks. `families_select_coordinator`. Vi kan ikke endre det
-- her uten å skrive om hele Steg F.
--
-- Pragmatisk mellomvei (CASE C):
--   - Bevar invarianten "team_id er globalt unik" i DB-en.
--   - Hvis en klubb prøver å opprette et lag med en slug som
--     allerede er tatt av en ANNEN klubb, legg til et 8-tegns
--     hex-suffix utledet fra klubbens UUID. Slug-en blir da
--     fortsatt deterministisk (samme klubb + samme inputs gir
--     samme slug), men kollisjons-fri på tvers av klubber.
--   - Hvis kallerens klubb selv allerede har laget, kast
--     "already exists in this club" — bruk skal velge et annet
--     navn / kjønn / årgang.
--
-- Eksempel:
--   Kongsvinger IL (først ute):  team_id = "football-gutter-2016"
--   Testklubb Mai (andre):       team_id = "football-gutter-2016-a1b2c3d4"
--   Visningsnavn i UI:           "Gutter 2016" for begge — slug er
--                                kun intern.
--
-- Returnerer JSONB { success, team_id, collision_resolved } slik
-- at frontend kan bruke den faktiske slug-en (som kan være
-- forskjellig fra den foreslåtte) i etterfølgende kall, og
-- eventuelt vise en informasjonsmelding om at sluggen ble justert.
-- =============================================================

-- Idempotent: erstatter den gamle versjonen som returnerte UUID
-- og hadde global eksistens-sjekk.
CREATE OR REPLACE FUNCTION public.bootstrap_first_coordinator(
  p_team_id TEXT,
  p_club_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing_in_my_club INT;
  v_existing_in_other_club INT;
  v_actual_team_id TEXT;
  v_suffix TEXT;
  v_new_member_id UUID;
  v_collision_resolved BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to bootstrap coordinator';
  END IF;

  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'club_id is required';
  END IF;

  -- 1. Sjekk om kallerens klubb allerede har et lag med samme slug.
  --    Dobbel-trykk eller "lagde dette i går"-scenarie. Vi vil ikke
  --    legge til suffix i KALLERENS klubb — sluggen er per definisjon
  --    "den samme" om det er samme klubb.
  SELECT COUNT(*) INTO v_existing_in_my_club
  FROM public.team_members
  WHERE team_id = p_team_id
    AND club_id = p_club_id
    AND role IN ('coordinator', 'club_admin');

  IF v_existing_in_my_club > 0 THEN
    RAISE EXCEPTION 'Team already exists in this club';
  END IF;

  -- 2. Sjekk om sluggen er tatt av en ANNEN klubb. Vi sammenligner
  --    nullsafe (IS DISTINCT FROM) for å være robust mot legacy-rader
  --    der club_id mangler — i så fall behandles de som "annen klubb"
  --    og vi føyer til suffix for sikkerhets skyld.
  SELECT COUNT(*) INTO v_existing_in_other_club
  FROM public.team_members
  WHERE team_id = p_team_id
    AND (club_id IS DISTINCT FROM p_club_id);

  IF v_existing_in_other_club > 0 THEN
    -- Klubb-utledet suffix: første 8 hex-tegn av klubbens UUID
    -- (uten bindestreker). Deterministisk — samme klubb får alltid
    -- samme suffix, slik at en re-kjøring etter feil produserer
    -- samme slug.
    v_suffix := substring(replace(p_club_id::text, '-', ''), 1, 8);
    v_actual_team_id := p_team_id || '-' || v_suffix;
    v_collision_resolved := true;

    -- Edge case: hvis selv den suffix-erte sluggen kolliderer (kan
    -- skje hvis vi har lagt til samme suffix før, eller hvis
    -- klubben allerede har et lag som tilfeldigvis matcher).
    -- I så fall feil tydelig — vi går ikke i en uendelig
    -- suffix-løkke.
    IF EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = v_actual_team_id
        AND role IN ('coordinator', 'club_admin')
    ) THEN
      RAISE EXCEPTION 'Slug collision could not be resolved automatically — please rename the team';
    END IF;
  ELSE
    v_actual_team_id := p_team_id;
  END IF;

  -- 3. Opprett team_members-raden med den faktiske (kollisjons-frie)
  --    sluggen. Frontend skal bruke verdien fra retur-payloaden, ikke
  --    den opprinnelige p_team_id, til å oppdatere localStorage og
  --    sette dugnad_active_team_filter.
  INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
  VALUES (v_actual_team_id, p_club_id, v_user_id, 'coordinator')
  RETURNING id INTO v_new_member_id;

  INSERT INTO public.role_changes (team_id, club_id, action, to_user, performed_by, role, notes)
  VALUES (
    v_actual_team_id,
    p_club_id,
    'accepted',
    v_user_id,
    v_user_id,
    'coordinator',
    CASE
      WHEN v_collision_resolved
        THEN 'Bootstrap: first coordinator on team creation (slug suffixed due to cross-club collision)'
      ELSE 'Bootstrap: first coordinator on team creation'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', v_actual_team_id,
    'team_member_id', v_new_member_id,
    'collision_resolved', v_collision_resolved
  );
END;
$$;

-- GRANT/REVOKE er idempotent — trygt å re-kjøre.
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) TO authenticated;


-- =============================================================
-- VERIFIKASJON — kjør før COMMIT
-- =============================================================
-- Sjekker at funksjonen finnes med riktig signatur (TEXT, UUID)
-- og returnerer JSONB. Hvis noe har gått galt, kastes en
-- eksplisitt feil og hele migrasjonen rulles tilbake.

DO $$
DECLARE
  v_proc_oid OID;
  v_return_type TEXT;
BEGIN
  SELECT p.oid, pg_get_function_result(p.oid)
    INTO v_proc_oid, v_return_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'bootstrap_first_coordinator'
    AND p.pronargs = 2;

  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'bootstrap_first_coordinator(TEXT, UUID) ble ikke opprettet';
  END IF;

  IF v_return_type <> 'jsonb' THEN
    RAISE EXCEPTION 'bootstrap_first_coordinator har feil return-type: % (forventet jsonb)', v_return_type;
  END IF;

  RAISE NOTICE '✅ bootstrap_first_coordinator oppdatert — kollisjons-bevisst, returnerer JSONB';
END $$;


-- =============================================================
-- ROLLBACK — gjenoppretter forrige versjon (returnerer UUID)
-- =============================================================
-- Kommentar ut og kjør hvis denne migrasjonen må rulles tilbake.
-- NB: krever også at app-koden i TeamSetupPage.tsx rulles tilbake
-- til å forvente UUID-respons.
--
-- CREATE OR REPLACE FUNCTION public.bootstrap_first_coordinator(
--   p_team_id TEXT,
--   p_club_id UUID
-- )
-- RETURNS UUID
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- DECLARE
--   v_user_id UUID;
--   v_existing_count INT;
--   v_new_member_id UUID;
-- BEGIN
--   v_user_id := auth.uid();
--   IF v_user_id IS NULL THEN
--     RAISE EXCEPTION 'Must be authenticated to bootstrap coordinator';
--   END IF;
--   SELECT COUNT(*) INTO v_existing_count
--   FROM public.team_members
--   WHERE team_id = p_team_id
--     AND role IN ('coordinator', 'club_admin');
--   IF v_existing_count > 0 THEN
--     RAISE EXCEPTION 'Team already has at least one coordinator';
--   END IF;
--   INSERT INTO public.team_members (team_id, club_id, auth_user_id, role)
--   VALUES (p_team_id, p_club_id, v_user_id, 'coordinator')
--   RETURNING id INTO v_new_member_id;
--   INSERT INTO public.role_changes (team_id, club_id, action, to_user, performed_by, role, notes)
--   VALUES (p_team_id, p_club_id, 'accepted', v_user_id, v_user_id, 'coordinator',
--           'Bootstrap: first coordinator on team creation');
--   RETURN v_new_member_id;
-- END;
-- $$;
-- REVOKE EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) FROM public;
-- GRANT EXECUTE ON FUNCTION public.bootstrap_first_coordinator(TEXT, UUID) TO authenticated;
