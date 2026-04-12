-- ============================================================
-- DUGNAD+ KOMPLETT DATABASE — KJØR I SUPABASE SQL EDITOR
-- Sist oppdatert: april 2026
-- ============================================================
-- Denne filen inneholder ALT. Kjør hele filen på én gang.
-- "IF NOT EXISTS" og "ADD COLUMN IF NOT EXISTS" gjør at den
-- trygt kan kjøres flere ganger uten å ødelegge eksisterende data.
-- ============================================================


-- ============================================================
-- 1. KJERNETABELLER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  total_points integer default 0,
  team_id text,
  import_code text,
  is_substitute boolean default false,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  role text check (role in ('parent', 'child')),
  birth_year integer,
  email text,
  phone text,
  subgroup text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  start_time time,
  end_time time,
  location text,
  sport text,
  subgroup text,
  assignment_mode text default 'auto',
  self_service_open_date timestamptz,
  team_id text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  start_time time,
  end_time time,
  people_needed integer default 2,
  description text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  status text default 'assigned',
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete cascade,
  from_family_id uuid references public.families(id),
  to_family_id uuid,
  target_family_id uuid,
  type text check (type in ('swap', 'substitute')),
  comment text,
  is_active boolean default true,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.lotteries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  ticket_price integer default 50,
  goal integer default 10000,
  vipps_number text,
  is_active boolean default true,
  team_id text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.prizes (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid references public.lotteries(id) on delete cascade,
  name text not null,
  value text,
  donor text,
  winner_name text,
  winner_phone text,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.lottery_sales (
  id uuid primary key default gen_random_uuid(),
  lottery_id uuid references public.lotteries(id) on delete cascade,
  seller_family_id uuid references public.families(id),
  buyer_name text,
  buyer_phone text,
  tickets integer default 1,
  amount integer default 0,
  created_at timestamptz default now()
);


-- ============================================================
-- 2. VERV, SKJERMING OG PREFERANSER (families-kolonner)
-- ============================================================

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS verv text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shift_preferences text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS exempt_from_shifts boolean DEFAULT false;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shield_level text DEFAULT 'none';
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shield_reason text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shield_set_by text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shield_set_at timestamptz;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS pref_unavailable_days text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS pref_time_of_day text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS pref_single_parent boolean DEFAULT false;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS pref_special_considerations text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS pref_can_help_with text;

ALTER TABLE public.families ADD COLUMN IF NOT EXISTS red_flag boolean DEFAULT false;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS red_flag_reason text;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS willing_shift_types text;

-- Ny skjerming (timebasert poeng)
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS is_shielded boolean DEFAULT false;
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS shield_start_points integer DEFAULT 0;


-- ============================================================
-- 3. UTVIDEDE KOLONNER PÅ KJERNETABELLER
-- ============================================================

-- family_members: join-kode og auth
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS join_code text UNIQUE;
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- lottery_sales: betalingsmåte
ALTER TABLE public.lottery_sales ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'vipps';

-- requests: bud-system
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_amount integer;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_message text;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_family_id uuid;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS bid_status text;

-- assignments: aktivitetstype og poeng
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS activity_type text;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS points_earned integer DEFAULT 0;

-- prizes: godkjenningsstatus
ALTER TABLE public.prizes ADD COLUMN IF NOT EXISTS approval_status text;

-- shifts: timebasert poeng
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS duration_hours numeric(4,2) DEFAULT 2.0;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS shift_type text DEFAULT 'standard';


-- ============================================================
-- 4. KIOSK
-- ============================================================

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
  team_id text,
  event_id uuid,
  items jsonb,
  total_amount integer default 0,
  payment_method text default 'vipps',
  created_at timestamptz default now()
);


-- ============================================================
-- 5. SALGSKAMPANJER
-- ============================================================

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


-- ============================================================
-- 6. SPONSORER OG INNSTILLINGER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  description text,
  website text,
  phone text,
  discount_level1 integer default 10,
  discount_level2 integer default 15,
  discount_level3 integer default 20,
  discount_level4 integer default 25,
  sponsor_amount integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text,
  updated_at timestamptz default now()
);

INSERT INTO public.settings (key, value) VALUES ('sponsors_visible', 'false')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 7. KLUBBER
-- ============================================================

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_name_municipality
  ON public.clubs (lower(name), lower(municipality));


-- ============================================================
-- 8. FORELDRE-GODKJENNING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pending_parents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  child_member_id uuid references public.family_members(id),
  name text not null,
  email text,
  phone text,
  password_hash text,
  status text default 'pending',
  auth_user_id uuid,
  login_method text default 'password',
  created_at timestamptz default now()
);


-- ============================================================
-- 9. VIKAR-MELDINGER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vikar_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  sender_id uuid,
  sender_name text,
  message text not null,
  created_at timestamptz default now()
);


-- ============================================================
-- 10. SMS-SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sms_credits (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  credits_remaining integer not null default 0,
  credits_used integer not null default 0,
  auto_reminder_enabled boolean default false,
  auto_reminder_days_before integer default 1,
  plan text default 'aktiv',
  updated_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS public.sms_log (
  id uuid primary key default gen_random_uuid(),
  team_id text,
  recipient_phone text not null,
  recipient_name text,
  message text not null,
  type text check (type in ('reminder', 'unconfirmed', 'custom')),
  assignment_id uuid,
  event_id uuid,
  status text default 'sent',
  sent_at timestamptz default now()
);


-- ============================================================
-- 11. PUSH-VARSLER
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  team_id text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);


-- ============================================================
-- 12. PREFERANSER (ny tabell)
-- ============================================================

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


-- ============================================================
-- 13. ROW LEVEL SECURITY (åpen for alle — stram inn for prod)
-- ============================================================

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lotteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lottery_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kiosk_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vikar_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_preferences ENABLE ROW LEVEL SECURITY;

-- Åpne policies (dev/test — stram inn før produksjon)
-- Dropper eksisterende og oppretter på nytt for å unngå duplikat-feil
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'families','family_members','events','shifts','assignments','requests',
      'lotteries','prizes','lottery_sales','kiosk_items','kiosk_sales',
      'sales_campaigns','campaign_sales','sponsors','settings','clubs',
      'pending_parents','vikar_messages','sms_credits','sms_log',
      'push_subscriptions','family_preferences'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_all', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true)', tbl || '_all', tbl);
  END LOOP;
END $$;


-- ============================================================
-- FERDIG! 22 tabeller, alle kolonner, alle policies.
-- ============================================================
