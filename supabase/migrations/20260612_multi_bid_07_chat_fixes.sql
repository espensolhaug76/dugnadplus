-- =============================================================
-- multi_bid 07 — chat-fikser fra prod-test 2026-06-11
-- =============================================================
-- Dato: 2026-06-12
-- Avhengighet: 20260612_chat_reads_05 + 20260612_multi_bid_02_rpcs
--
-- TO BUGS FRA PROD-TEST:
--
-- 1. Ulest-badge forsvant aldri.
--    mark_thread_read brukte ON CONFLICT (family_id, request_id,
--    thread_substitute_id) mot en PARTIELL unik indeks (WHERE
--    family_id IS NOT NULL). Postgres kan bare velge en partiell
--    indeks som arbiter når ON CONFLICT-klausulen gjentar indeksens
--    predikat. Uten det: «there is no unique or exclusion constraint
--    matching the ON CONFLICT specification» på HVERT kall →
--    vikar_message_reads forble tom (0 rader, verifisert i prod).
--
-- 2. Chatten stengte ved aksept.
--    send_vikar_message avviste alle inaktive requests, men
--    accept_substitute_bid lukker requesten (is_active=false).
--    Partene mistet dermed chatten akkurat når avtalen var inngått.
--    Ny regel: inaktiv request er OK hvis tråd-vikaren har akseptert
--    bud — da lever chatten videre for koordinering. Tråder uten
--    akseptert bud (avbrutt søk, avviste vikarer) forblir stengt.
--    get_vikar_messages tillot allerede lesing etter lukking.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. mark_thread_read — ON CONFLICT med indeks-predikat
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_thread_read(
  p_request_id    uuid,
  p_substitute_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_family_id     uuid;
  v_substitute_id uuid;
BEGIN
  v_family_id     := auth_user_family_id();
  v_substitute_id := auth_user_substitute_id();

  IF v_family_id IS NULL AND v_substitute_id IS NULL THEN
    RAISE EXCEPTION 'Du må være innlogget som familie eller vikar.';
  END IF;

  IF v_family_id IS NOT NULL THEN
    INSERT INTO vikar_message_reads (family_id, request_id, thread_substitute_id, last_read_at)
    VALUES (v_family_id, p_request_id, p_substitute_id, now())
    ON CONFLICT (family_id, request_id, thread_substitute_id)
      WHERE family_id IS NOT NULL
    DO UPDATE SET last_read_at = now();
  ELSE
    INSERT INTO vikar_message_reads (substitute_id, request_id, thread_substitute_id, last_read_at)
    VALUES (v_substitute_id, p_request_id, p_substitute_id, now())
    ON CONFLICT (substitute_id, request_id, thread_substitute_id)
      WHERE substitute_id IS NOT NULL
    DO UPDATE SET last_read_at = now();
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- 2. send_vikar_message — chat lever videre etter aksept
-- ------------------------------------------------------------
-- Basert på 20260612_multi_bid_02-versjonen (B6-sjekk mot
-- substitute_bids). Eneste endring: is_active-porten slipper
-- gjennom tråder der tråd-vikaren har akseptert bud.

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
  v_family_id      uuid;
  v_substitute_id  uuid;
  v_request        record;
  v_thread_accepted boolean;
  v_has_active_bid boolean;
  v_new_id         uuid;
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

  -- Inaktiv request: chatten lever videre KUN for tråden med
  -- akseptert bud (vedtatt avtale trenger koordinering).
  IF NOT v_request.is_active THEN
    SELECT EXISTS (
      SELECT 1 FROM substitute_bids b
      WHERE b.request_id = p_request_id
        AND b.substitute_id = p_substitute_id
        AND b.status = 'accepted'
    ) INTO v_thread_accepted;

    IF NOT v_thread_accepted THEN
      RAISE EXCEPTION 'Chatten er stengt fordi vakta er ferdigbehandlet.';
    END IF;
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

COMMENT ON FUNCTION public.send_vikar_message(uuid, uuid, text) IS
  'Sender chat-melding i vikar-tråd. Familie må eie requesten, vikar '
  'må være tråd-vikar med bud (pending/accepted). Inaktiv request: '
  'kun tråden med akseptert bud kan fortsatt skrive (multi_bid 07).';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mark_thread_read';
  IF v_def NOT ILIKE '%WHERE family_id IS NOT NULL%'
     OR v_def NOT ILIKE '%WHERE substitute_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'mark_thread_read mangler arbiter-predikat i ON CONFLICT';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'send_vikar_message';
  IF v_def NOT ILIKE '%v_thread_accepted%' THEN
    RAISE EXCEPTION 'send_vikar_message mangler akseptert-tråd-unntaket';
  END IF;

  RAISE NOTICE '✅ multi_bid 07 OK — mark_thread_read virker og chatten lever videre etter aksept.';
END $$;

COMMIT;
