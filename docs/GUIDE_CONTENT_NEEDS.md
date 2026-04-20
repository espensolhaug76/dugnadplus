# GUIDE_CONTENT_NEEDS.md

Funnrapport for interaktive onboarding-guider i Dugnad+. Skrevet for at
Espen/Claude-i-chat skal kunne forfatte endelig guide-tekst uten å måtte
åpne koden på nytt.

Per fil: hovedflyt (hva brukeren gjør), knapper/elementer som kan
være guide-ankre, foreslått guide-sekvens, og spesielle hensyn
(mobil, asynk, modaler).

Alle guide-ankre bruker `data-guide`-attributt (ikke className/id) —
mer robust mot styling-endringer og markerer tydelig at elementet er
et guide-ankerpunkt.

---

## 1. `src/components/coordinator/CoordinatorLayout.tsx`

### Hovedflyt
Layout-wrapperen rundt alle koordinator-sider. Sjekker at innlogget
bruker har `team_members`-rad med `role = 'coordinator' | 'club_admin'`
— ellers redirect til `/family-dashboard` eller `/login`. Laster lag
gruppert på sport (localStorage + Supabase), tegner sidebar med
team-velger + nav-items, og rendrer `children` i hovedpanelet.
Auto-trigger for guider skjer her via path→guide-id-tabell.

### Elementer (med data-guide-forslag)
- **Team-velger** (sidebar, ~linje 331–344). Brukes til å skifte
  aktivt lag. Data-guide: evt. `data-guide="layout-team-selector"` på
  ytre `<div>` rundt sport-gruppene. Klikk setter
  `dugnad_active_team_filter` og reloader.
- **Navigasjons-items** (Oversikt, Arrangementer, Spillere, Historikk)
  (~linje 360–374). Premium-items (Lotteri, Kampanje, Kiosk) ~linje
  414–427. Kandidater for en egen "navigasjons-guide", men er ikke
  del av de 6 sidegruidene.
- **Logg ut** (~linje 463). Lite aktuelt for onboarding-guide.

### Foreslått guide-sekvens
Ingen egen guide for CoordinatorLayout. Ekvivalent gjøres i
`coordinator-dashboard`-guiden (se under), som bruker den naturlige
innfallsvinkelen når koordinatoren først logger inn.

### Spesielle hensyn
- Auto-trigger (`useEffect` i CoordinatorLayout.tsx) starter guide
  800ms etter at `authGate === 'allowed'` — venter ikke på at
  `children` har fullrendret data. Hvis mål-elementet ikke finnes
  ennå (eks. asynk data-load som ikke er ferdig), hopper `runGuide`
  over stegene med manglende mål og advarer i konsollen. Øk 800ms
  til 1500ms hvis vi ser timing-issues.
- `currentPath = window.location.pathname` er kilden til hvilken
  guide som kjøres. React Router brukes ikke — app-en er en serie
  `window.location.href`-navigasjoner, så full sidereload skjer ved
  hver rutebytting. Auto-trigger-effekten rerunner da som forventet.
- Mobil: sidebaren blir en topbar + hamburger. Guide-ankre som peker
  på sidebar-elementer vil ikke være synlige uten manuell åpning.

---

## 2. `src/components/coordinator/CoordinatorDashboard.tsx`

### Hovedflyt
Dashboard med hilsen ("Hei, {navn}! 👋"), team-badge og "+ Nytt
arrangement"-knapp øverst. Viser en 4-stegs "Kom i gang"-sjekkliste
som gradvis fylles ut (importer → arrangement → tildel vakter →
inviter). Under kommer stat-kort (familier, tildelte vakter,
pending, neste arrangement) og faner: Oversikt, Arrangementer,
Vaktliste, Spillere & familier, Historikk.

### Elementer (med data-guide)
- **Header** (grønn bar med hilsen) —
  `data-guide="coordinator-dashboard-header"` (lagt til). Godt første
  steg.
- **"+ Nytt arrangement"-knapp** (hvitt, høyre i header) —
  `data-guide="coordinator-dashboard-new-event"` (lagt til). Går til
  `/create-event`.
- **Onboarding-listen** — `data-guide="coordinator-dashboard-onboarding"`
  (lagt til). Kun synlig så lenge `completedCount < 4`. Hvis brukeren
  allerede har fullført alt (ikke typisk for førstegangs-bruker),
  hopper guide-logikken over steget fordi selektoren ikke matcher.
- **Fane-rad** — `data-guide="coordinator-dashboard-tabs"` (lagt til).
- **GuideButton "Vis guide"** er plassert til venstre for "+ Nytt
  arrangement".

### Foreslått guide-sekvens (4 steg)
1. **Header** — velkomst, forklar rollen.
2. **Onboarding-listen** — pek på 4-stegs-sjekklisten, forklar at
   dette er veien gjennom de første 5 minuttene.
3. **+ Nytt arrangement** — forklar hurtigvei til å legge inn
   første kamp/arrangement.
4. **Fane-rad** — peker på hvor resten av funksjonaliteten ligger
   (arrangementer, familier, historikk).

### Spesielle hensyn
- Fane-rad kan bli smal på mobil (overflow-x). driver.js-popover
  håndterer dette, men piler kan feile hvis elementet er utenfor
  viewport — bør testes.
- Onboarding-seksjonen forsvinner når alle 4 er fullført.
  Guide-steget for den vil da hoppes over.
- `stats.pendingShifts > 0` viser en gul varselbanner — ikke
  tagget, ikke primær for guide.

---

## 3. `src/components/coordinator/ImportFamilies.tsx`

### Hovedflyt
To tydelige faser:
1. **Før import**: upload-boks for Excel/CSV → viser
   forhåndsvisningstabell (maks 20 rader) → "🚀 Importer og generer
   koder"-knapp.
2. **Etter import** (når `importResults.length > 0`): grønt
   suksess-kort med tabell over opprettede familier + koder,
   "📋 Kopier liste for Spond"-knapp og "Start ny import"-knapp.

Ingen `data-guide`-attributter lagt til i denne iterasjonen — siden
er ikke en av de 6 primære guide-sidene (`manage-families` er det
som peker hit). Men hvis vi senere vil lage en dedikert
`import-families`-guide, er det disse elementene som bør tagges:

### Elementer (ikke tagget ennå)
- File-input (`~linje 304–309`). Foreslått: `data-guide="import-upload"`.
- Forhåndsvisning-tabell (`~linje 320–344`). Synlig kun etter
  `parsedData.length > 0`. Foreslått: `data-guide="import-preview"`.
- "🚀 Importer og generer koder"-knapp (`~linje 346`). Foreslått:
  `data-guide="import-submit"`.
- Suksess-kort + "📋 Kopier liste for Spond" (`~linje 270–298`).
  Bare synlig når `importResults.length > 0`.

### Foreslått guide-sekvens
Ikke definert i denne iterasjonen. Hvis vi lager en guide her, må
den trolig være **tofaset**: første steg peker på file-input før
opplasting, og et oppfølgings-steg (eget trigger eller via
`runGuide('import-families-after')`) peker på kopier-knappen etter
vellykket import.

### Spesielle hensyn
- Forhåndsvisningstabellen vises først etter fil er valgt.
  Tidsvindu kan være ~100–500ms for parsing (XLSX-filer er tregere
  enn CSV).
- Suksess-state reloader ikke siden — "Start ny import" kaller
  `window.location.reload()`.

---

## 4. `src/components/coordinator/ManageFamilies.tsx`

### Hovedflyt
Koordinatoren ser alle registrerte familier (team-avgrenset), kan
søke/filtrere, utvide hver familie for å se foresatte + barn +
join-koder. Handlinger per familie: rediger medlem, skjerm barn,
administrer verv, generer invitasjon. Øverst: "+ Ny familie"
(manuell) og "📁 Importer" (CSV-flyt til `/import-families`).

### Elementer (med data-guide)
- **Header** (h1 + stats + knapp-rad) —
  `data-guide="manage-families-header"` (lagt til).
- **"📁 Importer"-knapp** —
  `data-guide="manage-families-import"` (lagt til). Går til
  `/import-families`.
- **"➕ Ny familie"-knapp** —
  `data-guide="manage-families-add"` (lagt til).
- **Familieliste** (container rundt `filteredFamilies.map`) —
  `data-guide="manage-families-list"` (lagt til).
- Knapp-rad inneholder også "Velg flere" (bulk), "Eksporter CSV",
  "Invitasjon" — ikke tagget, ikke primære for onboarding.
- **GuideButton "Vis guide"** plassert først i høyre knapp-rad.

### Foreslått guide-sekvens (4 steg)
1. **Header** — forklar hva denne siden er (samling av
   familier/spillere) og hvorfor den er viktig.
2. **Importer** — for første-gangs-bruk er dette hovedveien.
   Peker på Spond-flyten.
3. **Ny familie** — alternativet når man ikke har Spond-CSV
   (eks. ny familie midt i sesongen).
4. **Familielisten** — forklar at cards kan utvides, og at koder
   vises per barn.

### Spesielle hensyn
- Når familier = 0: listen er tom, men `data-guide="manage-families-list"`-
  containeren eksisterer fortsatt. Guide fungerer.
- Flere modaler kan åpne fra denne siden (skjermings-modal,
  invitasjon, verv, edit-member). Modaler er ikke guide-mål — de er
  ephemer og åpnes via brukerhandling som burde være tydelig uten
  guide.
- Stor fil (1200+ linjer). Finn-og-erstatt i fil er risikabelt —
  vær presis med selektorer.

---

## 5. `src/components/coordinator/LotteryAdmin.tsx`

### Hovedflyt
Tre hovedtilstander:
1. **Ingen lotteri** (empty state, linje ~989 og utover): hero
   "Lag et loddsalg på 2 minutter" + fordelskort + "Slik gjør du
   det" + "+ Opprett nytt lotteri"-knapp (linje ~736) og
   "Start nytt loddsalg"-knapp i hero (linje ~998).
2. **Mellom-side med aktivt/utkast-lotteri** (linje ~552): header,
   stat-kort, forhåndsvisning, premier, arkivliste.
3. **Detaljvisning** (linje ~740): transaksjoner, kjøpere,
   trekning.

### Elementer (med data-guide)
- **Hero** (empty state) — `data-guide="lottery-admin-hero"` (lagt til).
- **Fordel-kort-grid** — `data-guide="lottery-admin-benefits"` (lagt
  til).
- **"Start nytt loddsalg"-knapp (i hero)** —
  `data-guide="lottery-admin-create"` (lagt til). Åpner modal.
- **GuideButton** plassert øverst høyre i empty-state header-raden.
- "+ Opprett nytt lotteri"-knapp (linje 736) — vises i mellom-
  siden/arkivlisten, ikke tagget. Duplikat av hero-knappen men på
  en annen tilstand.
- "Nytt lotteri"-modalen (~linje 1059–1157) er bevisst IKKE
  guide-mål. Modaler åpnes ved brukerhandling og er kontekst-
  sensitive.

### Foreslått guide-sekvens (3 steg)
1. **Hero** — forklar digital loddsalg og hvorfor det er mer
   effektivt enn papir.
2. **Fordel-kort** — pek på de 6 fordelene kort, kan være
   1-setnings-ping.
3. **Start-knappen** — fortell at klikket åpner et kort skjema
   med navn, pris, mål, Vipps og premier.

### Spesielle hensyn
- Hero vises KUN i empty-state (når `lottery` er null og ingen
  draft finnes). Etter første opprettede lotteri ser bruker
  mellom-siden i stedet → guiden vil ikke vise hero-steget da.
  Auto-trigger vil bare kjøre én gang per guide uansett, og
  `markGuideSeen` lagres etter første vellykkede kjøring.
- `runGuide` filtrerer bort steg med manglende mål-elementer før
  det kaller `driver.drive()`. Hvis en returnerende bruker klikker
  "Vis guide" i mellom-siden, vil alle tre steg mangle og guiden
  logger en advarsel og kjører ikke. Dette er OK for V1 men kan
  forbedres med state-spesifikke guider senere.

---

## 6. `src/components/kiosk/KioskAdmin.tsx`

### Hovedflyt
To tilstander:
1. **Empty state** (linje ~274): hero "Sett opp kiosken på 2
   minutter" + fordelskort + "Sett opp kiosk"-knapp som toggler
   `showSetup = true`.
2. **Admin-visning** (linje ~337): Vipps-nummer + kiosk-lenke,
   meny (vareliste), "+ Legg til ny vare"-form, salgshistorikk,
   Print QR + Kopier lenke.

### Elementer (med data-guide)
- **Hero (empty state)** — `data-guide="kiosk-admin-hero"` (lagt
  til).
- **Fordel-kort** — `data-guide="kiosk-admin-benefits"` (lagt til).
- **"Sett opp kiosk"-knapp (i hero)** —
  `data-guide="kiosk-admin-setup"` (lagt til). `setShowSetup(true)`.
- **GuideButton** på både empty-state og admin-visning, øverst i
  "Tilbake"-raden.
- Ikke tagget: add-item-form, Print-QR-knapp, Vipps-feltet,
  meny-listen. Disse er relevante for en "admin-visning"-guide men
  er ikke i V1.

### Foreslått guide-sekvens (3 steg, empty-state)
1. **Hero** — forklar hva kiosk-modulen er og hva den brukes til
   (kaffe, pølser, kakelotteri på kampdager).
2. **Fordel-kort** — pek på QR-betaling og "slipper kontantkasse".
3. **Sett opp kiosk-knapp** — introduser admin-oppsettet.

### Spesielle hensyn
- Etter bruker klikker "Sett opp kiosk" rendres admin-visningen i
  samme komponent (`showSetup` state). Auto-trigger-guide som kjørte
  i empty-state vil da være ferdig og `markGuideSeen` har allerede
  lagret. Admin-visningen har egen GuideButton men samme guide-ID
  → vil bare vise Hero/Benefits/Setup-knapp som ikke finnes lenger.
  Enten: (a) introdusere `kiosk-admin-setup` som egen guide senere,
  eller (b) oppdatere eksisterende guide til å peke på varer/vipps
  når `showSetup = true`.
- Print QR-knapp bruker `hasPremium()` og åpner modal — ikke
  relevant for V1-guide.
- Mobile: fordel-kort-grid blir kolonne, hero tar hele bredden.
  driver.js håndterer viewport greit.

---

## 7. `src/components/coordinator/SalesCampaignPage.tsx`

### Hovedflyt
Tre hovedtilstander:
1. **Ingen kampanje** (linje ~184): hero "Selg produkter uten
   organiserings-kaos" + fordelskort + "Start ny kampanje"-knapp
   som toggler `showCreate = true`.
2. **Aktiv/utkast-kampanje** (linje ~349): header med
   kampanje-info, stats-grid, progresjonsbar, toppliste med
   selgere, purre-knapp.
3. **Avsluttet** (linje ~287): leveringsliste + CSV-eksport.

### Elementer (med data-guide)
- **Hero (empty state)** — `data-guide="sales-campaign-hero"` (lagt
  til).
- **Fordel-kort** — `data-guide="sales-campaign-benefits"` (lagt
  til).
- **"Start ny kampanje"-knapp (i hero)** —
  `data-guide="sales-campaign-create"` (lagt til).
- **GuideButton** øverst, ved siden av tilbake-knappen.
- Ikke tagget: form-feltene inni `showCreate` (kampanjenavn,
  produkt, pris, vipps, datoer) — modal-lignende, ephemer.

### Foreslått guide-sekvens (3 steg, empty-state)
1. **Hero** — forklar at dette er for produktsalg (kalender,
   julestrikk, osv.), ikke for løpende drift.
2. **Fordel-kort** — pek på personlige salgslenker og automatisk
   toppliste.
3. **Start-knappen** — introduser skjemaet.

### Spesielle hensyn
- Som med Lottery: etter første kampanje opprettet er hero borte.
  Guide kjører da ikke (ingen av steg-mål finnes).
- `showCreate`-formen er innebygd som inline-skjema (ikke
  portal-modal), så auto-lukking ved submit skjer via
  `setShowCreate(false)` + `fetchData()`.
- Mobile: fordel-kort-grid kan bli 1-kolonne.

---

## 8. `src/components/coordinator/CreateEvent.tsx`

### Hovedflyt
Lineær form for å opprette ett arrangement:
1. Velg lag (dropdown).
2. Fyll inn navn, dato, start/slutt-tid.
3. Velg sport + vakt-varighet + sted.
4. Huk av vakttyper (forhåndsvalgt per sport).
5. Trykk "✨ Generer vakter" → vaktsone-liste renderes.
6. Juster individuelle vakter (navn/tid/antall/type).
7. Velg tildeling (auto/manuell/selvvalg).
8. "💾 Lagre arrangement" → redirect til `/events-list`.

### Elementer (med data-guide)
- **Lag-velger** — `data-guide="create-event-team"` (lagt til).
- **Navn-input** — `data-guide="create-event-name"` (lagt til).
- **Dato-grid (dato/start/slutt)** —
  `data-guide="create-event-date"` (lagt til).
- **Vakttype-velger (hele boksen med checkboxes)** —
  `data-guide="create-event-shifts"` (lagt til).
- **"✨ Generer vakter"-knapp** —
  `data-guide="create-event-generate"` (lagt til).
- **Tildeling-seksjon** —
  `data-guide="create-event-assignment"` (lagt til).
- **"💾 Lagre arrangement"-knapp** —
  `data-guide="create-event-save"` (lagt til).
- **GuideButton** til venstre for "📅 Flerdag / Turnering".
- Ikke tagget: sport/lengde/sted-gridet, shift-listen etter
  generering (dynamisk).

### Foreslått guide-sekvens (7 steg)
1. **Lag** — forklar at arrangement må knyttes til ett lag.
2. **Navn** — konkret eksempel ("Hjemmekamp 8/9", "Turnering
   helgen").
3. **Dato+tid** — start/slutt styrer hvor mange vaktslots som
   genereres.
4. **Vakttyper** — forhåndsvalgt per sport, kan justeres.
5. **Generer vakter** — nå sammen setter systemet sammen tid +
   typer.
6. **Tildeling** — kort forklaring av auto vs manuell vs selvvalg.
7. **Lagre** — publiserer arrangementet til familiene.

### Spesielle hensyn
- Lange sider — popovers må scrolle seg til riktig element.
  driver.js gjør dette automatisk, men bekrefte at `stagePadding`
  og modal-overlay ikke er i veien for scroll.
- `assignmentMode === 'self-service'` viser ekstra
  dato/tid-inputs — ikke del av guide (for sjeldent brukt i
  V1-onboarding).
- Shift-listen (`shifts.length > 0`) er dynamisk: finnes ikke før
  brukeren klikker "Generer vakter". Et eventuelt steg som peker
  på shift-listen vil feile i auto-trigger; derfor er det ikke
  inkludert i V1-guiden.
- Save-knappen har `disabled={saving}` — påvirker ikke synlighet
  mot guide.

---

## Oppsummering: tilstands-sensitive guider

De fleste guider er bundet til "empty state"-visningen av sine
respektive sider. Dette er bevisst — returnerende brukere trenger
ikke samme introduksjon. Når en returnerende bruker trykker "Vis
guide" i en ikke-empty-state, filtrerer `runGuide` bort
manglende mål og logger en advarsel.

Senere forbedringer å vurdere:
- Guide V2: `coordinator-dashboard-populated` for brukere som
  kommer tilbake og skal lære "Arrangementer"-fanen.
- Guide V2: `lottery-admin-active` for å vise
  sales-dashboard/premie-trekning når et lotteri er live.
- Guide V2: `kiosk-admin-setup` for admin-visningen (varer,
  Vipps, Print QR).
- Multi-page flow: en "første dag"-guide som tar brukeren fra
  dashboard → import → create-event i én sammenhengende kjede.
  Krever state-lagring på tvers av sidereloads (guide-progress
  i localStorage).

## Alle guide-ID-er per 2026-04-20
- `coordinator-dashboard`
- `manage-families`
- `lottery-admin`
- `kiosk-admin`
- `sales-campaign`
- `create-event`

## Reset og testing
Åpne DevTools-konsollen og kjør:
```js
window.resetDugnadGuides()
```
Reloader siden og alle guider vil auto-trigge på nytt.
