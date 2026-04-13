# Security Backlog

Funn fra sikkerhetsrundene som ikke er fikset ennå, men må tas før eller
etter KIL-pilot. Hver bolk lenker tilbake til det auditet som først
identifiserte problemet.

## Post-pilot

### Migrér marketplace-bilder fra base64-localStorage til Supabase Storage
**Kilde:** `docs/UPLOAD_SECURITY_AUDIT.md` — funn U5

I dag lagrer `CreateListingPage.tsx` opplastede bilder som base64 data-URL
i `localStorage['dugnad_marketplace']`. Det gir:

- Klient-side quota-overflow etter få bilder (5–10 MB/origin i moderne
  browsere → `QuotaExceededError` crasher hele appen)
- Ingen deling mellom enheter — hver bruker ser bare bilder hen selv
  lastet opp
- Ingen server-side validering eller stripping av EXIF/GPS-metadata
- Ingen måte å moderere/fjerne upassende bilder sentralt

**Plan:**
1. Opprett `marketplace` Supabase Storage-bucket
2. MIME allowlist på bucket-nivå: `image/jpeg, image/png, image/webp, image/gif`
   (SVG bevisst utelatt — samme begrunnelse som COMMIT 2)
3. File size limit på bucket-nivå: 5 MB
4. RLS policy på `storage.objects`:
   - INSERT: kun koordinator-rolle i samme team som listing'ens `team_id`
   - SELECT: alle innloggede i samme team (eller public hvis
     marketplace skal være synlig for anon)
   - DELETE: opprinnelig uploader eller koordinator
5. Migrér `dugnad_marketplace` fra localStorage til en ny DB-tabell
   `marketplace_listings` med `image_path` som peker inn i bucketen
6. Legg til `transform`-basert auto-resize ved opplasting (Supabase
   støtter dette native)
7. EXIF-strip via en liten edge-funksjon før lagring
8. Flytt midlertidig `MAX_MARKETPLACE_IMAGE_BYTES` fra klient til
   bucket-nivå som autoritativ grense

### Validering av eksterne URL-input (`sponsors.logo_url` m.fl.)
**Kilde:** `docs/UPLOAD_SECURITY_AUDIT.md` — funn U4

`SponsorAdmin.tsx:199` lar koordinator skrive inn en vilkårlig URL som
`sponsors.logo_url`. URL-en rendres senere i `<img src>` og eksponerer
brukerens IP + User-Agent til tredjepart. Ikke direkte XSS (siden `<img>`
ikke eksekverer SVG-script), men:

- Phishing-risiko: en ondsinnet logo kan ligne på en betalingsknapp
- Tracking-piksler
- Mixed content hvis URL-en er `http:` på en `https:` app

**Plan:** Samlet runde med **all** URL-input-validering (ikke bare
sponsor-logo). Skal minst:

1. Kreve `https:`-skjema
2. Blokkere `javascript:`, `data:`, `file:`, `vbscript:`
3. Valgfritt: URL-reachability-check ved lagring (HEAD-request,
   verifiser Content-Type starter med `image/`)
4. Foretrukket løsning: last opp logoen til Storage-bucketen i stedet
   for å holde en ekstern URL — krever at U5-migreringen er gjort

**Andre URL-felter som må gjennom samme runde:** undersøk
`clubs.logo_url`, `marketplace.image` (hvis det noen gang aksepterer
URL i tillegg til upload), event-lokasjon hvis den noen gang blir
hyperlinket. Krever egen grep-runde før vi vet omfanget.

### Cloudflare Turnstile server-side verification
**Kilde:** `docs/PARENT_FLOW_ROADMAP.md` (2026-04-13 Runde 3)

Turnstile-widget er innført på `/register` og `/join` step 1, men
token verifiseres kun ved at client-side-sjekken krever at state
er satt. Widget-en kan trivielt omgås av en bot som submit'er
direkte mot `/register` uten å laste JS.

**Plan:**
1. Opprett en Supabase Edge Function `verify-turnstile` som tar
   token + caller `https://challenges.cloudflare.com/turnstile/v0/siteverify`
   med `TURNSTILE_SECRET_KEY` fra env
2. `/register` og `/join` kaller edge-funksjonen før de submit'er
   til Supabase Auth / `pending_parents`
3. Sett `TURNSTILE_SECRET_KEY` som secret i Supabase-prosjektet
4. Sett `VITE_TURNSTILE_SITE_KEY` i Netlify (gjøres av Espen)

**Status:** Client-side-gating implementert 2026-04-13. Server-side
er TODO. Ikke pilot-blokkerende så lenge pilot kjøres mot klarert
KIL-koordinator + utvalgte familier, men MÅ inn før åpen
registrering går live. Se `PARENT_FLOW_ROADMAP.md` for full plan.

### CSP: enforce etter Report-Only-observasjon
**Kilde:** `docs/UPLOAD_SECURITY_AUDIT.md` — funn C1

COMMIT 4 legger CSP i `Content-Security-Policy-Report-Only` mot
produksjon. Etter 24–48 timer observasjon skal vi:

1. Gå gjennom browser-konsoll-rapporter (eller `report-uri`-endpoint
   hvis satt opp) og fikse false positives
2. Bytt header-navnet fra `Content-Security-Policy-Report-Only` til
   `Content-Security-Policy` (enforce-modus) i `netlify.toml`
3. Deploy og verifiser at ingenting i produksjon knekker

Spesielle ting å sjekke under observasjonen:
- Inline event handlers (`onclick="..."` etc.) — noen kan være igjen
  i rå HTML-strenger et sted
- `eval`-bruk fra tredjeparts-biblioteker
- Ekstern font/CSS/script vi ikke har oppdaget

## RLS-relaterte TODOs (følger av `docs/RLS_POLICY_DESIGN.md`)

### Steg C: oppdater `FamilyDashboard.tsx` til kanonisk oppslag
**Kilde:** BUG 2-diagnose i forrige runde

`FamilyDashboard.tsx:78–82` bruker fortsatt legacy-mønsteret
`families.id = auth.uid()`. Dette:

- Gjør at "Foresatt-visning"-knappen i `CoordinatorLayout.tsx:398` viser
  tom tilstand for koordinatorer (ingen familie-rad med den IDen)
- Breaks ethvert scenario hvor en forelder har koblet seg til familien
  via `family_members.auth_user_id` i stedet for `families.id`

**Fix:** Samme mønster som ble brukt i `ParentSwapPage`-fiksen
(commit `50b568a`): slå opp via `family_members.auth_user_id` først,
fall tilbake til `families.id = auth.uid()` under overgangsperioden.

Skal gjøres som del av RLS Fase 2 Steg C (frontend-oppdatering til
kanonisk oppslag) — ikke som egen patch, for å unngå å røre samme
fil to ganger.
