import type { DriveStep } from 'driver.js';

export interface GuideDefinition {
  id: string;
  title: string;
  steps: DriveStep[];
}

const step = (selector: string, title: string, description: string): DriveStep => ({
  element: selector,
  popover: { title, description },
});

const GUIDES: Record<string, GuideDefinition> = {
  'coordinator-dashboard': {
    id: 'coordinator-dashboard',
    title: 'Koordinator-dashbord',
    steps: [
      step(
        '[data-guide="coordinator-dashboard-header"]',
        'Velkommen som dugnadsansvarlig',
        'Her styrer du alt for laget ditt. Vi tar en kjapp runde så du vet hvor ting ligger.'
      ),
      step(
        '[data-guide="coordinator-dashboard-onboarding"]',
        'Fire steg før du er i gang',
        'Følg denne listen i rekkefølge. Når alle fire er fullført, er laget klart for sesongen.'
      ),
      step(
        '[data-guide="coordinator-dashboard-new-event"]',
        'Legg inn arrangementer',
        'Legg inn arrangementer du ønsker dugnadsvakter til. Kamper, turneringer, kakelotteri, eller hva enn laget trenger hjelp til.'
      ),
      step(
        '[data-guide="coordinator-dashboard-tabs"]',
        'Resten finner du her',
        'Bla gjennom arrangementer, vakter, familier og historikk etter hvert som du trenger dem.'
      ),
    ],
  },

  'manage-families': {
    id: 'manage-families',
    title: 'Spillere og familier',
    steps: [
      step(
        '[data-guide="manage-families-header"]',
        'Her samler du laget',
        'Du ser alltid familiene som hører til laget du står på. Det første du må gjøre er å få dem inn.'
      ),
      step(
        '[data-guide="manage-families-import"]',
        'Anbefalt: importer fra Spond',
        'Last ned medlemslisten fra Spond og dra den inn her. Alle familier kommer inn på sekunder, med ferdige koder til foreldrene.'
      ),
      step(
        '[data-guide="manage-families-add"]',
        'Eller legg inn manuelt',
        'Hvis en familie kommer til midt i sesongen, legger du dem inn her uten å importere på nytt.'
      ),
      step(
        '[data-guide="manage-families-list"]',
        'Alt ligger samlet',
        'Klikk på en familie for å se foresatte, barn og koden de bruker til å logge inn.'
      ),
    ],
  },

  'lottery-admin': {
    id: 'lottery-admin',
    title: 'Lotteri',
    steps: [
      step(
        '[data-guide="lottery-admin-hero"]',
        'Digital loddbok',
        'Gi hver spiller en personlig salgslenke. Familiene kan også selv legge inn premier de skaffer. Alle pengene går rett til lagets Vipps.'
      ),
      step(
        '[data-guide="lottery-admin-benefits"]',
        'Slik sparer dere tid',
        'Ingen papirlodd, ingen manuell oversikt, ingen tulling med veksel. Systemet teller, trekker vinnere og sender kvittering.'
      ),
      step(
        '[data-guide="lottery-admin-create"]',
        'Klar på to minutter',
        'Du trenger bare navn, pris per lodd, lagets Vipps-nummer og minst én premie. Vi tar deg gjennom resten.'
      ),
    ],
  },

  'kiosk-admin': {
    id: 'kiosk-admin',
    title: 'Kiosk',
    steps: [
      step(
        '[data-guide="kiosk-admin-hero"]',
        'Kiosk på kampdag',
        'Sett opp en enkel meny for kaffe, pølser, kaker eller hva dere selger. Foreldre betaler med Vipps via QR-kode.'
      ),
      step(
        '[data-guide="kiosk-admin-benefits"]',
        'Slipper kontantkassen',
        'Ingen veksel, ingen papirregnskap. Alt betales direkte til laget, og du ser hvert salg fortløpende.'
      ),
      step(
        '[data-guide="kiosk-admin-setup"]',
        'Lag menyen',
        'Legg inn varene dere vil selge med pris. Du får en QR-kode å henge opp ved kiosken.'
      ),
    ],
  },

  'sales-campaign': {
    id: 'sales-campaign',
    title: 'Salgskampanje',
    steps: [
      step(
        '[data-guide="sales-campaign-hero"]',
        'Salgskampanje',
        'Skal dere selge kalendere, sjokolade eller julelys? Her får hver spiller sin egen salgslenke, og du slipper å jage innbetalinger.'
      ),
      step(
        '[data-guide="sales-campaign-benefits"]',
        'Full oversikt, null purring',
        'Alle betalinger går rett til laget. Du ser hvem som har solgt hva, og hvor mange enheter som skal leveres.'
      ),
      step(
        '[data-guide="sales-campaign-create"]',
        'Sett opp første kampanje',
        'Du bestemmer produkt, pris og salgsperiode. Systemet ordner salgslenker og toppliste automatisk.'
      ),
    ],
  },

  'create-event': {
    id: 'create-event',
    title: 'Opprett arrangement',
    steps: [
      step(
        '[data-guide="create-event-team"]',
        'Velg lag',
        'Arrangementet kobles til ett lag. NB! Har du flere lag, sjekk at du står på riktig lag før du oppretter.'
      ),
      step(
        '[data-guide="create-event-name"]',
        'Gi det et navn',
        'Skriv noe konkret som \"Hjemmekamp 8. mai\" eller \"Turnering Kongsvinger Cup\". Det er dette familiene ser.'
      ),
      step(
        '[data-guide="create-event-date"]',
        'Dato, start og slutt',
        'Tidspunktene styrer hvor mange vakter som genereres automatisk.'
      ),
      step(
        '[data-guide="create-event-shifts"]',
        'Hvilke vakter trenger dere?',
        'Vi har satt opp vanlige vakter for sporten du valgte. Huk av de dere faktisk har behov for.'
      ),
      step(
        '[data-guide="create-event-generate"]',
        'La systemet sette opp vakter',
        'Klikk her, så lager vi et utkast basert på tidene og typene du valgte. Du kan justere enkeltvakter etterpå.'
      ),
      step(
        '[data-guide="create-event-assignment"]',
        'Hvem får vaktene?',
        'Automatisk fordeling gir vaktene til familiene med lavest poeng. Du kan også velge manuell, eller la familiene plukke selv.'
      ),
      step(
        '[data-guide="create-event-save"]',
        'Ferdig',
        'Lagre, så publiseres arrangementet til familiene med varsel om vakten de har fått.'
      ),
    ],
  },

  'import-families-before': {
    id: 'import-families-before',
    title: 'Importer familier',
    steps: [
      step(
        '[data-guide="import-upload"]',
        'Last opp medlemslista',
        'Last ned lista fra Spond (se hjelpen rett under), og slipp fila her eller klikk for å velge.'
      ),
      step(
        '[data-guide="import-preview"]',
        'Sjekk at det stemmer',
        'Her ser du de første radene fra fila. Sjekk at navn, lag og foresatte ser riktige ut før du går videre.'
      ),
      step(
        '[data-guide="import-submit"]',
        'Importer alt',
        'Klikk her, så opprettes alle familiene og barna får ferdige koder.'
      ),
    ],
  },

  'import-families-after': {
    id: 'import-families-after',
    title: 'Import ferdig',
    steps: [
      step(
        '[data-guide="import-success"]',
        'Importen er ferdig',
        'Familiene er opprettet, og hvert barn har fått sin egen kode.'
      ),
      step(
        '[data-guide="import-copy"]',
        'Del kodene med foreldrene',
        'Trykk her for å kopiere hele lista. Lim inn i Spond-gruppa eller send på SMS, så har foreldrene det de trenger for å logge inn.'
      ),
    ],
  },

  'lottery-admin-active': {
    id: 'lottery-admin-active',
    title: 'Aktivt lotteri',
    steps: [
      step(
        '[data-guide="lottery-active-header"]',
        'Lotteriet er i gang',
        'Her ser du status på det aktive lotteriet og kan følge med live mens lodd selges.'
      ),
      step(
        '[data-guide="lottery-active-stats"]',
        'Tallene oppdateres direkte',
        'Innsamlet beløp, antall solgte lodd, kjøpere og hvor mange premier som er trukket. Alt i sanntid.'
      ),
      step(
        '[data-guide="lottery-active-progress"]',
        'Fremdrift mot målet',
        'Stolpen viser hvor langt dere er kommet av salgsmålet dere satte.'
      ),
      step(
        '[data-guide="lottery-active-draw"]',
        'Trekk vinnere',
        'Når dere er klare, trykker du her. Trekkingen er tilfeldig og kan ikke styres — alle lodd har lik sjanse.'
      ),
      step(
        '[data-guide="lottery-active-manage"]',
        'Dypdykk',
        'Trenger du å se transaksjoner, justere premier eller se hvem som har solgt mest? Trykk Administrer.'
      ),
    ],
  },

  'lottery-admin-detail': {
    id: 'lottery-admin-detail',
    title: 'Lotteri — administrer',
    steps: [
      step(
        '[data-guide="lottery-detail-tabs"]',
        'Tre visninger',
        'Oversikt viser totalbildet. Transaksjoner viser hvert enkelt salg. Kjøpere viser hvem som har kjøpt og hvor mye.'
      ),
      step(
        '[data-guide="lottery-detail-sellers"]',
        'Hvem selger mest?',
        'Her ser du topplisten over selgere. Fint å dele i Spond etter at lotteriet er ferdig — gir motivasjon til neste runde.'
      ),
      step(
        '[data-guide="lottery-detail-prizes"]',
        'Drag-and-drop rekkefølge',
        'Du kan endre rekkefølgen på premiene ved å dra dem. Den øverste trekkes først.'
      ),
      step(
        '[data-guide="lottery-detail-finish"]',
        'Når alt er solgt og trukket',
        'Trykk Avslutt for å arkivere lotteriet. Det fjernes fra det aktive feltet, men ligger trygt i historikken.'
      ),
    ],
  },

  'kiosk-admin-setup': {
    id: 'kiosk-admin-setup',
    title: 'Kiosk — oppsett',
    steps: [
      step(
        '[data-guide="kiosk-setup-header"]',
        'Bygg menyen',
        'Her setter du opp varene som skal selges. Du kan endre alt senere.'
      ),
      step(
        '[data-guide="kiosk-setup-vipps"]',
        'Først: Vipps-nummeret',
        'Skriv inn lagets Vipps-nummer. Uten det kan ikke kjøpere betale, og kiosken er ikke aktiv.'
      ),
      step(
        '[data-guide="kiosk-setup-add"]',
        'Hvilke varer selger dere?',
        'Legg til vare for vare med navn og pris. Eller bruk standardlista og juster det som passer for klubben.'
      ),
      step(
        '[data-guide="kiosk-setup-menu"]',
        'Justér menyen',
        'Endre pris direkte i feltet, skjul varer som er utsolgt, eller slett det dere ikke selger.'
      ),
      step(
        '[data-guide="kiosk-setup-print"]',
        'Heng opp QR-koden',
        'Print ut QR-koden og legg den ved kiosken. Kjøpere skanner med mobilen, betaler med Vipps, og kvitteringen lander hos dere.'
      ),
    ],
  },

  'coordinator-dashboard-populated': {
    id: 'coordinator-dashboard-populated',
    title: 'Dashbord — daglig drift',
    steps: [
      step(
        '[data-guide="coordinator-dashboard-stats"]',
        'Status akkurat nå',
        'Antall familier, tildelte vakter, hva som krever oppfølging, og når neste arrangement er. Tallene oppdateres mens dere jobber.'
      ),
      step(
        '[data-guide="coordinator-dashboard-pending"]',
        'Uløste vakter',
        'Det gule feltet betyr at noen vakter mangler dekning. Klikk på det for å gå rett til Uløste-fanen.'
      ),
      step(
        '[data-guide="coordinator-dashboard-upcoming"]',
        'Det som skjer fremover',
        'Klikk på et arrangement for å se vakter, hvem som er tildelt, og endre detaljer.'
      ),
      step(
        '[data-guide="coordinator-dashboard-tabs"]',
        'Bytt visning etter behov',
        'Bla mellom Oversikt, Arrangementer, Vakter, Familier og Historikk. Hver fane viser et eget perspektiv på det samme laget.'
      ),
      step(
        '[data-guide="dashboard-familier-ranking"]',
        'Hvem bidrar mest?',
        'I Familier-fanen kan du slå på Poeng-visning og se topplista. Fint å dele i Spond etter en stor dugnadsuke.'
      ),
    ],
  },

  'parent-join': {
    id: 'parent-join',
    title: 'Bli med som forelder',
    steps: [
      step(
        '[data-guide="join-step1-code"]',
        'Skriv inn barnekoden',
        'Du har fått en kode fra dugnadsansvarlig. Skriv den inn her.'
      ),
      step(
        '[data-guide="join-step1-continue"]',
        'Bekreft og gå videre',
        'Marker boksen for å bekrefte at du ikke er en bot. Så slår vi opp barnet ditt.'
      ),
      step(
        '[data-guide="join-step2-name"]',
        'Skriv inn navnet ditt',
        'Hvis du har søsken på laget eller andre lag i klubben, kan du legge til flere koder her. Skriv inn ditt eget navn nederst.'
      ),
    ],
  },

  'family-dashboard-first-time': {
    id: 'family-dashboard-first-time',
    title: 'Velkommen som forelder',
    steps: [
      step(
        '[data-guide="family-dashboard-header"]',
        'Velkommen til Dugnad+',
        'Her er oversikten for familien din. Vi tar en kjapp tur så du vet hvor ting ligger.'
      ),
      step(
        '[data-guide="family-dashboard-points"]',
        'Poengene dine',
        'Du tjener poeng ved å ta vakter. Mer poeng gir bedre nivå, og bedre nivå gir tilgang til fordeler.'
      ),
      step(
        '[data-guide="family-dashboard-shifts"]',
        'Vaktene dine',
        'Vakter du har fått tildelt vises her. Klikk på en for å bekrefte, bytte med noen, eller finne vikar.'
      ),
      step(
        '[data-guide="family-dashboard-add-child"]',
        'Søsken på andre lag?',
        'Har du flere barn i klubben? Bruk denne knappen for å legge dem til samme familie — da slipper du flere kontoer.'
      ),
      step(
        '[data-guide="family-dashboard-nav"]',
        'Naviger her',
        'Hjem, Lodd, Vakter og Familie. Bunnmenyen er alltid synlig.'
      ),
    ],
  },

  'parent-shifts': {
    id: 'parent-shifts',
    title: 'Vaktene dine',
    steps: [
      step(
        '[data-guide="my-shifts-tabs"]',
        'Tre typer vakter',
        'Tilgjengelig viser åpne vakter du kan ta. Mine viser dine egne. Bytte viser vakter du har lagt ut for andre.'
      ),
      step(
        '[data-guide="my-shifts-first-available"]',
        'Klikk for detaljer',
        'Trykk på en vakt for å se tid, sted og hva den går ut på. Du kan reservere den hvis arrangementet er på selvbetjening.'
      ),
      step(
        '[data-guide="my-shifts-tabs"]',
        'Når noe kommer i veien',
        'Har du en vakt du ikke kan ta? Legg den ut for bytte. Andre familier får varsel og kan bytte med deg.'
      ),
    ],
  },
};

export const getGuide = (guideId: string): GuideDefinition | undefined => GUIDES[guideId];
export const listGuideIds = (): string[] => Object.keys(GUIDES);
