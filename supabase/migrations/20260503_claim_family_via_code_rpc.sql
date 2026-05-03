-- =============================================================
-- claim_family_via_code — SECURITY DEFINER RPC for parent claim
-- =============================================================
-- Pilot-blocker 2026-05-03: forelder som tastet inn join-koden
-- til barnet sitt på /claim-family fikk feilmelding
--   "new row violates row-level security policy for table family_members"
-- når de bekreftet "Stemmer dette? Ja, det stemmer".
--
-- Rotårsak: chicken-and-egg i RLS-policiene fra Steg F.
--   - family_members_insert_parent krever
--       family_id = auth_user_family_id()
--   - auth_user_family_id() slår opp i team_members WHERE
--       auth_user_id = auth.uid() AND role = 'parent'
--   - Men en NY forelder har ingen team_members-rad ennå —
--     funksjonen returnerer NULL → policy feiler.
--
-- Vi kan heller ikke insertere team_members-raden først fra
-- frontend, fordi team_members_insert_coordinator KUN tillater
-- INSERT for coordinator/club_admin på team-id.
--
-- Løsningen: en SECURITY DEFINER-funksjon som
--   1. Slår opp barnet via family_members.join_code
--      (kanonisk lokasjon — families HAR ikke join_code-kolonne;
--       det er PER BARN, ikke per familie. Bekreftet via
--       resolve_join_code-RPC og ClaimFamilyPage-koden.)
--   2. Henter family_id og team_id (fra family_members.team_id
--      med fallback til families.team_id), og club_id (utledet
--      via team_members WHERE team_id = X AND role IN
--      coordinator/club_admin LIMIT 1).
--   3. Sjekker idempotency: hvis brukeren allerede er parent
--      i denne familien, returnerer success uten ny INSERT.
--   4. Inserterer team_members (parent) — krever family_id
--      pga. constraint team_members_family_id_only_for_parents.
--   5. Inserterer family_members (parent) — auth_user_id satt
--      slik at videre RLS-operasjoner fungerer normalt.
--   6. Returnerer JSONB med family_id, team_id og status-felt
--      slik at klienten kan redirecte og oppdatere localStorage.
--
-- Audit: vi loggter IKKE i role_changes fordi
-- role_changes_role_check kun tillater 'coordinator' og
-- 'club_admin'. Parent claims trenger en separat audit-mekanisme
-- (egen tabell eller utvidet CHECK) — flagget som teknisk gjeld.
-- =============================================================

CREATE OR REPLACE FUNCTION public.claim_family_via_code(
  p_code TEXT,
  p_parent_name TEXT,
  p_parent_email TEXT,
  p_parent_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_normalized_code TEXT;
  v_child RECORD;
  v_family_team_id TEXT;
  v_club_id UUID;
  v_existing_parent_count INT;
  v_team_member_id UUID;
  v_family_member_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget for å koble til familie';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Ugyldig kode';
  END IF;

  -- Normalisér: trim + uppercase. resolve_join_code bruker LOWER
  -- på begge sider — vi gjør det samme for konsistens.
  v_normalized_code := upper(trim(p_code));

  -- 1. Slå opp barnet via family_members.join_code.
  --    family_members.team_id kan være NULL for legacy-rader —
  --    fallback til families.team_id i steget under.
  SELECT
    fm.id            AS child_id,
    fm.family_id     AS family_id,
    fm.team_id       AS child_team_id,
    f.team_id        AS family_team_id,
    f.name           AS family_name
  INTO v_child
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE upper(fm.join_code) = v_normalized_code
    AND fm.role = 'child'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ugyldig kode';
  END IF;

  -- Bruk barnets team_id hvis satt, ellers familiens team_id.
  -- Hvis ingen team_id finnes overhodet, kan vi ikke bygge en
  -- gyldig team_members-rad (team_id er NOT NULL der).
  v_family_team_id := COALESCE(v_child.child_team_id, v_child.family_team_id);

  IF v_family_team_id IS NULL THEN
    RAISE EXCEPTION 'Familien er ikke koblet til et lag — kontakt koordinator';
  END IF;

  -- 2. Hent club_id ved å slå opp en eksisterende coordinator/
  --    club_admin på samme team. team_members.club_id kan være
  --    NULL for legacy-rader, så vi tar første ikke-null verdi.
  SELECT tm.club_id
    INTO v_club_id
  FROM public.team_members tm
  WHERE tm.team_id = v_family_team_id
    AND tm.role IN ('coordinator', 'club_admin')
    AND tm.club_id IS NOT NULL
  LIMIT 1;
  -- v_club_id kan fortsatt være NULL — det er greit, kolonnen
  -- er nullable og FK-en ON DELETE SET NULL.

  -- 3. Idempotency: er brukeren allerede parent i denne familien?
  --    Vi bruker UNIQUE-constraint (team_id, auth_user_id, role)
  --    som ekstra sikring, men sjekker først eksplisitt for å
  --    kunne returnere en ren success-respons til klienten.
  SELECT COUNT(*) INTO v_existing_parent_count
  FROM public.team_members
  WHERE auth_user_id = v_user_id
    AND family_id = v_child.family_id
    AND role = 'parent';

  IF v_existing_parent_count > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'family_id', v_child.family_id,
      'team_id', v_family_team_id,
      'family_name', v_child.family_name,
      'already_claimed', true
    );
  END IF;

  -- 4. Insert team_members (parent). Constraint
  --    team_members_family_id_only_for_parents krever at family_id
  --    er satt for parent-rolle.
  INSERT INTO public.team_members (
    team_id, club_id, auth_user_id, role, family_id
  )
  VALUES (
    v_family_team_id, v_club_id, v_user_id, 'parent', v_child.family_id
  )
  RETURNING id INTO v_team_member_id;

  -- 5. Insert family_members (parent). auth_user_id må settes her
  --    slik at fremtidige UPDATE-kall fra brukeren går gjennom
  --    family_members_update_own-policyen.
  INSERT INTO public.family_members (
    family_id, team_id, name, role, email, phone, auth_user_id
  )
  VALUES (
    v_child.family_id,
    v_family_team_id,
    p_parent_name,
    'parent',
    p_parent_email,
    p_parent_phone,
    v_user_id
  )
  RETURNING id INTO v_family_member_id;

  -- NB: ingen INSERT i role_changes — CHECK-constraint på role
  -- tillater kun 'coordinator' og 'club_admin'. Audit av parent
  -- claims er teknisk gjeld (krever egen tabell eller utvidet
  -- CHECK).

  RETURN jsonb_build_object(
    'success', true,
    'family_id', v_child.family_id,
    'team_id', v_family_team_id,
    'family_name', v_child.family_name,
    'team_member_id', v_team_member_id,
    'family_member_id', v_family_member_id,
    'already_claimed', false
  );
END;
$$;

-- GRANT/REVOKE er idempotent — trygt å re-kjøre.
REVOKE EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- =============================================================
-- VERIFIKASJON — kjør før COMMIT
-- =============================================================
-- Sjekker at funksjonen finnes med riktig signatur (4 TEXT-args)
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
    AND p.proname = 'claim_family_via_code'
    AND p.pronargs = 4;

  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'claim_family_via_code(TEXT, TEXT, TEXT, TEXT) ble ikke opprettet';
  END IF;

  IF v_return_type <> 'jsonb' THEN
    RAISE EXCEPTION 'claim_family_via_code har feil return-type: % (forventet jsonb)', v_return_type;
  END IF;

  RAISE NOTICE '✅ claim_family_via_code opprettet — parent claim via SECURITY DEFINER';
END $$;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- Kommentar ut og kjør hvis denne migrasjonen må rulles tilbake.
-- NB: krever også at app-koden i ClaimFamilyPage.tsx rulles
-- tilbake til direkte .insert() — som vil feile på RLS.
--
-- DROP FUNCTION IF EXISTS public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT);
