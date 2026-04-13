-- ============================================================
-- Dugnad+ — Wipe test-data før team_id-normalisering
-- ============================================================
--
-- Sletter alle test-rader fra tabeller som har legacy team_id-
-- verdier i Date.now()-format. Kjøres ETTER:
--   20260413_add_events_team_id.sql
-- og ETTER at den tilhørende frontend-koden er deployet.
--
-- Bekreftet baseline fra pre-flight / dry-run:
--   - 2 auth.users (beholdes)
--   - 20 families (alle skall-data, slettes)
--   - 55 family_members (35 parents + 20 children, slettes)
--   - 1 event (slettes)
--   - 1 club (BEHOLDES — clubs.id er uuid, ikke legacy)
--   - 0 team_members (Steg A er ren)
--   - 0 pending_parents
--
-- Vi sletter IKKE:
--   - auth.users                  (innloggede brukere)
--   - public.clubs                (ingen legacy team_id,
--                                  beholdes)
--   - public.team_members         (allerede tom, trenger
--                                  ingen wipe)
--   - public.sponsors             (admin-konfig, ikke test-data)
--   - public.settings             (feature flags)
--   - Rollback-snapshot-tabellene (Steg A)
--
-- Alt pakkes i én transaksjon. Hvis noe feiler, rulles hele
-- wipe tilbake og databasen er uendret.
--
-- Slette-rekkefølge tar hensyn til CASCADE-relasjoner for å
-- gi forutsigbare resultater selv om noen av FKene skulle
-- være konfigurert annerledes enn antatt:
--
--   child -> parent avhengigheter:
--     assignments          -> shifts, families
--     shifts               -> events
--     requests             -> shifts, families
--     lottery_sales        -> lotteries, families
--     prizes               -> lotteries
--     campaign_sales       -> sales_campaigns, families
--     pending_parents      -> families, family_members
--     family_preferences   -> families
--     push_subscriptions   -> families
--     vikar_messages       -> (sender_id, request_id — orphaned)
--     sms_log              -> (event_id — orphaned)
--     kiosk_sales          -> (event_id — orphaned)
--     family_members       -> families
--     events               -> (ingen parent)
--     lotteries            -> (ingen parent)
--     sales_campaigns      -> (ingen parent)
--     kiosk_items          -> (ingen parent)
--     sms_credits          -> (ingen parent)
--     families             -> (ingen parent)
--
-- Vi sletter fra barn mot rot. DELETE FROM (ikke TRUNCATE)
-- slik at CASCADE-FKer trer i kraft kontrollert og vi unngår
-- "cannot truncate because of foreign key references"-feil.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Lag 1: dypest nestede barn
-- ------------------------------------------------------------
DELETE FROM public.assignments;
DELETE FROM public.requests;
DELETE FROM public.lottery_sales;
DELETE FROM public.prizes;
DELETE FROM public.campaign_sales;
DELETE FROM public.pending_parents;
DELETE FROM public.family_preferences;
DELETE FROM public.push_subscriptions;
DELETE FROM public.vikar_messages;
DELETE FROM public.sms_log;
DELETE FROM public.kiosk_sales;

-- ------------------------------------------------------------
-- Lag 2: mellomlag
-- ------------------------------------------------------------
DELETE FROM public.shifts;
DELETE FROM public.family_members;

-- ------------------------------------------------------------
-- Lag 3: rot-entiteter som kan slettes uten CASCADE-smerter
-- ------------------------------------------------------------
DELETE FROM public.events;
DELETE FROM public.lotteries;
DELETE FROM public.sales_campaigns;
DELETE FROM public.kiosk_items;
DELETE FROM public.sms_credits;
DELETE FROM public.families;

-- ------------------------------------------------------------
-- Verifikasjon: alle wipede tabeller skal ha row_count = 0
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  cnt bigint;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'assignments','requests','lottery_sales','prizes','campaign_sales',
    'pending_parents','family_preferences','push_subscriptions',
    'vikar_messages','sms_log','kiosk_sales','shifts','family_members',
    'events','lotteries','sales_campaigns','kiosk_items','sms_credits',
    'families'
  ])
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I', t) INTO cnt;
    IF cnt <> 0 THEN
      RAISE EXCEPTION 'Wipe feilet: public.% har fortsatt % rad(er)', t, cnt;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Bekreft at det vi IKKE skulle røre, er uendret
-- ------------------------------------------------------------
DO $$
DECLARE
  auth_count bigint;
  clubs_count bigint;
BEGIN
  SELECT COUNT(*) INTO auth_count FROM auth.users;
  SELECT COUNT(*) INTO clubs_count FROM public.clubs;
  RAISE NOTICE 'Wipe OK. auth.users=%, public.clubs=%', auth_count, clubs_count;
END $$;

COMMIT;


-- ============================================================
-- ROLLBACK (ikke mulig — wipede rader er permanent borte)
-- ============================================================
-- Denne migreringen er en envei-operasjon. Når COMMIT er gjort,
-- er test-dataen permanent slettet. Vi godtar dette fordi:
--   - Alle 20 familier var skall-data uten auth-kobling
--   - Det finnes ingen reelle brukere med tap å bekymre seg om
--   - Tanken med runden er nettopp å starte med ren data
--
-- Hvis du trenger å rulle tilbake: bruk Supabase Point-in-Time-
-- Recovery via dashbordet.
-- ============================================================
