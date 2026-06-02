-- =============================================================
-- Fase 4D-B — Geografi-kolonner på substitutes
-- =============================================================
-- Dato: 2026-06-02
-- Avhengighet: 20260601_substitutes_table.sql
--
-- BAKGRUNN
-- Vikar er klubbløs men ikke geografi-løs. Hjemkommunen styrer
-- hvilke åpne vakter vikaren ser i børsen (Fase 4D-C: list_open_
-- substitute_jobs-RPC). Fylke trengs i UI for fylke-først dropdown
-- (samme mønster som ClubCreationPage), selv om filteringen bare
-- skjer på kommune.
--
-- Begge kolonner er nullable — en vikar kan eksistere uten å ha
-- satt geografi ennå. RPC-en håndterer dette ved å returnere ALLE
-- åpne vakter når municipality IS NULL/tom.
-- =============================================================

BEGIN;

ALTER TABLE public.substitutes
  ADD COLUMN county       text,
  ADD COLUMN municipality text;

COMMENT ON COLUMN public.substitutes.county IS
  'Vikarens fylke (norsk fylke-navn, eks. "Innlandet"). Brukes som '
  'forfilter i UI før kommunevalg. Filtrering av åpne vakter skjer '
  'på municipality, ikke county.';

COMMENT ON COLUMN public.substitutes.municipality IS
  'Vikarens hjemkommune (norsk kommune-navn, eks. "Kongsvinger"). '
  'Brukes av list_open_substitute_jobs til å filtrere børs-treff. '
  'NULL/tom → ingen filtrering (vikar ser alle åpne vakter).';

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_county_exists boolean;
  v_municipality_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'substitutes' AND column_name = 'county'
  ) INTO v_county_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'substitutes' AND column_name = 'municipality'
  ) INTO v_municipality_exists;

  IF NOT v_county_exists THEN
    RAISE EXCEPTION 'substitutes.county ble ikke lagt til';
  END IF;
  IF NOT v_municipality_exists THEN
    RAISE EXCEPTION 'substitutes.municipality ble ikke lagt til';
  END IF;

  RAISE NOTICE '✅ substitutes utvidet med county og municipality (begge nullable text).';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- ALTER TABLE public.substitutes
--   DROP COLUMN IF EXISTS municipality,
--   DROP COLUMN IF EXISTS county;
-- COMMIT;
