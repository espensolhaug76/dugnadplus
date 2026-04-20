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
        'TODO: velkomstoverskrift',
        'TODO: forklare hva dashbordet er og hva koordinatoren kan gjøre her.'
      ),
      step(
        '[data-guide="coordinator-dashboard-onboarding"]',
        'TODO: kom-i-gang-listen',
        'TODO: forklare de 4 stegene for å komme i gang (importer, arrangement, tildel, inviter).'
      ),
      step(
        '[data-guide="coordinator-dashboard-new-event"]',
        'TODO: lag første arrangement',
        'TODO: forklare at koordinatoren kan opprette et arrangement her.'
      ),
      step(
        '[data-guide="coordinator-dashboard-tabs"]',
        'TODO: faneoversikt',
        'TODO: forklare hva fanene (Oversikt, Arrangementer, Vakter, Familier, Historikk) inneholder.'
      ),
    ],
  },

  'manage-families': {
    id: 'manage-families',
    title: 'Spillere og familier',
    steps: [
      step(
        '[data-guide="manage-families-header"]',
        'TODO: oversikt over familier',
        'TODO: forklare hva denne siden viser og hvordan familier organiseres.'
      ),
      step(
        '[data-guide="manage-families-import"]',
        'TODO: importer fra Spond',
        'TODO: forklare hvordan man importerer spillere fra Spond via CSV.'
      ),
      step(
        '[data-guide="manage-families-add"]',
        'TODO: legg til familie manuelt',
        'TODO: forklare hvordan legge til en familie uten import.'
      ),
      step(
        '[data-guide="manage-families-list"]',
        'TODO: familielisten',
        'TODO: forklare hvordan man ser og redigerer enkeltfamilier.'
      ),
    ],
  },

  'lottery-admin': {
    id: 'lottery-admin',
    title: 'Lotteri',
    steps: [
      step(
        '[data-guide="lottery-admin-hero"]',
        'TODO: velkommen til lotteri',
        'TODO: forklare hva digitale lodd er og hvorfor det er nyttig for laget.'
      ),
      step(
        '[data-guide="lottery-admin-benefits"]',
        'TODO: fordeler',
        'TODO: peke på fordelskortene og forklare hva loddsalg gir laget.'
      ),
      step(
        '[data-guide="lottery-admin-create"]',
        'TODO: start nytt lotteri',
        'TODO: forklare at knappen åpner et skjema for å sette opp lotteriet.'
      ),
    ],
  },

  'kiosk-admin': {
    id: 'kiosk-admin',
    title: 'Kiosk',
    steps: [
      step(
        '[data-guide="kiosk-admin-hero"]',
        'TODO: velkommen til kiosk',
        'TODO: forklare hva kiosk-funksjonen er og hva den brukes til.'
      ),
      step(
        '[data-guide="kiosk-admin-benefits"]',
        'TODO: fordeler',
        'TODO: forklare fordeler med QR-kode-basert kiosk fremfor kontanter.'
      ),
      step(
        '[data-guide="kiosk-admin-setup"]',
        'TODO: sett opp kiosk',
        'TODO: forklare at knappen åpner oppsett for meny og Vipps-nummer.'
      ),
    ],
  },

  'sales-campaign': {
    id: 'sales-campaign',
    title: 'Salgskampanje',
    steps: [
      step(
        '[data-guide="sales-campaign-hero"]',
        'TODO: velkommen til salgskampanje',
        'TODO: forklare hva salgskampanje er (eks: kalendersalg, julesalg).'
      ),
      step(
        '[data-guide="sales-campaign-benefits"]',
        'TODO: fordeler',
        'TODO: forklare hvordan kampanjen fordeler salgslenker per familie.'
      ),
      step(
        '[data-guide="sales-campaign-create"]',
        'TODO: start ny kampanje',
        'TODO: forklare at knappen åpner skjema for navn, produkt, pris og Vipps.'
      ),
    ],
  },

  'create-event': {
    id: 'create-event',
    title: 'Opprett arrangement',
    steps: [
      step(
        '[data-guide="create-event-team"]',
        'TODO: velg lag',
        'TODO: forklare at arrangementet knyttes til ett lag og hvorfor det er viktig.'
      ),
      step(
        '[data-guide="create-event-name"]',
        'TODO: navn på arrangement',
        'TODO: forklare hva slags navn som gir mening (hjemmekamp, turnering).'
      ),
      step(
        '[data-guide="create-event-date"]',
        'TODO: dato og tid',
        'TODO: forklare at start/slutt-tid styrer vaktgenereringen.'
      ),
      step(
        '[data-guide="create-event-shifts"]',
        'TODO: velg vakter',
        'TODO: forklare vakt-mal per sport og hvordan huke av riktig.'
      ),
      step(
        '[data-guide="create-event-generate"]',
        'TODO: generer vakter',
        'TODO: forklare at systemet deler tidsrommet i vaktslots automatisk.'
      ),
      step(
        '[data-guide="create-event-assignment"]',
        'TODO: tildeling',
        'TODO: forklare auto vs manuell vs selvvalg.'
      ),
      step(
        '[data-guide="create-event-save"]',
        'TODO: lagre arrangement',
        'TODO: forklare at dette publiserer arrangementet til familiene.'
      ),
    ],
  },
};

export const getGuide = (guideId: string): GuideDefinition | undefined => GUIDES[guideId];
export const listGuideIds = (): string[] => Object.keys(GUIDES);
