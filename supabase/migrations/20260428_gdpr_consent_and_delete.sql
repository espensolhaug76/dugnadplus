-- =============================================================
-- GDPR: samtykke-sporing + slett-konto-RPC
-- =============================================================
-- Denne migreringen legger til:
--   1) public.user_consents — én rad per godkjent konto, lagrer
--      hvilken versjon av personvern/vilkar brukeren har godtatt
--      og når. Kobles via auth.users(id).
--   2) Tre nye kolonner på public.pending_parents:
--      - consent_privacy_version
--      - consent_terms_version
--      - consent_at
--      Slik at vi har audit-trail for /join-flowen før auth-bruker
--      eksisterer. Når koordinator godkjenner, kan disse kopieres
--      inn i user_consents.
--   3) public.delete_my_account() — SECURITY DEFINER-RPC som lar
--      en innlogget bruker slette sin egen family_member-rad og
--      auth.users-rad. CASCADE i family_members-FKene tar resten
--      (assignments, lottery_purchases, kiosk_orders osv).
--
-- Kjør dette i Supabase SQL Editor som éin transaksjon.
-- =============================================================

-- 1. user_consents
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  privacy_version text NOT NULL DEFAULT '1.0',
  terms_version text NOT NULL DEFAULT '1.0',
  consented_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_consents_user_id_idx
  ON public.user_consents(user_id);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_consents_self_read ON public.user_consents;
CREATE POLICY user_consents_self_read
  ON public.user_consents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_consents_self_insert ON public.user_consents;
CREATE POLICY user_consents_self_insert
  ON public.user_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. pending_parents: consent-kolonner
ALTER TABLE public.pending_parents
  ADD COLUMN IF NOT EXISTS consent_privacy_version text,
  ADD COLUMN IF NOT EXISTS consent_terms_version text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz;

-- 3. delete_my_account RPC
-- Sletter family_members-rader knyttet til auth.uid() (kaskaderer
-- via FK til assignments osv), og deretter auth.users-raden selv.
-- Kjører som SECURITY DEFINER fordi DELETE auth.users krever
-- service-role normalt — funksjonen er låst til kun å slette egen
-- bruker via WHERE id = auth.uid().
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Ikke autentisert';
  END IF;

  -- Slett tilhørende family_members (CASCADE rydder assignments,
  -- lottery_purchases, kiosk_orders osv via FK ON DELETE CASCADE)
  DELETE FROM public.family_members
   WHERE auth_user_id = v_uid;

  -- Rydd opp pending_parents hvis brukeren har en pending rad
  DELETE FROM public.pending_parents
   WHERE auth_user_id = v_uid;

  -- Til slutt: slett auth-bruker
  DELETE FROM auth.users
   WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
