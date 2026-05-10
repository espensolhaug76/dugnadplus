-- =============================================================
-- Vipps ePayment integration for kiosk_sales
-- =============================================================
-- 2026-05-10: Migrér kiosk fra deep-link tillit-modell til samme
-- ePayment-arkitektur som lottery (ferdigstilt 2026-05-10).
--
-- Speiler lottery_sales-mønsteret:
--   * status med CHECK + idempotens via STATUS_RANK i webhook
--   * vipps_reference UNIQUE (prefiks 'kiosk-')
--   * vipps_psp_reference, vipps_payment_method, *_at-timestamps
--   * fail-fast på 401/403 fra Vipps
--
-- NY: kiosk_settings-tabell. Vi har ingen sentral kiosk-config i dag
-- (Vipps-nummer ligger kun i localStorage). Edge Functions må ha en
-- autoritativ kilde — samme mønster som lotteries.vipps_number.
--
-- Migrasjonen er IDEMPOTENT (alt bruker IF NOT EXISTS / DROP POLICY
-- IF EXISTS) slik at den kan kjøres flere ganger.
-- =============================================================

-- 1. Ny tabell: kiosk_settings ----------------------------------------
-- PK på text team_id (samme mønster som alle andre per-team-tabeller).
-- Ingen FK fordi det ikke finnes noen sentral teams-tabell i dette
-- prosjektet.
CREATE TABLE IF NOT EXISTS public.kiosk_settings (
  team_id                       text PRIMARY KEY,
  vipps_number                  text,
  vipps_validation_failed_at    timestamptz,
  vipps_validation_error        text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- Auto-oppdater updated_at ved UPDATE
CREATE OR REPLACE FUNCTION public.kiosk_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kiosk_settings_updated_at ON public.kiosk_settings;
CREATE TRIGGER kiosk_settings_updated_at
  BEFORE UPDATE ON public.kiosk_settings
  FOR EACH ROW EXECUTE FUNCTION public.kiosk_settings_set_updated_at();

ALTER TABLE public.kiosk_settings ENABLE ROW LEVEL SECURITY;

-- Anon SELECT: KioskShop (kunde-side, ingen auth) må kunne lese
-- vipps_number for å initiere betaling. Ingen sensitive data eksponeres.
DROP POLICY IF EXISTS kiosk_settings_select_anon ON public.kiosk_settings;
CREATE POLICY kiosk_settings_select_anon ON public.kiosk_settings
  FOR SELECT USING (true);

-- Coordinator/club_admin INSERT på sitt eget team
DROP POLICY IF EXISTS kiosk_settings_insert_coordinator ON public.kiosk_settings;
CREATE POLICY kiosk_settings_insert_coordinator ON public.kiosk_settings
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

DROP POLICY IF EXISTS kiosk_settings_update_coordinator ON public.kiosk_settings;
CREATE POLICY kiosk_settings_update_coordinator ON public.kiosk_settings
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

DROP POLICY IF EXISTS kiosk_settings_delete_coordinator ON public.kiosk_settings;
CREATE POLICY kiosk_settings_delete_coordinator ON public.kiosk_settings
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- 2. Utvid kiosk_sales med Vipps ePayment-felter ----------------------
-- Speil av lottery_sales-skjemaet.
ALTER TABLE public.kiosk_sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL
    DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED', 'AUTHORIZED', 'CAPTURED', 'CANCELLED',
      'EXPIRED', 'REFUNDED', 'TERMINATED', 'FAILED'
    )),
  ADD COLUMN IF NOT EXISTS vipps_reference TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS vipps_psp_reference TEXT,
  ADD COLUMN IF NOT EXISTS vipps_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  -- Vipps ePayment krever customer.phoneNumber. I dag finnes bare
  -- vipps_number (mottaker) — ikke kjøpers telefon.
  ADD COLUMN IF NOT EXISTS buyer_phone TEXT,
  -- Frivillig kjøpers navn (defaulter til "Anonym kjøper" i frontend
  -- hvis tomt) — for sporbarhet ved disputes.
  ADD COLUMN IF NOT EXISTS buyer_name TEXT;

CREATE INDEX IF NOT EXISTS idx_kiosk_sales_status
  ON public.kiosk_sales (team_id, status);

CREATE INDEX IF NOT EXISTS idx_kiosk_sales_vipps_ref
  ON public.kiosk_sales (vipps_reference);


-- 3. RLS-oppdatering på kiosk_sales -----------------------------------
-- VIKTIG: Vi BEHOLDER åpen INSERT-policy (WITH CHECK true) i denne
-- migrasjonen, slik at eksisterende KioskShop fortsetter å virke
-- mellom steg 1 (DB) og steg 6 (frontend-omskriving). Den blir
-- tightenet i en senere migrasjon (steg 8 cleanup) etter at ePayment-
-- flyten er på plass og verifisert.
--
-- Mellomrisikoen: anon kan opprette rader uten vipps_reference. Det
-- er samme tilstand som i dag — tightheningen er en separat
-- forbedring som ikke skal blokkere migreringen.
DROP POLICY IF EXISTS kiosk_sales_insert_anon ON public.kiosk_sales;
CREATE POLICY kiosk_sales_insert_anon ON public.kiosk_sales
  FOR INSERT
  WITH CHECK (true);
-- TODO (steg 8): Tighten til:
--   WITH CHECK (status = 'CREATED' AND vipps_reference LIKE 'kiosk-%')
-- etter at KioskShop alltid sender vipps_reference.

-- Anon SELECT via vipps_reference: KioskShop poller status etter
-- retur fra Vipps. Reference er ugjettbar UUID. RLS tillater SELECT
-- bare hvis raden har vipps_reference satt — i praksis filtrerer
-- frontend WHERE vipps_reference = '<min reference>'. Edge Function
-- vipps-poll-status er den primære veien; denne policyen er fallback.
DROP POLICY IF EXISTS kiosk_sales_select_anon_by_ref ON public.kiosk_sales;
CREATE POLICY kiosk_sales_select_anon_by_ref ON public.kiosk_sales
  FOR SELECT
  USING (vipps_reference IS NOT NULL);

-- Coordinator INSERT: trengs hvis vi senere vil støtte kontantsalg
-- registrert direkte fra DA (samme som lottery). Best practice å
-- legge til nå selv om frontend ikke bruker det ennå.
DROP POLICY IF EXISTS kiosk_sales_insert_coordinator ON public.kiosk_sales;
CREATE POLICY kiosk_sales_insert_coordinator ON public.kiosk_sales
  FOR INSERT
  WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  -- Sjekk kiosk_sales-kolonner
  FOR v_missing IN
    SELECT col FROM (VALUES
      ('status'), ('vipps_reference'), ('vipps_psp_reference'),
      ('vipps_payment_method'), ('authorized_at'), ('captured_at'),
      ('cancelled_at'), ('failure_reason'), ('buyer_phone'), ('buyer_name')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kiosk_sales'
    )
  LOOP
    RAISE EXCEPTION 'kiosk_sales mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk kiosk_settings finnes med riktige kolonner
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kiosk_settings'
  ) THEN
    RAISE EXCEPTION 'kiosk_settings-tabellen mangler';
  END IF;

  FOR v_missing IN
    SELECT col FROM (VALUES
      ('team_id'), ('vipps_number'),
      ('vipps_validation_failed_at'), ('vipps_validation_error'),
      ('created_at'), ('updated_at')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'kiosk_settings'
    )
  LOOP
    RAISE EXCEPTION 'kiosk_settings mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk INSERT-policyen finnes (i denne migrasjonen er den åpen for
  -- backward compat; tightening kommer i steg 8 etter frontend-deploy)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kiosk_sales'
      AND policyname = 'kiosk_sales_insert_anon'
  ) THEN
    RAISE EXCEPTION 'kiosk_sales_insert_anon policy mangler';
  END IF;

  -- Sjekk UNIQUE-indeks på vipps_reference
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'kiosk_sales'
      AND indexdef ILIKE '%UNIQUE%vipps_reference%'
  ) THEN
    RAISE EXCEPTION 'kiosk_sales.vipps_reference UNIQUE-indeks mangler';
  END IF;

  -- Sjekk PK på kiosk_settings.team_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'kiosk_settings'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    RAISE EXCEPTION 'kiosk_settings mangler PRIMARY KEY';
  END IF;

  RAISE NOTICE '✅ Kiosk Vipps ePayment-skjema klart. Alle kolonner, indekser, constraints og policies er på plass.';
END $$;


-- =============================================================
-- ROLLBACK (hvis noe går galt under videre utrulling)
-- =============================================================
-- DROP TABLE IF EXISTS kiosk_settings CASCADE;
-- DROP FUNCTION IF EXISTS kiosk_settings_set_updated_at();
-- ALTER TABLE kiosk_sales
--   DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS vipps_reference,
--   DROP COLUMN IF EXISTS vipps_psp_reference, DROP COLUMN IF EXISTS vipps_payment_method,
--   DROP COLUMN IF EXISTS authorized_at, DROP COLUMN IF EXISTS captured_at,
--   DROP COLUMN IF EXISTS cancelled_at, DROP COLUMN IF EXISTS failure_reason,
--   DROP COLUMN IF EXISTS buyer_phone, DROP COLUMN IF EXISTS buyer_name;
-- DROP POLICY IF EXISTS kiosk_sales_select_anon_by_ref ON kiosk_sales;
-- DROP POLICY IF EXISTS kiosk_sales_insert_coordinator ON kiosk_sales;
--
-- INSERT-policyen 'kiosk_sales_insert_anon' beholdes som er (WITH CHECK true)
-- i denne migrasjonen — ingen rollback nødvendig der. Eksisterende KioskShop
-- fortsetter å virke uendret etter migrasjonen (status defaulter til
-- 'CREATED' for nye rader, vipps_reference er NULL).
--
-- Frontend-omskriving (KioskShop phase-modell, KioskAdmin settings-flyt) er
-- separate steg som rulles ut etter denne migrasjonen — de kan rulles
-- tilbake uavhengig.
