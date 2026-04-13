-- ============================================================
-- Dugnad+ — events.team_id + kiosk_sales.team_id
-- ============================================================
--
-- Legger til team_id-kolonnen på de to siste tabellene som
-- manglet den. Gjør team_id til den kanoniske "hvilket lag
-- hører denne raden til"-nøkkelen på tvers av ALLE tabeller
-- som har et team-konsept.
--
-- Før denne migreringen hadde appen tre parallelle
-- representasjoner:
--   (1) team_id (text) på 9 tabeller — kanonisk
--   (2) family_members.subgroup (text) — uformell, NULL i dag
--   (3) events.(sport + subgroup) — uformell, brukt i
--       CoordinatorDashboard client-side filter
-- Dette commitet gjør (1) til den eneste kilden for nye
-- rader. (2) og (3) beholdes som legacy display-kolonner
-- men brukes ikke lenger for routing/filtering.
--
-- Begge kolonnene er text + nullable + ingen FK, i samsvar
-- med hvordan alle andre 9 team_id-kolonnene er konfigurert.
--
-- Effekt på appen: ingen umiddelbart. Nye event- og kiosk_sales-
-- inserts etter denne migreringen vil sette team_id via
-- CreateEvent/MultiDayBulkCreator/EventsList (kode-endring i
-- samme commit-runde). Eksisterende rader (som uansett er
-- test-data) blir wipet i en separat migrering kjørt rett
-- etter denne.
--
-- Ikke idempotent mot en eksisterende kolonne med samme navn
-- (ADD COLUMN IF NOT EXISTS beskytter mot det), men siden live-
-- DB bekreftet at kolonnene mangler, er dette trivielt trygt.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. events.team_id
-- ------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS team_id text;

COMMENT ON COLUMN public.events.team_id IS
  'Kanonisk team-slug (f.eks. "handball-gutter-2016"). Matcher families.team_id, lotteries.team_id, etc. Settes av frontend ved event-opprettelse via generateTeamSlug-mønsteret.';

-- Indeks for policy-lookups i Steg F (partiell — kun rader
-- med team_id satt, siden legacy/anon-events kan ha NULL).
CREATE INDEX IF NOT EXISTS idx_events_team_id
  ON public.events (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON INDEX public.idx_events_team_id IS
  'Brukes av RLS-policies i Steg F og av CoordinatorDashboard server-side filter.';


-- ------------------------------------------------------------
-- 2. kiosk_sales.team_id
-- ------------------------------------------------------------
ALTER TABLE public.kiosk_sales
  ADD COLUMN IF NOT EXISTS team_id text;

COMMENT ON COLUMN public.kiosk_sales.team_id IS
  'Kanonisk team-slug. Identifiserer hvilken kiosk (og dermed hvilket lag) et salg tilhører. Settes av frontend ved salgs-opprettelse.';

CREATE INDEX IF NOT EXISTS idx_kiosk_sales_team_id
  ON public.kiosk_sales (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON INDEX public.idx_kiosk_sales_team_id IS
  'Brukes av RLS-policies i Steg F for å begrense kiosk_sales.SELECT til koordinator i eget team.';


-- ------------------------------------------------------------
-- 3. Selvsjekk
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'team_id'
  ) THEN
    RAISE EXCEPTION 'events.team_id ble ikke opprettet';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kiosk_sales' AND column_name = 'team_id'
  ) THEN
    RAISE EXCEPTION 'kiosk_sales.team_id ble ikke opprettet';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (manuell)
-- ============================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_kiosk_sales_team_id;
-- DROP INDEX IF EXISTS public.idx_events_team_id;
-- ALTER TABLE public.kiosk_sales DROP COLUMN IF EXISTS team_id;
-- ALTER TABLE public.events      DROP COLUMN IF EXISTS team_id;
-- COMMIT;
-- ============================================================
