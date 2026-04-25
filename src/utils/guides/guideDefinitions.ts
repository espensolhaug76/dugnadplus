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
};

export const getGuide = (guideId: string): GuideDefinition | undefined => GUIDES[guideId];
export const listGuideIds = (): string[] => Object.keys(GUIDES);
