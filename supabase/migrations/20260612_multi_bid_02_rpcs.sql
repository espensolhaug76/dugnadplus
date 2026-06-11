-- =============================================================
-- substitute_bids — RPCer
-- =============================================================
-- Dato: 2026-06-12
-- Avhengighet: 20260612_multi_bid_01_table.sql
--
-- place_substitute_bid   : insert nytt bud (avviser hvis vikar
--                          allerede har pending)
-- accept_substitute_bid  : familie aksepterer ett bud, alle andre
--                          pending → 'rejected', vikarens andre
--                          pending med tidskollisjon → 'withdrawn_conflict'
-- withdraw_bid           : vikar trekker eget pending-bud
-- send_vikar_message     : oppdatert — sende-tilgang for vikar krever
--                          bud med status 'pending' eller 'accepted'
--
-- Tidskollisjon (B4): ekte intervall-overlapp basert på
-- events.date + shifts.start_time / end_time. Vakter overlapper hvis:
--   start1 < end2 AND end1 > start2
-- (etter at klokkeslett er kombinert med dato).
--
-- Alle kolonner i SELECT INTO er kvalifisert med tabell-alias for
-- å unngå ambiguitet med RETURNS TABLE OUT-parametre (lærdom fra
-- forrige get_vikar_messages-bug).
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- place_substitute_bid
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.place_substitute_bid(uuid, integer, text);

CREATE FUNCTION public.place_substitute_bid(
  p_request_id uuid,
  p_amount     integer,
  p_message    text DEFAULT NULL
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_substitute_id uuid;
  v_request       record;
  v_existing      uuid;
  v_new_bid_id    uuid;
BEGIN
  v_substitute_id := auth_user_substitute_id();
  IF v_substitute_id IS NULL THEN
    RAISE EXCEPTION 'Du må være registrert som vikar.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'Ugyldig beløp.';
  END IF;

  SELECT r.id, r.is_active, r.type
  INTO v_request
  FROM requests r
  WHERE r.id = p_request_id AND r.type = 'substitute'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke vakta.';
  END IF;

  IF NOT v_request.is_active THEN
    RAISE EXCEPTION 'Vakta er allerede tatt.';
  END IF;

  -- Avvis hvis vikaren allerede har pending-bud på samme request
  SELECT b.id INTO v_existing
  FROM substitute_bids b
  WHERE b.request_id = p_request_id
    AND b.substitute_id = v_substitute_id
    AND b.status = 'pending'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Du har allerede et aktivt bud på denne vakta.';
  END IF;

  INSERT INTO substitute_bids (request_id, substitute_id, amount, message, status)
  VALUES (p_request_id, v_substitute_id, p_amount, p_message, 'pending')
  RETURNING substitute_bids.id INTO v_new_bid_id;

  RETURN v_new_bid_id;
END;
$$;


-- ------------------------------------------------------------
-- accept_substitute_bid
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.accept_substitute_bid(uuid);

CREATE FUNCTION public.accept_substitute_bid(p_bid_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_family_id     uuid;
  v_bid           record;
  v_request       record;
  v_accepted_shift record;
BEGIN
  v_family_id := auth_user_family_id();
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget som familie.';
  END IF;

  -- Lås budet og hent state
  SELECT b.id, b.request_id, b.substitute_id, b.status, b.amount
  INTO v_bid
  FROM substitute_bids b
  WHERE b.id = p_bid_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke budet.';
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'Budet er ikke lenger aktivt.';
  END IF;

  -- Verifiser familie-eierskap og lås request
  SELECT r.id, r.shift_id, r.from_family_id, r.is_active
  INTO v_request
  FROM requests r
  WHERE r.id = v_bid.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke vakta.';
  END IF;

  IF v_request.from_family_id <> v_family_id THEN
    RAISE EXCEPTION 'Du eier ikke denne vakta.';
  END IF;

  IF NOT v_request.is_active THEN
    RAISE EXCEPTION 'Vakta er allerede tildelt.';
  END IF;

  -- Hent tid/dato for den aksepterte vakten — brukes til
  -- tidskollisjon-sjekk i B4 under.
  SELECT e.date AS event_date, sh.start_time, sh.end_time
  INTO v_accepted_shift
  FROM shifts sh
  JOIN events e ON e.id = sh.event_id
  WHERE sh.id = v_request.shift_id;

  -- 1. Aksepter valgt bud
  UPDATE substitute_bids
  SET status = 'accepted', updated_at = now()
  WHERE id = v_bid.id;

  -- 2. Alle andre pending-bud på samme request → 'rejected' (B2)
  UPDATE substitute_bids
  SET status = 'rejected', updated_at = now()
  WHERE request_id = v_bid.request_id
    AND id <> v_bid.id
    AND status = 'pending';

  -- 3. Opprett assignment for den aksepterte vikaren
  INSERT INTO assignments (shift_id, substitute_id, status)
  VALUES (v_request.shift_id, v_bid.substitute_id, 'assigned');

  -- 4. Lukk requesten
  UPDATE requests
  SET is_active = false
  WHERE id = v_request.id;

  -- 5. B4: vikarens andre pending-bud med tidskollisjon →
  --    'withdrawn_conflict'. Bygger timestamp via
  --    events.date + shifts.start_time/end_time.
  UPDATE substitute_bids ob
  SET status = 'withdrawn_conflict', updated_at = now()
  FROM requests other_r
  JOIN shifts other_sh ON other_sh.id = other_r.shift_id
  JOIN events other_e  ON other_e.id  = other_sh.event_id
  WHERE ob.substitute_id = v_bid.substitute_id
    AND ob.status = 'pending'
    AND ob.request_id = other_r.id
    AND other_r.id <> v_request.id
    AND (other_e.date + other_sh.start_time)
        <  (v_accepted_shift.event_date + v_accepted_shift.end_time)
    AND (other_e.date + other_sh.end_time)
        >  (v_accepted_shift.event_date + v_accepted_shift.start_time);

  RETURN 'ok';
END;
$$;


-- ------------------------------------------------------------
-- withdraw_bid
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.withdraw_bid(p_bid_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_substitute_id uuid;
  v_bid           record;
BEGIN
  v_substitute_id := auth_user_substitute_id();
  IF v_substitute_id IS NULL THEN
    RAISE EXCEPTION 'Du må være registrert som vikar.';
  END IF;

  SELECT b.id, b.substitute_id, b.status
  INTO v_bid
  FROM substitute_bids b
  WHERE b.id = p_bid_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke budet.';
  END IF;

  IF v_bid.substitute_id <> v_substitute_id THEN
    RAISE EXCEPTION 'Du eier ikke dette budet.';
  END IF;

  IF v_bid.status <> 'pending' THEN
    RAISE EXCEPTION 'Budet er ikke lenger aktivt.';
  END IF;

  UPDATE substitute_bids
  SET status = 'withdrawn', updated_at = now()
  WHERE id = v_bid.id;

  RETURN 'ok';
END;
$$;


-- ------------------------------------------------------------
-- send_vikar_message — oppdatert tilgangskontroll (B6)
-- ------------------------------------------------------------
-- Vikar kan sende hvis det finnes bud (pending eller accepted) på
-- requesten — IKKE bare hvis vikar er current bid_substitute_id på
-- requests-raden (det feltet forsvinner i 04).

CREATE OR REPLACE FUNCTION public.send_vikar_message(
  p_request_id    uuid,
  p_substitute_id uuid,
  p_content       text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_family_id     uuid;
  v_substitute_id uuid;
  v_request       record;
  v_has_active_bid boolean;
  v_new_id        uuid;
BEGIN
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'Meldingen kan ikke være tom.';
  END IF;

  v_family_id     := auth_user_family_id();
  v_substitute_id := auth_user_substitute_id();

  IF v_family_id IS NULL AND v_substitute_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget som familie eller vikar.';
  END IF;

  SELECT r.id, r.from_family_id, r.is_active, r.type
  INTO v_request
  FROM requests r
  WHERE r.id = p_request_id AND r.type = 'substitute'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke vakta.';
  END IF;

  IF NOT v_request.is_active THEN
    RAISE EXCEPTION 'Chatten er stengt fordi vakta er ferdigbehandlet.';
  END IF;

  IF v_family_id IS NOT NULL THEN
    IF v_request.from_family_id <> v_family_id THEN
      RAISE EXCEPTION 'Du eier ikke denne vakta.';
    END IF;
    INSERT INTO vikar_messages (request_id, thread_substitute_id, sender_family_id, message)
    VALUES (p_request_id, p_substitute_id, v_family_id, btrim(p_content))
    RETURNING vikar_messages.id INTO v_new_id;
  ELSE
    IF v_substitute_id <> p_substitute_id THEN
      RAISE EXCEPTION 'Du har ikke tilgang til denne chat-tråden.';
    END IF;

    -- B6: vikar må ha bud med status 'pending' eller 'accepted'
    SELECT EXISTS (
      SELECT 1 FROM substitute_bids b
      WHERE b.request_id = p_request_id
        AND b.substitute_id = v_substitute_id
        AND b.status IN ('pending','accepted')
    ) INTO v_has_active_bid;

    IF NOT v_has_active_bid THEN
      RAISE EXCEPTION 'Du må ha et aktivt bud for å skrive i chatten.';
    END IF;

    INSERT INTO vikar_messages (request_id, thread_substitute_id, sender_substitute_id, message)
    VALUES (p_request_id, p_substitute_id, v_substitute_id, btrim(p_content))
    RETURNING vikar_messages.id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMIT;
