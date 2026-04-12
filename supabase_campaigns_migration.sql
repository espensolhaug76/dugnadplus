-- DUGNAD+ SALGSKAMPANJE — Kjør i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  team_id text,
  title text not null,
  description text,
  product_name text not null,
  unit_price integer not null,
  target_per_family integer default 10,
  start_date date,
  end_date date,
  status text default 'active' check (status in ('active', 'completed', 'draft')),
  vipps_number text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.campaign_sales (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.sales_campaigns(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  seller_family_id uuid references public.families(id) on delete set null,
  buyer_name text,
  buyer_phone text,
  quantity integer not null default 0,
  amount integer not null default 0,
  payment_method text default 'vipps',
  paid boolean default false,
  delivered boolean default false,
  created_at timestamptz default now()
);

alter table public.sales_campaigns enable row level security;
alter table public.campaign_sales enable row level security;
create policy "sales_campaigns_all" on public.sales_campaigns for all using (true);
create policy "campaign_sales_all" on public.campaign_sales for all using (true);
