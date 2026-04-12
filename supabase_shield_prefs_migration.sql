-- DUGNAD+ SKJERMING & PREFERANSER MIGRASJON
-- Kjør i Supabase SQL Editor

-- Skjerming
alter table public.families add column if not exists shield_level text not null default 'none' check (shield_level in ('none', 'reduced', 'full'));
alter table public.families add column if not exists shield_reason text;
alter table public.families add column if not exists shield_set_by text;
alter table public.families add column if not exists shield_set_at timestamptz;

-- Familie-preferanser
alter table public.families add column if not exists pref_unavailable_days text; -- JSON array: ["mandag","onsdag"]
alter table public.families add column if not exists pref_time_of_day text;      -- JSON array: ["morgen","kveld"]
alter table public.families add column if not exists pref_single_parent boolean not null default false;
alter table public.families add column if not exists pref_special_considerations text;
alter table public.families add column if not exists pref_can_help_with text;

-- Ferdig! 10 nye kolonner på families-tabellen.
