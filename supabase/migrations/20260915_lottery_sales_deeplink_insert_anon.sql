-- =============================================================
-- lottery_sales: tillat anon INSERT av deeplink-salg
-- =============================================================
-- Dato: 2026-09-15
-- Avhengighet: 20260509_lottery_vipps_epayment.sql (som strammet
--              lottery_sales_insert_anon til ePayment-formen).
--
-- BAKGRUNN
-- LotteryShop får deeplink som standard betalingsmodus. I den modusen
-- finnes det ingen Edge Function som oppretter raden på forhånd:
-- siden inserter selv, FØR Vipps åpnes, og uten vipps_reference —
-- Vipps gir ingen callback for deep links, så det finnes ingen
-- referanse å slå opp mot.
--
-- Dagens policy fra 9. mai krever det motsatte:
--
--   WITH CHECK (status = 'CREATED'
--               AND vipps_reference IS NOT NULL
--               AND vipps_reference LIKE 'lottery-%')
--
-- Den blokkerer derfor hele deeplink-flyten (42501 / "new row
-- violates row-level security policy"). Uten denne migrasjonen
-- registreres ingen deeplink-salg i det hele tatt.
--
-- HVA VI BEHOLDER
-- status = 'CREATED' står fast for anon i BEGGE former. Det var
-- hovedpoenget i mai-innstrammingen: ingen anonym klient skal kunne
-- skrive en rad som ser betalt ut (CAPTURED/AUTHORIZED). Webhooken
-- (service_role) er fortsatt eneste vei til de statusene.
--
-- I tillegg sperrer vi anon fra å skrive payment_method='cash', som
-- er koordinatorens kontantsalg og teller uavhengig av status.
--
-- HVA VI BEVISST GIR SLIPP PÅ
-- En deeplink-rad teller som solgt i loddboka (se
-- src/utils/lotterySales.ts) uten at noen har bekreftet betalingen.
-- Det er selve premisset for deeplink-modus — den gamle tillit-
-- modellen fra før 9. mai hadde samme egenskap, med WITH CHECK (true).
-- Konsekvensen er at hvem som helst kan poste rader og blåse opp
-- koordinatorens tall. Motvekten er avstemming mot Vipps-kontoen,
-- og "Fjern"-knappen per salg i LotteryAdmin.
--
-- Lotterier som kjører ePayment (lotteries.payment_mode='epayment')
-- er uberørt: Edge Function vipps-initiate-payment skriver som
-- service_role og treffer ikke denne policyen i det hele tatt.
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
  FOR INSERT
  WITH CHECK (
    status = 'CREATED'
    AND payment_method IS DISTINCT FROM 'cash'
    AND (
      -- ePayment-form (uendret fra 20260509): referanse med prefiks.
      (vipps_reference IS NOT NULL AND vipps_reference LIKE 'lottery-%')
      -- Deeplink-form (ny): ingen referanse finnes.
      OR vipps_reference IS NULL
    )
  );

COMMIT;

-- =============================================================
-- VERIFISERING (kjør manuelt etter migrasjonen)
-- =============================================================
-- 1. Policyen finnes og har begge former:
--
--   SELECT with_check
--   FROM pg_policies
--   WHERE tablename = 'lottery_sales'
--     AND policyname = 'lottery_sales_insert_anon';
--
-- 2. Deeplink-insert skal LYKKES som anon:
--
--   SET ROLE anon;
--   INSERT INTO public.lottery_sales
--     (lottery_id, buyer_name, buyer_phone, tickets, amount,
--      payment_method, status)
--   VALUES ('<et gyldig lottery_id>', 'Test Testesen', '99887766',
--           1, 50, 'vipps', 'CREATED');
--   RESET ROLE;
--
-- 3. Forsøk på å skrive en "betalt" rad skal FEILE:
--
--   SET ROLE anon;
--   INSERT INTO public.lottery_sales
--     (lottery_id, buyer_name, tickets, amount, payment_method, status)
--   VALUES ('<samme lottery_id>', 'Juks', 1, 50, 'vipps', 'CAPTURED');
--   -- forventet: new row violates row-level security policy
--   RESET ROLE;
--
-- 4. Rydd opp test-radene fra punkt 2:
--
--   DELETE FROM public.lottery_sales WHERE buyer_name = 'Test Testesen';

-- =============================================================
-- ROLLBACK
-- =============================================================
-- Tilbake til ePayment-only (blokkerer deeplink-kjøp igjen):
--
--   DROP POLICY IF EXISTS lottery_sales_insert_anon ON public.lottery_sales;
--   CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
--     FOR INSERT
--     WITH CHECK (
--       status = 'CREATED'
--       AND vipps_reference IS NOT NULL
--       AND vipps_reference LIKE 'lottery-%'
--     );
