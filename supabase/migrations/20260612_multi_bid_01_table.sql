-- =============================================================
-- substitute_bids — flere bud per vakt
-- =============================================================
-- Dato: 2026-06-12
-- Bakgrunn:
--   Tidligere lagret requests inline-bud (bid_amount, bid_message,
--   bid_substitute_id, bid_status). Det er kun ÉN bud-rad per
--   request → siste bud overskriver tidligere → tidligere vikar
--   mister budet uten beskjed.
--
--   Ny modell: substitute_bids som egen entitet. Hver vikar kan ha
--   sitt eget pending-bud per request. Familien velger blant bud.
--
-- Designvalg fra spec:
--   - B1: vikarer ser kun egne bud (egen RLS-policy)
--   - B2: aksept av ett bud → andre pending → 'rejected' (i 02_rpcs)
--   - B3: vikar kan trekke bud → 'withdrawn' (i 02_rpcs)
--   - B4: tidskollisjon-trekk → 'withdrawn_conflict' (i 02_rpcs)
--
-- Direkte-tilbud-flow uberørt:
--   take_substitute_request-RPC leser kun (id, shift_id, is_active)
--   fra requests — ingen bid_*-kolonner. Den fortsetter å virke
--   uten endring også etter at 04 dropper gamle bid_*-kolonner.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.substitute_bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  substitute_id uuid NOT NULL REFERENCES public.substitutes(id) ON DELETE CASCADE,
  amount        integer NOT NULL CHECK (amount > 0),
  message       text,
  status        text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','withdrawn','withdrawn_conflict')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Én PENDING per (request, vikar) — flere historiske bud (rejected
-- osv.) tillates fortsatt for samme par.
CREATE UNIQUE INDEX IF NOT EXISTS substitute_bids_one_pending_per_pair_idx
  ON public.substitute_bids (request_id, substitute_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS substitute_bids_request_idx
  ON public.substitute_bids (request_id);

CREATE INDEX IF NOT EXISTS substitute_bids_substitute_idx
  ON public.substitute_bids (substitute_id);


-- ------------------------------------------------------------
-- Backfill: eksisterende requests.bid_* → substitute_bids
-- ------------------------------------------------------------
-- Kun rader der bid_substitute_id er satt og bid_amount finnes
-- migreres. requests.bid_family_id-bud er familie-til-familie-swap-
-- bud, ikke vikarbud, og kommer ikke inn i substitute_bids.

INSERT INTO public.substitute_bids (request_id, substitute_id, amount, message, status, created_at)
SELECT
  r.id AS request_id,
  r.bid_substitute_id AS substitute_id,
  COALESCE(r.bid_amount, 0) AS amount,
  r.bid_message AS message,
  CASE
    WHEN r.bid_status = 'accepted' THEN 'accepted'
    ELSE 'pending'
  END AS status,
  COALESCE(r.created_at, now()) AS created_at
FROM public.requests r
WHERE r.bid_substitute_id IS NOT NULL
  AND COALESCE(r.bid_amount, 0) > 0
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- VIKTIG: requests.bid_*-kolonnene droppes IKKE her.
-- Migrasjon 04 (20260612_multi_bid_04_drop_old_columns.sql) gjør
-- det etter at prod-test av frontend på substitute_bids er grønn.
-- ------------------------------------------------------------

COMMIT;
