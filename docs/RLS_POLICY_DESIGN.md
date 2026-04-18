# RLS Policy Design — Dugnad+

**Status:** FASE 1 – designet er GODKJENT for retning. Venter på ny gjennomgang før Fase 2 (SQL).
**Dato:** 2026-04-12 (oppdatert etter beslutningsrunde)
**Kontekst:** Alle 22 tabeller har `FOR ALL USING (true)`. Vi må stramme inn før KIL-pilot.

## Beslutninger tatt (låst før Fase 2)

1. **Vei A valgt:** Ny `team_members`-tabell med helper-funksjoner. Bygges riktig én gang.
2. **Kanonisk "min familie":** `family_members.auth_user_id`. Datamigrering fra `families.id = auth.uid()` er påkrevd og **må være idempotent**.
3. **SECURITY DEFINER-funksjoner innføres** med strikt dataminimering (GDPR):
   - `get_seller_display_name(family_id uuid) → text` — returnerer KUN fornavn. Ikke etternavn, telefon, e-post.
   - `resolve_join_code(code text) → (family_id uuid, child_first_name text, team_name text)` — returnerer KUN barnets fornavn, lagets navn, og intern ID. Ingen foreldreinfo, ingen etternavn, ingen kontakt.
4. **Ingen SQL kjørt, ingen commits** i Fase 1.

---

## ⚠️ KRITISKE FUNN FØR VI KAN SKRIVE POLICIES

Kartleggingen avdekket tre strukturelle problemer som gjør at **ekte multi-tenancy RLS ikke kan innføres uten skjemaendringer og app-endringer i samme slengen**. Dette må avklares før Fase 2.

### Funn 1 — Det finnes ingen server-side binding mellom `auth.uid()` og team/klubb

- `team_id` er en **`text`-kolonne**, ikke FK. Den eksisterer på `events`, `lotteries`, `kiosk_items`, `kiosk_sales`, `sales_campaigns`, `sms_credits`, `sms_log`, `push_subscriptions`, `family_preferences`, `families`.
- Det finnes **ingen `team_members`- eller `club_members`-tabell**. Appen leser `dugnad_selected_team` og `dugnad_active_team_filter` fra **localStorage** — databasen vet ikke hvilket team en innlogget bruker «tilhører».
- `clubs`-tabellen er frikoblet: ingen FK fra `families`, `events` eller noe annet peker på `clubs.id`. Klubb-valget ligger også i localStorage (`dugnad_club`).
- Konsekvens: En policy som `team_id = auth.jwt()->>'team_id'` vil ikke funke, fordi JWT-en aldri får satt dette feltet noe sted.

**→ Vi MÅ legge til en `team_members`-tabell (eller tilsvarende) som kartlegger `auth_user_id → team_id → role` før vi kan skrive meningsfulle tenant-policies.** Alternativt må rollen/teamet pushes til `auth.users.raw_user_meta_data` ved login og vedlikeholdes der.

### Funn 2 — `families.id = auth.uid()` vs `family_members.auth_user_id` – to konkurrerende mønstre

- `RoleSelectionPage.tsx:41` oppretter en familie med `families.id = user.id` (auth-UUID).
- Men `family_members.auth_user_id` eksisterer også som en separat FK fra foreldre-brukere til familie.
- `pending_parents.auth_user_id` er en tredje vei inn.

Dette er inkonsistent. Vi må bestemme: **er "min familie" = raden der `families.id = auth.uid()`, eller raden der et medlem har `auth_user_id = auth.uid()`?** For at policies skal være entydige, anbefaler jeg å standardisere på **`family_members.auth_user_id`** (én forelder kan høre til én familie, og det støtter begge-foreldre-scenarioet). `families.id = auth.uid()`-mønsteret bør avvikles — men det krever en datamigrering.

### Funn 3 — Appen fetcher "alt" og filtrerer klient-side

- `CoordinatorDashboard.tsx:64–76` henter **alle `events`** uten `.eq('team_id', ...)`, og filtrerer deretter på `subgroup === activeTeam.name` i JS (linje 122–127).
- `CoordinatorDashboard.tsx:140–144` gjør det samme for `families`.
- `KioskAdmin.tsx:64` filtrerer server-side — men kun hvis et team er valgt, ellers returneres alt.

Så snart vi strammer RLS, vil disse siste "hent alt"-kallene bare returnere det den innloggede brukeren har tilgang til. Det er OK for koordinator innenfor egen klubb, men hvis en bruker er koordinator i flere team, vil JS-filteret plutselig mangle data fra andre team som var forventet å være tilgjengelig. **Vi må gå gjennom alle `.from('events').select()`-kall (og lignende) og verifisere at klient-filteret fortsatt gir mening.**

---

## Anbefalt vei videre (for å diskutere før Fase 2)

**Jeg anbefaler at vi IKKE bare skriver RLS-SQL nå, men at vi først gjør følgende minimale skjemaendring:**

1. **Ny tabell `team_members`:**
   ```
   id uuid pk
   team_id text not null
   auth_user_id uuid not null references auth.users(id)
   role text not null check (role in ('coordinator','parent','substitute'))
   family_id uuid references families(id)
   created_at timestamptz default now()
   unique(team_id, auth_user_id)
   ```
2. **Backfill** fra nåværende `families`/`family_members` ved engangsscript.
3. **App-endring:** Ved login, gjør ett oppslag på `team_members` og cache i localStorage som i dag — men autoriteten flyttes til DB.
4. **Helper-funksjoner i Postgres:**
   - `auth_user_team_ids() returns setof text` — alle team brukeren er medlem av
   - `auth_user_role_in(team text) returns text`
   - `auth_user_family_id() returns uuid`
   - Alle `SECURITY DEFINER` + `STABLE` for cache-vennlighet.
5. **Deretter** kan policy-matrisen nedenfor implementeres direkte.

Hvis du heller vil **minimere scope** og få en "god nok"-RLS før pilot uten skjemaendringer, finnes det en mellomløsning: bruk kun `auth.uid()`-sjekker mot `family_members.auth_user_id` for parent-rollen, og aksepter at *coordinator* inntil videre må gå gjennom en `service_role`-edge-funksjon (som er hvordan kioskkjøp og join-flows bør gjøres uansett). Si fra hvilken vei du vil.

---

## Policy-matrise (forutsetter at Funn 1 løses med `team_members` + helpers)

Notasjon:
- `UID` = `auth.uid()`
- `MY_TEAMS` = `auth_user_team_ids()`
- `MY_FAMILY` = `auth_user_family_id()`
- `ROLE(t)` = `auth_user_role_in(t)`
- `ANON` = `auth.uid() is null`

### Kjernetabeller

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **families** | `team_id = ANY(MY_TEAMS)` OR `id = MY_FAMILY` | `ROLE(team_id) = 'coordinator'` | `ROLE(team_id)='coordinator'` OR `id = MY_FAMILY` (kun egne kontakt-/pref-felter, best håndhevet via kolonnegrants eller split-tabell) | `ROLE(team_id)='coordinator'` |
| **family_members** | samme familie (`family_id = MY_FAMILY`) OR koordinator i familiens team | koordinator i team, eller eier av familien | koordinator, eller egen rad (`auth_user_id = UID`) | koordinator |
| **events** | `team_id = ANY(MY_TEAMS)` | `ROLE(team_id)='coordinator'` | `ROLE(team_id)='coordinator'` | `ROLE(team_id)='coordinator'` |
| **shifts** | via `events`: event.team_id ∈ MY_TEAMS | koordinator i event.team_id | koordinator | koordinator |
| **assignments** | `family_id = MY_FAMILY` OR koordinator i shift→event.team_id | koordinator, eller egen familie (selvbetjening) | samme | koordinator |
| **requests** | `from_family_id = MY_FAMILY` OR `to_family_id = MY_FAMILY` OR `target_family_id = MY_FAMILY` OR koordinator i team | innlogget bruker = fra_family_id | eier av request | eier eller koordinator |

### Lotteri

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **lotteries** | alle innloggede i samme team + **ANON** (nødvendig for LotteryShop deep link) | koordinator | koordinator | koordinator |
| **prizes** | samme som lotteries (inkl. ANON for visning i shop) | koordinator | koordinator | koordinator |
| **lottery_sales** | koordinator i team OR `seller_family_id = MY_FAMILY` | **ANON tillatt** (Vipps deep link) | koordinator (marker betalt) | koordinator |

### Kiosk

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **kiosk_items** | ANON tillatt (shop) | koordinator | koordinator | koordinator |
| **kiosk_sales** | koordinator i team | **ANON tillatt** | koordinator | koordinator |

### Salgskampanjer

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **sales_campaigns** | ANON tillatt (shop) | koordinator | koordinator | koordinator |
| **campaign_sales** | koordinator OR `seller_family_id = MY_FAMILY` | **ANON tillatt** | koordinator | koordinator |

### Sponsorer / innstillinger / klubber

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **sponsors** | alle (også ANON – vises på landing) | koordinator (admin-flagg) | koordinator | koordinator |
| **settings** | alle innloggede | kun `service_role` | kun `service_role` | kun `service_role` |
| **clubs** | alle (oppslag i onboarding, også ANON) | alle innloggede (klubbopprettelse i onboarding) | kun opprettet_av (trenger ny kolonne) eller `service_role` | `service_role` |

### Foreldre-godkjenning og vikar-chat

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **pending_parents** | koordinator i familiens team OR `auth_user_id = UID` | **ANON tillatt** (JoinPage før bruker har konto) | koordinator (godkjenne) | koordinator |
| **vikar_messages** | deltaker i request-tråden (via `request.from/to/target_family_id = MY_FAMILY`) | deltaker | sender | sender eller koordinator |

### SMS

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **sms_credits** | `ROLE(team_id)='coordinator'` | `service_role` (kjøp fra Stripe/Vipps) | `service_role` (dekrement) | nei |
| **sms_log** | `ROLE(team_id)='coordinator'` | `service_role` (edge-funksjon som sender SMS) | `service_role` | nei |

### Push

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **push_subscriptions** | `family_id = MY_FAMILY` (kun egne) | `family_id = MY_FAMILY` | eier | eier |

### Preferanser

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **family_preferences** | `family_id = MY_FAMILY` OR koordinator i team | `family_id = MY_FAMILY` | `family_id = MY_FAMILY` | `family_id = MY_FAMILY` eller koordinator |

---

## Anonyme flows — må verifiseres med koordinator før innskjerping

| Flow | Komponent | Tabeller som må være åpne for ANON |
|---|---|---|
| Kjøp lodd via Vipps deep link | `LotteryShop.tsx` | `lotteries` SELECT, `prizes` SELECT, `families` SELECT (for seller-navn), `lottery_sales` INSERT |
| Kiosk-salg (selvbetjening på kamp) | `KioskShop.tsx` | `kiosk_items` SELECT, `kiosk_sales` INSERT |
| Salgskampanje deep link | `CampaignShop.tsx` | `sales_campaigns` SELECT, `families` SELECT (seller-navn), `campaign_sales` INSERT |
| Forelder slår opp barn-kode | `JoinPage.tsx` | `family_members` SELECT (kun på `join_code`), `pending_parents` INSERT |

**Viktig:** `families` SELECT for anon er lekkasje-risiko — anon kan liste alle familier i alle klubber. **Anbefaling:** erstatt anon-lesning av `families` med en `SECURITY DEFINER`-funksjon `get_seller_display_name(family_id uuid)` som kun returnerer navn, ingen andre felter. Da kan `families` SELECT låses til innloggede brukere i eget team.

Tilsvarende: `family_members` SELECT på `join_code` bør pakkes i en SECURITY DEFINER-funksjon som returnerer `(family_id, child_name)` gitt en gyldig kode, i stedet for å åpne SELECT på hele tabellen.

---

## App-avhengigheter som KAN knekke når RLS strammes

Flagger for full gjennomgang i Fase 3:

1. `CoordinatorDashboard.tsx:64–76` — henter alle events, filtrerer i JS. Blir OK hvis koordinator kun er i ett team, ellers må aktivt team-filter eksplisitt settes i query.
2. `CoordinatorDashboard.tsx:140–144` — samme mønster for `families`.
3. `ManageFamilies.tsx`, `LotteryAdmin.tsx`, `SmsSettingsPage.tsx`, `CampaignOverviewPage.tsx` — alle bruker `team_id`, må sjekkes at de går mot "sitt eget" team, ikke antar full tilgang.
4. `FamilyDashboard.tsx:78–82` bruker `families.id = auth.uid()` (Funn 2). Må oppdateres til å bruke `family_members.auth_user_id`-mønsteret hvis vi velger det som kanon.
5. Alle edge-funksjoner (`supabase/functions/`) må sjekkes — de bruker sannsynligvis `service_role`-nøkkel og vil fortsatt virke, men vi må verifisere at ingen bruker anon-nøkkel og forventer full tilgang.

---

---

## 🆕 Nye kritiske funn fra utvidet anon-gjennomgang

Dyp-søk etter QR, iframe, delbare lenker, "se uten å logge inn", og pre-auth queries avdekket **én ny kritisk lekkasje** og flere bekreftelser.

### KRITISK — `ParentSwapPage.tsx:72`

- **Rute:** `/parent-swap` (public, utenfor auth-wrapper i `App.tsx:136–137`)
- **Query:** `supabase.from('assignments').select('*, shifts(*, events(*))').eq('id', assignmentId).single()` basert på URL-parameter `?assignment=<uuid>`.
- **Auth-sjekk:** Skjer FØRST ETTER queryen er kjørt (`App.tsx:44–51`). Dvs. at **hvem som helst med en assignment-UUID kan hente ut familie, shift, event, dato, lokasjon**.
- **Hva må skje:** Denne ruten må enten (a) kreve autentisering før queryen trigges, eller (b) policy må begrense `assignments.SELECT` til `family_id = MY_FAMILY` eller koordinator — og `ParentSwapPage` må håndtere "ikke funnet" graceful. Anbefaling: **begge deler**. Policy skal være autoritativ; frontend skal ikke stole på åpen tilgang.

### HØYT — `SponsorPage.tsx:38,47`

- **Rute:** `/sponsors` (public)
- **Queries (ingen auth-sjekk):**
  - `sponsors.select('*').eq('is_active', true)` — OK, sponsorliste er ment å være offentlig.
  - `families.select('total_points').eq('id', user.id)` — kjøres hvis `localStorage.dugnad_user` finnes, men uten ekte auth-verifisering. Lav lekkasjerisiko (bare points), men bryter "ingen anon tilgang til families"-prinsippet.
- **Ekstra issue:** `sponsors_visible`-settingen sjekkes i `SponsorAdmin.tsx:61` men ikke i `SponsorPage.tsx`. Offentlig visning respekterer ikke toggelen.
- **Fix:** Policy på `families` skal kun tillate `id = MY_FAMILY` for parent-rolle. `SponsorPage` må oppdateres til å lese `total_points` via `family_members.auth_user_id`-mønsteret etter migreringen, og må sjekke `sponsors_visible` før visning.

### Bekreftelser (allerede i matrisen, men verifisert)

- **LotteryShop.tsx:39,61** — `lotteries` + `families/family_members` uten auth. Krever SECURITY DEFINER-funksjon `get_seller_display_name` for families-delen.
- **CampaignShop.tsx:23,27** — `sales_campaigns` + `families/family_members` uten auth. Samme fix.
- **KioskShop.tsx:34** — `kiosk_items` uten auth. Bekreftet greit via policy.
- **JoinPage.tsx** — `family_members` via `join_code` uten auth. Skal erstattes med `resolve_join_code()`.

### Ikke funnet (bra nyheter)

- **Ingen iframe-embed-flows** for sponsorer eller annet innhold. `SponsorPage` er en vanlig React-rute.
- **Ingen "se vaktlisten uten å logge inn"-rute**. Vaktlister krever i dag at brukeren er innlogget (via `FamilyDashboard`/`CoordinatorDashboard`).
- **Ingen eksterne delbare lenker** utover Vipps deep links som allerede er dekket (LotteryShop, CampaignShop, KioskShop).
- **QR-koder genereres kun** for de allerede kjente shop-URLene (Kiosk/Lotteri/Kampanje) — ingen nye mål.

---

## 🧑‍⚖️ Rolle-matrise

### Roller som faktisk eksisterer i kodebasen i dag

Fra `RoleSelectionPage.tsx:4`:
```ts
type Role = 'coordinator' | 'family' | 'substitute' | null;
```

Rollen lagres i tre steder (må konsolideres):
- `localStorage.dugnad_user.role`
- `supabase.auth.updateUser({ data: { role } })` (JWT `raw_user_meta_data`)
- Implisitt i ruting (`/coordinator-dashboard` → koordinator)

**Ingen DB-autoritet.** Vi flytter autoriteten til `team_members.role`.

### Foreslått endelig rolle-modell (lagres i `team_members.role`)

| Rolle | Tildeles når | Scope | Kan i tillegg |
|---|---|---|---|
| `coordinator` | Opprettet team eller er lagt til av annen koordinator/klubb-admin | Ett team | Alt CRUD innenfor egne team. Kan invitere andre koordinatorer. |
| `parent` | Har koblet `auth_user_id` til en `family_members`-rad via join-kode eller registrering | Ett team (via `family_members.family_id → families.team_id`) | Lese/oppdatere egen familie, se egne shifts, bytte/vikar-bud, kjøpe lodd. |
| `substitute` | Valgt "Jeg vil jobbe som vikar" i onboarding | Ingen team-binding (vikarer jobber på tvers) | Lese åpne vikar-forespørsler på tvers av team, by på jobber. |
| `club_admin` *(ny)* | Valgfri, kun for store klubber med flere team | Alle team under samme `club_id` | Som `coordinator` + kan opprette/arkivere team, administrere andre koordinatorer i samme klubb. |
| `super_admin` *(ny, NOT in team_members)* | Manuelt, Dugnad+-stab | Globalt | Support-tilgang via `service_role` — IKKE via JWT-rolle. Holdes utenfor `team_members` for å unngå at en feilkonfigurering gir super_admin RLS-bypass. Implementeres som egen `platform_admins(auth_user_id)`-tabell som `service_role`-edge-funksjoner kan konsultere. |

**Viktig om `substitute`:** Vikarer har ingen `team_id` i `team_members` (NULL tillatt, eller egen "global"-markering). Policies må håndtere dette spesielt — f.eks. på `requests`: en vikar kan se `requests` hvor `type = 'substitute'` og `is_active = true` på tvers av team.

**Viktig om `club_admin`:** Krever at `team_members` også har (eller kan utlede) `club_id`. Siden vi legger til `team_members` fra scratch, foreslår jeg å også inkludere `club_id` som denormalisert felt der for å gjøre policies raske og lesbare.

### Oppdatert `team_members`-skjema

```
team_members (
  id            uuid pk default gen_random_uuid(),
  team_id       text not null,
  club_id       uuid references clubs(id),   -- denormalisert
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('coordinator','parent','substitute','club_admin')),
  family_id     uuid references families(id),-- kun for role='parent'
  created_at    timestamptz default now(),
  unique (team_id, auth_user_id, role)       -- en bruker kan ha flere roller i samme team? Sannsynligvis nei, men unique på (team_id, auth_user_id) alene er strengere. TBD.
)
```

### Permission-matrise per rolle × domene

Legend: **C**=Create, **R**=Read, **U**=Update, **D**=Delete, **—**=ingen tilgang, **own**=kun egne data, **team**=innenfor eget team, **club**=innenfor egen klubb, **cross**=på tvers (global)

| Domene | coordinator | parent | substitute | club_admin | super_admin (service_role) |
|---|---|---|---|---|---|
| **Egne team-events/shifts** | CRUD (team) | R (team) | R (team) hvis tilknyttet | CRUD (club) | CRUD |
| **Andre team-events/shifts** | — | — | R (hvis åpen vikarjobb) | R (club) | CRUD |
| **Families (egen)** | CRUD (team) | R/U (own) | — | CRUD (club) | CRUD |
| **Families (andres)** | — | — | — | R (club) | CRUD |
| **Family_members (egne)** | CRUD (team) | R/U (own familie) | — | CRUD (club) | CRUD |
| **Assignments** | CRUD (team) | R (own), U (egen) | R (tilbudte vikarjobber) | CRUD (club) | CRUD |
| **Requests (bytte/vikar)** | R (team), U (team) | CRUD (egen) | R (åpne vikar cross), C (bud) | R (club) | CRUD |
| **Lotteries / prizes** | CRUD (team) | R (team) + ANON shop | — | CRUD (club) | CRUD |
| **Lottery_sales** | CRUD (team) | R (own), C via shop | — | R (club) | CRUD |
| **Kiosk (items/sales)** | CRUD (team) | R (team) | — | CRUD (club) | CRUD |
| **Sales_campaigns / campaign_sales** | CRUD (team) | R (team), C via shop | — | CRUD (club) | CRUD |
| **Sponsors** | CRUD (global admin-flagg) | R (alle) | R | CRUD | CRUD |
| **Settings** | R | R | R | R | CRUD |
| **Clubs** | R (egen) | R (egen) | R | CRUD (egen) | CRUD |
| **Pending_parents** | R/U (team) | — (egen via auth_user_id) | — | R/U (club) | CRUD |
| **Vikar_messages** | R (team) | CRUD (egne tråder) | CRUD (tråder man er i) | R (club) | CRUD |
| **Sms_credits / sms_log** | R (team) | — | — | R (club) | CRUD |
| **Push_subscriptions** | — | CRUD (own) | CRUD (own) | — | CRUD |
| **Family_preferences** | R (team) | CRUD (own) | — | R (club) | CRUD |
| **Team_members (ny)** | R (team), C (invite parent) | R (own rad) | R (own rad) | CRUD (club) | CRUD |
| **Platform_admins (ny)** | — | — | — | — | CRUD |

**Noter:**
- `parent` kan aldri lese andre familier — selv ikke i samme team. Dette beskytter mot at en forelder kan "bla" gjennom naboer.
- `coordinator` skal kunne lese alle familier i sitt team for å kunne tildele vakter manuelt.
- `substitute` har bevisst ingen lesetilgang til families — vikarer skal kun se selve vakten de har tatt, ikke familien som "byttet bort".

---

## 📋 Frontend antipattern-liste (parallell fix-runde etter RLS)

Alle steder der appen henter uten klubb/team-filter. Dette er den fulle kjente listen — blir eget fix-pass.

| # | Fil | Linje | Tabell | Kategori | Note |
|---|---|---|---|---|---|
| 1 | `CoordinatorDashboard.tsx` | 65–76 | events | A | Henter alle events, filtrerer client-side |
| 2 | `CoordinatorDashboard.tsx` | 82–86 | families | A | Samme mønster — filtrerer etter `f.team_id === active` i JS |
| 3 | `CoordinatorDashboard.tsx` | 140–144 | families | E | Client-filter post-fetch |
| 4 | `SubstituteProfilePage.tsx` | 68 | events | A | Alle fremtidige events uten team-scope |
| 5 | `FamilyDashboard.tsx` | 132–135 | events | A | Filtrerer på `assignment_mode='self-service'`, mangler team_id |
| 6 | `ParentDashboard.tsx` | 111–114 | events | A | Filtrerer på `subgroup`, ikke `team_id` — ikke hard boundary |
| 7 | `CampaignOverviewPage.tsx` | 159 | kiosk_sales | A | Dashboard-aggregat uten team-filter |
| 8 | `KioskAdmin.tsx` | 70, 78–79 | events, kiosk_sales | C | Stats-aggregat — bevisst bredt, OK |
| 9 | `MyLottery.tsx` | 64–66 | lotteries | A/D | Filtrerer `is_active=true`, mangler team_id |
| 10 | `ParentSwapPage.tsx` | 72 | assignments | **KRITISK** | Anon-lesning via URL-param før auth-sjekk |
| 11 | `SponsorPage.tsx` | 47 | families | A | Anon-lesning av points hvis localStorage finnes |
| 12 | `LotteryShop.tsx` | 39, 61 | lotteries, families, family_members | D | Shop-flow — må byttes til `get_seller_display_name` |
| 13 | `CampaignShop.tsx` | 23, 27 | sales_campaigns, families, family_members | D | Samme — må byttes til SECURITY DEFINER |
| 14 | `KioskShop.tsx` | 34 | kiosk_items | D | OK å være åpent, men bør ha eksplisitt `.eq('team_id', teamIdFromUrl)` |
| 15 | `JoinPage.tsx` | 66–68 | family_members | D | Må byttes til `resolve_join_code()` |

**Kategorier:**
- **A** = Missing team_id filter (må fikses)
- **C** = Bevisst bred fetch (OK som den er)
- **D** = Anon shop flow (må håndteres via SECURITY DEFINER eller eksplisitt team-filter)
- **E** = Filtrert client-side etter fetch (må endres til server-side filter)
- **KRITISK** = Data-lekkasje mulig før auth-sjekk

**Estimert omfang:** 13 filer må røres i parallell frontend-runde. Ca. 15–25 query-endringer totalt. De fleste er "legg til `.eq('team_id', ...)`" — det er ikke stort, men må verifiseres med test-plan per komponent.

---

## 🔄 Datamigreringsplan — `families.id = auth.uid()` → `family_members.auth_user_id`

### Hva som skjer med eksisterende rader

**Utgangspunktet i dag:**
- Noen `families`-rader har `id = <auth.uid()>` fordi `RoleSelectionPage.tsx:41` setter det slik.
- Samtidig opprettes en `family_members`-rad med `role='parent'` og **uten** `auth_user_id` satt (linje 67–75 — `auth_user_id` utelates i insert).
- Andre familier (opprettet via import eller av koordinator) har `families.id = gen_random_uuid()` og ingen auth-kobling på `family_members`.
- Atter andre brukere har koblet seg via `pending_parents.auth_user_id` etter godkjenning.

**Migrerings-logikk (idempotent, kan kjøres flere ganger):**

```
-- Pseudokode, ikke endelig SQL
BEGIN;

-- Steg 1: For hver families-rad der id eksisterer i auth.users,
-- finn eller opprett en family_members-rad for den brukeren og sett auth_user_id.
-- Bruk email som nøkkel for å unngå å lage duplikat-forelder hvis raden allerede finnes.

WITH self_owned AS (
  SELECT f.id AS auth_uid, f.id AS family_id, f.contact_email, f.name AS family_name
  FROM families f
  WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = f.id)
)
-- 1a: Oppdater eksisterende family_members-rad hvis den matcher (email + role='parent' + family_id)
UPDATE family_members fm
SET auth_user_id = so.auth_uid
FROM self_owned so
WHERE fm.family_id = so.family_id
  AND fm.role = 'parent'
  AND (fm.email = so.contact_email OR fm.email IS NULL)
  AND fm.auth_user_id IS NULL;

-- 1b: Opprett family_members-rad hvis ingen forelder-rad finnes ennå
INSERT INTO family_members (family_id, name, role, email, auth_user_id)
SELECT so.family_id, 'Forelder', 'parent', so.contact_email, so.auth_uid
FROM self_owned so
WHERE NOT EXISTS (
  SELECT 1 FROM family_members fm
  WHERE fm.family_id = so.family_id AND fm.auth_user_id = so.auth_uid
);

-- Steg 2: For hver pending_parents-rad med status='approved' og auth_user_id satt,
-- kopier auth_user_id til family_members (koble foreldre som ble godkjent via JoinPage).
UPDATE family_members fm
SET auth_user_id = pp.auth_user_id
FROM pending_parents pp
WHERE fm.id = pp.child_member_id   -- eller annen korrekt kobling; MÅ verifiseres mot faktisk pending-flow
  AND pp.status = 'approved'
  AND pp.auth_user_id IS NOT NULL
  AND fm.auth_user_id IS NULL;

-- Steg 3: Populer team_members fra eksisterende data
-- 3a: coordinators — alle auth.users der metadata.role = 'coordinator'
-- 3b: parents — join family_members (med auth_user_id satt) → families (for team_id)
-- 3c: substitutes — alle auth.users der metadata.role = 'substitute' (ingen team_id)

INSERT INTO team_members (team_id, auth_user_id, role, family_id)
SELECT DISTINCT f.team_id, fm.auth_user_id, 'parent', fm.family_id
FROM family_members fm
JOIN families f ON f.id = fm.family_id
WHERE fm.auth_user_id IS NOT NULL
  AND f.team_id IS NOT NULL
ON CONFLICT (team_id, auth_user_id) DO NOTHING;

-- ... tilsvarende for coordinator/substitute ...

COMMIT;
```

### Idempotens-garantier

- Alle `UPDATE` bruker `WHERE ... IS NULL`-klausul → kjører ikke over allerede-satte verdier.
- Alle `INSERT` er pakket i `NOT EXISTS` eller `ON CONFLICT DO NOTHING`.
- Ingen `DELETE` i selve migreringen. Ingen rader fjernes før verifiseringsfasen er ferdig.
- Det er trygt å kjøre skriptet flere ganger — resultatet konvergerer.

### Verifiseringsspørringer (kjør før og etter, sammenlign)

```
-- V1: Antall auth-brukere som har en tilkoblet family_members-rad
SELECT count(*) FROM auth.users u
WHERE EXISTS (SELECT 1 FROM family_members fm WHERE fm.auth_user_id = u.id);

-- V2: Antall auth-brukere som har EN eller flere team_members-rader
SELECT count(*) FROM auth.users u
WHERE EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_user_id = u.id);

-- V3: Foreldre som "mistet tilgang" — hadde families.id = auth.uid() i dag,
-- men mangler family_members.auth_user_id etter migrering
SELECT u.id, u.email
FROM auth.users u
JOIN families f ON f.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM family_members fm WHERE fm.auth_user_id = u.id
);
-- FORVENTET: 0 rader etter vellykket migrering. Hvis ikke 0, ikke gå videre til policy-innstramming.

-- V4: Familier uten noen koblet forelder (foreldreløse — trenger manuell sjekk)
SELECT f.id, f.name, f.contact_email FROM families f
WHERE NOT EXISTS (
  SELECT 1 FROM family_members fm WHERE fm.family_id = f.id AND fm.auth_user_id IS NOT NULL
);
-- Disse må håndteres manuelt eller gjennom ny "claim"-flow før RLS strammes.
```

### Rollback-plan

Siden migreringen er kun **additiv** (setter `auth_user_id` på eksisterende rader, oppretter nye `family_members` og `team_members`), er full rollback enkelt:

```
BEGIN;
-- Fjern team_members-rader opprettet av migreringen (ny tabell, kan droppes helt)
TRUNCATE team_members;
-- Nullstill auth_user_id-feltet på family_members som var tomt før migreringen
-- NB: krever at vi snapshotter (fm.id, fm.auth_user_id) før migrering!
UPDATE family_members fm
SET auth_user_id = NULL
WHERE fm.id IN (SELECT id FROM migration_snapshot_family_members_pre);
-- Fjern auto-opprettede family_members (de som ble laget i steg 1b)
DELETE FROM family_members
WHERE id IN (SELECT id FROM migration_created_family_members);
COMMIT;
```

**Forutsetning for rollback:** Migreringsskriptet må **først** skrive til to snapshot-tabeller:
- `migration_snapshot_family_members_pre` — `(id, auth_user_id)` for alle eksisterende rader
- `migration_created_family_members` — `(id)` for alle rader steg 1b skapte

Disse tabellene droppes først når migreringen er verifisert stabil i produksjon (anbefalt: 2 uker).

### Verifisering at ingen mister tilgang til sin familie

Kjør denne FØR og ETTER migrering:

```
-- Per auth-bruker, hvilken family_id får de tilgang til?
-- FØR (dagens mønster): families.id = auth.uid()
SELECT u.id AS user_id, f.id AS family_id_before
FROM auth.users u
LEFT JOIN families f ON f.id = u.id;

-- ETTER (nytt mønster): via family_members.auth_user_id
SELECT u.id AS user_id, fm.family_id AS family_id_after
FROM auth.users u
LEFT JOIN family_members fm ON fm.auth_user_id = u.id AND fm.role = 'parent';
```

Join disse og flag alle rader der `family_id_before IS NOT NULL AND family_id_after IS NULL`. Disse brukerne ville mistet tilgang — **må være 0 før vi aktiverer policyene**.

### Rekkefølge på utrulling (MÅ være sekvensielt, ikke samtidig)

Gjennomgående markeringer:
- **[CC]** = Claude Code kan gjøre alene (kode, dokument, commit)
- **[Espen]** = Krever at Espen kjører noe (typisk SQL i Supabase SQL Editor)
- **[Begge]** = Krever at vi er online samtidig, eller manuell browser-verifisering av Espen før neste steg
- **🛑 Hard stopp** = må kjøres til ende i én økt, ikke trygt å pause midtveis
- **✅ Trygt stoppunkt** = OK å pause her, appen er fortsatt funksjonell

#### Steg 0 — ParentSwapPage anon data-lekkasje ✅ FERDIG
- **Commit:** `50b568a` (2026-04-12)
- **Hva:** `/parent-swap` hardnet med autoritativ `auth.getUser()`, ownership-filter og 404-semantikk.
- **Estimat:** 1 time. **Faktisk:** ~45 min.

#### Steg 0.5 — DevTools-eksponering i produksjon ✅ FERDIG
- **Commit:** `62f64af` (2026-04-12)
- **Hva:** `import.meta.env.DEV`-guard, tree-shaket ut av prod-bundle. Bundle falt 10,5 kB.
- **Estimat:** 30 min. **Faktisk:** ~20 min.

#### Steg 0.7 — Upload/eksport/CSP-runden ✅ FERDIG
- **Commits:** `60b3db3` (CSV-escape), `5b02c3f` (SVG-blokk + size limits), `407d96a` (KioskAdmin DOM), `9471a73` (CSP Report-Only), `1091174` (CSP Google Fonts-tillegg)
- **Dato:** 2026-04-12
- **Hva:** Stoppet CSV-formula-injection (inkl. anon→koordinator-desktop RCE-kjeden), MIME allowlist på marketplace, DOM-bygget kiosk-print-vindu, baseline security headers + CSP i Report-Only.
- **Estimat:** 3–4 timer. **Faktisk:** ~2,5 timer.

---

Alt etter dette er **ikke gjort ennå**. Estimater er grove.

#### Steg A — Schema: `team_members`, `platform_admins`*(valgfritt)*, snapshot-tabeller ✅ FERDIG
- **Commit:** `b827733` (SQL) — `supabase/migrations/20260413_step_a_team_members_scaffold.sql`
- **Dato kjørt:** 2026-04-13
- **Hvem:** [Espen] kjørte SQL i Supabase SQL Editor etter at [CC] hadde skrevet fila.
- **Hva som faktisk ble opprettet:**
  - `public.team_members (id, team_id, club_id, auth_user_id, role, family_id, created_at)` med `UNIQUE (team_id, auth_user_id, role)` og CHECK-constraint `family_id XOR role='parent'`. Roller i enum: `coordinator / parent / club_admin` (substitute utelatt bevisst — håndteres via auth metadata i Steg E). FKs: `auth.users ON DELETE CASCADE`, `clubs ON DELETE SET NULL`, `families ON DELETE CASCADE`. Fire indekser: `auth_user_id`, `(team_id, role)`, `family_id` partiell, `club_id` partiell.
  - `public.migration_snapshot_family_members_pre (snapshot_id, family_member_id, auth_user_id, captured_at)` — tom, populeres i Steg B.
  - `public.migration_created_family_members (id, family_member_id UNIQUE, created_at)` — tom, populeres i Steg B.
- **Verifikasjon grønn:** alle tre tabeller eksisterer, 7 riktige kolonner på `team_members`, 3 FKs bekreftet med riktig ON DELETE-oppførsel, row_count = 0 på alle tre.
- **Estimat vs. faktisk:** Estimat: CC 1t + Espen 15 min. Faktisk omtrent på estimat — SQL-skriving tok ~45 min, kjøring + verifikasjon ~20 min.
- **Avhengigheter:** Ingen. Kan starte når som helst.
- **Stoppunkt:** ✅ Trygt. Tabellen er ny og ubrukt. Appen merker ingenting.

> **Gotcha for fremtidige verifikasjoner — cross-schema-FK usynlig i `information_schema`:**
> Under verifikasjonen av Steg A oppdaget vi at `information_schema.constraint_column_usage` **ikke rapporterte FK-en fra `public.team_members.auth_user_id` til `auth.users.id`** — den viste kun 2 av 3 FKs. Dette er et dokumentert Postgres-oppførsel: `information_schema`-vyene følger SQL-standardens privileges-modell og skjuler referanser til objekter i schemas brukeren ikke har full tilgang til. `auth`-skjemaet i Supabase eies av en egen rolle, så `postgres`-rollen i SQL Editor ser FK-ens *eksistens* (via `pg_constraint`) men ikke *referanse-sporet* (via `constraint_column_usage`).
>
> **For fremtidige RLS-verifikasjons-queries:** ikke stol på `information_schema.constraint_column_usage` eller `information_schema.referential_constraints` for FKs som krysser schema-grenser. Bruk i stedet `pg_constraint` direkte:
>
> ```sql
> SELECT conname, pg_get_constraintdef(oid, true) AS definition
> FROM pg_constraint
> WHERE conrelid = 'public.team_members'::regclass
>   AND contype = 'f'
> ORDER BY conname;
> ```
>
> `pg_get_constraintdef()` returnerer den rå CREATE-syntaksen inkludert `REFERENCES auth.users(id) ON DELETE CASCADE` — synlig uavhengig av schema-grenser. Dette må bakes inn i verifikasjons-skriptene for Steg B, E og F hvor vi også kommer til å ha cross-schema-FKs.

#### Steg B — Backfill + verifiserings-queries V1–V4 ✅ LIGHT-VARIANT FERDIG
- **Status:** **Light variant ferdig 2026-04-15.** Full backfill-migrering utsatt til `pending_parents` inneholder data (etter pilot).
- **Commits:**
  - `e1913f8` — `supabase/migrations/20260415_step_b_light_team_members_backfill.sql` (light variant)
  - Full backfill-migrering: TBD, skrives post-pilot
- **Dry-run-resultat 2026-04-15:**
  - `parents_without_auth_user_id`: 35 (Spond-importerte foresatte, trenger organisk /claim-family)
  - `approved_pending_parents`: 0 (ingen kilde å backfille FRA)
  - `parents_missing_from_team_members`: 5 (test-claims fra 14-stegs retest)
  - `families_without_team_id`: 0
- **Hva light-varianten faktisk gjorde:** Én `INSERT INTO team_members ... SELECT FROM family_members JOIN families` for de 5 parents som allerede hadde `auth_user_id` satt men manglet en `team_members`-rad. Idempotent (`ON CONFLICT DO NOTHING` + `NOT EXISTS`-guard), verifisert med selvsjekk som RAISE EXCEPTION hvis antallet ikke matchet. Kjørt og committet i prod uten feil.
- **Hvorfor ikke full migrering:** Etter team_id-normaliseringsrunden (data-wipe) er `pending_parents` tom, så det er ingenting å backfille `auth_user_id` fra. Den fulle Steg B-migreringen (med `UPDATE family_members SET auth_user_id = pp.auth_user_id FROM pending_parents pp ...`) vil først være meningsfull når brukere har begynt å registrere seg via `/join`-flowen i produksjon og den tabellen har data. Utsatt som post-pilot-oppgave.
- **Full Steg B — når kjøres den?** Når `SELECT COUNT(*) FROM pending_parents WHERE status = 'approved' AND auth_user_id IS NOT NULL` returnerer > 0. Idempotent shape gjenbrukes — andre kjøring med 0 kandidater blir no-op.
- **Avhengigheter:** Steg A må være ferdig (✅ `b827733`).
- **Stoppunkt:** ✅ Trygt. Både light-varianten og den fremtidige fulle migreringen er additive og kan pauses.
- **Estimat vs. faktisk:** Estimat: CC 1,5t + Espen 20 min. Faktisk: CC ~30 min (light-variant + dry-run), Espen ~5 min kjøring. Vesentlig raskere enn forventet fordi dry-run-en avslørte at full migrering ikke var nødvendig.

#### Steg C — Frontend: bytt til `family_members.auth_user_id` som kanonisk oppslag
- **Hvem:** [CC] skriver kode, deployer via push til main, [Espen] verifiserer manuelt i browser.
- **Hva:** Alle komponenter som i dag slår opp `families.id = auth.uid()` byttes til å gå via `family_members.auth_user_id` med legacy-fallback. Dekker:
  - `FamilyDashboard.tsx:78–82` (samme mønster som ParentSwapPage-fiksen i `50b568a`) — **BUG 2 fix-in**
  - `MyShiftsPage.tsx`, `MyLottery.tsx`, `FamilyMembersPage.tsx`, `PointsTierPage.tsx`, `ParentDashboard.tsx` — trenger full sjekk, men samme oppslagsmønster
  - `SponsorPage.tsx:47` (family points-oppslaget, også flagget som funn A2 i upload-auditet)
- **Estimat:** 2–3 timer kode. 1 time manuell verifisering.
- **Avhengigheter:** Steg B må være ferdig og V3 = 0.
- **Stoppunkt:** ✅ Trygt. RLS er fortsatt åpen, så både gammel og ny vei funker. Hvis vi ruller halvveis, fungerer begge gruppene av komponenter side-om-side.
- **Etter deploy:** la koden ligge i minst **24 timer** mot prod før Steg F. Dette er "Steg D" i den opprinnelige planen og er egentlig en observasjonsperiode, ikke eget arbeid.

#### Steg D — Observasjonsperiode (24t minimum)
- **Hvem:** [Espen] bruker appen som normalt, rapporterer eventuelle regressjoner.
- **Hva:** Ingen kode. Bare å se at ingen parent-brukere mister tilgang, at `/family-dashboard` virker for både "Foresatt-visning"-koordinator og vanlige parents.
- **Estimat:** 24–48 timer elapsed, ~0 aktiv jobb.
- **Stoppunkt:** ✅ Trygt. Kan forlenges så lenge man vil.

#### Steg E — Helper-funksjoner i Postgres (SECURITY DEFINER) ✅ FERDIG
- **Commit:** `d75b39f` — `supabase/migrations/20260418_step_e_security_definer_helpers.sql`
- **Dato kjørt:** 2026-04-18
- **Hvem:** [CC] skrev SQL, [Espen] kjørte i Supabase SQL Editor.
- **Hva som faktisk ble opprettet:**
  - `auth_user_team_ids() → text[]` — alle team_id-verdier for innlogget bruker
  - `auth_user_role_in(p_team_id text) → text` — rolle i gitt team, NULL hvis ikke medlem
  - `auth_user_family_id() → uuid` — family_id for parent-brukere
  - `get_seller_display_name(p_family_id uuid) → text` — GDPR-minimert fornavn for anon shop-flows
  - `resolve_join_code(p_code text) → TABLE(child_name, team_display_name, family_member_id)` — strikt dataminimering for /claim-family
- **Alle funksjoner:** SECURITY DEFINER, SET search_path = public, STABLE, CREATE OR REPLACE (idempotent).
- **Verifikasjon grønn:** Selvsjekk passerte — alle 5 funksjoner eksisterer med riktig signatur.
- **Estimat vs. faktisk:** Estimat: CC 2t + Espen 10 min. Faktisk: CC ~30 min, Espen ~5 min.
- **Avhengigheter:** Steg A (team_members-tabellen). Ikke avhengig av Steg C eller D.
- **Stoppunkt:** ✅ Trygt. Funksjonene er installert, men ingen policy bruker dem ennå. Null effekt på appen.

#### Steg F — Policy-innstramming ✅ FERDIG
- **Commits:** `88d812d` (initial), `6d40769` (sender_id fix), `21f2722` (drop-all fix), `aba09a7` (versjonsstempel)
- **Migrering:** `supabase/migrations/20260418_step_f_tighten_rls_policies.sql` (versjon 3)
- **Dato kjørt:** 2026-04-18
- **Hvem:** [CC] skrev SQL, [Espen] kjørte i Supabase SQL Editor (3 forsøk — sender_id-fix og drop-all-fix underveis).
- **Hva som faktisk ble gjort:**
  - Droppet alle 22 åpne `FOR ALL USING (true)`-policies via dynamisk loop
  - Enabled RLS på `team_members` (ikke gjort i Steg A)
  - Opprettet ~70 nye policies for 23 tabeller basert på helper-funksjonene fra Steg E
  - Coordinator: full CRUD scoped til egne team via `auth_user_role_in()`
  - Parent: les team events/shifts/assignments, skriv egne familiedata
  - Anon: INSERT på lottery_sales/kiosk_sales/campaign_sales, SELECT på aktive lotterier/kampanjer/kiosk_items/prizes
  - Rollback-seksjon inkludert (kommentert ut)
- **Kjente begrensninger (flagget i SQL):**
  - `families` og `family_members` SELECT forblir `USING(true)` — anon shop-flows leser direkte. Migrer til `get_seller_display_name()`/`resolve_join_code()`.
  - Substitute-rollen har ingen `team_members`-rader — ser 0 events.
  - `EventsList.tsx` mangler frontend `team_id`-filter — RLS scoper, men multi-team koordinator ser alle team.
- **Estimat vs. faktisk:** Estimat: CC 3–4t + Espen 35 min. Faktisk: CC ~2t, Espen ~20 min (inkl. 3 kjøringer).

#### Steg G — Smoke-test ✅ FERDIG
- **Dato:** 2026-04-18
- **Hvem:** [Espen] kjørte 5 smoke-tester umiddelbart etter Steg F.
- **Resultater:**
  1. **Koordinator:** 20 familier synlige, data korrekt. ✅ (UI overlay-bug observert — ikke RLS-relatert, undersøkes separat)
  2. **Forelder:** family-dashboard med vakter, riktig data. ✅
  3. **Lotteri-shop (anon):** rendres med "Ingen aktive lotterier" (korrekt empty state). ✅
  4. **Kiosk-shop (anon):** ruten `/kiosk-shop` finnes ikke i router — korrekt rute er `/kiosk`. Ikke RLS-feil. ✅
  5. **Claim-family (anon):** redirect til login fungerer. ✅
- **Konklusjon:** Alle 5 kritiske flows fungerer. Ingen rollback nødvendig. RLS-policies er live i produksjon.

#### Steg H — Frontend antipattern-fix ✅ HØYRISIKO-FILER FERDIG
- **Status:** Høyrisiko-filer ferdig 2026-04-16. 9 filer fikset. Gjenværende: SmsSettingsPage.tsx (medium-risiko, stale localStorage, ikke datalekk).
- **Hvem:** [CC] skriver kode, [Espen] verifiserer i browser.
- **Hva:** Fra antipattern-tabellen tidligere i dette dokumentet — legg eksplisitte `.eq('team_id', ...)`, `.eq('family_id', ...)` etc. Gjøres i flere commits (en per logisk område).
- **Commits (kronologisk):**
  - `c0eb4a4` — CampaignOverviewPage: server-side team_id filter på kiosk_sales
  - `4dc2698` — MyLottery: server-side filter
  - `e15cc4a` — CampaignOverviewPage: role-gate (coordinator/club_admin only)
  - `227138f` — LoginPage: login redirect bruker team_members rolle i stedet for stale localStorage
  - `2852589` — CoordinatorLayout: auth-gate for å forhindre flash-of-unauthorized-content
  - `f4d18fe` — AttendancePage: server-side team_id filter på events
  - `b639e0e` — KioskAdmin: server-side team_id filter på events + kiosk_sales
  - `f932e89` — LotteryAdmin: server-side team_id filter på families-query
  - `2f2a8ed` — SalesCampaignPage: server-side team_id filter på families-query
- **Gjenværende:** SmsSettingsPage.tsx bruker allerede `.eq('team_id', teamId)`, men verdien kommer fra localStorage — stale-data-risiko hvis bruker bytter lag i en annen fane. Ikke en datalekk, klassifisert som medium-risiko. Tas ved behov.
- **Estimat vs. faktisk:** Estimat: 4–5 timer. Faktisk: ~3 timer kode + ~1,5 timer Espen-verifisering over 2 sesjoner.
- **Avhengigheter:** Steg F må være ferdig for full effekt. Uten RLS filtrerer frontend-fixene i app-laget, men DB er fortsatt åpen.
- **Stoppunkt:** ✅ Trygt mellom hver fil. Kan pauses etter hver commit.

#### Steg I — CSP enforce-switch (SECURITY_BACKLOG C1)
- **Hvem:** [CC] endrer `netlify.toml`, [Espen] verifiserer headers i browser etter deploy.
- **Hva:** Bytt `Content-Security-Policy-Report-Only` → `Content-Security-Policy` i `netlify.toml`. Ingen annen endring.
- **Estimat:** 10 min kode + 15 min verifisering.
- **Avhengigheter:** Ingen tekniske avhengigheter til RLS-stegene, men bør gjøres ETTER observasjonsperioden for Report-Only er ferdig (24–48t). Kan kjøres når som helst etter det, også parallelt med Steg A–H.
- **Stoppunkt:** ✅ Trygt. Hvis CSP knekker noe etter enforce, er rollback en ett-linjes-endring.

### Parallelliserings-muligheter

| Kan gå parallelt | Kan IKKE gå parallelt |
|---|---|
| Steg C og Steg E (frontend-kode + SQL-helpers) | Steg A → B (tabellen må finnes før backfill) |
| Steg I (CSP enforce) og hvilket som helst annet steg etter Steg 0.7 | Steg B → C (backfill må være verifisert før frontend bytter) |
| Innenfor Steg H kan hver fil gjøres parallelt | Steg C → D → F (observasjonsperiode må passere før policy-bryter) |
| | Steg F → G (test-plan krever at policies er på) |

### Totalestimat

Ren aktiv jobb for CC+Espen: **~20 timer kode/SQL + ~4 timer Espen-verifisering + 24–48t observasjonsperiode**. Realistisk spredd over 4–5 arbeidsdager hvis vi kjører sekvensielt uten parallellisering. Kan komprimeres til 2–3 dager hvis Steg C og E går parallelt.

### Avbruddshåndtering — "hva hvis vi blir avbrutt midtveis"

**Trygge stoppunkter (kan pause i dager/uker uten konsekvens):**
- Etter Steg 0.7 (i dag) — vi er her nå
- Etter Steg A — ny tom tabell, null effekt
- Etter Steg B — snapshot + backfill gjort, appen bruker fortsatt gammel vei
- Etter Steg C+D — ny frontend-vei live, gammel vei som fallback, RLS fortsatt åpen
- Etter Steg E — helpers installert, ingen policy bruker dem
- Etter Steg G — alt kjører
- Mellom hver fil i Steg H
- Før/etter Steg I (CSP enforce er uavhengig av RLS-stegene)

**Hard-stopp-steg (MÅ kjøres til ende i én økt):**
- **Steg F (policy-bryter) + Steg G (test-plan):** disse to må gå i sammenhengende økt. Hvis Steg G avslører en kritisk bug må vi fikse med en gang eller rulle tilbake. Appen i "policies strammet men ikke testet"-tilstand er ikke forsvarlig å forlate over natten.
- **Steg B enkeltkjøringen i seg selv må fullføres** (det er én transaksjon), men når den er committet er vi på et trygt stoppunkt igjen.

**Hvis vi pauser i dager mellom steg:**
- Ingen problem frem til Steg F.
- Steg D (observasjonsperioden) kan forlenges så lenge man vil.
- Hvis vi har kjørt Steg C+D+E og så pauser en uke før Steg F: greit, men verifiser at V3 fortsatt er 0 (nye brukere kan ha registrert seg i mellomtiden med det nye frontend-mønsteret, som vi vil — men hvis noen har klart å havne utenfor begge mønstrene må det fanges før Steg F).

### Strukturell svakhet — manglende auth-wrapper (oppfølging etter Fase 2)

**Problem:** `App.tsx` har ingen `ProtectedRoute`-komponent. Alle ruter inkludert `/family-dashboard`, `/coordinator-dashboard`, `/my-shifts`, `/manage-families` er definert som plain `<Route>` uten noen auth-gate. Hver komponent må håndheve auth selv via `supabase.auth.getUser()` eller localStorage. Dette ble oppdaget under ParentSwapPage-fiksen i Steg 0 (commit `50b568a`).

**Hvorfor det er et problem:**
1. **Inkonsistent håndhevelse:** Noen komponenter (f.eks. `FamilyDashboard`) returnerer tomt på `!userId`, andre antar brukeren er innlogget og krasher ved `null`. Dette produserer både lekkasjer og regressjoner.
2. **Dublert auth-logikk:** Den samme "hent auth.getUser, fall tilbake til localStorage, håndter ingen bruker"-blokken er copy-pastet i 20+ filer. Hver duplikasjon er en ny angrepsflate.
3. **Rollebasert ruting eksisterer ikke:** Ingen kode hindrer en forelder-bruker fra å navigere direkte til `/coordinator-dashboard`. URL-ruting er eneste "access control".
4. **Defense-in-depth:** Selv med RLS Fase 2 ferdig er det en god idé å ha en klient-side auth-wrapper som andre lag — hvis en policy har en feil, ser man det som tom skjerm i stedet for lekket data.

**Foreslått løsning (egen runde, ikke pilot-blokkerende):**

```tsx
// src/components/common/ProtectedRoute.tsx
interface Props {
  children: React.ReactNode;
  requireRole?: 'coordinator' | 'parent' | 'substitute' | 'club_admin';
}

export const ProtectedRoute: React.FC<Props> = ({ children, requireRole }) => {
  const [state, setState] = useState<'checking' | 'ok' | 'unauth' | 'wrong_role'>('checking');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState('unauth'); return; }
      if (requireRole) {
        const { data } = await supabase
          .from('team_members')
          .select('role')
          .eq('auth_user_id', user.id)
          .eq('role', requireRole)
          .maybeSingle();
        if (!data) { setState('wrong_role'); return; }
      }
      setState('ok');
    })();
  }, [requireRole]);

  if (state === 'checking') return <LoadingScreen />;
  if (state === 'unauth') { window.location.href = '/login'; return null; }
  if (state === 'wrong_role') return <NoAccessScreen />;
  return <>{children}</>;
};
```

Brukes i `App.tsx`:
```tsx
<Route path="/coordinator-dashboard" element={
  <ProtectedRoute requireRole="coordinator">
    <CoordinatorLayout><CoordinatorDashboard /></CoordinatorLayout>
  </ProtectedRoute>
} />
```

**Grovt arbeidsestimat:**
- Skrive `ProtectedRoute` + `LoadingScreen` + `NoAccessScreen`: 2 timer
- Oppdatere ~30 ruter i `App.tsx` med riktig `requireRole`: 1 time
- Fjerne duplikat auth-logikk fra hver komponent (erstatt med enkel `useCurrentUser()`-hook): 4–6 timer
- Manuell verifisering av alle rolle × rute-kombinasjoner: 2 timer
- **Total: 1–1,5 arbeidsdag**

**Klassifisering:** **Egen runde etter RLS Fase 2. Ikke pilot-blokkerende, men strukturelt viktig.** Denne er en forsvarsdybde-forbedring som reduserer sannsynligheten for at fremtidige utviklere (inkludert CC) introduserer nye lekkasjer av samme type som ParentSwapPage. Avhenger av at `team_members`-tabellen eksisterer (Steg A), så kan tidligst starte etter Steg A.

**Stoppunkt-strategi for denne runden:** hver rute kan oppdateres og deployes individuelt. Ingen hard-stopp. Trygt å kjøre parallelt med Steg H og Steg I.

---

## Oppsummering — åpne spørsmål før Fase 2

Alle fire hovedbeslutninger er låst (se toppen av dokumentet). Gjenstående avklaringer:

1. **`ParentSwapPage.tsx`-lekkasjen** — skal vi fikse frontend (kreve auth før fetch) samtidig med RLS-innstramming, eller skal frontend-fix gå først som en egen "blødnings-stopp"-PR før noe annet? Anbefaling: frontend-fix først, alene.
2. **`unique (team_id, auth_user_id)` vs `unique (team_id, auth_user_id, role)`** på `team_members` — kan en bruker ha flere roller i samme team (f.eks. både `coordinator` og `parent` i samme klubb)? Hvis ja, trenger vi den bredere unique-en.
3. **`club_admin` og `super_admin` — skal vi implementere dem nå eller la det vente?** Jeg anbefaler å ta `club_admin` med i skjemaet nå (billig), men utsette `platform_admins`-tabellen til vi faktisk trenger support-tilgang. Si fra hvis du ønsker noe annet.
4. **`substitute` på tvers av team** — hvordan defineres "vikar kan se åpne vikarjobber globalt"? Skal det være ren `requests.type='substitute' AND is_active=true` uten team-sjekk, eller skal det begrenses til klubber/regioner vikaren eksplisitt har registrert seg på? I dag finnes ikke konseptet "vikar-region" i skjemaet.
5. **`SponsorPage.tsx` — ekstra fix** trengs uansett (sjekk `sponsors_visible`-toggelen, og bytt fra `families`-oppslag til `family_members`-oppslag for points). Ønsker du at dette inkluderes i frontend-antipattern-runden, eller som egen fix?

Når disse fem er avklart, skriver jeg:
- `supabase/migrations/YYYYMMDD_add_team_members.sql` (schema + snapshot-tabeller)
- `supabase/migrations/YYYYMMDD_backfill_auth_user_id.sql` (idempotent datamigrering)
- `supabase/migrations/YYYYMMDD_rls_helpers.sql` (SECURITY DEFINER-funksjoner)
- `supabase/migrations/YYYYMMDD_tighten_rls.sql` (policy-innstramming, én transaksjon)
- `docs/RLS_TEST_PLAN.md` (test-scenarier)
