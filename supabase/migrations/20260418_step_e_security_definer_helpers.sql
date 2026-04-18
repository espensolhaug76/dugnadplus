-- ============================================================
-- Dugnad+ — Steg E: SECURITY DEFINER helper-funksjoner
-- Dato: 2026-04-18
-- Avhengigheter: Steg A (team_members-tabellen må eksistere)
-- ============================================================
--
-- Disse fem funksjonene brukes av RLS-policies i Steg F.
-- De installeres nå som forberedelse — ingen policies endres,
-- ingen frontend-kode endres, appen merker ingenting.
--
-- Alle funksjoner:
--   - SECURITY DEFINER: kjører med eierens rettigheter, slik at
--     policies kan kalle dem uten at brukeren trenger direkte
--     SELECT-tilgang på de underliggende tabellene.
--   - SET search_path = public: forhindrer search_path-hijacking
--     (CWE-426) der en angriper oppretter et objekt i et annet
--     schema som skygger public-tabellen.
--   - STABLE: resultatet endres ikke innenfor samme transaksjon,
--     slik at Postgres kan cache kallet per statement.
--   - CREATE OR REPLACE: idempotent — trygt å kjøre flere ganger.
--
-- GDPR-merknader:
--   - get_seller_display_name: returnerer KUN fornavn, aldri
--     etternavn, telefon eller e-post.
--   - resolve_join_code: returnerer KUN barnets fornavn, lagets
--     visningsnavn og family_member-ID. Ingen foreldreinfo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. auth_user_team_ids() → text[]
--
-- Returnerer alle team_id-verdier brukeren tilhører.
-- Brukes i policies: WHERE team_id = ANY(auth_user_team_ids())
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_team_ids()
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(tm.team_id),
    '{}'::text[]
  )
  FROM team_members tm
  WHERE tm.auth_user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.auth_user_team_ids() IS
  'Steg E helper — returnerer alle team_id-verdier for innlogget bruker. '
  'Brukes i RLS-policies som: WHERE team_id = ANY(auth_user_team_ids()). '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 2. auth_user_role_in(p_team_id text) → text
--
-- Returnerer rollen (coordinator/parent/club_admin) for
-- innlogget bruker i det gitte teamet. NULL hvis ingen rad.
-- Brukes i policies for rolle-basert tilgang.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_role_in(p_team_id text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT tm.role
  FROM team_members tm
  WHERE tm.auth_user_id = auth.uid()
    AND tm.team_id = p_team_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_user_role_in(text) IS
  'Steg E helper — returnerer rollen for innlogget bruker i gitt team. '
  'NULL hvis brukeren ikke er medlem. '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 3. auth_user_family_id() → uuid
--
-- Returnerer family_id fra team_members der brukeren har
-- rollen 'parent'. maybeSingle-semantikk: returnerer NULL
-- hvis ingen parent-rad finnes. Hvis brukeren er parent i
-- flere team, returneres den første (deterministisk men
-- vilkårlig — policies som bruker denne bør også sjekke
-- team_id separat).
-- Brukes i policies: WHERE family_id = auth_user_family_id()
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_user_family_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT tm.family_id
  FROM team_members tm
  WHERE tm.auth_user_id = auth.uid()
    AND tm.role = 'parent'
    AND tm.family_id IS NOT NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.auth_user_family_id() IS
  'Steg E helper — returnerer family_id for innlogget parent-bruker. '
  'NULL hvis brukeren ikke har parent-rolle. '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 4. get_seller_display_name(p_family_id uuid) → text
--
-- GDPR-minimering: returnerer KUN fornavnet til den første
-- foresatte (role = 'parent') i familien. Aldri etternavn,
-- telefon eller e-post. Brukes i anonyme shop-flows
-- (LotteryShop, CampaignShop) der kjøperen ser
-- "Solgt av [fornavn]".
--
-- Returnerer familiens navn (families.name) som fallback
-- hvis ingen parent-member finnes.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_seller_display_name(p_family_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    -- Forsøk 1: fornavnet til første forelder i familien
    (
      SELECT split_part(fm.name, ' ', 1)
      FROM family_members fm
      WHERE fm.family_id = p_family_id
        AND fm.role = 'parent'
      ORDER BY fm.created_at
      LIMIT 1
    ),
    -- Forsøk 2: familiens navn (fallback)
    (
      SELECT f.name
      FROM families f
      WHERE f.id = p_family_id
    ),
    -- Forsøk 3: generisk
    'Ukjent'
  );
$$;

COMMENT ON FUNCTION public.get_seller_display_name(uuid) IS
  'Steg E helper — GDPR-minimert visningsnavn for selger. '
  'Returnerer KUN fornavn, aldri etternavn/telefon/e-post. '
  'For bruk i anonyme shop-flows (LotteryShop, CampaignShop, KioskShop). '
  'SECURITY DEFINER + SET search_path = public.';


-- ------------------------------------------------------------
-- 5. resolve_join_code(p_code text)
--    → TABLE(child_name text, team_display_name text, family_member_id uuid)
--
-- GDPR-minimering: returnerer KUN det minimum /claim-family
-- trenger for å vise bekreftelsessiden:
--   - barnets fornavn (ikke etternavn)
--   - lagets visningsnavn (fra families.team_id)
--   - family_member-IDen (for å fullføre claim)
-- Aldri foreldrenavn, kontaktinfo eller familie-ID.
--
-- Koden sammenlignes case-insensitive (LOWER) for å matche
-- bruker-input uavhengig av store/små bokstaver.
-- Returnerer 0 rader hvis koden ikke finnes.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_join_code(p_code text)
  RETURNS TABLE(child_name text, team_display_name text, family_member_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    split_part(fm.name, ' ', 1)  AS child_name,
    COALESCE(f.team_id, '')      AS team_display_name,
    fm.id                        AS family_member_id
  FROM family_members fm
  JOIN families f ON f.id = fm.family_id
  WHERE LOWER(fm.join_code) = LOWER(p_code)
    AND fm.role = 'child'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_join_code(text) IS
  'Steg E helper — slår opp join-kode og returnerer KUN barnets '
  'fornavn, lagets visningsnavn og family_member-ID. Aldri foreldreinfo. '
  'For bruk i pre-auth /claim-family flow. '
  'SECURITY DEFINER + SET search_path = public.';


-- ============================================================
-- SELVSJEKK — verifiser at alle 5 funksjoner eksisterer
-- ============================================================

DO $$
DECLARE
  v_count integer;
  v_expected text[] := ARRAY[
    'auth_user_team_ids',
    'auth_user_role_in',
    'auth_user_family_id',
    'get_seller_display_name',
    'resolve_join_code'
  ];
  v_missing text[] := '{}';
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_name;

    IF v_count = 0 THEN
      v_missing := array_append(v_missing, v_name);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'Steg E FEILET — manglende funksjoner: %', v_missing;
  END IF;

  -- Signatur-sjekk: verifiser antall argumenter
  -- auth_user_team_ids: 0, auth_user_role_in: 1,
  -- auth_user_family_id: 0, get_seller_display_name: 1,
  -- resolve_join_code: 1

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_team_ids' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'auth_user_team_ids har feil signatur (forventet 0 argumenter)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_role_in' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'auth_user_role_in har feil signatur (forventet 1 argument)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'auth_user_family_id' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'auth_user_family_id har feil signatur (forventet 0 argumenter)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_seller_display_name' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'get_seller_display_name har feil signatur (forventet 1 argument)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_join_code' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'resolve_join_code har feil signatur (forventet 1 argument)';
  END IF;

  RAISE NOTICE '✅ Steg E SELVSJEKK OK — alle 5 funksjoner eksisterer med riktig signatur';
END $$;


COMMIT;


-- ============================================================
-- ROLLBACK — kjør dette for å fjerne alle 5 funksjoner
-- ============================================================
--
-- DROP FUNCTION IF EXISTS public.auth_user_team_ids();
-- DROP FUNCTION IF EXISTS public.auth_user_role_in(text);
-- DROP FUNCTION IF EXISTS public.auth_user_family_id();
-- DROP FUNCTION IF EXISTS public.get_seller_display_name(uuid);
-- DROP FUNCTION IF EXISTS public.resolve_join_code(text);
