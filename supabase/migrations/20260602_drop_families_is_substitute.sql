-- =============================================================
-- Drop families.is_substitute
-- =============================================================
-- Dato: 2026-06-02
-- Avhengigheter: Fase 4A (substitutes-tabell) + Fase 4B
--                (frontend bruker substitutes, ikke families)
--
-- BAKGRUNN
-- Kolonnen ble lagt til som type-discriminator da vikar lå i
-- families-tabellen. Fra Fase 4A bor vikar i egen substitutes-
-- tabell, og Fase 4B fjernet all frontend-bruk av is_substitute.
-- Verifisert via grep -r "is_substitute" src/ → 0 treff.
--
-- Trygt: 0 vikar-rader (families WHERE is_substitute = true = 0),
-- ingen RLS-policies eller andre objekter refererer kolonnen.
-- =============================================================

BEGIN;

ALTER TABLE public.families DROP COLUMN IF EXISTS is_substitute;

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'families'
      AND column_name = 'is_substitute'
  ) THEN
    RAISE EXCEPTION 'is_substitute-kolonnen ble ikke droppet';
  END IF;

  RAISE NOTICE '✅ families.is_substitute droppet. Vikar lever nå utelukkende i substitutes-tabellen.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK — gjenopprett kolonnen (legacy-default false)
-- =============================================================
-- BEGIN;
-- ALTER TABLE public.families
--   ADD COLUMN is_substitute boolean NOT NULL DEFAULT false;
-- COMMIT;
