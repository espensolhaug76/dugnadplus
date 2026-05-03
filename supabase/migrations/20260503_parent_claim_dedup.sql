-- =============================================================
-- Parent claim dedup — fuzzy match mot eksisterende foresatt-rader
-- =============================================================
-- Pilot 2026-05-03: claim_family_via_code oppretter alltid en NY
-- family_members-rad med role='parent'. Men når en koordinator har
-- importert familier fra Spond (eller registrert dem manuelt) er
-- det ofte allerede en parent-rad uten auth_user_id og uten
-- kontaktinfo. Resultat: dupletter — koordinator ser to "Liv
-- Dorthe Hoel" i Spillere & familier-listen, én ghost (fra Spond)
-- og én claimet (fra forelder-registrering).
--
-- Forretningskrav: ved claim, forsøk å matche forelders innskrevne
-- navn mot eksisterende ghost-rader i samme familie. Hvis match
-- finnes, vis "Er dette deg?"-skjerm og UPDATE eksisterende rad
-- istedenfor å INSERTe en ny.
--
-- Migrasjonen leverer:
--   PART A: helper find_matching_parent_candidates(family_id, name)
--           som returnerer match-kandidater med strength-score
--   PART B: ny versjon av claim_family_via_code med to-stegs flyt:
--           - preview-mode: returner kandidater UTEN mutasjon
--           - create-mode: tving INSERT (når bruker valgte "ny")
--           - link-mode: UPDATE eksisterende rad
-- =============================================================


-- =============================================================
-- PART A — find_matching_parent_candidates
-- =============================================================
-- Returnerer ghost-rader (auth_user_id IS NULL) i family_id som
-- matcher input-navnet med:
--   strength=2: eksakt match etter normalisering
--   strength=1: etternavn matcher OG minst ett felles fornavn
--
-- Normalisering: lowercase, trim, kollaps doble mellomrom, og
-- bytt bindestreker mot mellomrom slik at "Liv-Dorthe" matcher
-- "Liv Dorthe". Vi behandler "siste token" som etternavn — godt
-- nok for norske navn i pilot-skala. Mer avansert matching
-- (Levenshtein, fonetisk) kan komme senere hvis nødvendig.
--
-- SECURITY DEFINER fordi vi vil kunne lese ghost-rader uten å
-- avhenge av at innlogget bruker er parent i familien ennå —
-- dette er hele poenget med funksjonen. Familien identifiseres
-- via join_code i caller (claim_family_via_code), så det er
-- ingen ny informasjon-leak utover det join-koden allerede gir.
-- =============================================================

CREATE OR REPLACE FUNCTION public.find_matching_parent_candidates(
  p_family_id UUID,
  p_input_name TEXT
)
RETURNS TABLE (
  family_member_id UUID,
  name TEXT,
  match_strength INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_input TEXT;
  v_input_tokens TEXT[];
  v_input_lastname TEXT;
  v_input_firstnames TEXT[];
BEGIN
  -- Normaliser input: lowercase, bytt bindestreker mot mellomrom,
  -- kollaps multiple mellomrom til ett, trim.
  v_normalized_input := lower(trim(regexp_replace(
    regexp_replace(p_input_name, '-', ' ', 'g'),
    '\s+', ' ', 'g'
  )));

  IF v_normalized_input IS NULL OR length(v_normalized_input) = 0 THEN
    RETURN;
  END IF;

  -- Splitt i tokens. Trenger minst ett token (et navn) for å gjøre
  -- noen som helst matching.
  v_input_tokens := string_to_array(v_normalized_input, ' ');

  IF array_length(v_input_tokens, 1) IS NULL OR array_length(v_input_tokens, 1) = 0 THEN
    RETURN;
  END IF;

  -- Siste token = etternavn.
  v_input_lastname := v_input_tokens[array_length(v_input_tokens, 1)];

  -- Resterende tokens = fornavn(ene). Hvis brukeren bare har skrevet
  -- ett ord (f.eks. "Liv"), er v_input_firstnames tom — da kan vi
  -- aldri få strength=1 (krever felles fornavn-token), men strength=2
  -- (eksakt match med en ett-ords ghost-rad) fanges fortsatt.
  IF array_length(v_input_tokens, 1) > 1 THEN
    v_input_firstnames := v_input_tokens[1:array_length(v_input_tokens, 1) - 1];
  ELSE
    v_input_firstnames := ARRAY[]::TEXT[];
  END IF;

  -- Returner matches med scoring. CTE-en normaliserer hver kandidats
  -- navn på samme måte som input før sammenligning.
  RETURN QUERY
  WITH normalized_candidates AS (
    SELECT
      fm.id,
      fm.name AS original_name,
      lower(trim(regexp_replace(
        regexp_replace(fm.name, '-', ' ', 'g'),
        '\s+', ' ', 'g'
      ))) AS norm_name
    FROM public.family_members fm
    WHERE fm.family_id = p_family_id
      AND fm.role = 'parent'
      AND fm.auth_user_id IS NULL
      AND fm.name IS NOT NULL
  ),
  scored AS (
    SELECT
      nc.id,
      nc.original_name,
      CASE
        -- Trinn 1: full normalisert match.
        WHEN nc.norm_name = v_normalized_input THEN 2
        -- Trinn 2: etternavn matcher OG minst ett felles fornavn.
        WHEN array_length(string_to_array(nc.norm_name, ' '), 1) >= 2
         AND (string_to_array(nc.norm_name, ' '))[
              array_length(string_to_array(nc.norm_name, ' '), 1)
            ] = v_input_lastname
         AND array_length(v_input_firstnames, 1) IS NOT NULL
         AND EXISTS (
              SELECT 1 FROM unnest(v_input_firstnames) AS input_fn
              WHERE input_fn = ANY(
                (string_to_array(nc.norm_name, ' '))[
                  1:array_length(string_to_array(nc.norm_name, ' '), 1) - 1
                ]
              )
            ) THEN 1
        ELSE 0
      END AS strength
    FROM normalized_candidates nc
  )
  SELECT s.id, s.original_name, s.strength
  FROM scored s
  WHERE s.strength >= 1
  ORDER BY s.strength DESC, s.original_name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_matching_parent_candidates(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.find_matching_parent_candidates(UUID, TEXT) TO authenticated;


-- =============================================================
-- PART B — claim_family_via_code (oppdatert med to-stegs flyt)
-- =============================================================
-- Tre modus styrt av input-parametre:
--   1. p_link_to_existing_id IS NULL OG p_force_create = false
--      → preview-mode: hvis matches finnes, returner kandidatliste
--                      uten mutasjon. Hvis ingen matches: opprett
--                      ny rad (mode='created').
--   2. p_link_to_existing_id IS NULL OG p_force_create = true
--      → create-mode: tving INSERT av ny rad selv om matches
--                     finnes (forelder valgte "Nei, jeg er ny").
--   3. p_link_to_existing_id IS NOT NULL
--      → link-mode: UPDATE eksisterende rad og koble auth_user_id.
--                   Bevar fm.name (koordinatoren skal kjenne det
--                   igjen), oppdater email/phone fra forelder.
--
-- Vi DROPper gammel signatur først pga endret parametersett —
-- CREATE OR REPLACE støtter ikke endret signatur (PostgreSQL
-- behandler det som forskjellige funksjoner basert på arg-typer).
-- =============================================================

DROP FUNCTION IF EXISTS public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.claim_family_via_code(
  p_code TEXT,
  p_parent_name TEXT,
  p_parent_email TEXT,
  p_parent_phone TEXT,
  p_link_to_existing_id UUID DEFAULT NULL,
  p_force_create BOOLEAN DEFAULT false
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
  v_candidates JSONB;
  v_candidate_count INT;
  v_top_strength INT;
  v_link_row RECORD;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget for å koble til familie';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Ugyldig kode';
  END IF;

  v_normalized_code := upper(trim(p_code));

  -- 1. Slå opp barnet via family_members.join_code.
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

  v_family_team_id := COALESCE(v_child.child_team_id, v_child.family_team_id);

  IF v_family_team_id IS NULL THEN
    RAISE EXCEPTION 'Familien er ikke koblet til et lag — kontakt koordinator';
  END IF;

  -- 2. Hent club_id fra eksisterende coordinator/club_admin på samme team.
  SELECT tm.club_id
    INTO v_club_id
  FROM public.team_members tm
  WHERE tm.team_id = v_family_team_id
    AND tm.role IN ('coordinator', 'club_admin')
    AND tm.club_id IS NOT NULL
  LIMIT 1;

  -- 3. Idempotency: er brukeren allerede parent i denne familien?
  --    Dette gjelder uavhengig av modus — om brukeren har en
  --    eksisterende kobling, returnerer vi success uten endring.
  SELECT COUNT(*) INTO v_existing_parent_count
  FROM public.team_members
  WHERE auth_user_id = v_user_id
    AND family_id = v_child.family_id
    AND role = 'parent';

  IF v_existing_parent_count > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'mode', 'already_claimed',
      'family_id', v_child.family_id,
      'team_id', v_family_team_id,
      'family_name', v_child.family_name,
      'already_claimed', true
    );
  END IF;

  -- 4. LINK-MODE: bruker har valgt en eksisterende ghost-rad å
  --    koble seg til. Verifiser at raden er gyldig (tilhører riktig
  --    family_id, er parent, ikke allerede claimet).
  IF p_link_to_existing_id IS NOT NULL THEN
    SELECT fm.id, fm.family_id, fm.role, fm.auth_user_id, fm.name
      INTO v_link_row
    FROM public.family_members fm
    WHERE fm.id = p_link_to_existing_id
    FOR UPDATE;  -- lås raden så ikke to brukere claimer samtidig

    IF NOT FOUND
       OR v_link_row.family_id IS DISTINCT FROM v_child.family_id
       OR v_link_row.role <> 'parent'
       OR v_link_row.auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid candidate';
    END IF;

    -- Insert team_members (parent).
    INSERT INTO public.team_members (
      team_id, club_id, auth_user_id, role, family_id
    )
    VALUES (
      v_family_team_id, v_club_id, v_user_id, 'parent', v_child.family_id
    )
    RETURNING id INTO v_team_member_id;

    -- UPDATE eksisterende family_members-rad. Bevar name (koordinator
    -- skal se det navnet de selv importerte). Oppdater email/phone
    -- fra forelders registrering — det er ny info.
    UPDATE public.family_members
    SET auth_user_id = v_user_id,
        email = COALESCE(NULLIF(p_parent_email, ''), email),
        phone = COALESCE(NULLIF(p_parent_phone, ''), phone),
        team_id = COALESCE(team_id, v_family_team_id)
    WHERE id = p_link_to_existing_id
    RETURNING id INTO v_family_member_id;

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'linked',
      'family_id', v_child.family_id,
      'team_id', v_family_team_id,
      'family_name', v_child.family_name,
      'team_member_id', v_team_member_id,
      'family_member_id', v_family_member_id,
      'already_claimed', false
    );
  END IF;

  -- 5. PREVIEW-MODE (default når p_link_to_existing_id er NULL og
  --    p_force_create er false): se etter matchende ghost-rader.
  --    Hvis funnet, returner kandidatliste uten mutasjon.
  IF p_force_create = false THEN
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'family_member_id', c.family_member_id,
          'name', c.name,
          'match_strength', c.match_strength
        ) ORDER BY c.match_strength DESC, c.name ASC
      ),
      COUNT(*),
      MAX(c.match_strength)
    INTO v_candidates, v_candidate_count, v_top_strength
    FROM public.find_matching_parent_candidates(v_child.family_id, p_parent_name) c;

    IF v_candidate_count > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'mode', 'preview',
        'family_id', v_child.family_id,
        'team_id', v_family_team_id,
        'family_name', v_child.family_name,
        'candidates', v_candidates,
        -- 'auto_match_suggested' når én eksakt match (strength=2) —
        -- frontend kan vise "Er dette deg?" som et enkelt Ja/Nei.
        -- 'select_or_create_new' ellers — frontend viser radio-liste.
        'message', CASE
          WHEN v_candidate_count = 1 AND v_top_strength = 2
            THEN 'auto_match_suggested'
          ELSE 'select_or_create_new'
        END,
        'already_claimed', false
      );
    END IF;
    -- Ingen kandidater — fall through til CREATE-mode under.
  END IF;

  -- 6. CREATE-MODE: ingen matches funnet, eller p_force_create=true.
  --    Insert team_members + family_members (parent) som vanlig.
  INSERT INTO public.team_members (
    team_id, club_id, auth_user_id, role, family_id
  )
  VALUES (
    v_family_team_id, v_club_id, v_user_id, 'parent', v_child.family_id
  )
  RETURNING id INTO v_team_member_id;

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

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'created',
    'family_id', v_child.family_id,
    'team_id', v_family_team_id,
    'family_name', v_child.family_name,
    'team_member_id', v_team_member_id,
    'family_member_id', v_family_member_id,
    'already_claimed', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;


-- =============================================================
-- VERIFIKASJON — kjør før COMMIT
-- =============================================================
-- Sjekker at begge funksjonene finnes med riktig signatur.
DO $$
DECLARE
  v_match_oid OID;
  v_claim_oid OID;
  v_claim_args TEXT;
  v_match_returns TEXT;
BEGIN
  SELECT p.oid, pg_get_function_result(p.oid)
    INTO v_match_oid, v_match_returns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'find_matching_parent_candidates'
    AND p.pronargs = 2;

  IF v_match_oid IS NULL THEN
    RAISE EXCEPTION 'find_matching_parent_candidates(UUID, TEXT) ble ikke opprettet';
  END IF;

  IF v_match_returns NOT LIKE 'TABLE%' THEN
    RAISE EXCEPTION 'find_matching_parent_candidates har feil return-type: %', v_match_returns;
  END IF;

  SELECT p.oid, pg_get_function_arguments(p.oid)
    INTO v_claim_oid, v_claim_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'claim_family_via_code'
    AND p.pronargs = 6;

  IF v_claim_oid IS NULL THEN
    RAISE EXCEPTION 'claim_family_via_code med 6 args ble ikke opprettet';
  END IF;

  -- Sanity-sjekk: gammel 4-arg-versjon skal være borte.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'claim_family_via_code'
      AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'Gammel claim_family_via_code(4-args) finnes fortsatt — DROP feilet';
  END IF;

  RAISE NOTICE '✅ Parent claim dedup migrert. find_matching_parent_candidates + claim_family_via_code (6-args) opprettet.';
END $$;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- Kommentar ut og kjør hvis denne migrasjonen må rulles tilbake.
-- NB: rollback krever at app-koden i ClaimFamilyPage.tsx også
-- rulles tilbake til kun å kalle 4-arg-versjonen.
--
-- DROP FUNCTION IF EXISTS public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT, UUID, BOOLEAN);
-- DROP FUNCTION IF EXISTS public.find_matching_parent_candidates(UUID, TEXT);
--
-- CREATE OR REPLACE FUNCTION public.claim_family_via_code(
--   p_code TEXT, p_parent_name TEXT, p_parent_email TEXT, p_parent_phone TEXT
-- )
-- RETURNS JSONB
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- AS $$
-- -- (... full body fra 20260503_claim_family_via_code_rpc.sql ...)
-- $$;
-- REVOKE EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT) FROM public;
-- GRANT EXECUTE ON FUNCTION public.claim_family_via_code(TEXT, TEXT, TEXT, TEXT) TO authenticated;
