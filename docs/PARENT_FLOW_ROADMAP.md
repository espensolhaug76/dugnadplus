# Parent Flow Roadmap

Dokumenterer status for parent join/claim-flowen etter 2026-04-13-runden
og hvilke oppfølgingspunkter som gjenstår før pilot + etter pilot.

## Tre runder 2026-04-13

### ✅ Runde 1 — FK-bug + bekreftelse + fjern "uten kode"-vei
- **Commit:** `a3b6fad` (`fix(claim-family): join existing family + confirmation + remove no-code path`)
- **Hva:**
  - ClaimFamilyPage rewritet fra merge-flow til clean "join existing family"-flow
  - Bekreftelse-skjerm (`Du kobler til {barn}, {lag}. Stemmer dette?`)
  - RoleSelectionPage: fjernet "Nei, opprett ny familie"-knapp. Kun "Ja, jeg har en kode" + hjelpetekst
  - Ingen families-rader opprettes lenger fra onboarding-flyten
  - Nye helpers i `src/utils/teamSlug.ts`: `displayTeamName`, `formatChildDisplayName`

### ✅ Runde 2 — Multi-child-støtte
- **Commits:**
  - `ea32850` (`feat(multi-child): family_members.team_id + add child flow`)
  - `2574f3b` (`feat(db): add family_members.team_id column`)
- **Hva:**
  - Ny kolonne `family_members.team_id` (text, nullable) — autoritativ per rad
  - Backfill fra `families.team_id`
  - Partiell index `family_members_team_id_idx`
  - `FamilyDashboard` bruker nå `family_members.auth_user_id`-oppslag (fixer samtidig BUG 2 fra RLS-planen)
  - Ny "+ Legg til barn med kode"-knapp på `FamilyDashboard`
  - `ClaimFamilyPage?mode=add`-branch: flytter barn til innlogget brukers familie, bevarer team_id, sletter ghost-familie hvis foreldreløs

### ✅ Runde 3 — Turnstile + obligatoriske felt + dokumentasjon
- **Commit:** `[dette commitet]` (`feat(security): Cloudflare Turnstile + required parent fields`)
- **Hva:**
  - Cloudflare Turnstile på `/register` og `/join` (step 1)
  - Env var `VITE_TURNSTILE_SITE_KEY` med test-key fallback
  - `/join` step 3: alle fire felt (navn, e-post, telefon, passord) er obligatoriske. `loginMethod`-toggelen er fjernet.
  - Norsk telefon-regex: `/^(\+47)?[ ]?[2-9]\d{7}$/`
  - Passord min 8 tegn (tidligere 6)

## Gjenstående — pre-pilot

### `VITE_TURNSTILE_SITE_KEY` på Netlify
Espen må opprette en Turnstile-site på `https://dash.cloudflare.com/?to=/:account/turnstile`, få site key + secret key, og sette `VITE_TURNSTILE_SITE_KEY` som environment variable på Netlify. Uten dette bruker appen test-key-en `1x00000000000000000000AA` som alltid passerer — nyttig for dev, men gir **null bot-beskyttelse i prod**.

Hoved-site-key'en må være på Netlify før pilot kjøres mot ekte brukere.

### Turnstile server-side verification
I dag verifiseres token kun client-side (dvs. widget-en genererer en token vi sjekker "er satt", men vi kaller ikke Cloudflares `siteverify` API fra server). En bot kan trivielt omgå dette ved å drope Turnstile-widget-en og submit'e direkte.

**Plan:** Egen liten Supabase Edge Function som tar token + kaller `https://challenges.cloudflare.com/turnstile/v0/siteverify` med secret key fra env. Både `/register` og `/join` kalles via edge-funksjonen i stedet for direkte til Supabase Auth / Postgres.

Notert som SECURITY_BACKLOG-entry. Ikke pilot-blokkerende hvis pilot-brukere er klarert KIL-koordinator + noen håndplukkede familier, men MÅ inn før åpen registrering.

## Gjenstående — post-pilot

### Multi-child i koordinator-flows
To steder filtrerer fortsatt families på `families.team_id` og antar én team per familie:
- `src/components/coordinator/CoordinatorDashboard.tsx:143`
- `src/components/coordinator/ManageFamilies.tsx:208`

Etter at multi-child er i bruk i prod vil disse skjule familier fra koordinator-visninger hvor ett eller flere barn er på det aktive teamet men familiens `primary team_id` (families.team_id) er et annet. Fiks: filtrer på `family_members.team_id` i stedet, og vis en familie hvis minst ett av barna er på det aktive teamet.

Ikke blokkerende nå fordi pilot sannsynligvis starter med single-child-familier. Følges opp som del av RLS Steg H (antipattern-runden).

### `/join` → direkte auth-signup
Dagens `/join` oppretter en `pending_parents`-rad og venter på koordinator-godkjenning. Det er dobbeltarbeid for koordinatoren — de godkjenner deretter raden manuelt, som oppretter en auth.users-rad.

Bedre UX: `/join` kaller `supabase.auth.signUp()` direkte med e-post + passord, så inserter `family_members` parent-rad med `auth_user_id` satt. Ingen pending-queue, ingen manuell godkjenning. Koordinator kan fortsatt revokere tilgang hvis nødvendig via en egen moderation-UI.

Krever at Turnstile server-side verification er på plass først (ellers blir `/join` en åpen bot-mål for Supabase-signup-spam).

### SMS-basert innlogging
Dagens `/join` har ingen SMS-flow (vi fjernet loginMethod-toggelen i Runde 3). Hvis vi senere vil tilby SMS-engangskoder som alternativ til passord, må vi:
1. Sette opp en SMS-leverandør (Twilio / AWS SNS / lignende)
2. Integrere med Supabase OTP-auth
3. Legge tilbake en valgknapp på `/join` step 3

Ikke prioritert for pilot.

## Test-plan — parent join flow (oppdatert)

For E2E-testing av hele flyten etter 2026-04-13-runden.

| # | Steg | Forventet |
|---|---|---|
| 1 | Gå til `/register`, fyll inn alle fire felt, løs Turnstile, trykk Opprett | Bruker opprettes, redirect til `/role-selection` |
| 2 | Velg "Jeg er forelder", trykk Fortsett | Code-choice-fase: "Har du fått en kode?" + knapp + hjelpetekst |
| 3 | Trykk "✓ Ja, jeg har en kode" | Redirect til `/claim-family` |
| 4 | Skriv en gyldig kode (f.eks. `KIL8583`), trykk Koble til | Bekreftelse-skjerm: "Du kobler til Adrian H., Håndball Gutter 2016. Stemmer dette?" |
| 5 | Trykk "Ja, det stemmer" | Parent-rad opprettes i eksisterende familie, redirect til `/family-dashboard` med suksess-melding |
| 6 | På dashbordet, verifiser at alle barn i familien vises (inkl. navn, team) | Multi-child-støtte aktiv |
| 7 | Trykk "+ Legg til barn med kode" | Redirect til `/claim-family?mode=add` |
| 8 | Skriv kode for et barn på et annet lag (f.eks. fotball-jenter-2018) | Bekreftelse: "Du legger til Emma H., Fotball Jenter 2018..." |
| 9 | Trykk "Ja, det stemmer" | Barnet flyttes fra ghost-familie til min familie, team_id bevares, ghost-familie slettes hvis foreldreløs, redirect til dashbord |
| 10 | På dashbordet, verifiser at BEGGE barn vises | Multi-child flow komplett |
| 11 | Gå til `/claim-family` i en incognito-fane uten innlogging | Skal feile med "Du må være logget inn" (auth-check) |
| 12 | Bypass Turnstile på `/register` via DevTools (disable JS) og submit | Form-validering skal fortsatt kreve token client-side. Server-side verification er TODO. |
| 13 | Skriv `999` (ugyldig) i telefon-feltet på `/register` | Feil: "Ugyldig telefonnummer" |
| 14 | Skriv `kort` (under 8 tegn) i passord-feltet | Feil: "Passord må være minst 8 tegn" |
