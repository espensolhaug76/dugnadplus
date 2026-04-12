-- DUGNAD+ KIOSK MIGRASJON — Kjør i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.kiosk_items (
  id uuid primary key default gen_random_uuid(),
  team_id text,
  name text not null,
  price integer not null,
  emoji text default '🛒',
  is_active boolean default true,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.kiosk_sales (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  items jsonb not null,
  total_amount integer not null,
  vipps_number text,
  created_at timestamptz default now()
);

-- RLS
alter table public.kiosk_items enable row level security;
alter table public.kiosk_sales enable row level security;
create policy "kiosk_items_all" on public.kiosk_items for all using (true);
create policy "kiosk_sales_all" on public.kiosk_sales for all using (true);

-- Lotteri payment_method (om ikke allerede lagt til)
alter table public.lottery_sales add column if not exists payment_method text default 'vipps';
