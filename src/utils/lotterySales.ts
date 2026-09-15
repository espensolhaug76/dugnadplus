// Felles telleregel for loddsalg.
// =============================================================
// LotteryAdmin (koordinator), MyLottery (forelder) og
// CampaignOverviewPage MÅ bruke denne. Før 2026-09-15 telte de ulikt:
// forelderen så ALLE rader for familien sin (også avbrutte og
// mislykkede betalinger), mens koordinatoren kun så Vipps-bekreftede.
// Samme lotteri viste dermed to forskjellige tall.
//
// Tre salgsformer, to betalingsmoduser:
//
//   kontant   — payment_method='cash'. Registrert av koordinator som
//               har pengene i hånda. Teller alltid, uavhengig av
//               status-feltet (kontantsalg får aldri Vipps-status).
//
//   deeplink  — vipps_reference IS NULL. Vipps gir ingen callback for
//               deep links, så status blir stående 'CREATED' for
//               alltid. Raden er en REGISTRERING, ikke en bekreftet
//               betaling. Den teller — ellers ville deeplink-lotterier
//               vist 0 solgte lodd — og koordinator avstemmer mot
//               Vipps-kontoen og kan fjerne rader i loddboka.
//
//   ePayment  — vipps_reference satt. Webhook er sannhetskilde, og
//               kun AUTHORIZED/CAPTURED teller. CREATED er et
//               påbegynt kjøp, ikke et salg.
//
// VIKTIG for kallere: spørringen MÅ selecte vipps_reference. Uten
// feltet blir det undefined, og da ser hver eneste rad ut som et
// deeplink-salg — også avbrutte ePayment-kjøp.

export interface CountableSale {
  status?: string | null;
  payment_method?: string | null;
  vipps_reference?: string | null;
}

export const PAID_STATUSES = new Set(['AUTHORIZED', 'CAPTURED']);

export const isCashSale = (s: CountableSale): boolean =>
  s.payment_method === 'cash';

// Deeplink-rad: ingen Vipps-referanse å slå opp mot, og ikke kontant.
export const isDeeplinkSale = (s: CountableSale): boolean =>
  !isCashSale(s) && !s.vipps_reference;

// Bekreftet av Vipps-webhook (kun relevant for ePayment-rader).
export const isVippsConfirmed = (s: CountableSale): boolean =>
  PAID_STATUSES.has(s.status || '');

// Den ene regelen alle flater teller etter.
export const countsAsSold = (s: CountableSale): boolean =>
  isCashSale(s) || isDeeplinkSale(s) || isVippsConfirmed(s);
