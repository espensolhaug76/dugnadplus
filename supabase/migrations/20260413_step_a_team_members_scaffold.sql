-- ============================================================
-- Dugnad+ — RLS Fase 2, Steg A
-- Tabell-scaffold for team_members og rollback-snapshot-tabeller
-- ============================================================
--
-- Denne filen er "Steg A" i utrullingsplanen dokumentert i
-- docs/RLS_POLICY_DESIGN.md. Steget er bevisst MINIMALT:
--
--   - Oppretter `team_members`-tabellen som senere (Steg B) skal
--     populeres med koblinger fra auth-brukere til team og roller.
--   - Oppretter to snapshot-tabeller som brukes for rollback av
--     datamigreringen i Steg B.
--
-- Denne filen gjør IKKE:
--   - Backfill av data (det er Steg B)
--   - Helper-funksjoner (det er Steg E)
--   - Policy-endringer (det er Steg F)
--
-- Effekt på appen: ingen. Appen leser ikke fra de nye tabellene
-- ennå. RLS-policyene er fortsatt åpne (`FOR ALL USING (true)`).
-- Det skal være trygt å kjøre denne filen uten noen kode-deploy
-- samtidig, og trygt å pause utrullingen her i dager/uker før
-- vi går til Steg B.
--
-- Alle statements er pakket i én transaksjon. Hvis noe feiler,
-- rulles ALT tilbake automatisk og databasen er uendret.
--
-- Rollback (hvis vi vil angre MANUELT etter commit): se seksjonen
-- nederst i fila, markert "-- ROLLBACK".
--
-- Merknad om `substitute`-rollen: team_id er NOT NULL i denne
-- tabellen. Global-substitute-mekanismen håndteres i Steg E når
-- vi skriver helper-funksjonene (vikar-rollen leses da fra
-- auth.users.raw_user_meta_data). Tabellen dekker coordinator,
-- parent og club_admin — de tre rollene som faktisk er bundet
-- til et spesifikt team.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. team_members — hoved-tabellen for rolle-bindinger
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.team_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       text        NOT NULL,
  club_id       uuid        REFERENCES public.clubs(id) ON DELETE SET NULL,
  auth_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text        NOT NULL
                            CHECK (role IN ('coordinator', 'parent', 'club_admin')),
  family_id     uuid        REFERENCES public.families(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_members_unique_team_user_role
    UNIQUE (team_id, auth_user_id, role),

  -- family_id skal KUN være satt når rollen er 'parent'. Dette
  -- hindrer en coordinator-rad i å ha en tilknyttet familie og
  -- holder datamodellen ren.
  CONSTRAINT team_members_family_id_only_for_parents
    CHECK (
      (role = 'parent' AND family_id IS NOT NULL)
      OR (role <> 'parent' AND family_id IS NULL)
    )
);

-- Kolonne-dokumentasjon
COMMENT ON TABLE  public.team_members                IS 'Rolle-binding mellom auth-brukere og team. Populeres i Steg B, brukes av policies fra Steg F.';
COMMENT ON COLUMN public.team_members.team_id        IS 'Team-identifikator (text — legacy localStorage-format, ikke FK). Én bruker kan tilhøre flere team.';
COMMENT ON COLUMN public.team_members.club_id        IS 'Denormalisert FK til clubs — gjør club_admin-policies raske uten join mot team-tabell.';
COMMENT ON COLUMN public.team_members.auth_user_id   IS 'Supabase auth-bruker som har rollen. ON DELETE CASCADE — sletting av bruker fjerner medlemskap.';
COMMENT ON COLUMN public.team_members.role           IS 'Rolle i teamet: coordinator / parent / club_admin. substitute håndteres via auth-metadata (Steg E).';
COMMENT ON COLUMN public.team_members.family_id      IS 'Kun satt når role = parent. Peker på familien brukeren representerer. ON DELETE CASCADE.';
COMMENT ON COLUMN public.team_members.created_at     IS 'Opprettet-tidspunkt. Brukes ikke av policies, men nyttig for debugging.';

-- Indekser
-- Unique-constraint gir allerede en index på (team_id, auth_user_id, role).
-- De følgende er for å støtte vanlige policy-lookups:
CREATE INDEX IF NOT EXISTS idx_team_members_auth_user_id
  ON public.team_members (auth_user_id);
COMMENT ON INDEX public.idx_team_members_auth_user_id
  IS 'Brukes av auth_user_team_ids() og auth_user_role_in() — "hvilke team/roller har jeg?"';

CREATE INDEX IF NOT EXISTS idx_team_members_team_id_role
  ON public.team_members (team_id, role);
COMMENT ON INDEX public.idx_team_members_team_id_role
  IS 'Brukes når policies sjekker "er denne brukeren coordinator i teamet?" via team_id.';

CREATE INDEX IF NOT EXISTS idx_team_members_family_id
  ON public.team_members (family_id)
  WHERE family_id IS NOT NULL;
COMMENT ON INDEX public.idx_team_members_family_id
  IS 'Brukes av auth_user_family_id() og av parent-policies. Partiell — kun rader med family_id satt.';

CREATE INDEX IF NOT EXISTS idx_team_members_club_id
  ON public.team_members (club_id)
  WHERE club_id IS NOT NULL;
COMMENT ON INDEX public.idx_team_members_club_id
  IS 'Brukes av club_admin-policies som sjekker "har jeg club_admin-rolle i denne klubben?".';

-- Ingen RLS på team_members ennå. Den settes opp i Steg F sammen
-- med de andre policy-endringene. Inntil videre følger tabellen
-- den samme åpne "FOR ALL USING (true)"-konvensjonen som resten
-- av skjemaet — som betyr at RLS IKKE er aktivert i det hele tatt
-- på denne tabellen og alt er tillatt via service_role og anon
-- (bare som resten av tabellene i dag).
--
-- Vi aktiverer RLS her i Steg F:
--   ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2. migration_snapshot_family_members_pre — rollback-snapshot
-- ------------------------------------------------------------
--
-- Denne tabellen populeres i Steg B som ALLER FØRSTE statement i
-- den migreringen. Den lagrer (id, auth_user_id) for alle rader
-- i family_members FØR Steg B eventuelt setter auth_user_id på
-- tidligere tomme rader. Ved rollback gjenoppretter vi auth_user_id
-- fra denne snapshoten.
--
-- Tabellen er bevisst foreldreløs (ingen FK tilbake til
-- family_members) slik at en rollback kan fungere selv hvis Steg B
-- har laget nye family_members-rader — vi trenger bare å kunne
-- lese id-ene ut av snapshoten.

CREATE TABLE IF NOT EXISTS public.migration_snapshot_family_members_pre (
  snapshot_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid      NOT NULL,
  auth_user_id   uuid,
  captured_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.migration_snapshot_family_members_pre
  IS 'Pre-migrering snapshot av family_members(id, auth_user_id) fra Steg B. Brukes for rollback. Slettes etter 2 uker stabil produksjon.';
COMMENT ON COLUMN public.migration_snapshot_family_members_pre.family_member_id
  IS 'Peker på family_members.id. IKKE FK — rollback-tabellen må fungere selv om family_members endres.';
COMMENT ON COLUMN public.migration_snapshot_family_members_pre.auth_user_id
  IS 'Opprinnelig auth_user_id-verdi (kan være NULL). Gjenopprettes ved rollback.';
COMMENT ON COLUMN public.migration_snapshot_family_members_pre.captured_at
  IS 'Tidspunkt snapshoten ble tatt — skal være samme instant for hele batchen i Steg B.';

CREATE INDEX IF NOT EXISTS idx_snapshot_fm_pre_family_member_id
  ON public.migration_snapshot_family_members_pre (family_member_id);


-- ------------------------------------------------------------
-- 3. migration_created_family_members — nyopprettede rader
-- ------------------------------------------------------------
--
-- Steg B vil opprette nye family_members-rader i tilfeller der
-- en auth-bruker har en families-rad (gammelt families.id =
-- auth.uid()-mønster) men ingen tilhørende parent-rad i
-- family_members. Disse rad-ID-ene registreres her slik at en
-- rollback vet nøyaktig hvilke rader som ble auto-opprettet og
-- kan slette dem uten å røre ekte bruker-data.

CREATE TABLE IF NOT EXISTS public.migration_created_family_members (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_member_id uuid        NOT NULL UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.migration_created_family_members
  IS 'Register over family_members-rader opprettet av Steg B-migreringen. Brukes for rollback. Slettes etter 2 uker stabil produksjon.';
COMMENT ON COLUMN public.migration_created_family_members.family_member_id
  IS 'family_members.id for raden som ble opprettet. Ikke FK av samme grunn som snapshot-tabellen.';
COMMENT ON COLUMN public.migration_created_family_members.created_at
  IS 'Opprettet-tidspunkt — bør være samme instant som Steg B-batchen.';


-- ------------------------------------------------------------
-- 4. Bekreft at alt ble opprettet
-- ------------------------------------------------------------
-- Selvsjekk: disse SELECT-ene feiler transaksjonen hvis noe mangler.
-- Brukes ikke for data, bare for å få en tydelig feilmelding hvis
-- noe har gått galt før COMMIT.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'team_members') THEN
    RAISE EXCEPTION 'team_members ble ikke opprettet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migration_snapshot_family_members_pre') THEN
    RAISE EXCEPTION 'migration_snapshot_family_members_pre ble ikke opprettet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'migration_created_family_members') THEN
    RAISE EXCEPTION 'migration_created_family_members ble ikke opprettet';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (manuell — kjør KUN hvis du vil angre Steg A)
-- ============================================================
-- Kopier blokken under ut av kommentaren og kjør den i
-- Supabase SQL Editor. Den er trygg så lenge Steg B IKKE er
-- kjørt ennå — etter Steg B må du bruke rollback-skriptet
-- som skrives sammen med Steg B, ikke dette.
-- ------------------------------------------------------------
-- BEGIN;
--
-- DROP TABLE IF EXISTS public.migration_created_family_members;
-- DROP TABLE IF EXISTS public.migration_snapshot_family_members_pre;
-- DROP TABLE IF EXISTS public.team_members;
--
-- COMMIT;
-- ============================================================
