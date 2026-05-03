-- =============================================================
-- lottery_sales — Vipps payment confirmation flow
-- =============================================================
-- Pilot 2026-05-03 (KIL Håndball): Vipps har INGEN automatisk
-- callback til Dugnad+, så appen vet ikke om en betaling faktisk
-- ble gjennomført. Dagens implementasjon i LotteryShop teller
-- lodd som "solgt" så snart Vipps deep link åpnes — uavhengig av
-- om betalingen skjedde. Det betyr falske tellinger og potensielt
-- urettferdig trekning av vinnere.
--
-- Forretningskravet: digitalisér eksisterende dugnad-praksis der
-- DA samler inn manuelt og avstemmer mot Vipps-historikk. Vi
-- introduserer en pending_confirmation-status: kjøp registreres
-- umiddelbart men teller IKKE som "innsamlet" før DA bekrefter
-- mot Vipps-historikken.
--
-- Migrasjonen leverer:
--   PART A: status-kolonne + revisjonsspor (confirmed_at/by,
--           cancelled_at/by) + indeks
--   PART B: backfill eksisterende rader til 'paid' (forutsetning:
--           dagens data er testdata)
--   PART C: bulk_confirm_lottery_sales / bulk_cancel_lottery_sales
--           SECURITY DEFINER-RPCer for masseoperasjoner fra DA-UI
--   PART D: INSERT-policy som tvinger status='pending_confirmation'
--           for anon (kjøpere) men tillater coordinator å sette
--           hvilken som helst status (bl.a. kontantsalg = 'paid'
--           direkte siden DA registrerer det manuelt etter mottak)
-- =============================================================


-- =============================================================
-- PART A — Skjema-endringer
-- =============================================================

ALTER TABLE public.lottery_sales
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);


-- =============================================================
-- PART B — Backfill og default
-- =============================================================
-- Eksisterende rader er testdata fra pilot-forberedelser. Setter
-- alle til 'paid' slik at de inkluderes i tellinger som før (ingen
-- regresjon for utviklere som tester mot disse).

UPDATE public.lottery_sales
SET status = 'paid'
WHERE status IS NULL;

ALTER TABLE public.lottery_sales
  ALTER COLUMN status SET DEFAULT 'pending_confirmation',
  ALTER COLUMN status SET NOT NULL;

-- CHECK-constraint: kun de tre tillatte verdiene.
ALTER TABLE public.lottery_sales
  DROP CONSTRAINT IF EXISTS lottery_sales_status_check;
ALTER TABLE public.lottery_sales
  ADD CONSTRAINT lottery_sales_status_check
  CHECK (status IN ('pending_confirmation', 'paid', 'cancelled'));

-- Indeks for raske tellinger per (lottery_id, status).
-- Brukes av LotteryAdmin.fetchActiveLottery (stats/pending-seksjonen)
-- og av handleDraw (filtrer trekningspool på status='paid').
CREATE INDEX IF NOT EXISTS idx_lottery_sales_lottery_status
  ON public.lottery_sales (lottery_id, status);


-- =============================================================
-- PART C — Bulk-RPCer for DA-administrasjon
-- =============================================================
-- Begge funksjonene følger samme mønster:
--   1. Verifisere at kallende bruker er coordinator/club_admin på
--      LOTTERIETS team_id (ikke salgets team_id direkte —
--      lottery_sales mangler den kolonnen, men har lottery_id som
--      kobler til lotteries.team_id).
--   2. Iterere over UUID-arrayet og oppdatere kun rader som er
--      'pending_confirmation'. Allerede paid/cancelled hoppes over
--      (idempotent — to DA-er kan trygt klikke "Bekreft" samtidig).
--   3. Returnere {confirmed_count|cancelled_count, skipped_count,
--      not_found_count}.
--
-- SECURITY DEFINER bypasser RLS, men vi gjør egen autorisasjons-
-- sjekk inni funksjonen.

CREATE OR REPLACE FUNCTION public.bulk_confirm_lottery_sales(
  p_sale_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_confirmed_count INT := 0;
  v_skipped_count INT := 0;
  v_not_found_count INT := 0;
  v_unauthorized_count INT := 0;
  v_sale_id UUID;
  v_sale RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget';
  END IF;

  IF p_sale_ids IS NULL OR array_length(p_sale_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'confirmed_count', 0, 'skipped_count', 0,
      'not_found_count', 0, 'unauthorized_count', 0
    );
  END IF;

  FOREACH v_sale_id IN ARRAY p_sale_ids LOOP
    SELECT ls.id, ls.status, l.team_id
      INTO v_sale
    FROM public.lottery_sales ls
    JOIN public.lotteries l ON l.id = ls.lottery_id
    WHERE ls.id = v_sale_id
    FOR UPDATE;  -- lås for å unngå race med en annen DA-handling

    IF NOT FOUND THEN
      v_not_found_count := v_not_found_count + 1;
      CONTINUE;
    END IF;

    -- Autorisasjon per rad: må være coordinator/club_admin på
    -- LOTTERIETS team. Tillater ikke at en coordinator i klubb A
    -- bekrefter et salg fra klubb B.
    IF auth_user_role_in(v_sale.team_id) NOT IN ('coordinator', 'club_admin') THEN
      v_unauthorized_count := v_unauthorized_count + 1;
      CONTINUE;
    END IF;

    IF v_sale.status <> 'pending_confirmation' THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    UPDATE public.lottery_sales
    SET status = 'paid',
        confirmed_at = now(),
        confirmed_by = v_user_id
    WHERE id = v_sale_id;

    v_confirmed_count := v_confirmed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'confirmed_count', v_confirmed_count,
    'skipped_count', v_skipped_count,
    'not_found_count', v_not_found_count,
    'unauthorized_count', v_unauthorized_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_confirm_lottery_sales(UUID[]) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_confirm_lottery_sales(UUID[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.bulk_cancel_lottery_sales(
  p_sale_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_cancelled_count INT := 0;
  v_skipped_count INT := 0;
  v_not_found_count INT := 0;
  v_unauthorized_count INT := 0;
  v_sale_id UUID;
  v_sale RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget';
  END IF;

  IF p_sale_ids IS NULL OR array_length(p_sale_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'cancelled_count', 0, 'skipped_count', 0,
      'not_found_count', 0, 'unauthorized_count', 0
    );
  END IF;

  FOREACH v_sale_id IN ARRAY p_sale_ids LOOP
    SELECT ls.id, ls.status, l.team_id
      INTO v_sale
    FROM public.lottery_sales ls
    JOIN public.lotteries l ON l.id = ls.lottery_id
    WHERE ls.id = v_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_not_found_count := v_not_found_count + 1;
      CONTINUE;
    END IF;

    IF auth_user_role_in(v_sale.team_id) NOT IN ('coordinator', 'club_admin') THEN
      v_unauthorized_count := v_unauthorized_count + 1;
      CONTINUE;
    END IF;

    IF v_sale.status <> 'pending_confirmation' THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    UPDATE public.lottery_sales
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = v_user_id
    WHERE id = v_sale_id;

    v_cancelled_count := v_cancelled_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'cancelled_count', v_cancelled_count,
    'skipped_count', v_skipped_count,
    'not_found_count', v_not_found_count,
    'unauthorized_count', v_unauthorized_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_cancel_lottery_sales(UUID[]) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_cancel_lottery_sales(UUID[]) TO authenticated;


-- En forelder-vennlig variant som tillater kjøperen selv å avbryte
-- ETT salg hen nettopp opprettet — uten å være innlogget. Vi kan
-- ikke verifisere identitet (kjøperen er anon), så vi bruker
-- sale_id som kapabilitet: bare den som kjenner UUID-en kan avbryte,
-- og kun før status er endret av DA. Dette er trygt fordi:
--   - sale_id er gen_random_uuid (ingen gjettbar pattern)
--   - cancel er IDEMPOTENT (samme effekt som DA's "Avvis")
--   - et 'paid' salg kan IKKE rebackes til cancelled av kjøperen
CREATE OR REPLACE FUNCTION public.cancel_pending_lottery_sale(
  p_sale_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF p_sale_id IS NULL THEN
    RAISE EXCEPTION 'Mangler sale_id';
  END IF;

  SELECT status INTO v_status
  FROM public.lottery_sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF v_status <> 'pending_confirmation' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_finalized', 'status', v_status);
  END IF;

  UPDATE public.lottery_sales
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = NULL  -- anon — vi vet ikke hvem
  WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_lottery_sale(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_pending_lottery_sale(UUID) TO anon, authenticated;


-- =============================================================
-- PART D — INSERT-policy: tvinge anon til pending_confirmation
-- =============================================================
-- Dagens lottery_sales_insert_anon = WITH CHECK (true) lar enhver
-- anon-bruker INSERTe hva som helst. Vi strammer inn slik at:
--   - Anon (kjøper i LotteryShop): MÅ insertere med
--     status='pending_confirmation' (den eneste statusen som
--     beskriver "kjøps-forsøk, ikke verifisert").
--   - Coordinator/club_admin: kan insertere med hvilken som helst
--     status — inkludert 'paid' direkte for kontantsalg som DA
--     registrerer manuelt etter mottak.
--
-- Dette stenger ikke alle hull i anon-INSERT (en angriper kan
-- fortsatt fylle opp tabellen med søppel-rader), men sikrer at
-- ingen kan SELV-bekrefte et salg som "betalt" uten DA-godkjenning.

DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
  FOR INSERT
  WITH CHECK (
    status = 'pending_confirmation'
    OR EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_sales.lottery_id
        AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_status_check TEXT;
  v_confirm_oid OID;
  v_cancel_oid OID;
  v_anon_cancel_oid OID;
BEGIN
  -- CHECK-constraint finnes
  SELECT pg_get_constraintdef(c.oid) INTO v_status_check
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'lottery_sales' AND c.conname = 'lottery_sales_status_check';

  IF v_status_check IS NULL THEN
    RAISE EXCEPTION 'lottery_sales_status_check ble ikke opprettet';
  END IF;

  -- bulk_confirm_lottery_sales finnes
  SELECT p.oid INTO v_confirm_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bulk_confirm_lottery_sales' AND p.pronargs = 1;
  IF v_confirm_oid IS NULL THEN
    RAISE EXCEPTION 'bulk_confirm_lottery_sales(UUID[]) ble ikke opprettet';
  END IF;

  -- bulk_cancel_lottery_sales finnes
  SELECT p.oid INTO v_cancel_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bulk_cancel_lottery_sales' AND p.pronargs = 1;
  IF v_cancel_oid IS NULL THEN
    RAISE EXCEPTION 'bulk_cancel_lottery_sales(UUID[]) ble ikke opprettet';
  END IF;

  -- cancel_pending_lottery_sale finnes
  SELECT p.oid INTO v_anon_cancel_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cancel_pending_lottery_sale' AND p.pronargs = 1;
  IF v_anon_cancel_oid IS NULL THEN
    RAISE EXCEPTION 'cancel_pending_lottery_sale(UUID) ble ikke opprettet';
  END IF;

  -- Backfill verifisering: ingen NULL-status
  IF EXISTS (SELECT 1 FROM public.lottery_sales WHERE status IS NULL) THEN
    RAISE EXCEPTION 'Backfill ufullstendig — det finnes lottery_sales-rader med status IS NULL';
  END IF;

  RAISE NOTICE '✅ Lottery payment confirmation migration fullført. Status-kolonne, RPC-er og policy oppdatert.';
END $$;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- Kommentar ut og kjør hvis denne migrasjonen må rulles tilbake.
-- NB: rollback krever også at LotteryShop og LotteryAdmin rulles
-- tilbake til å ikke kjenne status-feltet.
--
-- DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
-- CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
--   FOR INSERT WITH CHECK (true);
--
-- DROP FUNCTION IF EXISTS public.cancel_pending_lottery_sale(UUID);
-- DROP FUNCTION IF EXISTS public.bulk_cancel_lottery_sales(UUID[]);
-- DROP FUNCTION IF EXISTS public.bulk_confirm_lottery_sales(UUID[]);
--
-- DROP INDEX IF EXISTS idx_lottery_sales_lottery_status;
--
-- ALTER TABLE public.lottery_sales DROP CONSTRAINT IF EXISTS lottery_sales_status_check;
-- ALTER TABLE public.lottery_sales ALTER COLUMN status DROP NOT NULL;
-- ALTER TABLE public.lottery_sales ALTER COLUMN status DROP DEFAULT;
-- ALTER TABLE public.lottery_sales
--   DROP COLUMN IF EXISTS status,
--   DROP COLUMN IF EXISTS confirmed_at,
--   DROP COLUMN IF EXISTS confirmed_by,
--   DROP COLUMN IF EXISTS cancelled_at,
--   DROP COLUMN IF EXISTS cancelled_by;
