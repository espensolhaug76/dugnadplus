-- ============================================================
-- Dugnad+ — RLS Fase 2, Steg B "light"
-- Populer team_members for eksisterende auth_user_id-koblede parents
-- ============================================================
--
-- Kontekst: Dry-run 2026-04-15 viste at den fulle Steg B-
-- migreringen ikke er nødvendig etter data-wipen:
--
--   parents_without_auth_user_id:       35 (Spond-imports uten auth)
--   approved_pending_parents:            0 (ingen kilde å backfille FRA)
--   parents_missing_from_team_members:   5 (test-claims)
--   families_without_team_id:            0
--
-- De 35 Spond-importerte parents må forbli auth_user_id IS NULL
-- til de kobler seg organisk via /claim-family etter pilot-launch.
-- Den eneste reelle handlingen nå er å populere team_members for
-- de 5 test-parents som allerede har auth_user_id men mangler en
-- team_members-rad.
--
-- Den fulle Steg B-migreringen (med pending_parents-backfill) kjøres
-- senere når den tabellen faktisk inneholder data.
--
-- Idempotent: ON CONFLICT DO NOTHING og NOT EXISTS-sjekk gjør det
-- trygt å kjøre flere ganger. Selvsjekk på antall inserted rader
-- feiler transaksjonen hvis vi ikke får de forventede radene.
--
-- Kjørt og verifisert i produksjon 2026-04-15: rows_inserted = 5,
-- transaksjonen committet uten exception.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Før-sjekk: hvor mange kandidater finnes akkurat nå?
-- ------------------------------------------------------------
DO $$
DECLARE
  candidate_count bigint;
BEGIN
  SELECT COUNT(*) INTO candidate_count
  FROM public.family_members fm
  WHERE fm.role = 'parent'
    AND fm.auth_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.auth_user_id = fm.auth_user_id
        AND tm.role = 'parent'
    );

  RAISE NOTICE 'Før insert: % parent(s) mangler i team_members', candidate_count;
END $$;


-- ------------------------------------------------------------
-- 2. Insert team_members-rader for alle kvalifiserte parents
-- ------------------------------------------------------------
-- Kildene:
--   family_members.auth_user_id  -> team_members.auth_user_id
--   families.team_id             -> team_members.team_id
--   families.id                  -> team_members.family_id
--   'parent' (konstant)          -> team_members.role
-- club_id er NULL — vi har ikke en kanonisk families -> clubs-mapping
-- ennå, og team_members.club_id er nullable.
--
-- ON CONFLICT bruker den eksisterende unique-constrainten
-- team_members_unique_team_user_role (team_id, auth_user_id, role)
-- fra Steg A.

WITH inserted AS (
  INSERT INTO public.team_members (team_id, auth_user_id, role, family_id, club_id)
  SELECT
    f.team_id,
    fm.auth_user_id,
    'parent',
    fm.family_id,
    NULL
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.role = 'parent'
    AND fm.auth_user_id IS NOT NULL
    AND f.team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.auth_user_id = fm.auth_user_id
        AND tm.role = 'parent'
    )
  ON CONFLICT (team_id, auth_user_id, role) DO NOTHING
  RETURNING id
)
SELECT COUNT(*) AS rows_inserted FROM inserted;


-- ------------------------------------------------------------
-- 3. Etter-sjekk: verifiser at ingen kvalifiserte parents er
-- igjen utenfor team_members
-- ------------------------------------------------------------
DO $$
DECLARE
  remaining bigint;
  actual_count bigint;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.family_members fm
  WHERE fm.role = 'parent'
    AND fm.auth_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.auth_user_id = fm.auth_user_id
        AND tm.role = 'parent'
    );

  IF remaining <> 0 THEN
    RAISE EXCEPTION 'Migreringen feilet: % parent(s) har fortsatt auth_user_id satt men mangler i team_members. Undersøk om noen av dem har families.team_id IS NULL.', remaining;
  END IF;

  SELECT COUNT(*) INTO actual_count
  FROM public.team_members
  WHERE role = 'parent';

  RAISE NOTICE 'Etter insert: 0 parents mangler i team_members. Total parent-rader i team_members: %', actual_count;
END $$;


-- ------------------------------------------------------------
-- 4. Sanity check: bekreft at ingen duplikater finnes
-- ------------------------------------------------------------
DO $$
DECLARE
  dupe_count bigint;
BEGIN
  SELECT COUNT(*) INTO dupe_count FROM (
    SELECT team_id, auth_user_id, role, COUNT(*) c
    FROM public.team_members
    GROUP BY team_id, auth_user_id, role
    HAVING COUNT(*) > 1
  ) x;

  IF dupe_count > 0 THEN
    RAISE EXCEPTION 'Duplikater funnet i team_members etter insert: % (team_id, auth_user_id, role)-kombinasjoner', dupe_count;
  END IF;

  RAISE NOTICE 'Ingen duplikater i team_members';
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (manuell — kjør KUN hvis noe ser galt ut etter commit)
-- ============================================================
-- Steg B "light" er additiv — den inserter rader i team_members
-- og rører IKKE eksisterende data. Rollback er derfor enkel:
-- slett rader med role='parent' som ble opprettet i dag.
-- Kontroller datoen før du kjører, og juster intervallet ved behov.
--
-- BEGIN;
-- DELETE FROM public.team_members
-- WHERE role = 'parent'
--   AND created_at >= '2026-04-15 00:00:00'::timestamptz
--   AND created_at <  '2026-04-16 00:00:00'::timestamptz;
-- COMMIT;
-- ============================================================
