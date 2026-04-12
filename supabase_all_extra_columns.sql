-- DUGNAD+ ALLE EKSTRA KOLONNER (kjør dette i Supabase SQL Editor)
-- Samlet migrasjon for verv, skjerming og preferanser

-- Verv og fritak
alter table public.families add column if not exists verv text;
alter table public.families add column if not exists exempt_from_shifts boolean not null default false;
alter table public.families add column if not exists shift_preferences text;

-- Skjerming
alter table public.families add column if not exists shield_level text default 'none';
alter table public.families add column if not exists shield_reason text;
alter table public.families add column if not exists shield_set_by text;
alter table public.families add column if not exists shield_set_at timestamptz;

-- Familie-preferanser
alter table public.families add column if not exists pref_unavailable_days text;
alter table public.families add column if not exists pref_time_of_day text;
alter table public.families add column if not exists pref_single_parent boolean not null default false;
alter table public.families add column if not exists pref_special_considerations text;
alter table public.families add column if not exists pref_can_help_with text;

-- Sett default for eksisterende rader
update public.families set shield_level = 'none' where shield_level is null;
