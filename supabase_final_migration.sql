-- DUGNAD+ SISTE MIGRASJON — Kjør i Supabase SQL Editor

-- Vikar-meldinger
CREATE TABLE IF NOT EXISTS public.vikar_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.requests(id) on delete cascade,
  sender_family_id uuid references public.families(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);
alter table public.vikar_messages enable row level security;
create policy "vikar_messages_all" on public.vikar_messages for all using (true);

-- Vikar-bud
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_amount integer;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_message text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_family_id uuid references public.families(id);
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_status text default 'none';

-- Rødt flagg
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS red_flag boolean default false;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS red_flag_reason text;

-- Poeng per aktivitet
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS points_earned integer default 0;

-- Jeg-vil system
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS willing_shift_types text; -- JSON array

-- Premie-godkjenning
ALTER TABLE public.prizes ADD COLUMN IF NOT EXISTS approval_status text default 'approved';

-- Sponsorer (om ikke allerede opprettet)
CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null, logo_url text, description text,
  website text, phone text,
  discount_level1 integer default 10, discount_level2 integer default 15,
  discount_level3 integer default 20, discount_level4 integer default 25,
  is_active boolean default true, created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, value text, created_at timestamptz default now()
);

-- RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sponsors_all') THEN
    alter table public.sponsors enable row level security;
    create policy "sponsors_all" on public.sponsors for all using (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'settings_all') THEN
    alter table public.settings enable row level security;
    create policy "settings_all" on public.settings for all using (true);
  END IF;
END $$;

INSERT INTO public.settings (key, value) VALUES ('sponsors_visible', 'false') ON CONFLICT (key) DO NOTHING;
