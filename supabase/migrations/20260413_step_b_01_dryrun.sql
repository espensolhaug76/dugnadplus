-- ============================================================
-- Dugnad+ — RLS Fase 2, Steg B, del 1
-- DRY-RUN — REN OBSERVASJON, ENDRER INGENTING
-- ============================================================
--
-- Denne filen inneholder kun SELECT-statements. Ingen data
-- endres. Hensikten er å vise:
--
--   0. Pre-flight: verifiser at skjema-antakelsene stemmer
--      (korrigert etter live-sjekk i Supabase: events og
--       kiosk_sales har IKKE team_id)
--   0.5. Utforske hvordan events og kiosk_sales faktisk er
--      koblet til team, så vi vet det før Steg F
--   1. En baseline av relevante tabell-tellinger (sanity check)
--   2–5. Nøyaktig hvor mange rader hver del av Steg B-
--      migreringen vil påvirke, før vi skriver migreringen
--   6. Coordinator-gap-analyse + ferdig generert INSERT-
--      skjelett for manuell coordinator-population
--   6.5. Team-identifikator-konsistens: sammenligner
--      family_members.subgroup mot de 9 tabellene som faktisk
--      har team_id, slik at vi ser om det finnes subgroup-
--      verdier som ikke er representert som team_id og vice
--      versa. Kritisk input til Steg F.
--   7. Snapshot-tabell-status (skal være 0 rader i alle)
--
-- PII-maskering: alle e-post-felter i output maskeres som
--   substring(email, 1, 3) || '***@' || split_part(email, '@', 2)
-- -> "esp***@example.com".
--
-- Filen kan kjøres flere ganger - den er idempotent.
--
-- KJØRING: Supabase SQL Editor viser ofte kun siste resultat
-- når flere SELECT-statements kjøres samtidig. Del kjøringen
-- opp i 6 grupper og kjør én gruppe om gangen:
--   GRUPPE 1: Seksjon 0, 0.5, 1  (pre-flight + baseline)
--   GRUPPE 2: Seksjon 2, 3, 4    (backfill previews)
--   GRUPPE 3: Seksjon 5          (team-projeksjon)
--   GRUPPE 4: Seksjon 6          (coordinator gap)
--   GRUPPE 5: Seksjon 6.5        (team-konsistens)
--   GRUPPE 6: Seksjon 7          (snapshot-status)
-- ============================================================


-- ============================================================
-- SEKSJON 0 — PRE-FLIGHT: SKJEMA-ANTAKELSER
-- ============================================================
-- Bekreft at de 9 tabellene som FAKTISK har team_id eksisterer,
-- og rapporter datatype + nullable. Hvis noen av disse
-- mangler eller har feil type, STOPP og ikke kjør resten.

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'team_id'
  AND table_name IN (
    'families',
    'family_preferences',
    'kiosk_items',
    'lotteries',
    'push_subscriptions',
    'sales_campaigns',
    'sms_credits',
    'sms_log',
    'team_members'
  )
ORDER BY table_name;


-- ============================================================
-- SEKSJON 0.5 — HVORDAN ER events OG kiosk_sales KOBLET?
-- ============================================================
-- events.team_id og kiosk_sales.team_id finnes IKKE.
-- Dump kolonnene for begge slik at vi ser den faktiske
-- strukturen og kan designe Steg F-policyene riktig.

-- 0.5.1 — events-kolonner
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events'
ORDER BY ordinal_position;

-- 0.5.2 — kiosk_sales-kolonner
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kiosk_sales'
ORDER BY ordinal_position;

-- 0.5.3 — events: distinkte kombinasjoner av sport og subgroup
-- Dette er ut fra CoordinatorDashboard.tsx:122-127 den faktiske
-- "team key" for events i appen i dag. Hvis listen er kort og
-- overlapper pent med families.team_id, er livet enkelt i
-- Steg F. Hvis den er lang og divergerer, må vi designe en
-- mapping-tabell eller view.
SELECT
  sport,
  subgroup,
  COUNT(*) AS events_count
FROM public.events
GROUP BY sport, subgroup
ORDER BY events_count DESC, sport, subgroup;


-- ============================================================
-- SEKSJON 1 — DATA SANITY CHECK
-- ============================================================
-- Disse tallene er baseline. Hvis noe ser rart ut her, STOPP
-- og flagg det før du ser på migreringsdetaljene i seksjon 2+.

SELECT 'auth.users total'                                AS metric, COUNT(*)::bigint AS value FROM auth.users
UNION ALL
SELECT 'families total',                                 COUNT(*) FROM public.families
UNION ALL
SELECT 'family_members total',                           COUNT(*) FROM public.family_members
UNION ALL
SELECT 'family_members role=parent',                     COUNT(*) FROM public.family_members WHERE role = 'parent'
UNION ALL
SELECT 'family_members role=child',                      COUNT(*) FROM public.family_members WHERE role = 'child'
UNION ALL
SELECT 'family_members auth_user_id IS NOT NULL',        COUNT(*) FROM public.family_members WHERE auth_user_id IS NOT NULL
UNION ALL
SELECT 'family_members auth_user_id IS NULL',            COUNT(*) FROM public.family_members WHERE auth_user_id IS NULL
UNION ALL
SELECT 'pending_parents total',                          COUNT(*) FROM public.pending_parents
UNION ALL
SELECT 'pending_parents approved + auth_user_id set',    COUNT(*) FROM public.pending_parents WHERE status = 'approved' AND auth_user_id IS NOT NULL
UNION ALL
SELECT 'events total',                                   COUNT(*) FROM public.events
UNION ALL
SELECT 'clubs total',                                    COUNT(*) FROM public.clubs;


-- ============================================================
-- SEKSJON 2 — MANIPULASJON 1 PREVIEW
-- Backfill av family_members.auth_user_id
-- ============================================================
-- Migreringen vil kjøre STRATEGI A (middels streng):
--   UPDATE family_members SET auth_user_id = family_id
--   WHERE auth_user_id IS NULL
--     AND role = 'parent'
--     AND family_id IN (SELECT id FROM auth.users)
--
-- STRATEGI B (streng e-post-match) vises kun til info, brukes
-- IKKE av migreringen. Hvis A og B avviker mye, kan det
-- indikere data-inkonsistens som bør undersøkes.

-- 2.1 — Strategi A count (det migreringen faktisk vil gjøre)
SELECT COUNT(*) AS strategy_a_will_backfill
FROM public.family_members fm
WHERE fm.auth_user_id IS NULL
  AND fm.role = 'parent'
  AND fm.family_id IN (SELECT id FROM auth.users);

-- 2.2 — Strategi B count (streng e-post-match, kun til info)
SELECT COUNT(*) AS strategy_b_strict_email_match
FROM public.family_members fm
JOIN auth.users u ON u.id = fm.family_id
WHERE fm.auth_user_id IS NULL
  AND fm.role = 'parent'
  AND fm.email IS NOT NULL
  AND lower(fm.email) = lower(u.email);

-- 2.3 — Gap: rader A vil oppdatere som B IKKE ville ha matchet.
-- Stort tall her = flag at data er uryddig.
SELECT COUNT(*) AS strategy_a_without_email_match
FROM public.family_members fm
JOIN auth.users u ON u.id = fm.family_id
WHERE fm.auth_user_id IS NULL
  AND fm.role = 'parent'
  AND (fm.email IS NULL OR lower(fm.email) IS DISTINCT FROM lower(u.email));

-- 2.4 — Sample (maks 5 rader). E-postene er maskert.
SELECT
  fm.id                                                                AS family_member_id,
  fm.family_id,
  fm.name                                                              AS fm_name,
  substring(fm.email, 1, 3) || '***@' || split_part(fm.email, '@', 2)  AS fm_email_masked,
  substring(u.email,  1, 3) || '***@' || split_part(u.email,  '@', 2)  AS auth_email_masked,
  CASE
    WHEN fm.email IS NULL                        THEN 'fm_email_null'
    WHEN lower(fm.email) = lower(u.email)        THEN 'match'
    ELSE                                              'mismatch'
  END                                                                  AS email_strategy
FROM public.family_members fm
JOIN auth.users u ON u.id = fm.family_id
WHERE fm.auth_user_id IS NULL
  AND fm.role = 'parent'
ORDER BY fm.created_at
LIMIT 5;


-- ============================================================
-- SEKSJON 3 — MANIPULASJON 1 PREVIEW (sekundær strategi)
-- pending_parents-flowen (JoinPage -> godkjent forelder)
-- ============================================================

WITH pp_approved AS (
  SELECT id, family_id, auth_user_id, email, name
  FROM public.pending_parents
  WHERE status = 'approved' AND auth_user_id IS NOT NULL
),
classified AS (
  SELECT
    pp.id,
    pp.family_id,
    pp.auth_user_id,
    pp.email,
    pp.name,
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = pp.family_id
        AND fm.role = 'parent'
        AND fm.auth_user_id = pp.auth_user_id
    ) AS already_linked,
    EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = pp.family_id
        AND fm.role = 'parent'
        AND fm.auth_user_id IS NULL
        AND fm.email IS NOT NULL
        AND lower(fm.email) = lower(pp.email)
    ) AS can_update_existing
  FROM pp_approved pp
)
SELECT
  COUNT(*) FILTER (WHERE already_linked)                                 AS pp_already_linked,
  COUNT(*) FILTER (WHERE NOT already_linked AND can_update_existing)     AS pp_will_update_existing,
  COUNT(*) FILTER (WHERE NOT already_linked AND NOT can_update_existing) AS pp_will_create_new
FROM classified;

-- 3.1 — Sample av pp-rader som vil opprette nye family_members-rader
SELECT
  pp.id                                                                AS pending_parent_id,
  pp.family_id,
  pp.name                                                              AS pp_name,
  substring(pp.email, 1, 3) || '***@' || split_part(pp.email, '@', 2)  AS pp_email_masked,
  pp.auth_user_id
FROM public.pending_parents pp
WHERE pp.status = 'approved'
  AND pp.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.family_members fm
    WHERE fm.family_id = pp.family_id
      AND fm.role = 'parent'
      AND (
        fm.auth_user_id = pp.auth_user_id
        OR (fm.auth_user_id IS NULL
            AND fm.email IS NOT NULL
            AND lower(fm.email) = lower(pp.email))
      )
  )
ORDER BY pp.created_at
LIMIT 5;


-- ============================================================
-- SEKSJON 4 — MANIPULASJON 2 PREVIEW
-- Nye family_members-rader fra legacy families.id = auth.uid
-- ============================================================
-- Navn settes til:
--   COALESCE(raw_user_meta_data->>'full_name',
--            split_part(email, '@', 1),
--            'Forelder')

-- 4.1 — Count
SELECT COUNT(*) AS new_family_members_from_legacy
FROM auth.users u
JOIN public.families f ON f.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.family_members fm
  WHERE fm.family_id = f.id AND fm.role = 'parent'
);

-- 4.2 — Sample med foreslått navn og e-post
SELECT
  u.id                                                                 AS auth_user_id,
  substring(u.email, 1, 3) || '***@' || split_part(u.email, '@', 2)    AS auth_email_masked,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    split_part(u.email, '@', 1),
    'Forelder'
  )                                                                    AS proposed_name,
  f.team_id                                                            AS family_team_id,
  f.name                                                               AS family_name
FROM auth.users u
JOIN public.families f ON f.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.family_members fm
  WHERE fm.family_id = f.id AND fm.role = 'parent'
)
ORDER BY u.created_at
LIMIT 5;


-- ============================================================
-- SEKSJON 5 — MANIPULASJON 3 PREVIEW
-- team_members parent-rader (KUN parent, coordinator skippes)
-- ============================================================

WITH projected AS (
  -- (a) Eksisterende parent-rader med auth_user_id
  SELECT fm.auth_user_id, fm.family_id, f.team_id
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.role = 'parent'
    AND fm.auth_user_id IS NOT NULL
    AND f.team_id IS NOT NULL

  UNION

  -- (b) Parent-rader som vil få auth_user_id via Strategi A
  SELECT fm.family_id AS auth_user_id, fm.family_id, f.team_id
  FROM public.family_members fm
  JOIN public.families f ON f.id = fm.family_id
  WHERE fm.role = 'parent'
    AND fm.auth_user_id IS NULL
    AND fm.family_id IN (SELECT id FROM auth.users)
    AND f.team_id IS NOT NULL

  UNION

  -- (c) Nye parent-rader som vil bli opprettet fra legacy
  SELECT u.id AS auth_user_id, f.id AS family_id, f.team_id
  FROM auth.users u
  JOIN public.families f ON f.id = u.id
  WHERE f.team_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.family_members fm
      WHERE fm.family_id = f.id AND fm.role = 'parent'
    )
)
SELECT
  COUNT(*)                                               AS total_projected_rows,
  COUNT(DISTINCT (team_id, auth_user_id))                AS distinct_pairs,
  COUNT(DISTINCT team_id)                                AS distinct_teams,
  COUNT(DISTINCT auth_user_id)                           AS distinct_parents
FROM projected;

-- 5.1 — Separat count for familier UTEN team_id.
-- Hvis > 0: disse parents får ingen team_members-rad og kan
-- ikke få RLS-tilgang etter Steg F før en coordinator setter
-- families.team_id manuelt.
SELECT COUNT(*) AS parents_without_team_id
FROM public.family_members fm
JOIN public.families f ON f.id = fm.family_id
WHERE fm.role = 'parent'
  AND f.team_id IS NULL;


-- ============================================================
-- SEKSJON 6 — COORDINATOR GAP ANALYSIS
-- Steg B populerer IKKE coordinator-rader i team_members.
-- Denne seksjonen gir deg all data du trenger for å skrive
-- en kort manuell INSERT etter at Steg B er committet.
-- ============================================================

-- 6.1 — Alle auth-brukere med role=coordinator i metadata
SELECT
  u.id                                                                 AS coordinator_auth_user_id,
  substring(u.email, 1, 3) || '***@' || split_part(u.email, '@', 2)    AS email_masked,
  u.created_at                                                         AS user_created_at,
  u.raw_user_meta_data->>'full_name'                                   AS full_name_from_metadata
FROM auth.users u
WHERE u.raw_user_meta_data->>'role' = 'coordinator'
ORDER BY u.created_at;

-- 6.2 — Alle distinkte team_ids på tvers av de 9 tabellene
-- som FAKTISK har team_id (events og kiosk_sales fjernet).
SELECT team_id, COUNT(*) AS appearances
FROM (
  SELECT team_id FROM public.families             WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.family_preferences   WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.kiosk_items          WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.lotteries            WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.push_subscriptions   WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.sales_campaigns      WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.sms_credits          WHERE team_id IS NOT NULL
  UNION ALL
  SELECT team_id FROM public.sms_log              WHERE team_id IS NOT NULL
) all_teams
GROUP BY team_id
ORDER BY appearances DESC, team_id;

-- 6.3 — Total antall distinkte team_ids og coordinator-brukere
SELECT
  (SELECT COUNT(DISTINCT team_id) FROM (
    SELECT team_id FROM public.families             WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.family_preferences   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.kiosk_items          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.lotteries            WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.push_subscriptions   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sales_campaigns      WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_credits          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_log              WHERE team_id IS NOT NULL
  ) t) AS distinct_team_ids,
  (SELECT COUNT(*) FROM auth.users WHERE raw_user_meta_data->>'role' = 'coordinator') AS coordinator_count;

-- 6.4 — ANBEFALT MANUELL INSERT (ferdig generert SQL)
-- Hver linje har ON CONFLICT DO NOTHING slik at den er trygg
-- å kjøre flere ganger. Kommentér ut linjer du ikke vil
-- inkludere før kjøring.
SELECT
  format(
    'INSERT INTO public.team_members (team_id, auth_user_id, role) VALUES (%L, %L::uuid, %L) ON CONFLICT (team_id, auth_user_id, role) DO NOTHING;',
    t.team_id,
    u.id,
    'coordinator'
  ) AS suggested_insert
FROM auth.users u
CROSS JOIN (
  SELECT DISTINCT team_id FROM (
    SELECT team_id FROM public.families             WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.family_preferences   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.kiosk_items          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.lotteries            WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.push_subscriptions   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sales_campaigns      WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_credits          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_log              WHERE team_id IS NOT NULL
  ) x
) t
WHERE u.raw_user_meta_data->>'role' = 'coordinator'
ORDER BY u.id, t.team_id;


-- ============================================================
-- SEKSJON 6.5 — TEAM-IDENTIFIKATOR-KONSISTENS
-- ============================================================
-- Tre forskjellige representasjoner av "team" finnes i DB-en:
--   (1) team_id (text) på 9 tabeller (families, lotteries, osv.)
--   (2) family_members.subgroup (text)
--   (3) events.subgroup + events.sport (text, text)
--
-- Denne seksjonen viser om de er konsistente. Hvis
-- subgroup-verdier ikke finnes i team_id-settet (eller
-- omvendt), har vi en datakobling vi må løse i Steg F.

-- 6.5.1 — Distinkte family_members.subgroup-verdier
SELECT
  subgroup,
  COUNT(*) AS members_count
FROM public.family_members
WHERE subgroup IS NOT NULL AND subgroup <> ''
GROUP BY subgroup
ORDER BY members_count DESC, subgroup;

-- 6.5.2 — Subgroup-verdier som IKKE finnes i team_id-settet.
-- Hvis listen er tom, har alle subgroups en tilsvarende
-- team_id i minst én av de 9 tabellene.
SELECT DISTINCT fm.subgroup AS subgroup_without_matching_team_id
FROM public.family_members fm
WHERE fm.subgroup IS NOT NULL
  AND fm.subgroup <> ''
  AND fm.subgroup NOT IN (
    SELECT team_id FROM public.families             WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.family_preferences   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.kiosk_items          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.lotteries            WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.push_subscriptions   WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sales_campaigns      WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_credits          WHERE team_id IS NOT NULL
    UNION
    SELECT team_id FROM public.sms_log              WHERE team_id IS NOT NULL
  )
ORDER BY subgroup_without_matching_team_id;

-- 6.5.3 — team_id-verdier som IKKE finnes som subgroup i
-- family_members. Hvis listen er tom, er alle teamene
-- representert med minst ett family_member. Hvis ikke,
-- finnes det "tomme" team som ingen foreldre er knyttet til.
SELECT DISTINCT all_teams.team_id AS team_id_without_members
FROM (
  SELECT team_id FROM public.families             WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.family_preferences   WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.kiosk_items          WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.lotteries            WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.push_subscriptions   WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.sales_campaigns      WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.sms_credits          WHERE team_id IS NOT NULL
  UNION
  SELECT team_id FROM public.sms_log              WHERE team_id IS NOT NULL
) all_teams
WHERE all_teams.team_id NOT IN (
  SELECT DISTINCT subgroup FROM public.family_members
  WHERE subgroup IS NOT NULL AND subgroup <> ''
)
ORDER BY team_id_without_members;

-- 6.5.4 — Eksempler på (family_id, families.team_id,
-- family_members.subgroup) hvor de to sistnevnte avviker.
-- Dette vil være et signal om at team_id og subgroup ikke
-- alltid er i sync.
SELECT
  f.id AS family_id,
  f.name AS family_name,
  f.team_id AS family_team_id,
  fm.subgroup AS child_subgroup,
  fm.role
FROM public.families f
JOIN public.family_members fm ON fm.family_id = f.id
WHERE fm.role = 'child'
  AND fm.subgroup IS NOT NULL
  AND fm.subgroup <> ''
  AND (f.team_id IS NULL OR f.team_id <> fm.subgroup)
ORDER BY f.created_at
LIMIT 10;


-- ============================================================
-- SEKSJON 7 — SNAPSHOT-TABELL-STATUS
-- ============================================================
-- Bekreftelse på at Steg A-tabellene er tomme og klare for
-- bruk i Steg B. Alle tre skal ha row_count = 0.

SELECT 'team_members'                          AS table_name, COUNT(*)::bigint AS row_count FROM public.team_members
UNION ALL
SELECT 'migration_snapshot_family_members_pre', COUNT(*) FROM public.migration_snapshot_family_members_pre
UNION ALL
SELECT 'migration_created_family_members',      COUNT(*) FROM public.migration_created_family_members;


-- ============================================================
-- FERDIG. Ingen data er endret. Send resultatene tilbake til
-- CC før migrerings-fila skrives.
-- ============================================================
