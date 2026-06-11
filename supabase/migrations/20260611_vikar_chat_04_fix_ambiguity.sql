-- =============================================================
-- get_vikar_messages — fiks ambiguous id-feil
-- =============================================================
-- Dato: 2026-06-11
-- Bug:
--   get_vikar_messages har RETURNS TABLE (id, request_id, ...).
--   Inne i funksjonen gjorde vi:
--     SELECT id, from_family_id, type INTO v_request FROM requests ...
--   Bare `id` i SELECT-listen kolliderte med RETURNS TABLE-
--   OUT-parameteren `id` → "column reference id is ambiguous".
--
-- Fiks: alle kolonner i SELECT-listen kvalifiseres med
-- requests.<kolonne>. Også send_vikar_message får tabell-aliasing
-- i sin SELECT INTO, slik at samme klasse bug ikke dukker opp
-- ved senere endringer.
--
-- CREATE OR REPLACE er trygt siden signaturene ikke endres.
-- =============================================================

BEGIN;

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

  SELECT r.id, r.from_family_id, r.bid_substitute_id, r.is_active, r.type
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
    IF v_request.bid_substitute_id IS NULL
       OR v_request.bid_substitute_id <> v_substitute_id THEN
      RAISE EXCEPTION 'Du må ha lagt inn bud for å skrive i chatten.';
    END IF;
    INSERT INTO vikar_messages (request_id, thread_substitute_id, sender_substitute_id, message)
    VALUES (p_request_id, p_substitute_id, v_substitute_id, btrim(p_content))
    RETURNING vikar_messages.id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_vikar_messages(
  p_request_id    uuid,
  p_substitute_id uuid
)
  RETURNS TABLE (
    id                   uuid,
    request_id           uuid,
    thread_substitute_id uuid,
    sender_family_id     uuid,
    sender_substitute_id uuid,
    message              text,
    created_at           timestamptz
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_family_id     uuid;
  v_substitute_id uuid;
  v_request       record;
BEGIN
  v_family_id     := auth_user_family_id();
  v_substitute_id := auth_user_substitute_id();

  IF v_family_id IS NULL AND v_substitute_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget som familie eller vikar.';
  END IF;

  SELECT r.id, r.from_family_id, r.type
  INTO v_request
  FROM requests r
  WHERE r.id = p_request_id AND r.type = 'substitute';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke vakta.';
  END IF;

  IF v_family_id IS NOT NULL THEN
    IF v_request.from_family_id <> v_family_id THEN
      RAISE EXCEPTION 'Du eier ikke denne vakta.';
    END IF;
  ELSE
    IF v_substitute_id <> p_substitute_id THEN
      RAISE EXCEPTION 'Du har ikke tilgang til denne chat-tråden.';
    END IF;
  END IF;

  RETURN QUERY
    SELECT m.id,
           m.request_id,
           m.thread_substitute_id,
           m.sender_family_id,
           m.sender_substitute_id,
           m.message,
           m.created_at
    FROM vikar_messages m
    WHERE m.request_id = p_request_id
      AND m.thread_substitute_id = p_substitute_id
    ORDER BY m.created_at ASC, m.id ASC;
END;
$$;

COMMIT;
