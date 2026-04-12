-- DUGNAD+ JOIN-FLYT MIGRASJON — Kjør i Supabase SQL Editor

-- Barnekode for join-flyt
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS join_code text unique;

-- Pending-foreldre tabell
CREATE TABLE IF NOT EXISTS public.pending_parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_member_id uuid references public.family_members(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  password_hash text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

alter table public.pending_parents enable row level security;
create policy "pending_parents_all" on public.pending_parents for all using (true);

-- Indeks
CREATE INDEX IF NOT EXISTS idx_family_members_join_code ON public.family_members(join_code);
