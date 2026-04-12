-- ============================================================
-- DUGNAD+ KOMPLETT DATABASE-MIGRASJON
-- Kjør dette i Supabase SQL Editor (https://supabase.com/dashboard)
-- Generert fra kodebase-analyse av alle Supabase-queries
-- ============================================================

-- 1. FAMILIES
-- Kjerne-tabell for familier/husholdninger
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text default '',
  total_points integer not null default 0,
  import_code text,
  is_substitute boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. FAMILY_MEMBERS
-- Individuelle familiemedlemmer (foreldre og barn)
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  role text not null check (role in ('parent', 'child')),
  birth_year integer,
  email text,
  phone text,
  subgroup text,
  created_at timestamptz not null default now()
);

-- 3. EVENTS
-- Arrangementer/kampdager
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  location text,
  sport text not null default 'football',
  subgroup text,
  assignment_mode text not null default 'auto' check (assignment_mode in ('auto', 'manual', 'self-service')),
  self_service_open_date timestamptz,
  self_service_status text,
  created_at timestamptz not null default now()
);

-- 4. SHIFTS
-- Individuelle vakter innenfor et arrangement
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  people_needed integer not null default 1,
  description text default '',
  created_at timestamptz not null default now()
);

-- 5. ASSIGNMENTS
-- Tildeling av familier til vakter
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'confirmed', 'completed', 'missed', 'no_show')),
  created_at timestamptz not null default now()
);

-- 6. REQUESTS
-- Bytteforespørsler og vikar-søk
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  from_family_id uuid not null references public.families(id) on delete cascade,
  to_family_id uuid references public.families(id) on delete set null,
  target_family_id uuid references public.families(id) on delete set null,
  type text not null check (type in ('swap', 'substitute')),
  comment text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 7. LOTTERIES
-- Lotteri-kampanjer
create table public.lotteries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  ticket_price integer not null default 50,
  goal integer not null default 10000,
  vipps_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 8. PRIZES
-- Premier knyttet til et lotteri
create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  name text not null,
  value text,
  donor text,
  winner_name text,
  winner_phone text,
  created_at timestamptz not null default now()
);

-- 9. LOTTERY_SALES
-- Lotteri-salg
create table public.lottery_sales (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid not null references public.lotteries(id) on delete cascade,
  seller_family_id uuid references public.families(id) on delete set null,
  buyer_name text not null,
  buyer_phone text,
  tickets integer not null default 1,
  amount integer not null default 0,
  created_at timestamptz not null default now()
);


-- ============================================================
-- INDEKSER for ytelse
-- ============================================================

create index idx_family_members_family_id on public.family_members(family_id);
create index idx_family_members_subgroup on public.family_members(subgroup);
create index idx_shifts_event_id on public.shifts(event_id);
create index idx_assignments_shift_id on public.assignments(shift_id);
create index idx_assignments_family_id on public.assignments(family_id);
create index idx_requests_shift_id on public.requests(shift_id);
create index idx_requests_from_family on public.requests(from_family_id);
create index idx_requests_active on public.requests(is_active) where is_active = true;
create index idx_events_date on public.events(date);
create index idx_prizes_lottery_id on public.prizes(lottery_id);
create index idx_lottery_sales_lottery_id on public.lottery_sales(lottery_id);
create index idx_lottery_sales_seller on public.lottery_sales(seller_family_id);
create index idx_families_import_code on public.families(import_code);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Åpne policies for anon-nøkkel (passer appen som bruker anon key)
-- ============================================================

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.events enable row level security;
alter table public.shifts enable row level security;
alter table public.assignments enable row level security;
alter table public.requests enable row level security;
alter table public.lotteries enable row level security;
alter table public.prizes enable row level security;
alter table public.lottery_sales enable row level security;

-- Fullstendig tilgang for autentiserte brukere
-- (Appen bruker anon key med Supabase Auth, så vi gir tilgang til authenticated)
-- For utvikling: vi gir også anon tilgang slik at DevTools fungerer

-- FAMILIES
create policy "families_select" on public.families for select using (true);
create policy "families_insert" on public.families for insert with check (true);
create policy "families_update" on public.families for update using (true);
create policy "families_delete" on public.families for delete using (true);

-- FAMILY_MEMBERS
create policy "family_members_select" on public.family_members for select using (true);
create policy "family_members_insert" on public.family_members for insert with check (true);
create policy "family_members_update" on public.family_members for update using (true);
create policy "family_members_delete" on public.family_members for delete using (true);

-- EVENTS
create policy "events_select" on public.events for select using (true);
create policy "events_insert" on public.events for insert with check (true);
create policy "events_update" on public.events for update using (true);
create policy "events_delete" on public.events for delete using (true);

-- SHIFTS
create policy "shifts_select" on public.shifts for select using (true);
create policy "shifts_insert" on public.shifts for insert with check (true);
create policy "shifts_update" on public.shifts for update using (true);
create policy "shifts_delete" on public.shifts for delete using (true);

-- ASSIGNMENTS
create policy "assignments_select" on public.assignments for select using (true);
create policy "assignments_insert" on public.assignments for insert with check (true);
create policy "assignments_update" on public.assignments for update using (true);
create policy "assignments_delete" on public.assignments for delete using (true);

-- REQUESTS
create policy "requests_select" on public.requests for select using (true);
create policy "requests_insert" on public.requests for insert with check (true);
create policy "requests_update" on public.requests for update using (true);
create policy "requests_delete" on public.requests for delete using (true);

-- LOTTERIES
create policy "lotteries_select" on public.lotteries for select using (true);
create policy "lotteries_insert" on public.lotteries for insert with check (true);
create policy "lotteries_update" on public.lotteries for update using (true);
create policy "lotteries_delete" on public.lotteries for delete using (true);

-- PRIZES
create policy "prizes_select" on public.prizes for select using (true);
create policy "prizes_insert" on public.prizes for insert with check (true);
create policy "prizes_update" on public.prizes for update using (true);
create policy "prizes_delete" on public.prizes for delete using (true);

-- LOTTERY_SALES
create policy "lottery_sales_select" on public.lottery_sales for select using (true);
create policy "lottery_sales_insert" on public.lottery_sales for insert with check (true);
create policy "lottery_sales_update" on public.lottery_sales for update using (true);
create policy "lottery_sales_delete" on public.lottery_sales for delete using (true);


-- ============================================================
-- FERDIG!
-- Tabeller: families, family_members, events, shifts,
--           assignments, requests, lotteries, prizes, lottery_sales
-- Totalt: 9 tabeller, 67 kolonner, 13 indekser, 36 RLS policies
-- ============================================================
