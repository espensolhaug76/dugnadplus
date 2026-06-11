-- =============================================================
-- vikar_messages — kolonner for aktør-polymorfisme
-- =============================================================
-- Dato: 2026-06-11
-- Bakgrunn:
--   Tabellen ble laget før Fase 5 og har bare sender_family_id.
--   Vikar har ingen families-rad, så vikaren kan ikke sende
--   meldinger uten å oppfinne en families-id. Vi følger samme
--   mønster som Fase 5 assignments/requests: separate uuid-felter
--   per aktørtype + mutex-CHECK.
--
--   Trådidentitet for chat: (request_id, thread_substitute_id).
--   Én vikar = én tråd per request. Familie kan ha flere parallelle
--   tråder dersom flere vikarer byr på samme request.
--
--   Tabellen er tom (0 rader, verifisert 2026-06-11) → trygt å
--   sette thread_substitute_id NOT NULL fra start.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Nye aktør-kolonner
-- ------------------------------------------------------------

ALTER TABLE public.vikar_messages
  ADD COLUMN IF NOT EXISTS sender_substitute_id uuid
    REFERENCES public.substitutes(id) ON DELETE CASCADE;

ALTER TABLE public.vikar_messages
  ADD COLUMN IF NOT EXISTS thread_substitute_id uuid NOT NULL
    REFERENCES public.substitutes(id) ON DELETE CASCADE;

-- sender_family_id er allerede nullable (verifisert i Fase 0),
-- ingen DROP NOT NULL nødvendig.

-- ------------------------------------------------------------
-- 2. Mutex-CHECK: nøyaktig én av sender_family_id /
--    sender_substitute_id skal være satt
-- ------------------------------------------------------------

ALTER TABLE public.vikar_messages
  DROP CONSTRAINT IF EXISTS vikar_messages_sender_actor_xor;

ALTER TABLE public.vikar_messages
  ADD CONSTRAINT vikar_messages_sender_actor_xor
    CHECK ((sender_family_id IS NULL) <> (sender_substitute_id IS NULL));

-- ------------------------------------------------------------
-- 3. Indeks for kronologisk tråd-henting
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS vikar_messages_thread_created_idx
  ON public.vikar_messages (request_id, thread_substitute_id, created_at);

COMMIT;
