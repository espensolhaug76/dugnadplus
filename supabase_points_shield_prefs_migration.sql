-- DUGNAD+ TIMEBASERT POENG + SKJERMING + PREFERANSER
-- Kjør i Supabase SQL Editor

-- 1. Legg til varighet og vakttype på shifts
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS duration_hours numeric(4,2) DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS shift_type text DEFAULT 'standard';

-- 2. Oppdater families med skjerming
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS is_shielded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shield_reason text,
  ADD COLUMN IF NOT EXISTS shield_start_points integer DEFAULT 0;

-- 3. Preferanser-tabell
CREATE TABLE IF NOT EXISTS public.family_preferences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  team_id text,

  pref_kiosk boolean default false,
  pref_practical boolean default false,
  pref_transport boolean default false,
  pref_arrangement boolean default false,
  pref_security boolean default false,
  pref_other boolean default false,

  pref_weekdays boolean default true,
  pref_weekends boolean default true,
  pref_mornings boolean default true,
  pref_evenings boolean default true,

  wants_extra_shifts boolean default false,
  notes text,

  updated_at timestamptz default now(),
  UNIQUE(family_id, team_id)
);

ALTER TABLE public.family_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_preferences_all" ON public.family_preferences FOR ALL USING (true);
