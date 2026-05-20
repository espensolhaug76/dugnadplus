-- =============================================================
-- Fix: get_seller_display_name skal returnere BARNETS navn,
-- ikke forelderens
-- =============================================================
-- 2026-05-20:
-- Funksjonen ble laget i april (Steg E) som SECURITY DEFINER-RPC
-- for å erstatte direkte SELECT på families fra anonyme shop-
-- flows. Intensjonen var GDPR-vennlig fornavn-visning på
-- offentlige delelinker. Men implementasjonen havnet feil —
-- den prioriterer forelderens fornavn først, mens nåværende
-- shop-design (LotteryShop, CampaignShop) skal vise BARNETS
-- fornavn ("Støtt Adrian og laget!").
--
-- Designprinsipp: offentlige shop-lenker skal aldri eksponere
-- forelders navn. Hvis barnet ikke kan utledes, falles det
-- tilbake til familienavnet (som typisk er "Familien Hansen" —
-- ikke et personnavn).
--
-- Endring:
-- 1. Bytt prioritering: barnets navn først, deretter familienavn
-- 2. Drop forelder-fallback helt — funksjonen skal aldri
--    returnere en voksens navn
-- 3. Bytt fallback fra 'Ukjent' til 'en dugnadsfamilie' for
--    konsistens med LotteryShop sin opprinnelige UI-default
--
-- Signatur og SECURITY DEFINER-attributt uendret. Ingen
-- frontend-endring kreves — LotteryShop og fremtidige
-- CampaignShop-kall mot samme RPC vil se ny atferd direkte.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_seller_display_name(p_family_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- Forsøk 1: fornavnet til BARNET (eldste først hvis flere)
    (
      SELECT split_part(fm.name, ' ', 1)
      FROM family_members fm
      WHERE fm.family_id = p_family_id
        AND fm.role = 'child'
      ORDER BY fm.created_at
      LIMIT 1
    ),
    -- Forsøk 2: familienavn (typisk "Familien X" — ikke et
    -- personnavn, så GDPR-trygg fallback)
    (
      SELECT f.name
      FROM families f
      WHERE f.id = p_family_id
    ),
    -- Forsøk 3: generisk fallback. Matcher LotteryShop sin
    -- opprinnelige useState-default slik at "tomme" tilfeller
    -- ser ut som en uinitialisert shop-load.
    'en dugnadsfamilie'
  );
$function$;

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_result text;
  v_test_family_id uuid := '8fbc1f6a-44c8-4d2b-a212-9c98f2781c43';
  v_has_child boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM family_members
    WHERE family_id = v_test_family_id AND role = 'child'
  ) INTO v_has_child;

  SELECT get_seller_display_name(v_test_family_id) INTO v_result;
  RAISE NOTICE 'Test family % (has_child=%) display name: "%"',
    v_test_family_id, v_has_child, v_result;
  -- Forventet hvis familien har barn: barnets fornavn (f.eks. "Adrian")
  -- Forventet hvis ingen barn-rad: familienavn (eks. "Familien X")
  -- Skal IKKE returnere forelderens fornavn (Espen/Roar)

  -- Sanity: bekreft at funksjonen ikke lenger ser etter 'parent'
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'get_seller_display_name'
      AND prosrc ILIKE '%role = ''parent''%'
  ) THEN
    RAISE EXCEPTION 'get_seller_display_name refererer fortsatt til role=parent — funksjonsdef ble ikke oppdatert';
  END IF;

  RAISE NOTICE '✅ get_seller_display_name returnerer nå barnets fornavn med familienavn-fallback.';
END $$;

-- =============================================================
-- ROLLBACK (gjenopprett gammel parent-først-logikk)
-- =============================================================
-- CREATE OR REPLACE FUNCTION public.get_seller_display_name(p_family_id uuid)
-- RETURNS text
-- LANGUAGE sql
-- STABLE SECURITY DEFINER
-- SET search_path TO 'public'
-- AS $function$
--   SELECT COALESCE(
--     (SELECT split_part(fm.name, ' ', 1) FROM family_members fm
--      WHERE fm.family_id = p_family_id AND fm.role = 'parent'
--      ORDER BY fm.created_at LIMIT 1),
--     (SELECT f.name FROM families f WHERE f.id = p_family_id),
--     'Ukjent'
--   );
-- $function$;
