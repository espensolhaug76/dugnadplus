-- DUGNAD+ FORELDRE + SMS — Kjør i Supabase SQL Editor

-- 1. Legg til auth_user_id på family_members for foreldre-innlogging
ALTER TABLE public.family_members ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.pending_parents ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.pending_parents ADD COLUMN IF NOT EXISTS login_method text default 'password';

-- 2. SMS Credits per lag
CREATE TABLE IF NOT EXISTS public.sms_credits (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  credits_remaining integer not null default 0,
  credits_used integer not null default 0,
  auto_reminder_enabled boolean default false,
  auto_reminder_days_before integer default 1,
  updated_at timestamptz default now()
);

ALTER TABLE public.sms_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_credits_all" ON public.sms_credits FOR ALL USING (true);

-- 3. SMS Logg
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

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_log_all" ON public.sms_log FOR ALL USING (true);
