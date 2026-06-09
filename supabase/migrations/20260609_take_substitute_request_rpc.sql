-- =============================================================
-- take_substitute_request — atomisk "Ta direkte" for vikar
-- =============================================================
-- Dato: 2026-06-09
-- Avhengigheter: Fase 5 (substitutes, auth_user_substitute_id,
--                requests.is_active, assignments.substitute_id)
--
-- BAKGRUNN
-- SubstituteMarketplacePage.acceptJob gjør to separate operasjoner:
--   1. INSERT assignments med substitute_id
--   2. UPDATE requests SET is_active = false
-- Mellom dem kan en annen vikar lese samme request som aktiv, kjøre
-- sin egen acceptJob, og begge ender opp med assignments-rader for
-- samme vakt. Race observert i flere-vikar-test 2026-06-09.
--
-- Denne RPC-en gjør hele "ta vakta"-flyten atomisk:
--   - Låser request-raden FOR UPDATE
--   - Sjekker is_active = true
--   - Inserter assignment + setter is_active = false i samme transaksjon
--
-- RETURN-VERDIER:
--   'ok'              → vakta er nå din
--   'already_taken'   → noen rakk det først (request er is_active=false)
--   'not_found'       → request-ID finnes ikke eller er ikke substitute-type
--   'not_substitute'  → caller har ingen substitutes-rad
--
-- Frontend (Fase 6-frontend, kommer i #4-commit) skal kalle RPC-en
-- og vise pen feilmelding ved 'already_taken'.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.take_substitute_request(p_request_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_substitute_id uuid;
  v_request record;
BEGIN
  -- 1. Verifiser at caller er en vikar
  v_substitute_id := auth_user_substitute_id();
  IF v_substitute_id IS NULL THEN
    RETURN 'not_substitute';
  END IF;

  -- 2. Lås request-raden atomisk og hent state
  SELECT id, shift_id, is_active
  INTO v_request
  FROM requests
  WHERE id = p_request_id
    AND type = 'substitute'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF NOT v_request.is_active THEN
    RETURN 'already_taken';
  END IF;

  -- 3. Inserter assignment + deaktiver request i samme transaksjon.
  --    Hvis assignment-INSERT feiler (eks. XOR-CHECK eller FK), rulles
  --    hele transaksjonen tilbake automatisk via PL/pgSQL.
  INSERT INTO assignments (shift_id, substitute_id, status)
  VALUES (v_request.shift_id, v_substitute_id, 'assigned');

  UPDATE requests SET is_active = false WHERE id = p_request_id;

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.take_substitute_request(uuid) IS
  'Atomisk "Ta direkte" for vikar. Låser request FOR UPDATE, sjekker '
  'is_active, INSERTer assignment, deaktiverer request — alt i én '
  'transaksjon. Forhindrer race der to vikarer tar samme vakt. '
  'Returnerer ok / already_taken / not_found / not_substitute. '
  'SECURITY DEFINER + SET search_path = public.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'take_substitute_request';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'take_substitute_request ble ikke opprettet';
  END IF;

  IF v_def NOT ILIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'take_substitute_request mangler FOR UPDATE-lås';
  END IF;

  IF v_def NOT ILIKE '%auth_user_substitute_id%' THEN
    RAISE EXCEPTION 'take_substitute_request bruker ikke auth_user_substitute_id-helper';
  END IF;

  RAISE NOTICE '✅ take_substitute_request(uuid) opprettet med atomisk lås.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK
-- =============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.take_substitute_request(uuid);
-- COMMIT;
