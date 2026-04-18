-- ============================================================
-- Dugnad+ — Steg F: RLS-policy-innstramming
-- Dato: 2026-04-18
-- Avhengigheter: Steg A (team_members), Steg B (backfill),
--                Steg E (helper-funksjoner)
-- ============================================================
--
-- Erstatter alle 22 åpne "FOR ALL USING (true)"-policies med
-- ekte rolle- og team-baserte policies.
--
-- Helper-funksjoner fra Steg E:
--   auth_user_team_ids()          → text[]
--   auth_user_role_in(team text)  → text
--   auth_user_family_id()         → uuid
--
-- Policy-navnekonvensjon: tablename_operation_role
--   f.eks. events_select_team, lotteries_insert_coordinator
--
-- ⚠️  KJENTE BEGRENSNINGER (flagget med ⚠️ i koden):
--
-- 1. families og family_members har SELECT USING (true) fordi
--    anon shop-flows (LotteryShop, CampaignShop) og JoinPage/
--    ClaimFamilyPage leser disse tabellene direkte. Migrer til
--    get_seller_display_name() og resolve_join_code() for å
--    stramme inn. Skriveoperasjoner ER strammet.
--
-- 2. Substitute-rollen har ingen team_members-rader i dag.
--    SubstituteProfilePage henter events uten team-filter —
--    med nye policies ser vikarer 0 events. Krever egen
--    substitute-policy i fremtidig iterasjon.
--
-- 3. EventsList.tsx henter events uten eksplisitt .eq('team_id')
--    i frontend. RLS filtrerer til brukerens team — koordinator
--    med flere team ser events fra alle team, ikke bare aktivt.
--    Fungerer, men kan være forvirrende i UI.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP ALLE EKSISTERENDE ÅPNE POLICIES
-- ============================================================

DROP POLICY IF EXISTS families_all ON public.families;
DROP POLICY IF EXISTS family_members_all ON public.family_members;
DROP POLICY IF EXISTS events_all ON public.events;
DROP POLICY IF EXISTS shifts_all ON public.shifts;
DROP POLICY IF EXISTS assignments_all ON public.assignments;
DROP POLICY IF EXISTS requests_all ON public.requests;
DROP POLICY IF EXISTS lotteries_all ON public.lotteries;
DROP POLICY IF EXISTS prizes_all ON public.prizes;
DROP POLICY IF EXISTS lottery_sales_all ON public.lottery_sales;
DROP POLICY IF EXISTS kiosk_items_all ON public.kiosk_items;
DROP POLICY IF EXISTS kiosk_sales_all ON public.kiosk_sales;
DROP POLICY IF EXISTS sales_campaigns_all ON public.sales_campaigns;
DROP POLICY IF EXISTS campaign_sales_all ON public.campaign_sales;
DROP POLICY IF EXISTS sponsors_all ON public.sponsors;
DROP POLICY IF EXISTS settings_all ON public.settings;
DROP POLICY IF EXISTS clubs_all ON public.clubs;
DROP POLICY IF EXISTS pending_parents_all ON public.pending_parents;
DROP POLICY IF EXISTS vikar_messages_all ON public.vikar_messages;
DROP POLICY IF EXISTS sms_credits_all ON public.sms_credits;
DROP POLICY IF EXISTS sms_log_all ON public.sms_log;
DROP POLICY IF EXISTS push_subscriptions_all ON public.push_subscriptions;
DROP POLICY IF EXISTS family_preferences_all ON public.family_preferences;


-- ============================================================
-- 2. ENABLE RLS PÅ team_members (ikke gjort i Steg A)
-- ============================================================

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. TEAM_MEMBERS — brukerens egne rolle-bindinger
-- ============================================================

CREATE POLICY team_members_select_own ON public.team_members
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY team_members_insert_coordinator ON public.team_members
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY team_members_update_coordinator ON public.team_members
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY team_members_delete_coordinator ON public.team_members
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 4. FAMILIES
-- ============================================================

-- ⚠️ SELECT er USING (true) fordi LotteryShop, CampaignShop og
-- ClaimFamilyPage leser families direkte som anon/pre-team bruker.
-- Migrer disse til get_seller_display_name() for å stramme inn.
CREATE POLICY families_select_all ON public.families
  FOR SELECT USING (true);

CREATE POLICY families_insert_coordinator ON public.families
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY families_update_coordinator ON public.families
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY families_update_parent ON public.families
  FOR UPDATE USING (id = auth_user_family_id());

CREATE POLICY families_delete_coordinator ON public.families
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 5. FAMILY_MEMBERS
-- ============================================================

-- ⚠️ SELECT er USING (true) fordi JoinPage slår opp join_code
-- og LotteryShop/CampaignShop henter family_members via join.
-- Migrer til resolve_join_code() for å stramme inn.
CREATE POLICY family_members_select_all ON public.family_members
  FOR SELECT USING (true);

CREATE POLICY family_members_insert_coordinator ON public.family_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY family_members_insert_parent ON public.family_members
  FOR INSERT WITH CHECK (family_id = auth_user_family_id());

CREATE POLICY family_members_update_coordinator ON public.family_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY family_members_update_own ON public.family_members
  FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY family_members_delete_coordinator ON public.family_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 6. EVENTS
-- ============================================================

CREATE POLICY events_select_team ON public.events
  FOR SELECT USING (team_id = ANY(auth_user_team_ids()));

CREATE POLICY events_insert_coordinator ON public.events
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY events_update_coordinator ON public.events
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY events_delete_coordinator ON public.events
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 7. SHIFTS (ingen team_id — via event_id → events)
-- ============================================================

CREATE POLICY shifts_select_team ON public.shifts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
      AND e.team_id = ANY(auth_user_team_ids())
    )
  );

CREATE POLICY shifts_insert_coordinator ON public.shifts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY shifts_update_coordinator ON public.shifts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY shifts_delete_coordinator ON public.shifts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 8. ASSIGNMENTS (ingen team_id — via shift_id → shifts → events)
-- ============================================================

-- SELECT: team-medlemmer ser alle assignments i sine team-events.
-- Foreldre trenger dette for å se vaktoversikten og bytte-muligheter.
CREATE POLICY assignments_select_team ON public.assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND e.team_id = ANY(auth_user_team_ids())
    )
  );

CREATE POLICY assignments_insert_coordinator ON public.assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Parent self-service: melde seg på vakter
CREATE POLICY assignments_insert_parent ON public.assignments
  FOR INSERT WITH CHECK (family_id = auth_user_family_id());

CREATE POLICY assignments_update_coordinator ON public.assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Parent: bekrefte oppmøte, endre status på egne assignments
CREATE POLICY assignments_update_parent ON public.assignments
  FOR UPDATE USING (family_id = auth_user_family_id());

CREATE POLICY assignments_delete_coordinator ON public.assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Parent: melde seg av vakter (self-service)
CREATE POLICY assignments_delete_parent ON public.assignments
  FOR DELETE USING (family_id = auth_user_family_id());


-- ============================================================
-- 9. REQUESTS (ingen team_id — via shift_id → shifts → events)
-- ============================================================

-- SELECT: egen familie er involvert ELLER coordinator i teamet
CREATE POLICY requests_select_family ON public.requests
  FOR SELECT USING (
    from_family_id = auth_user_family_id()
    OR to_family_id = auth_user_family_id()
    OR target_family_id = auth_user_family_id()
    OR bid_family_id = auth_user_family_id()
  );

CREATE POLICY requests_select_coordinator ON public.requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY requests_insert_authenticated ON public.requests
  FOR INSERT WITH CHECK (
    from_family_id = auth_user_family_id()
    OR bid_family_id = auth_user_family_id()
  );

CREATE POLICY requests_update_family ON public.requests
  FOR UPDATE USING (
    from_family_id = auth_user_family_id()
    OR to_family_id = auth_user_family_id()
    OR bid_family_id = auth_user_family_id()
  );

CREATE POLICY requests_update_coordinator ON public.requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY requests_delete_coordinator ON public.requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.shifts s
      JOIN public.events e ON e.id = s.event_id
      WHERE s.id = shift_id
      AND auth_user_role_in(e.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 10. LOTTERIES
-- ============================================================

-- Anon: kun aktive lotterier (shop-flow)
CREATE POLICY lotteries_select_anon ON public.lotteries
  FOR SELECT USING (is_active = true);

-- Coordinator: alle i teamet (inkl. arkiverte)
CREATE POLICY lotteries_select_coordinator ON public.lotteries
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

-- Parent: aktive i eget team (for MyLottery)
CREATE POLICY lotteries_select_parent ON public.lotteries
  FOR SELECT USING (team_id = ANY(auth_user_team_ids()));

CREATE POLICY lotteries_insert_coordinator ON public.lotteries
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY lotteries_update_coordinator ON public.lotteries
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY lotteries_delete_coordinator ON public.lotteries
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 11. PRIZES (ingen team_id — via lottery_id → lotteries)
-- ============================================================

-- Anon: trengs for shop (vise premier)
CREATE POLICY prizes_select_all ON public.prizes
  FOR SELECT USING (true);

CREATE POLICY prizes_insert_coordinator ON public.prizes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY prizes_update_coordinator ON public.prizes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY prizes_delete_coordinator ON public.prizes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 12. LOTTERY_SALES (ingen team_id — via lottery_id → lotteries)
-- ============================================================

-- Coordinator: alle salg for lotterier i teamet
CREATE POLICY lottery_sales_select_coordinator ON public.lottery_sales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Parent: egne salg (der de er selger)
CREATE POLICY lottery_sales_select_seller ON public.lottery_sales
  FOR SELECT USING (seller_family_id = auth_user_family_id());

-- Anon INSERT: offentlig loddkjøp via Vipps deep link
CREATE POLICY lottery_sales_insert_anon ON public.lottery_sales
  FOR INSERT WITH CHECK (true);

CREATE POLICY lottery_sales_update_coordinator ON public.lottery_sales
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY lottery_sales_delete_coordinator ON public.lottery_sales
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.lotteries l
      WHERE l.id = lottery_id
      AND auth_user_role_in(l.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 13. KIOSK_ITEMS
-- ============================================================

-- Anon: trengs for kiosk shop
CREATE POLICY kiosk_items_select_all ON public.kiosk_items
  FOR SELECT USING (true);

CREATE POLICY kiosk_items_insert_coordinator ON public.kiosk_items
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY kiosk_items_update_coordinator ON public.kiosk_items
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY kiosk_items_delete_coordinator ON public.kiosk_items
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 14. KIOSK_SALES
-- ============================================================

CREATE POLICY kiosk_sales_select_coordinator ON public.kiosk_sales
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

-- Anon INSERT: offentlig kioskkjøp
CREATE POLICY kiosk_sales_insert_anon ON public.kiosk_sales
  FOR INSERT WITH CHECK (true);

CREATE POLICY kiosk_sales_update_coordinator ON public.kiosk_sales
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY kiosk_sales_delete_coordinator ON public.kiosk_sales
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 15. SALES_CAMPAIGNS
-- ============================================================

-- Anon: kun aktive kampanjer (shop-flow)
CREATE POLICY sales_campaigns_select_anon ON public.sales_campaigns
  FOR SELECT USING (status = 'active');

-- Coordinator: alle i teamet (inkl. fullførte)
CREATE POLICY sales_campaigns_select_coordinator ON public.sales_campaigns
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY sales_campaigns_insert_coordinator ON public.sales_campaigns
  FOR INSERT WITH CHECK (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY sales_campaigns_update_coordinator ON public.sales_campaigns
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY sales_campaigns_delete_coordinator ON public.sales_campaigns
  FOR DELETE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );


-- ============================================================
-- 16. CAMPAIGN_SALES (ingen team_id — via campaign_id → sales_campaigns)
-- ============================================================

CREATE POLICY campaign_sales_select_coordinator ON public.campaign_sales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_campaigns sc
      WHERE sc.id = campaign_id
      AND auth_user_role_in(sc.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY campaign_sales_select_seller ON public.campaign_sales
  FOR SELECT USING (seller_family_id = auth_user_family_id());

-- Anon INSERT: offentlig kampanjekjøp
CREATE POLICY campaign_sales_insert_anon ON public.campaign_sales
  FOR INSERT WITH CHECK (true);

CREATE POLICY campaign_sales_update_coordinator ON public.campaign_sales
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sales_campaigns sc
      WHERE sc.id = campaign_id
      AND auth_user_role_in(sc.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY campaign_sales_delete_coordinator ON public.campaign_sales
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.sales_campaigns sc
      WHERE sc.id = campaign_id
      AND auth_user_role_in(sc.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 17. SPONSORS (global — ingen team_id)
-- ============================================================

-- Public: vises på landingsside og SponsorPage
CREATE POLICY sponsors_select_all ON public.sponsors
  FOR SELECT USING (true);

CREATE POLICY sponsors_insert_coordinator ON public.sponsors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY sponsors_update_coordinator ON public.sponsors
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY sponsors_delete_coordinator ON public.sponsors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 18. SETTINGS (global key-value)
-- ============================================================

CREATE POLICY settings_select_all ON public.settings
  FOR SELECT USING (true);

CREATE POLICY settings_insert_coordinator ON public.settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY settings_update_coordinator ON public.settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 19. CLUBS
-- ============================================================

-- Alle innloggede kan lese (onboarding-oppslag)
CREATE POLICY clubs_select_authenticated ON public.clubs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Onboarding: ny bruker oppretter klubb
CREATE POLICY clubs_insert_authenticated ON public.clubs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY clubs_update_coordinator ON public.clubs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE auth_user_id = auth.uid()
      AND role IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 20. PENDING_PARENTS
-- ============================================================

-- Coordinator: se søknader for familier i teamet
CREATE POLICY pending_parents_select_coordinator ON public.pending_parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );

-- Egen søknad
CREATE POLICY pending_parents_select_own ON public.pending_parents
  FOR SELECT USING (auth_user_id = auth.uid());

-- Anon INSERT: JoinPage (forelder søker om tilgang)
CREATE POLICY pending_parents_insert_anon ON public.pending_parents
  FOR INSERT WITH CHECK (true);

-- Coordinator: godkjenne/avvise
CREATE POLICY pending_parents_update_coordinator ON public.pending_parents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );

CREATE POLICY pending_parents_delete_coordinator ON public.pending_parents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.families f
      WHERE f.id = family_id
      AND auth_user_role_in(f.team_id) IN ('coordinator', 'club_admin')
    )
  );


-- ============================================================
-- 21. VIKAR_MESSAGES
-- ============================================================

-- Enkel policy: alle innloggede kan lese/skrive.
-- Strammes inn etter at vikar-systemet er mer modent.
CREATE POLICY vikar_messages_select_authenticated ON public.vikar_messages
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY vikar_messages_insert_authenticated ON public.vikar_messages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY vikar_messages_update_sender ON public.vikar_messages
  FOR UPDATE USING (sender_id = auth.uid());

CREATE POLICY vikar_messages_delete_sender ON public.vikar_messages
  FOR DELETE USING (sender_id = auth.uid());


-- ============================================================
-- 22. SMS_CREDITS
-- ============================================================

CREATE POLICY sms_credits_select_coordinator ON public.sms_credits
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

-- UPDATE: coordinator oppdaterer auto_reminder-innstillinger
CREATE POLICY sms_credits_update_coordinator ON public.sms_credits
  FOR UPDATE USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

-- INSERT og DELETE kun via service_role (edge-funksjoner).
-- Ingen policy = ingen tilgang fra klienten.


-- ============================================================
-- 23. SMS_LOG
-- ============================================================

CREATE POLICY sms_log_select_coordinator ON public.sms_log
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

-- INSERT/UPDATE/DELETE kun via service_role (edge-funksjoner).


-- ============================================================
-- 24. PUSH_SUBSCRIPTIONS
-- ============================================================

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT USING (family_id = auth_user_family_id());

CREATE POLICY push_subscriptions_insert_authenticated ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE USING (family_id = auth_user_family_id());

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE USING (family_id = auth_user_family_id());


-- ============================================================
-- 25. FAMILY_PREFERENCES
-- ============================================================

CREATE POLICY family_preferences_select_coordinator ON public.family_preferences
  FOR SELECT USING (
    auth_user_role_in(team_id) IN ('coordinator', 'club_admin')
  );

CREATE POLICY family_preferences_select_parent ON public.family_preferences
  FOR SELECT USING (family_id = auth_user_family_id());

CREATE POLICY family_preferences_insert_parent ON public.family_preferences
  FOR INSERT WITH CHECK (family_id = auth_user_family_id());

CREATE POLICY family_preferences_update_parent ON public.family_preferences
  FOR UPDATE USING (family_id = auth_user_family_id());

CREATE POLICY family_preferences_delete_parent ON public.family_preferences
  FOR DELETE USING (family_id = auth_user_family_id());


-- ============================================================
-- SELVSJEKK
-- ============================================================

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'families', 'family_members', 'events', 'shifts', 'assignments',
    'requests', 'lotteries', 'prizes', 'lottery_sales', 'kiosk_items',
    'kiosk_sales', 'sales_campaigns', 'campaign_sales', 'sponsors',
    'settings', 'clubs', 'pending_parents', 'vikar_messages',
    'sms_credits', 'sms_log', 'push_subscriptions', 'family_preferences',
    'team_members'
  ];
  v_tbl text;
  v_count integer;
  v_total integer := 0;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = v_tbl;

    IF v_count = 0 THEN
      RAISE EXCEPTION 'FEIL: Tabell % har 0 policies — alle brukere er låst ute!', v_tbl;
    END IF;

    v_total := v_total + v_count;
    RAISE NOTICE '  % → % policies', v_tbl, v_count;
  END LOOP;

  -- Verifiser at ingen av de gamle åpne policies fortsatt eksisterer
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE '%_all'
    AND policyname NOT IN (
      'families_select_all', 'family_members_select_all',
      'prizes_select_all', 'kiosk_items_select_all',
      'sponsors_select_all', 'settings_select_all'
    )
  ) THEN
    RAISE EXCEPTION 'FEIL: Det finnes fortsatt gamle _all policies som ikke ble droppet!';
  END IF;

  RAISE NOTICE '✅ Steg F SELVSJEKK OK — 23 tabeller har totalt % policies, ingen tabeller med 0', v_total;
END $$;


COMMIT;


-- ============================================================
-- ROLLBACK — gjenskaper åpne "FOR ALL USING (true)"-policies
-- ============================================================
-- Kjør dette hvis smoke-test feiler etter COMMIT.
-- Først drop alle nye policies, deretter gjenskaper de åpne.
--
-- DO $$
-- DECLARE
--   pol record;
-- BEGIN
--   -- Drop alle policies i public schema
--   FOR pol IN
--     SELECT schemaname, tablename, policyname
--     FROM pg_policies
--     WHERE schemaname = 'public'
--   LOOP
--     EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
--       pol.policyname, pol.schemaname, pol.tablename);
--   END LOOP;
--
--   -- Gjenskaper åpne policies for alle 22 originale tabeller
--   FOR pol IN
--     SELECT unnest(ARRAY[
--       'families','family_members','events','shifts','assignments','requests',
--       'lotteries','prizes','lottery_sales','kiosk_items','kiosk_sales',
--       'sales_campaigns','campaign_sales','sponsors','settings','clubs',
--       'pending_parents','vikar_messages','sms_credits','sms_log',
--       'push_subscriptions','family_preferences'
--     ]) AS tablename
--   LOOP
--     EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (true)',
--       pol.tablename || '_all', pol.tablename);
--   END LOOP;
--
--   -- team_members trenger også åpen policy etter at RLS ble enabled
--   CREATE POLICY team_members_all ON public.team_members FOR ALL USING (true);
--
--   RAISE NOTICE '🔓 ROLLBACK FERDIG — alle policies er tilbake til FOR ALL USING (true)';
-- END $$;
