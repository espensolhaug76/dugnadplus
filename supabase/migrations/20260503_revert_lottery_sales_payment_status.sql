-- =============================================================
-- REVERT: lottery_sales payment status tracking
-- =============================================================
-- Pilot 2026-05-03 (KIL Håndball): Beslutning fra Espen om å
-- forlate "Bekreft-flyten" på DA-siden som ble bygget i
-- 20260503_lottery_sales_payment_confirmation.sql.
--
-- Ny modell: tillit-basert dugnad. Foreldre bekrefter selv at
-- de har betalt i Vipps, og DA avstemmer mot Vipps-kontoen ved
-- sesongslutt — samme prinsipp som papirloddbok. Dugnad+ holder
-- ikke per-kjøp status, så det er ingen pending/paid/cancelled-
-- distinksjon i DB.
--
-- Forelder-flyten ("Fullførte du betalingen?") beholdes som
-- intensjons-gate, men har ingen DB-konsekvens utover at INSERT
-- først skjer etter "Ja, jeg har betalt".
--
-- Migrasjonen er IDEMPOTENT (alt bruker IF EXISTS / DROP
-- POLICY IF EXISTS) slik at den kan kjøres uavhengig av om
-- forrige migrasjon ble kjørt eller ikke. Pre-pilot-verifisering
-- viste at DB allerede var i revertert tilstand på MCP-tidspunkt
-- (forrige migrasjon ble sannsynligvis ikke kjørt, eller manuelt
-- rullet tilbake) — denne migrasjonen sikrer konsistent endepunkt.
-- =============================================================

-- 1. Slett RPC-er. CASCADE for å rydde opp ev. avhengigheter.
DROP FUNCTION IF EXISTS public.bulk_confirm_lottery_sales(UUID[]);
DROP FUNCTION IF EXISTS public.bulk_cancel_lottery_sales(UUID[]);
DROP FUNCTION IF EXISTS public.cancel_pending_lottery_sale(UUID);

-- 2. Reverter INSERT-policyen til original (WITH CHECK true).
--    Dette er samme tilstand som før Steg F la til denne policyen
--    bare med tighter check — anon kan INSERTe lottery_sales-rader
--    fra LotteryShop uten auth.
DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
  FOR INSERT
  WITH CHECK (true);

-- 3. Slett indeks før vi dropper kolonnen den indekserer.
DROP INDEX IF EXISTS public.idx_lottery_sales_lottery_status;

-- 4. Slett CHECK-constraint før kolonne (slik at DROP COLUMN
--    ikke trigger constraint-feil i edge-cases).
ALTER TABLE public.lottery_sales
  DROP CONSTRAINT IF EXISTS lottery_sales_status_check;

-- 5. Slett kolonnene. CASCADE for å rydde opp ev. views/triggere.
ALTER TABLE public.lottery_sales
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS confirmed_at,
  DROP COLUMN IF EXISTS confirmed_by,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS cancelled_by;


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
BEGIN
  -- Status-kolonnen skal være borte
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lottery_sales'
      AND column_name IN ('status', 'confirmed_at', 'confirmed_by', 'cancelled_at', 'cancelled_by')
  ) THEN
    RAISE EXCEPTION 'Revert ufullstendig — status-kolonner finnes fortsatt på lottery_sales';
  END IF;

  -- RPC-ene skal være borte
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('bulk_confirm_lottery_sales', 'bulk_cancel_lottery_sales', 'cancel_pending_lottery_sale')
  ) THEN
    RAISE EXCEPTION 'Revert ufullstendig — bulk_*/cancel_pending_* RPC-er finnes fortsatt';
  END IF;

  -- INSERT-policyen skal være enkel (WITH CHECK true)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lottery_sales'
      AND policyname = 'lottery_sales_insert_anon'
  ) THEN
    RAISE EXCEPTION 'lottery_sales_insert_anon policy mangler etter revert';
  END IF;

  RAISE NOTICE '✅ Lottery payment status tracking fjernet. Tilbake til tillit-basert modell.';
END $$;


-- =============================================================
-- ROLLBACK (re-apply payment status tracking)
-- =============================================================
-- Hvis denne reverten må rulles tilbake, kjør på nytt
-- 20260503_lottery_sales_payment_confirmation.sql i sin helhet.
-- Frontend må også rulles tilbake (commits f605d5a..ab6c7c5).
