-- =============================================================
-- vikar_messages — RLS-politikk
-- =============================================================
-- Dato: 2026-06-11
-- Bakgrunn:
--   Eksisterende RLS er ultra-permissive (kun auth.uid() IS NOT NULL
--   på alle fire kommandoer). Byttes ut.
--
--   INSERT, UPDATE og DELETE skal kun skje via send_vikar_message-
--   RPCen (SECURITY DEFINER) — vi lager DERFOR ingen permissive
--   policies for disse kommandoene. Postgres avviser alle direkte
--   skriveforsøk fra authenticated/anon når ingen policy gir tilgang.
--   Det er den enkleste måten å låse skriving til RPC.
--
--   SELECT-policyene gjør at frontend kan hente meldinger direkte
--   hvis det noensinne skulle bli ønskelig, men get_vikar_messages-
--   RPCen brukes som primær lese-vei og bypasser likevel RLS.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop eksisterende ultra-permissive politikk
-- ------------------------------------------------------------

DROP POLICY IF EXISTS vikar_messages_select_authenticated ON public.vikar_messages;
DROP POLICY IF EXISTS vikar_messages_insert_authenticated ON public.vikar_messages;
DROP POLICY IF EXISTS vikar_messages_update_authenticated ON public.vikar_messages;
DROP POLICY IF EXISTS vikar_messages_delete_authenticated ON public.vikar_messages;

-- ------------------------------------------------------------
-- 2. SELECT for familie: kun meldinger på egne requester
-- ------------------------------------------------------------

DROP POLICY IF EXISTS vikar_messages_select_family ON public.vikar_messages;
CREATE POLICY vikar_messages_select_family
  ON public.vikar_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = vikar_messages.request_id
        AND r.from_family_id = auth_user_family_id()
    )
  );

-- ------------------------------------------------------------
-- 3. SELECT for vikar: kun meldinger på egne tråder
-- ------------------------------------------------------------

DROP POLICY IF EXISTS vikar_messages_select_substitute ON public.vikar_messages;
CREATE POLICY vikar_messages_select_substitute
  ON public.vikar_messages
  FOR SELECT
  TO authenticated
  USING (thread_substitute_id = auth_user_substitute_id());

-- Ingen INSERT/UPDATE/DELETE-policy: all skriving går via
-- send_vikar_message-RPCen som er SECURITY DEFINER.

-- ------------------------------------------------------------
-- VERIFIKASJON
-- ------------------------------------------------------------

DO $$
DECLARE
  v_policy_count int;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'vikar_messages';

  RAISE NOTICE 'vikar_messages har % policies etter migrasjon.', v_policy_count;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vikar_messages'
      AND policyname='vikar_messages_select_family'
  ) THEN
    RAISE EXCEPTION 'vikar_messages_select_family mangler';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vikar_messages'
      AND policyname='vikar_messages_select_substitute'
  ) THEN
    RAISE EXCEPTION 'vikar_messages_select_substitute mangler';
  END IF;
END $$;

COMMIT;
