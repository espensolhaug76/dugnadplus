-- ============================================================
-- Dugnad+ — Normaliser family_members.join_code
-- ============================================================
--
-- Fjerner bindestreker fra eksisterende join_code-verdier slik at
-- live-data matcher den nye generator-logikken i src/utils/joinCode.ts
-- ("{PREFIX}{NNNN}" uten bindestrek).
--
-- Historikk: ImportFamilies og ManageFamilies genererte tidligere
-- koder på formen "{PREFIX}-{NNNN}" (f.eks. "KON-8583"). Ny kode
-- bruker "{PREFIX}{NNNN}" ("KON8583"). Frontend er tolerant via
-- normalizeJoinCode() som aksepterer begge formater fra bruker-
-- input, men lagrede verdier må standardiseres for å holde
-- ClaimFamilyPage + JoinPage sine join_code-queryer konsistente.
--
-- Idempotent: andre kjøring finner 0 dash-koder og blir no-op.
-- Transaksjonspakket med selvsjekk — hvis UPDATE-en etterlater
-- noen rader med dash, rulles hele migreringen tilbake og
-- databasen er uendret.
--
-- Ikke-destruktiv: bare REPLACE på en eksisterende kolonne.
-- Ingen rader slettes eller opprettes.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Før-sjekk: tell legacy-koder
-- ------------------------------------------------------------
DO $$
DECLARE
  with_dash_count bigint;
  total_count bigint;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM public.family_members
  WHERE join_code IS NOT NULL;

  SELECT COUNT(*) INTO with_dash_count
  FROM public.family_members
  WHERE join_code LIKE '%-%';

  RAISE NOTICE 'join_code-status FØR: % totalt, % med dash', total_count, with_dash_count;
END $$;


-- ------------------------------------------------------------
-- 2. UPDATE: fjern dash fra alle matchende rader
-- ------------------------------------------------------------
UPDATE public.family_members
SET join_code = REPLACE(join_code, '-', '')
WHERE join_code LIKE '%-%';


-- ------------------------------------------------------------
-- 3. Etter-sjekk: 0 dash-koder skal være igjen
-- ------------------------------------------------------------
DO $$
DECLARE
  remaining bigint;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.family_members
  WHERE join_code LIKE '%-%';

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Migreringen feilet: % rader har fortsatt dash i join_code', remaining;
  END IF;

  RAISE NOTICE 'join_code-status ETTER: 0 med dash. OK.';
END $$;


-- ------------------------------------------------------------
-- 4. Valgfri bonus: unique-sjekk etter wipe
-- ------------------------------------------------------------
-- Ikke en hard feil hvis to koder kolliderer (kunne skje hvis
-- generator-random traff samme nummer på samme prefix), men vi
-- ønsker å vite det. join_code har en UNIQUE-constraint fra
-- skjemaet (supabase_KOMPLETT.sql:153) så en kollisjon ville
-- faktisk ha fått UPDATE-en til å feile med 23505 og rullet
-- tilbake transaksjonen. Inkluderes som NOTICE for tydelighet.
DO $$
DECLARE
  dupes bigint;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT join_code, COUNT(*) c
    FROM public.family_members
    WHERE join_code IS NOT NULL
    GROUP BY join_code
    HAVING COUNT(*) > 1
  ) x;

  IF dupes > 0 THEN
    RAISE NOTICE 'Advarsel: % duplikate join_code-verdier etter normalisering', dupes;
  ELSE
    RAISE NOTICE 'Unique-sjekk OK: ingen duplikate join_code-verdier';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (ikke mulig — den opprinnelige formen er tapt)
-- ============================================================
-- Denne migreringen er en envei-operasjon. REPLACE() er
-- tapsløs for all nyttig informasjon (prefix + 4 sifre),
-- men den nøyaktige gamle streng-formen er borte etter
-- commit. Hvis en rollback skulle trengs: bruk Supabase
-- Point-in-Time-Recovery.
-- ============================================================
