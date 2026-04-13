-- ============================================================
-- Dugnad+ — family_members.team_id
-- ============================================================
--
-- Multi-child-støtte: en familie kan ha flere barn på flere lag
-- (f.eks. ett barn på håndball, ett på fotball). families.team_id
-- beholdes som "primær-team" men er ikke lenger autoritativ for
-- hvilket lag et medlem tilhører — family_members.team_id er
-- kilden per rad.
--
-- For parents er team_id "primær-team" (default ved team-filtrering
-- i koordinator-UI) men kan være NULL. For children er team_id
-- autoritativt for hvilket lag barnet spiller på.
--
-- Backfill: alle eksisterende rader arver team_id fra sin families-
-- rad. Dette er konservativt og trygt — ingen eksisterende data
-- flyttes mellom team, vi bare denormaliserer.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Legg til kolonnen
-- ------------------------------------------------------------
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS team_id text;

COMMENT ON COLUMN public.family_members.team_id IS
  'Autoritativt team for medlemmet. For children: hvilket lag de spiller på. For parents: default/primær-team (kan være NULL). Multi-child-familier kan ha barn på flere team_id-verdier.';


-- ------------------------------------------------------------
-- 2. Backfill fra families.team_id
-- ------------------------------------------------------------
DO $$
DECLARE
  before_null bigint;
  updated_count bigint;
  after_null bigint;
BEGIN
  SELECT COUNT(*) INTO before_null
  FROM public.family_members
  WHERE team_id IS NULL;

  RAISE NOTICE 'FØR backfill: % rader med team_id IS NULL', before_null;

  WITH updated AS (
    UPDATE public.family_members fm
    SET team_id = f.team_id
    FROM public.families f
    WHERE fm.family_id = f.id
      AND fm.team_id IS NULL
      AND f.team_id IS NOT NULL
    RETURNING fm.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  SELECT COUNT(*) INTO after_null
  FROM public.family_members
  WHERE team_id IS NULL;

  RAISE NOTICE 'Backfill oppdaterte % rader', updated_count;
  RAISE NOTICE 'ETTER backfill: % rader med team_id IS NULL (rester = parents/children uten tilknytning til en families-rad med team_id)', after_null;
END $$;


-- ------------------------------------------------------------
-- 3. Index for policy-lookups i Steg F + parent-dashboards
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS family_members_team_id_idx
  ON public.family_members (team_id)
  WHERE team_id IS NOT NULL;

COMMENT ON INDEX public.family_members_team_id_idx IS
  'Partiell index — brukes av koordinator-queryer "hvem er medlemmer av dette teamet?" og av RLS-policies i Steg F.';


-- ------------------------------------------------------------
-- 4. Selvsjekk
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'team_id'
  ) THEN
    RAISE EXCEPTION 'family_members.team_id ble ikke opprettet';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (manuell)
-- ============================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.family_members_team_id_idx;
-- ALTER TABLE public.family_members DROP COLUMN IF EXISTS team_id;
-- COMMIT;
-- ============================================================
