-- =============================================================
-- vikar_messages — RPCer for sending og henting av meldinger
-- =============================================================
-- Dato: 2026-06-11
-- Bakgrunn:
--   All chat-aktivitet går via SECURITY DEFINER-RPCer. Det gir
--   atomisk validering, slipper at vikar trenger direkte INSERT-rett,
--   og lar oss returnere norske feilmeldinger med RAISE EXCEPTION.
--
-- send_vikar_message(p_request_id, p_substitute_id, p_content)
--   Utleder fra auth.uid() om caller er familie eller vikar og
--   skriver til riktig sender-kolonne (mutex-CHECK i 01-migrasjonen).
--
-- get_vikar_messages(p_request_id, p_substitute_id)
--   Returnerer tråden kronologisk. Tilgang valideres samme som
--   send-RPCen.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- send_vikar_message
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.send_vikar_message(uuid, uuid, text);

CREATE FUNCTION public.send_vikar_message(
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

  -- Hent og verifiser request
  SELECT id, from_family_id, bid_substitute_id, is_active, type
  INTO v_request
  FROM requests
  WHERE id = p_request_id AND type = 'substitute';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fant ikke vakta.';
  END IF;

  IF NOT v_request.is_active THEN
    RAISE EXCEPTION 'Chatten er stengt fordi vakta er ferdigbehandlet.';
  END IF;

  -- Tilgangskontroll: familie må eie requesten, vikar må være
  -- tråd-vikaren og ha lagt nåværende bud.
  IF v_family_id IS NOT NULL THEN
    IF v_request.from_family_id <> v_family_id THEN
      RAISE EXCEPTION 'Du eier ikke denne vakta.';
    END IF;
    INSERT INTO vikar_messages (request_id, thread_substitute_id, sender_family_id, message)
    VALUES (p_request_id, p_substitute_id, v_family_id, btrim(p_content))
    RETURNING id INTO v_new_id;
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
    RETURNING id INTO v_new_id;
  END IF;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.send_vikar_message(uuid, uuid, text) IS
  'Sender en chat-melding i en vikar-tråd. Caller må være enten '
  'familie som eier requesten, eller vikaren som er tråd-vikar OG '
  'har lagt nåværende bud. Stenges når requesten er inaktiv.';


-- ------------------------------------------------------------
-- get_vikar_messages
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_vikar_messages(uuid, uuid);

CREATE FUNCTION public.get_vikar_messages(
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

  SELECT id, from_family_id, type
  INTO v_request
  FROM requests
  WHERE requests.id = p_request_id AND requests.type = 'substitute';

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

COMMENT ON FUNCTION public.get_vikar_messages(uuid, uuid) IS
  'Henter chat-tråd kronologisk. Lesing er tillatt også etter at '
  'requesten er stengt; tilgang valideres som i send_vikar_message '
  'bortsett fra at vikar kan lese selv om de ikke lenger har '
  'aktivt bud (gjør at tråden lever videre etter aksept).';

COMMIT;
