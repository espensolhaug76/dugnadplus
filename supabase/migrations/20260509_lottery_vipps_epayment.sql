-- =============================================================
-- Vipps ePayment integration for lottery_sales
-- =============================================================
-- 2026-05-09 (KIL Håndball pilot 14. mai):
-- Vi forlater tillit-modellen fra 3. mai-pilot og bygger ekte
-- ePayment-integrasjon mot Vipps test-miljø. Status er nå sannhet
-- fra Vipps via webhook, ikke fra forelders bekreftelse.
--
-- Migrasjonen er IDEMPOTENT (alt bruker IF NOT EXISTS / DROP
-- POLICY IF EXISTS) slik at den kan kjøres flere ganger uten feil.
-- =============================================================

-- 1. lottery_sales: legg til status + Vipps-felter ----------------
ALTER TABLE public.lottery_sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL
    DEFAULT 'CREATED'
    CHECK (status IN (
      'CREATED',         -- initiert, ingen Vipps-respons ennå
      'AUTHORIZED',      -- Vipps har autorisert (kort-reservasjon)
      'CAPTURED',        -- penger trukket og overført til klubb
      'CANCELLED',       -- avbrutt av forelder
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

CREATE INDEX IF NOT EXISTS idx_lottery_sales_status
  ON public.lottery_sales (lottery_id, status);

CREATE INDEX IF NOT EXISTS idx_lottery_sales_vipps_ref
  ON public.lottery_sales (vipps_reference);

-- 2. lotteries: fail-fast-felter for ugyldig MSN ------------------
-- Når Edge Function får 401/403 fra Vipps ved opprettelse,
-- markeres lotteriet midlertidig utilgjengelig. DA varsles via push
-- og kan rette opp Vipps-nummeret. Felt nullstilles ved manuell
-- re-aktivering eller ny gyldig betaling.
ALTER TABLE public.lotteries
  ADD COLUMN IF NOT EXISTS vipps_validation_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vipps_validation_error TEXT;

-- 3. vipps_webhook_events: event-logg --------------------------------
-- Brukes for debugging og idempotens. Webhook UPDATE-ene er
-- idempotente i lottery_sales, men event-loggen lar oss
-- spore alle innkommende kall (også de med ugyldig signatur eller
-- ukjent reference). Tabellen bruker også 'validation_failed' som
-- event_name når vi logger fail-fast-tilfeller fra initiate-payment.
CREATE TABLE IF NOT EXISTS public.vipps_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vipps_reference TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT,
  signature_valid BOOLEAN,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_vipps_webhook_ref
  ON public.vipps_webhook_events (vipps_reference);

CREATE INDEX IF NOT EXISTS idx_vipps_webhook_processed
  ON public.vipps_webhook_events (processed_at DESC);

-- RLS: kun service_role skriver, koordinator/club_admin leser for
-- debugging. Anon har ingen tilgang.
ALTER TABLE public.vipps_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vipps_webhook_events_select_coord
  ON public.vipps_webhook_events;
CREATE POLICY vipps_webhook_events_select_coord
  ON public.vipps_webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('coordinator', 'club_admin')
    )
  );

-- 4. RLS-oppdatering på lottery_sales --------------------------------
-- INSERT-policyen tightenes: anon kan kun INSERT med status='CREATED'
-- og vipps_reference satt. Hindrer at noen lager rader som ser
-- ut som om de er betalt (status='CAPTURED') uten Vipps-bekreftelse.
DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
  FOR INSERT
  WITH CHECK (
    status = 'CREATED'
    AND vipps_reference IS NOT NULL
    AND vipps_reference LIKE 'lottery-%'
  );

-- Coordinator/club_admin INSERT: kontantsalg lagres uten vipps_reference,
-- så den nye anon-policyen ville blokkert det. Egen policy som tillater
-- INSERT for koordinator i lotteriets team.
DROP POLICY IF EXISTS lottery_sales_insert_coordinator ON public.lottery_sales;
CREATE POLICY lottery_sales_insert_coordinator ON public.lottery_sales
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lotteries l
      WHERE l.id = lottery_sales.lottery_id
        AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Anon SELECT via vipps_reference: forelder må kunne polle status
-- etter retur fra Vipps. Reference er en UUID-prefiks, så det er
-- praktisk talt ugjettbart. RLS-policyen tillater SELECT bare hvis
-- klienten oppgir reference i WHERE-klausulen — Postgres evaluerer
-- USING per rad, så uten LIKE/= på vipps_reference returnerer den 0.
-- (Dette er bare ett lag — Edge Function vipps-poll-status er den
-- normale veien; denne policyen er fallback hvis frontend leser
-- direkte.)
DROP POLICY IF EXISTS lottery_sales_select_anon_by_ref
  ON public.lottery_sales;
CREATE POLICY lottery_sales_select_anon_by_ref
  ON public.lottery_sales
  FOR SELECT
  USING (vipps_reference IS NOT NULL);

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  -- Sjekk at alle nye lottery_sales-kolonner finnes
  FOR v_missing IN
    SELECT col FROM (VALUES
      ('status'), ('vipps_reference'), ('vipps_psp_reference'),
      ('vipps_payment_method'), ('authorized_at'), ('captured_at'),
      ('cancelled_at'), ('failure_reason')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lottery_sales'
    )
  LOOP
    RAISE EXCEPTION 'lottery_sales mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk at lotteries-kolonner finnes
  FOR v_missing IN
    SELECT col FROM (VALUES
      ('vipps_validation_failed_at'), ('vipps_validation_error')
    ) AS expected(col)
    WHERE col NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lotteries'
    )
  LOOP
    RAISE EXCEPTION 'lotteries mangler kolonne: %', v_missing;
  END LOOP;

  -- Sjekk at webhook-tabellen finnes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vipps_webhook_events'
  ) THEN
    RAISE EXCEPTION 'vipps_webhook_events-tabellen mangler';
  END IF;

  -- Sjekk at status-CHECK finnes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name LIKE 'lottery_sales_status_check%'
  ) THEN
    RAISE EXCEPTION 'lottery_sales_status_check constraint mangler';
  END IF;

  -- Sjekk at vipps_reference er UNIQUE
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'lottery_sales'
      AND indexdef ILIKE '%UNIQUE%vipps_reference%'
  ) THEN
    RAISE EXCEPTION 'lottery_sales.vipps_reference UNIQUE-indeks mangler';
  END IF;

  -- Sjekk at INSERT-policyen krever CREATED + vipps_reference
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lottery_sales'
      AND policyname = 'lottery_sales_insert_anon'
      AND with_check ILIKE '%CREATED%'
      AND with_check ILIKE '%vipps_reference%'
  ) THEN
    RAISE EXCEPTION 'lottery_sales_insert_anon policy er ikke tightenet';
  END IF;

  RAISE NOTICE '✅ Vipps ePayment-skjema klart. Alle kolonner, indekser, constraints og policies er på plass.';
END $$;

-- =============================================================
-- ROLLBACK (hvis noe går galt under pilot)
-- =============================================================
-- ALTER TABLE lottery_sales DROP COLUMN IF EXISTS status, ...;
-- DROP TABLE IF EXISTS vipps_webhook_events;
-- ALTER TABLE lotteries DROP COLUMN IF EXISTS vipps_validation_failed_at, ...;
-- Reverter lottery_sales_insert_anon til WITH CHECK true.
-- Frontend må også rulles tilbake (dette er ikke trivielt — hele
-- LotteryShop-flyten er bygget om).
