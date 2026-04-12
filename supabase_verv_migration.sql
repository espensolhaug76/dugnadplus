-- DUGNAD+ VERV-MIGRASJON
-- Kjør i Supabase SQL Editor

-- 1. Verv-felt på familier (JSON-array med roller og poeng)
alter table public.families add column if not exists verv text;

-- 2. Vaktpreferanser (om ikke allerede lagt til)
alter table public.families add column if not exists shift_preferences text;

-- 3. Fritatt-flagg for rask sjekk
alter table public.families add column if not exists exempt_from_shifts boolean not null default false;

-- Ferdig! Tre nye kolonner på families-tabellen.
