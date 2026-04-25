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

---

# V2 — utvidet rapport (2026-04-25)

V1-seksjonen over dekker empty-state-guider for de 6 primære
sidene. V2-seksjonen utvider dekningen til (a) state-spesifikke
guider for sider som har distinkt empty/populated-modus,
(b) tofase-guider for ImportFamilies, og (c) en helt ny
foreldre-onboarding fra /join til /family-dashboard.

Ingen `data-guide`-attributter er lagt til i koden i denne
iterasjonen — dette dokumentet er en kartlegging og forberedelse
for en senere implementasjons-PR.

## 9. `src/components/coordinator/ImportFamilies.tsx` — V2: tofase-guide

### Hovedflyt
Komponenten har to disjunkte UI-tilstander styrt av
`importResults.length`:
- **Fase A — før opplasting** (linje ~300–352): file-input-kort,
  forhåndsvisningstabell (vises etter at fil er parset),
  "🚀 Importer og generer koder"-knapp.
- **Fase B — etter import** (linje ~269–299): grønt suksess-kort
  med 🎉, oversiktstabell over opprettede familier + koder,
  "📋 Kopier liste for Spond"-knapp og "Start ny import".

Disse to fasene er aldri synlige samtidig — fase A renderes når
`importResults.length === 0`, fase B når `>0`.

### Elementer (med foreslåtte data-guide)

**Fase A — før opplasting:**
- File-input-kort (linje ~302–316). Foreslått:
  `data-guide="import-upload"` på den ytre `.card`.
- "✓ Fil valgt: ..."-bekreftelsen (linje 311–315). Vises bare
  etter `setFile`. Ikke hovedanker — informativ.
- Forhåndsvisning-tabell (linje ~320–344). Vises kun etter
  `parsedData.length > 0` (asynk parsing). Foreslått:
  `data-guide="import-preview"` på den ytre `.card`.
- "🚀 Importer og generer koder"-knapp (linje 346). Foreslått:
  `data-guide="import-submit"`. Disabled mens `importing === true`.

**Fase B — etter import:**
- Suksess-kort wrapper (linje ~270). Foreslått:
  `data-guide="import-success"`.
- "📋 Kopier liste for Spond"-knapp (linje 275). Foreslått:
  `data-guide="import-copy"`.
- Resultat-tabellen (linje ~278–297). Foreslått:
  `data-guide="import-results"`.
- "Start ny import"-knapp (linje 298). Triggrer
  `window.location.reload()`.

### Foreslått guide-sekvens

**`import-families-before` (3 steg, fase A):**
1. **Upload-kort** — forklar at man kan dra inn både Excel/CSV
   fra Spond-eksport, og at filen må være "For import"-eksporten.
2. **Forhåndsvisning** — kjøres bare hvis `parsedData.length > 0`.
   Forklarer at brukeren ser de første 20 radene og at navn,
   lag og foresatte er lest ut korrekt.
3. **Importer-knapp** — siste steg, "Klikk her for å opprette
   familier i Dugnad+ og generere koder."

**`import-families-after` (2 steg, fase B):**
1. **Suksess-kort** — bekrefter at importen er ferdig og at
   koder er klare.
2. **Kopier-knapp** — forklarer at lista kan limes inn rett i
   Spond eller SMS for distribusjon til foreldrene.

### Spesielle hensyn
- Asynk-parsing: `parsedData` settes i `reader.onload`, ~50–500ms
  etter file-input-change. En guide som kjører
  `import-families-before` umiddelbart vil ikke se preview-kortet
  i steg 2 hvis brukeren ikke har lastet opp ennå — `runGuide`
  vil hoppe over steget.
- Tofase = to separate auto-triggere. Fase B trigges naturlig
  ikke av path-endring (siden URL-en er den samme). Foreslås
  trigget enten:
  (a) manuelt via `runGuide('import-families-after')` rett etter
      vellykket `setImportResults`, eller
  (b) en `useEffect` som watcher `importResults.length` og kaller
      `runGuide` ved overgang fra 0 til >0.
- Suksess-kortet erstatter HELE fase A i samme komponent (ingen
  ruting), så `markGuideSeen('import-families-before')` bør
  lagres når importen lykkes selv om brukeren ikke trykket
  "Neste" gjennom hele guiden.
- "Start ny import" reloader siden → fase A vises igjen → guide
  V1 vil auto-trigge på nytt hvis ikke `markGuideSeen` har vært
  satt for denne guide-ID-en.

---

## 10. `src/components/coordinator/LotteryAdmin.tsx` — V2: aktivt lotteri

### Hovedflyt
Når `lottery !== null` har siden to underfaser, styrt av
`showDetail`:

- **Mellomside** (`lottery && !showDetail`, linje ~552–741):
  active-header med 🎟️ + lotterinavn, "Aktivt"/"Utkast"-badge,
  4-stat-grid (innsamlet, lodd solgt, kjøpere, trukket),
  progress-bar mot mål, forhåndsvisning av kjøperen-vinkelen,
  trekningsknapp, vinnerliste, gjenstående premier, arkivlisten,
  "+ Opprett nytt lotteri".
- **Detaljvisning** (`lottery && showDetail`, linje ~744–984):
  header med "💵 Kontantsalg / 📦 Avslutt / 🗑️"-knapper,
  stat-grid, faner (📊 Oversikt / 📋 Transaksjoner / 👥 Kjøpere),
  topp-selgere-liste med stolpediagram, innstillinger
  (loddpris, mål, Vipps-nr), drag-and-drop premielistje,
  legg til ny premie-form, transaksjonstabell med søk og sort,
  kjøperliste med CSV-eksport, kontantsalg-modal.

### Elementer (med foreslåtte data-guide)

**Mellomside (`lottery-admin-active`):**
- Active-header med navn + status-badge (linje 562). Foreslått:
  `data-guide="lottery-active-header"`.
- 4-stat-grid (linje 580). Foreslått:
  `data-guide="lottery-active-stats"`.
- Progress-bar (linje 600, vises kun når `goal > 0`). Foreslått:
  `data-guide="lottery-active-progress"`.
- Trekningsknapp (linje 644, vises kun når `prizesLeft > 0`).
  Foreslått: `data-guide="lottery-active-draw"`. Disabled før
  første lodd er solgt.
- "Administrer →"-knapp (linje 575). Foreslått:
  `data-guide="lottery-active-manage"` — leder til detaljvisning.
- Arkiv-listen (linje 689, vises kun når
  `archivedLotteries.length > 0`). Foreslått:
  `data-guide="lottery-active-archive"`.

**Detaljvisning (`lottery-admin-detail`):**
- Topplinje "Avslutt"-knapp (linje 753). Foreslått:
  `data-guide="lottery-detail-finish"`. Viktig for å avslutte
  lotteri og arkivere.
- "💵 Kontantsalg"-knapp (linje 752). Foreslått:
  `data-guide="lottery-detail-cash"`.
- Faner (linje 790). Foreslått:
  `data-guide="lottery-detail-tabs"`.
- Topp-selgere-blokken (linje 805, kun hvis
  `sellerStats.length > 0`). Foreslått:
  `data-guide="lottery-detail-sellers"`.
- Premie-listen med drag-handles (linje 846). Foreslått:
  `data-guide="lottery-detail-prizes"`.
- Innstillinger (loddpris, mål, Vipps) (linje 831). Foreslått:
  `data-guide="lottery-detail-settings"`.

### Foreslått guide-sekvens

**`lottery-admin-active` (5 steg, mellomside):**
1. **Active-header** — "Lotteriet ditt er aktivt. Her er en
   rask oversikt."
2. **Stat-grid** — pek på hva tallene betyr og at de oppdateres
   live.
3. **Progress-bar** — bare hvis `goal > 0`, ellers hopp.
4. **Trekningsknapp** — "Når dere er klare for å trekke,
   trykker dere her. Trekkingen er tilfeldig og kan ikke
   manipuleres."
5. **Administrer →** — peker på dypdykket for transaksjoner,
   premier og kjøpere.

**`lottery-admin-detail` (4 steg, detaljvisning):**
1. **Faner** — forklar Oversikt vs Transaksjoner vs Kjøpere.
2. **Topp-selgere** — "Her ser du hvem som har solgt flest
   lodd — kult å vise topplisten i Spond etterpå."
3. **Premier** — "Du kan endre rekkefølgen ved å dra. Den
   første premien trekkes først."
4. **Avslutt** — "Når lotteriet er ferdig og alle premier er
   trukket, trykker du Avslutt for å arkivere det."

### Spesielle hensyn
- Sidereload skjer ikke ved `setShowDetail(true)` — det er
  client-state. `runGuide` kan trigges manuelt fra "Vis guide"-
  knappen, men auto-trigger på path er ikke nyttig.
- Trekningsknappen er disabled før første lodd er solgt.
  Driver.js highlighter den fortsatt visuelt, men brukeren kan
  ikke utføre handlingen — guide-teksten må forklare premissen.
- Arkivlisten kan være tom — hopp over steget hvis
  `archivedLotteries.length === 0`.
- Mellomside og detalj deler samme URL (`/lottery-admin`).
  Hvilken guide som kjører må avgjøres av komponent-state, ikke
  path. Anbefalt: la `LotteryAdmin` selv kalle
  `runGuide(showDetail ? 'lottery-admin-detail' : 'lottery-admin-active')`
  i en `useEffect` som watcher `[lottery?.id, showDetail]`.
- Drag-and-drop premielistje: `dnd-kit`-håndtak skjuler seg
  hvis listen er tom. Steg 3 i detail-guide hopper over hvis
  `lottery.prizes.length === 0`.

---

## 11. `src/components/kiosk/KioskAdmin.tsx` — V2: admin-visning

### Hovedflyt
Når `items.length > 0` ELLER `showSetup === true` rendres
admin-visningen (linje ~337–561):
- Active header bar med "Kiosk" + antall aktive varer + Print
  QR-kode-knapp + Kopier lenke-knapp.
- Stats-grid (3 kort, vises bare hvis `totalAllSales > 0`).
- Innstillinger-seksjon: Vipps-nummer-input + skrivebeskyttet
  kiosk-lenke + "Kopier"-knapp.
- Meny-seksjon: grid av varekort med ikon, navn, pris-input,
  Skjul/Vis, Slett. "Legg til standardvarer"-knapp hvis listen
  er tom. Inline "+ Legg til ny vare"-form (ikon, navn, pris).
- Salgshistorikk-seksjon: liste av kampdager med totalbeløp og
  topp-vare (vises bare hvis `salesByEvent.length > 0`).

### Elementer (med foreslåtte data-guide)
- Active header (linje 351). Foreslått:
  `data-guide="kiosk-setup-header"`.
- Print QR-knapp (linje 360). Foreslått:
  `data-guide="kiosk-setup-print"`. Premium-gated.
- Vipps-nummer-input (linje 399). Foreslått:
  `data-guide="kiosk-setup-vipps"`. Obligatorisk for at
  kiosken faktisk skal funke for kjøpere.
- Kiosk-lenke + Kopier (linje 410). Foreslått:
  `data-guide="kiosk-setup-link"`.
- Meny-grid med varekort (linje 443). Foreslått:
  `data-guide="kiosk-setup-menu"`.
- "Legg til standardvarer"-knapp (linje 433, kun når listen er
  tom). Foreslått: `data-guide="kiosk-setup-seed"`.
- "+ Legg til ny vare"-form (linje 484). Foreslått:
  `data-guide="kiosk-setup-add"`.
- Salgshistorikk (linje 531, kun hvis salg finnes). Foreslått:
  `data-guide="kiosk-setup-history"`.

### Foreslått guide-sekvens (`kiosk-admin-setup`, 5 steg)
1. **Active header** — "Bra! Du er inne på admin-visningen.
   Her bygger du menyen."
2. **Vipps-nummer** — "Aller først: skriv inn Vipps-nummeret
   til laget. Uten det kan ikke kjøpere betale."
3. **Legg til standardvarer / + Legg til ny vare** — to
   alternative steg basert på `items.length`. Hvis listen er
   tom, peker på "Legg til standardvarer". Ellers peker på
   "+ Legg til ny vare"-formen.
4. **Meny-grid** — "Her ser du varene. Endre pris direkte i
   feltet, skjul varer som er utsolgt, eller slett dem."
5. **Print QR-kode** — "Når menyen er klar, print QR-koden og
   heng den opp ved kiosken. Kjøpere skanner og betaler selv."

### Spesielle hensyn
- Print QR-knappen er premium-gated via `hasPremium()`. Hvis
  brukeren ikke har premium åpnes `PremiumGateModal` ved klikk.
  Guiden kan fortsatt peke på knappen — interaksjonen er ikke
  nødvendig under guide-kjøring.
- Vipps-nummer lagres on-blur via `saveVipps`. Hvis brukeren
  bare skanner gjennom guiden uten å fylle inn, vil kiosken
  ikke fungere før Vipps er lagt inn — guideteksten bør
  understreke dette.
- Overgang fra empty-state til admin er enten via "Sett opp
  kiosk"-knappen (`setShowSetup(true)`) eller ved at varer
  finnes fra før (`items.length > 0`). Ingen sidereload —
  samme URL `/kiosk-admin`. Auto-trigger basert på path er
  ikke nok; må triggges fra komponentstate.
- Salgshistorikk er ofte tom på første besøk — guide-steg som
  peker på den skal hoppe når `salesByEvent.length === 0`.
- Kiosk-lenken (`kioskUrl`) er en read-only deltagsel-URL
  som er gyldig så snart Vipps er lagt inn. Bruker den til
  QR-generering.

---

## 12. `src/components/coordinator/CoordinatorDashboard.tsx` — V2: populated state

### Hovedflyt
Når `completedCount === 4` (alle 4 onboarding-steg fullført)
forsvinner `coordinator-dashboard-onboarding`-blokken
(`showOnboarding === false`, linje 328 + 335). Det brukerne ser
er da:
- Header med hilsen + GuideButton + "+ Nytt arrangement"
  (uendret fra V1).
- Eventuelt gult varselbanner øverst hvis `pendingShifts > 0`
  (linje 270).
- 4-stat-grid: Familier, Tildelte vakter, Pending/Krever
  oppfølging, Neste arrangement (linje 367).
- "Kommende arrangementer"-listen (linje 387).
- Status-listen med uløste vakter (linje 419).
- Fanene Oversikt / Arrangementer / Vaktliste / Spillere &
  familier / Historikk (uendret).

Returnerende brukere kommer altså inn på en datatung side, ikke
en velkomst.

### Elementer (med foreslåtte data-guide)
- Header (linje 236) — gjenbrukes,
  `data-guide="coordinator-dashboard-header"` finnes alt.
- Varselbanner for pendingShifts (linje 270, kun hvis `> 0`).
  Foreslått: `data-guide="coordinator-dashboard-pending"`.
- 4-stat-grid (linje 367). Foreslått:
  `data-guide="coordinator-dashboard-stats"`.
- "Kommende arrangementer"-listen (linje 387, kun hvis
  `upcomingEvents.length > 0`). Foreslått:
  `data-guide="coordinator-dashboard-upcoming"`.
- Fanene (linje 283) — gjenbrukes,
  `data-guide="coordinator-dashboard-tabs"` finnes alt.
- Arrangementer-fane: "+ Nytt arrangement"-knapp øverst i
  fane-innholdet (linje 445). Ikke tagget — knapp i header har
  allerede tag.
- Vaktliste-fane (linje 536): hver event-rad med åpne/lukk-
  toggle. Foreslått: `data-guide="dashboard-vakter-event"` på
  første event-card.
- Familier-fane (linje 594): "🏆 Poeng"-toggle (linje 619) for
  ranking-visning. Foreslått: `data-guide="dashboard-familier-ranking"`.

### Foreslått guide-sekvens (`coordinator-dashboard-populated`, 5 steg)
1. **Stat-grid** — "Her er status for laget akkurat nå.
   Tallene oppdateres mens dere jobber."
2. **Pending-banner** — kun hvis `pendingShifts > 0`. "Du har
   uløste vakter — det gule feltet tar deg rett til Uløste-
   fanen."
3. **Kommende arrangementer** — "Klikk på et arrangement for å
   se vakter og hvem som er tildelt."
4. **Fanene** — "Bla mellom oversikten, arrangement-listen,
   vaktene og familiene etter hva du jobber med akkurat nå."
5. **Familie-rangering** — "Trykk Poeng-toggle for å se
   topplisten — hvem av familiene som har bidratt mest."

### Spesielle hensyn
- Guide-ID-en `coordinator-dashboard` er allerede tatt av
  V1-empty-state-guiden. V2 bør være en separat guide-ID:
  `coordinator-dashboard-populated`. Auto-trigger må sjekke
  state — kjør V2 kun hvis `completedCount === 4`, og kun
  hvis V2-`markGuideSeen` ikke er satt.
- `upcomingEvents.length === 0` er mulig selv etter
  onboarding (alle arrangementer ferdig). Steg 3 må hoppe.
- Pending-banneret kan lukkes manuelt via X-knappen (linje
  277, manipulerer `style.display`). Hvis den er lukket før
  guide kjører, mangler steg 2 sitt mål — hopp.
- Active-tab styrer hvilket innhold som er synlig. Steg som
  refererer til en bestemt fane (f.eks. familie-ranking) må
  enten først bytte fane via `setActiveTab('familier')` eller
  hoppe hvis ikke i riktig tab. Guide-systemet støtter ikke
  state-mutering nativt — anbefaling: hold V2-guiden til
  elementer synlige uavhengig av tab (header, stats, banner,
  upcoming-listen).
- Mobile: stat-grid og 4-kolonne kan kollapse til 2x2 eller
  1-kolonne. Driver.js håndterer viewport, men piler kan
  feile på smale skjermer.

---

## 13. Foreldre-flyt — kartlegging

### Sider involvert
1. `/join` — `src/components/onboarding/JoinPage.tsx`
   Inngangs-flyt for foreldre som har fått barnekoder fra
   koordinator. Tre-stegs wizard.
2. `/claim-family` — `src/components/onboarding/ClaimFamilyPage.tsx`
   Brukes (a) for innloggede brukere uten familie, og (b) som
   `?mode=add` for å legge til søsken på et annet lag.
   Toggles via `useCurrentFamily`-hook i FamilyDashboard.
3. `/family-dashboard` — `src/components/family/FamilyDashboard.tsx`
   Forelderens hjemmeskjerm. Poeng, vakter, lotteri, byttebørs,
   vikar-marketplace, sponsorrabatter.
4. `/my-shifts` — `src/components/family/MyShiftsPage.tsx`
   Vakt-detaljvisning. Faner: Tilgjengelig / Mine / Bytte.
5. `/family-members` — `src/components/family/FamilyMembersPage.tsx`
   Familie-administrasjon (legg til medlemmer, sett
   preferanser).

### Onboarding-flyt for ny forelder

Trinn for trinn fra at brukeren åpner /join-lenken:

1. **Lander på `/join`, steg 1**: skriver inn barnekoden
   (eks. "KIL8583"), løser Turnstile-CAPTCHA, trykker Fortsett.
   `lookupCode` slår opp `family_members` på `join_code` og
   matcher mot ett barn.
2. **Steg 2 — bekreft barn**: viser kort med barnets navn,
   familienavn, lagnavn (subgroup). Kan legge til ekstra koder
   for søsken via "+ Legg til en kode til". Skriver inn eget
   navn. Trykker "Ja, dette er mitt barn".
3. **Steg 3 — opprett konto**: skriver inn e-post, telefon,
   passord (alle obligatoriske, valideres med
   `EMAIL_REGEX`/`NORWEGIAN_PHONE_REGEX`/min 8 tegn).
   `handleSubmit` skriver til `pending_parents`-tabellen med
   `status: 'pending'`. Viser suksess-skjerm "Registrering
   mottatt — koordinator vil godkjenne".
4. **Etter godkjenning** (skjer utenfor /join — koordinator
   gjør det fra ManageFamilies). Forelderen får e-post/SMS
   med innloggingsinfo. Logger inn på `/login` → kommer rett
   til `/family-dashboard`.
5. **Førstegangs-besøk på `/family-dashboard`**: ser hilsen
   med eget navn, poeng-progressbar (Basis/Aktiv/Premium-tier),
   "+ Legg til barn med kode"-knapp (leder til
   `/claim-family?mode=add` for søsken). Eventuelt aktivt
   lotteri-banner, innkommende bytte-tilbud, kommende vakter.
   Bunnmeny: Hjem / Lodd / Vakter / Familie.

### Elementer (med foreslåtte data-guide)

**`/join` — alle steg:**
- Steg 1: input-felt (linje 331). Foreslått:
  `data-guide="join-step1-code"`.
- Steg 1: Turnstile-blokken (linje 352). Foreslått:
  `data-guide="join-step1-captcha"`.
- Steg 1: "Fortsett"-knapp (linje 369). Foreslått:
  `data-guide="join-step1-continue"`.
- Steg 2: barne-kort med navn (linje 402). Foreslått:
  `data-guide="join-step2-child"`.
- Steg 2: "+ Legg til en kode til" (linje 464). Foreslått:
  `data-guide="join-step2-add"`.
- Steg 2: parent-name-input (linje 529). Foreslått:
  `data-guide="join-step2-name"`.
- Steg 3: form-felt-grid (linje 583). Foreslått:
  `data-guide="join-step3-form"`.
- Steg 3: "Fullfør registrering"-knapp (linje 624). Foreslått:
  `data-guide="join-step3-submit"`.

**`/claim-family`:**
- Code-input + "Koble til"-knapp (i `phase === 'code'`).
  Foreslått: `data-guide="claim-code"`.
- Bekreftelse-kort (`phase === 'confirm'`). Foreslått:
  `data-guide="claim-confirm"`.

**`/family-dashboard`:**
- Header med navn + poengtier-badge (linje 292). Foreslått:
  `data-guide="family-dashboard-header"`.
- Poeng-progressbar (linje 305). Foreslått:
  `data-guide="family-dashboard-points"`.
- "+ Legg til barn med kode"-knapp (linje 326). Foreslått:
  `data-guide="family-dashboard-add-child"`.
- Lotteri-banner (linje 348, kun hvis `activeLottery`).
  Foreslått: `data-guide="family-dashboard-lottery"`.
- "Dine kommende vakter"-listen (linje 384). Foreslått:
  `data-guide="family-dashboard-shifts"`.
- Bunnmeny (linje 502). Foreslått:
  `data-guide="family-dashboard-nav"`.

**`/my-shifts`:**
- Tab-rad (Tilgjengelig / Mine / Bytte). Foreslått:
  `data-guide="my-shifts-tabs"`.
- Første tilgjengelige vakt-kort. Foreslått:
  `data-guide="my-shifts-first-available"`.

**`/family-members`:**
- Medlems-listen. Foreslått: `data-guide="family-members-list"`.
- Preferanse-seksjonen (utilgjengelige dager, tider). Foreslått:
  `data-guide="family-members-prefs"`.

### Foreslåtte foreldre-guider

Tre separate guider — én per "natural pause"-punkt i flyten:

**Guide F1: `parent-join` (3 steg, kjøres på /join)**
1. **Code-input** — "Skriv inn barnekoden du fikk fra
   koordinator. Den ser typisk ut som KIL8583."
2. **Captcha + Fortsett** — "Bekreft at du ikke er en bot, så
   slår vi opp barnet ditt."
3. **Add-more / parent-name** (etter at barn er funnet) —
   "Har du flere barn på laget eller andre lag i klubben?
   Legg dem til her. Skriv inn ditt eget navn nederst."

   *Merknad:* steg 2 og 3 viser elementer fra ulike
   `step`-states (1 vs 2). Auto-triggerer per `step`-endring —
   se Spesielle hensyn.

**Guide F2: `family-dashboard-first-time` (5 steg, kjøres første
gang på /family-dashboard etter godkjent registrering)**
1. **Header** — "Velkommen til Dugnad+! Her ser du oversikten
   for familien din."
2. **Poeng-progressbar** — "Du tjener poeng ved å ta vakter.
   Mer poeng = bedre tier = sponsorrabatter."
3. **Kommende vakter** — "Vaktene dine vises her. Trykk på en
   for å bekrefte, bytte med noen, eller finne vikar."
4. **+ Legg til barn med kode** — "Har du søsken på et annet
   lag? Bruk denne for å koble dem til samme familie."
5. **Bunnmeny** — "Naviger mellom Hjem, Lodd, Vakter og
   Familie her."

**Guide F3: `parent-shifts` (3 steg, kjøres første gang på
/my-shifts)**
1. **Tabs** — "Tilgjengelig viser åpne vakter du kan ta. Mine
   er dine egne. Bytte viser hva du har lagt ut for bytte."
2. **Første tilgjengelige vakt** — "Klikk på en vakt for å se
   detaljer. Du kan reservere den hvis arrangementet er på
   selvbetjening."
3. **Bytte-faner** — "Når du har tatt en vakt, kan du legge
   den ut for bytte hvis noe kommer i veien."

### Spesielle hensyn

**`/join` er anonym/uautentisert:**
- Brukeren har ingen Supabase-session ennå når de starter på
  /join. `markGuideSeen`-mekanismen baserer seg på
  localStorage, så den fungerer fortsatt — men cross-device
  vil samme bruker se guiden på nytt på en ny enhet. OK for
  V1.
- Turnstile-tokenet må være satt før Fortsett er aktiv. Hvis
  guide auto-trigger kjører før Turnstile er tegnet
  (~200–500ms etter mount), vil steg 2 ikke finne sitt mål.
  Anbefaling: bumper auto-trigger-delay til 1500ms for
  /join, eller pek først på input og overlat captcha til
  bruker-handling.
- Multi-step-wizard: `step === 1`, `step === 2`, `step === 3`
  rendres betinget. En guide som vil dekke alle tre steg
  må enten (a) splittes i tre under-guider med separat
  trigger, eller (b) bruke `runGuide` re-trigger på
  `step`-endring. Anbefalt: én guide per step, slik
  som F1 over (kun fokus på første halvdel av flyten).
- `done === true` viser suksess-skjermen — guide bør markeres
  seen ved overgangen fra `done = false` til `done = true`,
  selv om brukeren ikke nådde siste steg i guiden.

**`/claim-family`-loggikken:**
- Skiller mellom `mode === 'initial'` og `mode === 'add'` via
  query-param. Initial brukes etter første pålogging hvis
  brukeren ikke har en family_members-rad. Add brukes fra
  FamilyDashboard for å legge til søsken.
- `useCurrentFamily`-hook redirecter til `/claim-family` hvis
  `noFamily === true`. Guide-trigger må kjøres ETTER hook'en
  er ferdig sjekket (auth-state === 'ok').
- Modi har ulike behov: initial er onboarding, add er rutine.
  Guide for `mode === 'initial'` bør være velkomst-orientert;
  for `mode === 'add'` ren task-orientert.
- Code-form og confirm-form har ulike DOM-elementer —
  `phase`-state styrer hvilket som rendres. Enkleste løsning
  er én guide som peker kun på code-input (phase 'code') og
  lar bruker fortsette manuelt.

**`/family-dashboard`-timing:**
- Avhenger av `useCurrentFamily`-hook + Supabase-fetch.
  `loading === true` rendres "Laster..." i ~200–800ms før
  hovedskjermen.  Auto-trigger må vente til
  `loading === false`.
- Hilsen ("Hei, {displayName}!") viser parent-navn fra
  `family_members.role = 'parent'` med matching auth-uid.
  Hvis denne mangler (legacy-bruker), faller den tilbake til
  `family.name`. Guide-tekst kan ikke anta at navnet er der —
  hold formuleringen generisk.
- "Kommende vakter"-listen er tom hvis brukeren akkurat har
  blitt godkjent og ikke har fått tildelt vakter ennå.
  Steget hopper. Anbefaling: erstatt med "Tomt-state-tekst"
  hvis `myShifts.length === 0` ("Vaktene dine dukker opp her
  så snart koordinator har tildelt dem").
- Aktivt lotteri-banner og innkommende-tilbud-blokken er
  helt betingede. Ikke inkluder i hoved-guide.
- Mobile er primær-formfaktor for foreldre. Bunnmeny er
  alltid synlig. Header-elementer kan stables vertikalt på
  smale skjermer.

**Foreldre-flyt versus koordinator-flyt:**
- Koordinator-guidene auto-triggrer via `CoordinatorLayout`-
  wrapper. Foreldre-sidene har ingen tilsvarende layout-
  wrapper — `FamilyDashboard`, `MyShiftsPage`, `FamilyMembersPage`
  rendres direkte. En egen `FamilyLayout` eller en hook som
  sjekker path mot guide-id-tabell må introduseres for å få
  auto-trigger på foreldre-siden.
- `GuideButton` finnes i koordinator-pages men ikke i
  family-pages. Må legges inn parallelt med data-guide-
  attributtene.

### Mangler / uklare punkter

- **Betalings-/historikk-side for familier**: ikke funnet som
  egen rute. Lotteri-betalingen skjer via `/my-lottery`
  (`MyLottery.tsx`) — egen salgsflyt, ikke "min historikk".
  Hvis ønsket: en `/family-history`-side med oversikt over
  fullførte vakter, lotterikjøp og kiosk-kjøp må
  spec-es separat. Ikke prioritert for V2-foreldreflyten.
- **Vakt-detaljvisning som egen side**: vakter vises som
  inline-kort på FamilyDashboard og MyShiftsPage. Det finnes
  ingen `/shift/:id`-side. Detalj-handlinger (bekreft, bytt,
  finn vikar) skjer via knapper på kortet og confirms-dialoger.
  Guide-ankre for "vakt-detaljer" må peke på første kort i
  listen.
- **"Vipps-betaling for vikar"-flyten**: når et bud aksepteres
  vises kun en alert("✅ Bud akseptert! Betal {beløp} kr via
  Vipps."). Det finnes ingen embedded payment-flow eller
  bekreftelse-side. Guide bør ikke prøve å dekke dette.
- **`SubstituteMarketplacePage`** og **`ParentSwapPage`**:
  finnes som egne sider men er ikke en del av kjerne-
  onboarding for ny forelder. Vurder eventuelle V3-guider
  her senere.

---

## V2-oppsummering: nye guide-IDer foreslått

Koordinator-side:
- `import-families-before` (3 steg)
- `import-families-after` (2 steg)
- `lottery-admin-active` (5 steg, mellomside)
- `lottery-admin-detail` (4 steg, detaljvisning)
- `kiosk-admin-setup` (5 steg)
- `coordinator-dashboard-populated` (5 steg)

Foreldre-side:
- `parent-join` (3 steg, /join)
- `family-dashboard-first-time` (5 steg, /family-dashboard)
- `parent-shifts` (3 steg, /my-shifts)

Total: 9 nye guider, ~35 nye guide-steg, ~25 nye
data-guide-attributter (mange på elementer som mangler tag i
dag).

## Implementasjons-rekkefølge (forslag)

1. **`import-families-after`** og **`kiosk-admin-setup`** —
   liten scope, ingen ny auth- eller layout-infra. Bra
   testkasus for state-spesifikk auto-trigger.
2. **`lottery-admin-active`** + **`lottery-admin-detail`** —
   krever component-state-basert trigger (ikke path).
3. **`coordinator-dashboard-populated`** — krever
   `markGuideSeen`-overstyring slik at returnerende brukere
   får se den ÉN gang etter onboarding er ferdig.
4. **`family-dashboard-first-time`** + nytt `FamilyLayout`-
   wrapper for auto-trigger på foreldre-pages.
5. **`parent-join`** — krever delay-bumping for Turnstile,
   og vurdering av per-step trigger.
6. **`parent-shifts`** og **`import-families-before`** —
   sekundær prioritet etter at infraen står.
