-- =============================================================
-- place_substitute_bid + accept_substitute_bid
-- =============================================================
-- Dato: 2026-06-09
-- Avhengigheter: Fase 5 (substitutes, requests, assignments med
--                substitute_id, auth_user_family_id, auth_user_substitute_id)
--
-- BAKGRUNN — to RLS-rotåpne bugs avdekket i prod-test 2026-06-09:
--
-- 1. Vikar kan ikke sende bud via direkte UPDATE
--    PostgreSQL UPDATE krever BÅDE SELECT-policy og UPDATE-policy
--    (AND mellom dem) for å finne raden. Vikar har ingen SELECT-
--    policy som matcher på en request hvor bid_substitute_id
--    fortsatt er NULL (requests_select_substitute_own bare matcher
--    når raden allerede peker på vikar). Resultat: UPDATE finner
--    0 rader, ingen feil — UI viser falsk "Bud sendt".
--
-- 2. Familie kan ikke akseptere bud (assignment opprettes ikke)
--    handleAcceptBid INSERTer assignment med substitute_id. Ingen
--    av familie-policy-ene tillater det:
--    - assignments_insert_parent: family_id må matche, vi setter
--      substitute_id (XOR-CHECK)
--    - assignments_insert_substitute: substitute_id = caller's
--      vikar-id; familien er ikke vikar
--    Resultat: INSERT avvist stille, request markert akseptert men
--    ingen assignment laget.
--
-- LØSNING — SECURITY DEFINER RPCer (samme mønster som
-- take_substitute_request fra commit 99f2470):
--
--   place_substitute_bid(p_request_id, p_amount, p_message)
--     For vikar: lås request, valider, sett bud, returner status
--
--   accept_substitute_bid(p_request_id)
--     For familie: lås request, valider eierskap, INSERT assignment
--     med riktig kolonne (mutex), UPDATE request status
--
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. place_substitute_bid
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_substitute_bid(
  p_request_id uuid,
  p_amount     integer,
  p_message    text DEFAULT NULL
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_substitute_id uuid;
  v_request record;
BEGIN
  -- 1. Caller må være vikar
  v_substitute_id := auth_user_substitute_id();
  IF v_substitute_id IS NULL THEN
    RETURN 'not_substitute';
  END IF;

  -- 2. Valider beløp (samme regel som UI-side: 1..500)
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RETURN 'invalid_amount';
  END IF;

  -- 3. Lås request FOR UPDATE og verifiser at den er åpen
  SELECT id, is_active, type
  INTO v_request
  FROM requests
  WHERE id = p_request_id AND type = 'substitute'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF NOT v_request.is_active THEN
    RETURN 'already_taken';
  END IF;

  -- 4. Skriv bud. Mutex-CHECK garanterer at bid_family_id må være NULL
  --    når vi setter bid_substitute_id. Last bid wins — om en annen
  --    vikar har lagt et bud, overskriver vi det.
  UPDATE requests SET
    bid_substitute_id = v_substitute_id,
    bid_family_id     = NULL,
    bid_amount        = p_amount,
    bid_message       = p_message,
    bid_status        = 'pending'
  WHERE id = p_request_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.place_substitute_bid(uuid, integer, text) IS
  'Atomisk bud-skriving for vikar. Bypass RLS via SECURITY DEFINER. '
  'Vikar har ikke direkte SELECT-tilgang til åpne requests (kun via '
  'list_open_substitute_jobs), så UPDATE må gå via RPC. Returnerer '
  'ok / not_substitute / invalid_amount / not_found / already_taken.';


-- ------------------------------------------------------------
-- 2. accept_substitute_bid
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_substitute_bid(p_request_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_family_id      uuid;
  v_request        record;
BEGIN
  -- 1. Caller må være familie-forelder
  v_family_id := auth_user_family_id();
  IF v_family_id IS NULL THEN
    RETURN 'not_family';
  END IF;

  -- 2. Lås request og verifiser eierskap + bud-state
  SELECT id, shift_id, from_family_id, is_active,
         bid_substitute_id, bid_family_id, bid_status
  INTO v_request
  FROM requests
  WHERE id = p_request_id AND type = 'substitute'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_request.from_family_id <> v_family_id THEN
    RETURN 'not_owner';
  END IF;

  IF NOT v_request.is_active THEN
    RETURN 'already_handled';
  END IF;

  IF v_request.bid_substitute_id IS NULL AND v_request.bid_family_id IS NULL THEN
    RETURN 'no_bid';
  END IF;

  -- 3. INSERT assignment med riktig kolonne (mutex på actor-XOR)
  IF v_request.bid_substitute_id IS NOT NULL THEN
    INSERT INTO assignments (shift_id, substitute_id, status)
    VALUES (v_request.shift_id, v_request.bid_substitute_id, 'assigned');
  ELSE
    INSERT INTO assignments (shift_id, family_id, status)
    VALUES (v_request.shift_id, v_request.bid_family_id, 'assigned');
  END IF;

  -- 4. Marker request som akseptert + inaktiv
  UPDATE requests SET
    bid_status = 'accepted',
    is_active  = false
  WHERE id = p_request_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.accept_substitute_bid(uuid) IS
  'Atomisk bud-aksept for familie. INSERTer assignment med riktig '
  'actor-kolonne (substitute_id eller family_id avhengig av bud-type), '
  'oppdaterer request-status. Bypass RLS via SECURITY DEFINER siden '
  'familie ikke har INSERT-rett på assignments med substitute_id direkte. '
  'Returnerer ok / not_family / not_found / not_owner / already_handled / no_bid.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_substitute_bid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'place_substitute_bid ikke opprettet';
  END IF;
  IF v_def NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'place_substitute_bid mangler FOR UPDATE-lås';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'accept_substitute_bid';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'accept_substitute_bid ikke opprettet';
  END IF;
  IF v_def NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'accept_substitute_bid mangler FOR UPDATE-lås';
  END IF;

  RAISE NOTICE '✅ place_substitute_bid + accept_substitute_bid opprettet med atomiske låser.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.accept_substitute_bid(uuid);
-- DROP FUNCTION IF EXISTS public.place_substitute_bid(uuid, integer, text);
-- COMMIT;
