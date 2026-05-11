-- =============================================================
-- Vipps ePayment integration for campaign_sales
-- =============================================================
-- 2026-05-11 (steg 1 av salgskampanje-migrering):
-- Salgskampanje-modulen får samme ePayment-arkitektur som lottery
-- og kiosk. Status (CREATED/AUTHORIZED/CAPTURED/etc.) er sannhet
-- fra Vipps via webhook, ikke fra forelders bekreftelse.
--
-- paid:boolean-feltet beholdes synkronisert med status via trigger
-- for å bevare backward compat med eksisterende kode som leser
-- paid direkte (CampaignOverviewPage, evt. andre aggregatorer).
-- Ny kode bør lese fra status.
--
-- Migrasjonen er IDEMPOTENT (alt bruker IF NOT EXISTS / DROP IF
-- EXISTS / CREATE OR REPLACE) slik at den kan kjøres flere ganger
-- uten feil.
--
-- RLS-tightening utsatt til steg 8 — speiler kiosk-mønsteret. Den
-- nåværende 'campaign_sales_all'-policyen (FOR ALL USING (true))
-- forblir uberørt i denne migrasjonen, slik at eksisterende
-- CampaignShop fortsetter å virke gjennom hele migreringen.
-- =============================================================

-- 1. campaign_sales: legg til status + Vipps-felter ---------------
ALTER TABLE public.campaign_sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL
    DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED',         -- initiert, ingen Vipps-respons ennå
      'AUTHORIZED',      -- Vipps har autorisert (kort-reservasjon)
      'CAPTURED',        -- penger trukket og overført til klubb
      'CANCELLED',       -- avbrutt av kjøper
      'EXPIRED',         -- timeout fra Vipps (typisk etter 5 min)
      'REFUNDED',        -- refundert i ettertid
      'TERMINATED',      -- vi avbrøt programmatisk
      'FAILED'           -- teknisk feil
    )),
  ADD COLUMN IF NOT EXISTS vipps_reference TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS vipps_psp_reference TEXT,
  ADD COLUMN IF NOT EXISTS vipps_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_sales_status
  ON public.campaign_sales (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_sales_vipps_ref
  ON public.campaign_sales (vipps_reference);

-- 2. sales_campaigns: fail-fast-felter for ugyldig MSN -----------
-- Når Edge Function får 401/403 fra Vipps ved opprettelse,
-- markeres kampanjen midlertidig utilgjengelig. DA varsles via push
-- og kan rette opp Vipps-nummeret. Felt nullstilles ved manuell
-- re-aktivering eller ny gyldig betaling. Speiler lotteries-mønsteret.
ALTER TABLE public.sales_campaigns
  ADD COLUMN IF NOT EXISTS vipps_validation_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vipps_validation_error TEXT;

-- 3. paid-sync-trigger: bevarer backward compat ------------------
-- Eldre kode leser campaign_sales.paid:boolean direkte (f.eks.
-- CampaignOverviewPage som aggregerer omsetning). Ny ePayment-flyt
-- skriver kun status via webhook. Trigger sørger for at paid alltid
-- speiler status og matcher PAID_STATUSES-semantikken som brukes i
-- LotteryAdmin/KioskAdmin frontend-aggregeringer:
--   AUTHORIZED, CAPTURED                              → paid=true
--   CANCELLED, EXPIRED, TERMINATED, FAILED, REFUNDED  → paid=false
--   CREATED                                           → paid uberørt
--
-- REFUNDED inkluderes i paid=false-grenen fordi lottery sin
-- PAID_STATUSES-filter ({AUTHORIZED, CAPTURED}) ekskluderer
-- REFUNDED — pengene er returnert til kjøper, så semantisk er det
-- ikke lenger betalt. Uten denne håndteringen ville en refundert
-- rad hatt status=REFUNDED men paid=true (siden den passerte
-- gjennom AUTHORIZED/CAPTURED først), som ville gitt splittet
-- sannhet mellom gammel og ny kode.
--
-- Trigger fyrer BEFORE INSERT OR UPDATE OF status — vi går
-- gjennom NEW (ikke OLD) slik at både opprettelse og oppdatering
-- holder feltene konsistente.
--
-- Backfill av eksisterende rader (fra tillit-modellen, paid=true
-- men status defaulter til CREATED) er IKKE inkludert. Disse vil
-- bli ekskludert fra status-aware aggregeringer i steg 7. Det er
-- bevisst — testdata bør ikke kontaminere de nye ePayment-baserte
-- statistikkene. Hvis behov for å backfille senere:
--   UPDATE campaign_sales
--     SET status = 'CAPTURED', captured_at = COALESCE(captured_at, created_at)
--   WHERE paid = TRUE AND status = 'CREATED';
-- (kjør én gang, idempotent — trigger holder paid uendret siden
-- AUTHORIZED/CAPTURED uansett gir paid=true).

CREATE OR REPLACE FUNCTION public.sync_campaign_sales_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('AUTHORIZED', 'CAPTURED') THEN
    NEW.paid := TRUE;
  ELSIF NEW.status IN ('CANCELLED', 'EXPIRED', 'TERMINATED', 'FAILED', 'REFUNDED') THEN
    NEW.paid := FALSE;
  END IF;
  -- CREATED: la paid være som NEW satte det (typisk DB-default
  -- false ved INSERT, eller uendret ved UPDATE av andre felter
  -- enn status).
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_campaign_sales_paid_trigger
  ON public.campaign_sales;

CREATE TRIGGER sync_campaign_sales_paid_trigger
  BEFORE INSERT OR UPDATE OF status ON public.campaign_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_campaign_sales_paid();

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  -- Sjekk at alle nye campaign_sales-kolonner finnes
  FOR v_missing IN
    SELECT col FROM (VALUES
      ('status'), ('vipps_reference'), ('vipps_psp_reference'),
      ('vipps_payment_method'), ('authorized_at'), ('captured_at'),
      ('cancelled_at'), ('failure_reason')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'campaign_sales'
    )
  LOOP
    RAISE EXCEPTION 'campaign_sales mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk at sales_campaigns-kolonner finnes
  FOR v_missing IN
    SELECT col FROM (VALUES
      ('vipps_validation_failed_at'), ('vipps_validation_error')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales_campaigns'
    )
  LOOP
    RAISE EXCEPTION 'sales_campaigns mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk at status-CHECK constraint finnes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name LIKE 'campaign_sales_status_check%'
  ) THEN
    RAISE EXCEPTION 'campaign_sales_status_check constraint mangler';
  END IF;

  -- Sjekk at vipps_reference er UNIQUE
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'campaign_sales'
      AND indexdef ILIKE '%UNIQUE%vipps_reference%'
  ) THEN
    RAISE EXCEPTION 'campaign_sales.vipps_reference UNIQUE-indeks mangler';
  END IF;

  -- Sjekk at trigger finnes
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'sync_campaign_sales_paid_trigger'
      AND tgrelid = 'public.campaign_sales'::regclass
  ) THEN
    RAISE EXCEPTION 'sync_campaign_sales_paid_trigger mangler';
  END IF;

  -- Sjekk at trigger-funksjonen finnes
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'sync_campaign_sales_paid'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'sync_campaign_sales_paid() trigger-funksjon mangler';
  END IF;

  RAISE NOTICE '✅ Salgskampanje ePayment-skjema klart. Kolonner, indekser, CHECK-constraint og paid-sync-trigger er på plass.';
END $$;

-- =============================================================
-- ROLLBACK (hvis migrasjonen må reverteres)
-- =============================================================
-- DROP TRIGGER IF EXISTS sync_campaign_sales_paid_trigger ON public.campaign_sales;
-- DROP FUNCTION IF EXISTS public.sync_campaign_sales_paid();
-- ALTER TABLE public.campaign_sales
--   DROP COLUMN IF EXISTS status,
--   DROP COLUMN IF EXISTS vipps_reference,
--   DROP COLUMN IF EXISTS vipps_psp_reference,
--   DROP COLUMN IF EXISTS vipps_payment_method,
--   DROP COLUMN IF EXISTS authorized_at,
--   DROP COLUMN IF EXISTS captured_at,
--   DROP COLUMN IF EXISTS cancelled_at,
--   DROP COLUMN IF EXISTS failure_reason;
-- ALTER TABLE public.sales_campaigns
--   DROP COLUMN IF EXISTS vipps_validation_failed_at,
--   DROP COLUMN IF EXISTS vipps_validation_error;
