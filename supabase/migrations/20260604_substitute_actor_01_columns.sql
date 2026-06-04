-- =============================================================
-- Fase 5-A — substitute_id-kolonner på requests + assignments
-- =============================================================
-- Dato: 2026-06-04
-- Avhengighet: substitutes-tabellen (Fase 4A)
--
-- BAKGRUNN
-- Etter Fase 4B var det meningen at requests.bid_family_id og
-- assignments.family_id skulle holde enten en families.id eller
-- en substitutes.id. Men FK-constraints peker på families(id) og
-- er enforced → INSERT med en substitutes.id ville bli avvist av
-- Postgres. 0 rader i requests/assignments i prod = feilen har
-- ikke vist seg, men vikar-flyten var i praksis død.
--
-- Modell 2 (vurdert i Fase 5-kartleggingen): to separate uuid-
-- kolonner per polymorf rolle, mutex-CHECK at maksimalt én er
-- non-null. Ekte FK-constraints per kolonne, eksplisitt RLS,
-- Supabase REST embed virker fortsatt mot families-kolonnene.
--
-- ENDRINGER I DENNE MIGRASJONEN
-- 1. requests: ADD target_substitute_id, bid_substitute_id (FK
--    substitutes, ON DELETE SET NULL)
-- 2. assignments: ADD substitute_id (FK substitutes, ON DELETE
--    CASCADE) + ALTER family_id DROP NOT NULL (nødvendig for XOR-
--    check siden vikar-assignments har family_id=NULL)
-- 3. CHECK-constraints:
--    - requests: maks én av (target_family_id, target_substitute_id)
--      non-null; samme for bid_family_id/bid_substitute_id
--    - assignments: nøyaktig én av (family_id, substitute_id)
-- 4. Partielle indekser på de nye FK-kolonnene for join-effektivitet
--
-- TRYGGHET
-- 0 rader i requests og assignments. Eksisterende families-FK-er
-- (target_family_id, bid_family_id, from_family_id, to_family_id,
-- family_id) er uendret. from_family_id og to_family_id forblir
-- family-only (vikar initierer ikke requests — bekreftet 2026-06-04).
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Nye kolonner + FK
-- ------------------------------------------------------------

ALTER TABLE public.requests
  ADD COLUMN target_substitute_id uuid REFERENCES public.substitutes(id) ON DELETE SET NULL,
  ADD COLUMN bid_substitute_id    uuid REFERENCES public.substitutes(id) ON DELETE SET NULL;

ALTER TABLE public.assignments
  ADD COLUMN substitute_id uuid REFERENCES public.substitutes(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.requests.target_substitute_id IS
  'Direkte tilbud til en spesifikk vikar. NULL for åpne markeds-'
  'requests eller swap-requests. Mutex med target_family_id (maks én).';

COMMENT ON COLUMN public.requests.bid_substitute_id IS
  'Vikar som har lagt bud på en åpen substitute-request. NULL hvis '
  'ingen bud, eller hvis budet kom fra en familie (bid_family_id). '
  'Mutex med bid_family_id (maks én).';

COMMENT ON COLUMN public.assignments.substitute_id IS
  'Vikar som er tildelt vakta. Mutex med family_id (nøyaktig én '
  'skal være satt — XOR enforced via assignments_actor_xor CHECK).';

-- ------------------------------------------------------------
-- 2. assignments.family_id må bli nullable
-- ------------------------------------------------------------
-- Begrunnelse: vikar-assignments har family_id=NULL og substitute_id
-- satt. Eksisterende familie-assignments er uberørt (0 rader nå,
-- og fremtidige beholder family_id NOT NULL via XOR-check).

ALTER TABLE public.assignments ALTER COLUMN family_id DROP NOT NULL;

-- ------------------------------------------------------------
-- 3. Mutex-CHECK-constraints
-- ------------------------------------------------------------

ALTER TABLE public.requests
  ADD CONSTRAINT requests_target_actor_mutex
    CHECK (target_family_id IS NULL OR target_substitute_id IS NULL),
  ADD CONSTRAINT requests_bid_actor_mutex
    CHECK (bid_family_id IS NULL OR bid_substitute_id IS NULL);

-- XOR: nøyaktig én av family_id og substitute_id må være satt.
-- Begge null → ulovlig (ingen tildelt). Begge satt → ulovlig (uklart hvem).
ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_actor_xor
    CHECK ((family_id IS NULL) <> (substitute_id IS NULL));

-- ------------------------------------------------------------
-- 4. Indekser
-- ------------------------------------------------------------
-- Partielle indekser sparer plass — de fleste rader vil ha
-- substitute_id NULL (familier dominerer fortsatt).

CREATE INDEX IF NOT EXISTS requests_target_substitute_id_idx
  ON public.requests(target_substitute_id) WHERE target_substitute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS requests_bid_substitute_id_idx
  ON public.requests(bid_substitute_id) WHERE bid_substitute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assignments_substitute_id_idx
  ON public.assignments(substitute_id) WHERE substitute_id IS NOT NULL;

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_count integer;
  v_family_id_nullable text;
BEGIN
  -- Nye kolonner finnes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='requests' AND column_name='target_substitute_id') THEN
    RAISE EXCEPTION 'requests.target_substitute_id mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='requests' AND column_name='bid_substitute_id') THEN
    RAISE EXCEPTION 'requests.bid_substitute_id mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='assignments' AND column_name='substitute_id') THEN
    RAISE EXCEPTION 'assignments.substitute_id mangler';
  END IF;

  -- assignments.family_id er nullable
  SELECT is_nullable INTO v_family_id_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='assignments' AND column_name='family_id';
  IF v_family_id_nullable <> 'YES' THEN
    RAISE EXCEPTION 'assignments.family_id er fortsatt NOT NULL (forventet nullable)';
  END IF;

  -- FK-er mot substitutes
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND confrelid = 'public.substitutes'::regclass
    AND conrelid IN ('public.requests'::regclass, 'public.assignments'::regclass);
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Forventet 3 nye FK-er mot substitutes, fant %', v_count;
  END IF;

  -- 3 nye CHECK-constraints
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requests_target_actor_mutex') THEN
    RAISE EXCEPTION 'requests_target_actor_mutex mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requests_bid_actor_mutex') THEN
    RAISE EXCEPTION 'requests_bid_actor_mutex mangler';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_actor_xor') THEN
    RAISE EXCEPTION 'assignments_actor_xor mangler';
  END IF;

  -- Indekser
  SELECT count(*) INTO v_count FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN ('requests_target_substitute_id_idx',
                      'requests_bid_substitute_id_idx',
                      'assignments_substitute_id_idx');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Forventet 3 nye indekser, fant %', v_count;
  END IF;

  RAISE NOTICE '✅ Fase 5-A OK — 3 nye kolonner, 3 FK-er, 3 CHECK-constraints, 3 indekser. assignments.family_id er nullable.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP INDEX IF EXISTS public.assignments_substitute_id_idx;
-- DROP INDEX IF EXISTS public.requests_bid_substitute_id_idx;
-- DROP INDEX IF EXISTS public.requests_target_substitute_id_idx;
--
-- ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_actor_xor;
-- ALTER TABLE public.requests    DROP CONSTRAINT IF EXISTS requests_bid_actor_mutex;
-- ALTER TABLE public.requests    DROP CONSTRAINT IF EXISTS requests_target_actor_mutex;
--
-- -- NB: gjenopprett NOT NULL kun hvis ingen NULL-rader finnes.
-- -- ALTER TABLE public.assignments ALTER COLUMN family_id SET NOT NULL;
--
-- ALTER TABLE public.assignments DROP COLUMN IF EXISTS substitute_id;
-- ALTER TABLE public.requests    DROP COLUMN IF EXISTS bid_substitute_id;
-- ALTER TABLE public.requests    DROP COLUMN IF EXISTS target_substitute_id;
-- COMMIT;
