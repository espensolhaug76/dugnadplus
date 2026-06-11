-- =============================================================
-- Wipe vikar-testdata før prod-test av multi-bid
-- =============================================================
-- Dato: 2026-06-12
-- Bakgrunn:
--   Migrasjon 01 backfillet det gamle test-budet fra requests.bid_*
--   inn i substitute_bids som pending. Ved retest får vikaren da
--   «Du har allerede et aktivt bud på denne vakta» uten at UI-et
--   viste noe bud (stale testdata, ikke en bug).
--
-- Sletter: substitute_bids, vikar_messages, vikar_message_reads,
--          og nuller gamle bid_*-felter på requests (hvis 04 ikke
--          har droppet dem ennå).
-- Beholder: substitutes-profiler, requests (den åpne vakta å by på),
--           assignments, alt utenfor vikar-modulen.
--
-- Trygg å kjøre både før og etter migrasjon 04 (kolonne-sjekk i DO).
-- =============================================================

BEGIN;

DELETE FROM public.vikar_message_reads;
DELETE FROM public.vikar_messages;
DELETE FROM public.substitute_bids;

-- Null gamle inline-bud-felter så de ikke backfilles på nytt om 01
-- skulle kjøres igjen. Betinget: kolonnene finnes ikke etter 04.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='requests'
               AND column_name='bid_substitute_id') THEN
    UPDATE public.requests
    SET bid_substitute_id = NULL,
        bid_family_id     = NULL,
        bid_amount        = NULL,
        bid_message       = NULL,
        bid_status        = NULL
    WHERE type = 'substitute';
  END IF;
END $$;

-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_bids int; v_msgs int; v_reads int; v_open_requests int;
BEGIN
  SELECT count(*) INTO v_bids  FROM public.substitute_bids;
  SELECT count(*) INTO v_msgs  FROM public.vikar_messages;
  SELECT count(*) INTO v_reads FROM public.vikar_message_reads;
  SELECT count(*) INTO v_open_requests
    FROM public.requests WHERE type='substitute' AND is_active;

  IF v_bids + v_msgs + v_reads > 0 THEN
    RAISE EXCEPTION 'Wipe ufullstendig: % bud, % meldinger, % reads igjen',
      v_bids, v_msgs, v_reads;
  END IF;

  RAISE NOTICE '✅ Vikar-testdata wipet. % åpne vikar-vakter klare for retest.',
    v_open_requests;
END $$;

COMMIT;
