-- DUGNAD+ KLUBBREGISTER — Kjør i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  county text,
  municipality text,
  sport_primary text,
  logo_url text,
  created_at timestamptz default now()
);

-- Unik på normalisert navn + kommune for å hindre duplikater
CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_name_municipality
  ON public.clubs (lower(trim(name)), lower(trim(municipality)));

alter table public.clubs enable row level security;
create policy "clubs_all" on public.clubs for all using (true);

-- Legg til club_id på lag/teams (lagres i localStorage nå, men klar for DB)
-- ALTER TABLE public.families ADD COLUMN IF NOT EXISTS club_id uuid references public.clubs(id);
