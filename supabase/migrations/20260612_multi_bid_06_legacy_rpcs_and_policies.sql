-- =============================================================
-- multi_bid 06 — siste bid_*-avhengigheter vekk fra RPCer/policies
-- =============================================================
-- Dato: 2026-06-12
-- Avhengighet: 20260612_multi_bid_01_table.sql (substitute_bids)
-- KJØRES: etter 01-03 (+05), FØR 04 (drop-kolonner).
--
-- BAKGRUNN
-- Migrasjon 04 dropper requests.bid_*-kolonnene, men fire RLS-
-- policies på requests og to RPCer refererer dem fortsatt:
--
--   policies: requests_insert_authenticated (WITH CHECK),
--             requests_select_family, requests_update_family,
--             requests_select_substitute_own,
--             requests_update_substitute_bid
--   RPCer:    list_open_substitute_jobs, get_substitute_public_profile
--
-- Policies lager pg_depend-avhengigheter → DROP COLUMN i 04 ville
-- feilet. RPC-ene ville feilet ved kall etter drop.
--
-- BONUS-FIKS: vikar-avslag av direkte tilbud (SubstituteDashboard
-- setter target_substitute_id = NULL) har vært stille brutt:
-- gammel requests_update_substitute_bid hadde
-- WITH CHECK (bid_substitute_id = me) som aldri passerer når raden
-- ikke har bud. Ny smal decline-policy fikser dette.
--
-- REKURSJON-MERKNAD (lærdom fra 20260610_fix_substitute_rls_recursion):
-- substitute_bids_select_family (03) har EXISTS-subquery mot requests.
-- Hvis requests-policy hadde EXISTS mot substitute_bids → sirkel.
-- Derfor SECURITY DEFINER-helper substitute_bid_request_ids() som
-- bypasser RLS internt, samme mønster som substitute_assigned_*_ids.
-- =============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Helper: request-ider der innlogget vikar har aktivt bud
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.substitute_bid_request_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT request_id), '{}'::uuid[])
  FROM substitute_bids
  WHERE substitute_id = auth_user_substitute_id()
    AND status IN ('pending','accepted');
$$;

COMMENT ON FUNCTION public.substitute_bid_request_ids() IS
  'Returnerer request-IDer der innlogget vikar har bud med status '
  'pending/accepted. SECURITY DEFINER bypasser RLS internt → trygt i '
  'RLS-policies uten rekursjon mot substitute_bids_select_family.';


-- ------------------------------------------------------------
-- 2. requests-policies uten bid_*-kolonner
-- ------------------------------------------------------------

-- Familie oppretter requests med seg selv som avsender. Den gamle
-- bid_family_id-grenen tillot INSERT av familie-swap-bud direkte på
-- raden — den modellen forsvinner med kolonnene i 04, og ingen
-- frontend-flyt bruker den (swap/vikar-søk setter from_family_id).
DROP POLICY IF EXISTS requests_insert_authenticated ON public.requests;
CREATE POLICY requests_insert_authenticated ON public.requests
  FOR INSERT
  TO authenticated
  WITH CHECK (from_family_id = auth_user_family_id());

DROP POLICY IF EXISTS requests_select_family ON public.requests;
CREATE POLICY requests_select_family ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    from_family_id = auth_user_family_id()
    OR to_family_id = auth_user_family_id()
    OR target_family_id = auth_user_family_id()
  );

DROP POLICY IF EXISTS requests_update_family ON public.requests;
CREATE POLICY requests_update_family ON public.requests
  FOR UPDATE
  TO authenticated
  USING (
    from_family_id = auth_user_family_id()
    OR to_family_id = auth_user_family_id()
  );

-- Vikar ser requests rettet mot dem (target) eller der de har
-- aktivt bud i substitute_bids (via helper, ikke EXISTS — se
-- rekursjon-merknad i header).
DROP POLICY IF EXISTS requests_select_substitute_own ON public.requests;
CREATE POLICY requests_select_substitute_own ON public.requests
  FOR SELECT
  TO authenticated
  USING (
    target_substitute_id = auth_user_substitute_id()
    OR id = ANY(public.substitute_bid_request_ids())
  );

-- Bud-skriving går nå utelukkende via place/withdraw/accept-RPCer
-- (SECURITY DEFINER). Eneste direkte UPDATE vikar gjør er å avslå
-- et direkte tilbud: target_substitute_id = NULL → tilbake til
-- åpent marked. WITH CHECK låser til akkurat den overgangen.
DROP POLICY IF EXISTS requests_update_substitute_bid ON public.requests;
DROP POLICY IF EXISTS requests_update_substitute_decline ON public.requests;
CREATE POLICY requests_update_substitute_decline ON public.requests
  FOR UPDATE
  TO authenticated
  USING (target_substitute_id = auth_user_substitute_id())
  WITH CHECK (target_substitute_id IS NULL);


-- ------------------------------------------------------------
-- 3. list_open_substitute_jobs — uten bid_*-kolonner
-- ------------------------------------------------------------
-- Vikars egne bud leses nå fra substitute_bids direkte (RLS-policy
-- substitute_bids_select_substitute gir kun egne rader), så RPCen
-- trenger ikke lenger eksponere bud-state. RETURNS TABLE endres
-- (21 → 16 kolonner) → DROP + CREATE.

DROP FUNCTION IF EXISTS public.list_open_substitute_jobs(text);

CREATE FUNCTION public.list_open_substitute_jobs(p_municipality text DEFAULT NULL)
  RETURNS TABLE(
    event_id              uuid,
    event_name            text,
    event_date            date,
    event_location        text,
    event_sport           text,
    event_team_id         text,
    event_municipality    text,
    shift_id              uuid,
    shift_name            text,
    start_time            time,
    end_time              time,
    request_id            uuid,
    target_family_id      uuid,
    target_substitute_id  uuid,
    from_family_id        uuid,
    from_family_name      text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    e.id            AS event_id,
    e.name          AS event_name,
    e.date          AS event_date,
    e.location      AS event_location,
    e.sport         AS event_sport,
    e.team_id       AS event_team_id,
    (
      SELECT c.municipality
      FROM team_members tm
      JOIN clubs c ON c.id = tm.club_id
      WHERE tm.team_id = e.team_id
        AND c.municipality IS NOT NULL
      LIMIT 1
    )               AS event_municipality,
    sh.id           AS shift_id,
    sh.name         AS shift_name,
    sh.start_time,
    sh.end_time,
    r.id            AS request_id,
    r.target_family_id,
    r.target_substitute_id,
    r.from_family_id,
    f.name          AS from_family_name
  FROM events e
  JOIN shifts sh ON sh.event_id = e.id
  JOIN requests r ON r.shift_id = sh.id
  LEFT JOIN families f ON f.id = r.from_family_id
  WHERE r.type = 'substitute'
    AND r.is_active = true
    AND e.date >= CURRENT_DATE
    AND auth.uid() IS NOT NULL
    AND (
      p_municipality IS NULL
      OR btrim(p_municipality) = ''
      OR EXISTS (
        SELECT 1
        FROM team_members tm
        JOIN clubs c ON c.id = tm.club_id
        WHERE tm.team_id = e.team_id
          AND c.municipality = p_municipality
      )
    )
  ORDER BY e.date, sh.start_time;
$$;

COMMENT ON FUNCTION public.list_open_substitute_jobs(text) IS
  'Vikar-børs: returnerer åpne substitute-requests filtrert på '
  'kommune. p_municipality NULL/tom → ingen filtrering. Bud-state '
  'leses ikke her — vikar henter egne bud fra substitute_bids (RLS). '
  'Krever authenticated caller. SECURITY DEFINER + search_path=public.';


-- ------------------------------------------------------------
-- 4. get_substitute_public_profile — join via substitute_bids
-- ------------------------------------------------------------
-- Tilgang som før (vikaren må ha aktivt bud på en request i callers
-- lag), men buddet bor i substitute_bids. r.is_active-kravet er
-- byttet mot status IN ('pending','accepted') slik at familien
-- fortsatt kan se profilen etter aksept (requesten lukkes da).

CREATE OR REPLACE FUNCTION public.get_substitute_public_profile(p_substitute_id uuid)
  RETURNS TABLE(
    substitute_id  uuid,
    name           text,
    age            integer,
    experience     text,
    is_active      boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    s.id          AS substitute_id,
    s.name        AS name,
    s.age         AS age,
    s.experience  AS experience,
    s.is_active   AS is_active
  FROM substitutes s
  WHERE s.id = p_substitute_id
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM substitute_bids b
      JOIN requests r ON r.id = b.request_id
      JOIN shifts sh ON sh.id = r.shift_id
      JOIN events e ON e.id = sh.event_id
      WHERE b.substitute_id = s.id
        AND b.status IN ('pending','accepted')
        AND e.team_id = ANY(auth_user_team_ids())
    );
$$;

COMMENT ON FUNCTION public.get_substitute_public_profile(uuid) IS
  'GDPR-minimerende public profile for vikar. Returnerer navn, alder, '
  'erfaring, is_active. IKKE telefon eller e-post. '
  'Tilgang: vikaren må ha bud (pending/accepted) i substitute_bids på '
  'en request tilhørende et lag caller er medlem av. '
  'SECURITY DEFINER + SET search_path = public.';


-- =============================================================
-- VERIFIKASJON
-- =============================================================
DO $$
DECLARE
  v_def text;
  v_bad int;
BEGIN
  -- Ingen requests-policy skal lenger referere bid_*-kolonnene som
  -- droppes i 04. Match på eksakte kolonnenavn — generisk '%bid_%'
  -- ga falsk positiv på helper-navnet substitute_bid_request_ids().
  SELECT count(*) INTO v_bad
  FROM pg_policy
  WHERE polrelid = 'public.requests'::regclass
    AND (
      COALESCE(pg_get_expr(polqual, polrelid), '')
        || ' ' || COALESCE(pg_get_expr(polwithcheck, polrelid), '')
    ) ~* '\m(bid_substitute_id|bid_family_id|bid_amount|bid_message|bid_status)\M';
  IF v_bad > 0 THEN
    RAISE EXCEPTION '% requests-policies refererer fortsatt bid_*-kolonner', v_bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'requests_update_substitute_decline') THEN
    RAISE EXCEPTION 'requests_update_substitute_decline mangler';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'list_open_substitute_jobs';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'list_open_substitute_jobs ikke opprettet';
  END IF;
  IF v_def ILIKE '%bid_%' THEN
    RAISE EXCEPTION 'list_open_substitute_jobs refererer fortsatt bid_*';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_substitute_public_profile';
  IF v_def ILIKE '%bid_substitute_id%' THEN
    RAISE EXCEPTION 'get_substitute_public_profile joiner fortsatt på bid_substitute_id';
  END IF;

  RAISE NOTICE '✅ multi_bid 06 OK — ingen RPCer/policies refererer requests.bid_* lenger. 04 kan kjøres etter prod-test.';
END $$;

COMMIT;


-- =============================================================
-- ROLLBACK (gjenoppretter 20260604-definisjonene — krever at
-- requests.bid_*-kolonnene fortsatt finnes, dvs. FØR 04)
-- =============================================================
-- Se 20260604_substitute_actor_02_rpcs.sql og _03_rls.sql for
-- de gamle definisjonene.
