-- DUGNAD+ PLAN-OPPDATERING — Kjør i Supabase SQL Editor

-- Legg til plan-kolonne på sms_credits
ALTER TABLE public.sms_credits
ADD COLUMN IF NOT EXISTS plan text DEFAULT 'aktiv'
CHECK (plan IN ('aktiv', 'premium'));

-- Aktiv-plan: 200 SMS inkludert ved aktivering
-- Premium-plan: 500 SMS inkludert ved aktivering
