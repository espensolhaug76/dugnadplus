-- =============================================================
-- vikar_message_reads — ulest-tracking + RPCer
-- =============================================================
-- Dato: 2026-06-12
-- Bakgrunn:
--   Chat-knapper trenger badge for uleste meldinger. Vi sporer per
--   bruker (familie ELLER vikar) og per tråd (request_id, thread_
--   substitute_id) når brukeren sist åpnet tråden. Antall uleste =
--   meldinger fra MOTPARTEN nyere enn last_read_at.
--
-- Mutex-CHECK på (family_id, substitute_id) — eier er enten familie
-- eller vikar, aldri begge.
--
-- All skriving via mark_thread_read-RPC. get_unread_counts er
-- read-only og kjøres fra dashbordene hvert 60. sekund.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabell
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vikar_message_reads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id            uuid REFERENCES public.families(id) ON DELETE CASCADE,
  substitute_id        uuid REFERENCES public.substitutes(id) ON DELETE CASCADE,
  request_id           uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  thread_substitute_id uuid NOT NULL REFERENCES public.substitutes(id) ON DELETE CASCADE,
  last_read_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vikar_message_reads_actor_xor
    CHECK ((family_id IS NULL) <> (substitute_id IS NULL))
);

-- Partielle UNIQUE-indekser per aktørtype så vi får én rad per
-- (aktør, tråd) — partial fordi NULL-er ikke "kolliderer" i vanlig
-- UNIQUE-indeks.
CREATE UNIQUE INDEX IF NOT EXISTS vikar_message_reads_family_idx
  ON public.vikar_message_reads (family_id, request_id, thread_substitute_id)
  WHERE family_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vikar_message_reads_substitute_idx
  ON public.vikar_message_reads (substitute_id, request_id, thread_substitute_id)
  WHERE substitute_id IS NOT NULL;


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE public.vikar_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vikar_message_reads_select_own ON public.vikar_message_reads;
CREATE POLICY vikar_message_reads_select_own
  ON public.vikar_message_reads
  FOR SELECT
  TO authenticated
  USING (
    family_id = auth_user_family_id()
    OR substitute_id = auth_user_substitute_id()
  );

-- Ingen INSERT/UPDATE/DELETE — kun via mark_thread_read-RPC.


-- ------------------------------------------------------------
-- mark_thread_read
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
    DO UPDATE SET last_read_at = now();
  ELSE
    INSERT INTO vikar_message_reads (substitute_id, request_id, thread_substitute_id, last_read_at)
    VALUES (v_substitute_id, p_request_id, p_substitute_id, now())
    ON CONFLICT (substitute_id, request_id, thread_substitute_id)
    DO UPDATE SET last_read_at = now();
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- get_unread_counts
-- ------------------------------------------------------------
-- Returnerer én rad per tråd som har minst én ulest melding fra
-- motparten. Trådidentitet = (request_id, thread_substitute_id).

DROP FUNCTION IF EXISTS public.get_unread_counts();

CREATE FUNCTION public.get_unread_counts()
  RETURNS TABLE (
    request_id           uuid,
    thread_substitute_id uuid,
    unread_count         integer
  )
  LANGUAGE plpgsql
  STABLE
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
    -- Familie ser uleste meldinger sendt av vikar (sender_substitute_id IS NOT NULL),
    -- på tråder der familien eier requesten.
    RETURN QUERY
      SELECT m.request_id, m.thread_substitute_id, count(*)::int AS unread_count
      FROM vikar_messages m
      JOIN requests r ON r.id = m.request_id
      LEFT JOIN vikar_message_reads rd
        ON rd.family_id = v_family_id
       AND rd.request_id = m.request_id
       AND rd.thread_substitute_id = m.thread_substitute_id
      WHERE r.from_family_id = v_family_id
        AND m.sender_substitute_id IS NOT NULL
        AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
      GROUP BY m.request_id, m.thread_substitute_id;
  ELSE
    -- Vikar ser uleste meldinger sendt av familien (sender_family_id IS NOT NULL),
    -- på egne tråder.
    RETURN QUERY
      SELECT m.request_id, m.thread_substitute_id, count(*)::int AS unread_count
      FROM vikar_messages m
      LEFT JOIN vikar_message_reads rd
        ON rd.substitute_id = v_substitute_id
       AND rd.request_id = m.request_id
       AND rd.thread_substitute_id = m.thread_substitute_id
      WHERE m.thread_substitute_id = v_substitute_id
        AND m.sender_family_id IS NOT NULL
        AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
      GROUP BY m.request_id, m.thread_substitute_id;
  END IF;
END;
$$;

COMMIT;
