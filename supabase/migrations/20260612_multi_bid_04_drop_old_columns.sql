-- =============================================================
-- KJØRES SIST — etter verifisert prod-test av substitute_bids
-- =============================================================
-- Dato: 2026-06-12
-- Avhengighet: 20260612_multi_bid_01..03 + 06 (legacy RPCer/policies)
--              + verifisert at frontend har gått over til
--              substitute_bids som sannhetskilde.
--
-- VIKTIG: 06 MÅ kjøres før denne — fire RLS-policies på requests
-- refererte bid_*-kolonnene og ville blokkert DROP COLUMN her.
--
-- Dropper bid_*-kolonnene på requests siden substitute_bids er
-- kanonisk for vikarbud nå. bid_family_id og requests_bid_actor_mutex
-- droppes også fordi de var del av samme polymorfi-pakke fra Fase 5;
-- familie-til-familie-swap (de få stedene som leste dem) brukes ikke
-- aktivt i dag og kan introduseres tilbake hvis vi vil bygge swap-
-- auksjon senere.
--
-- KJØR DENNE BARE NÅR:
--   1. Migrasjon 01-03 + 05 + 06 er kjørt og verifisert
--   2. Frontend-deploy med substitute_bids er live
--   3. Manuell test av place/accept/withdraw og chat har vært grønn
-- =============================================================

BEGIN;

-- Drop CHECK først (avhenger av kolonnene)
ALTER TABLE public.requests
  DROP CONSTRAINT IF EXISTS requests_bid_actor_mutex;

-- Drop kolonnene
ALTER TABLE public.requests DROP COLUMN IF EXISTS bid_substitute_id;
ALTER TABLE public.requests DROP COLUMN IF EXISTS bid_family_id;
ALTER TABLE public.requests DROP COLUMN IF EXISTS bid_amount;
ALTER TABLE public.requests DROP COLUMN IF EXISTS bid_message;
ALTER TABLE public.requests DROP COLUMN IF EXISTS bid_status;

COMMIT;
