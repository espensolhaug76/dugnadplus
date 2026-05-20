// =============================================================
// Dugnad+ Service Worker — push relay only, ingen caching
// =============================================================
// 2026-05-20:
// Tidligere versjon brukte network-first med install-time
// pre-caching av 3 offline-URLs (/parent-dashboard, /, /join).
// Det forårsaket stale-cache-bugs under KIL-piloten (gamle CSP-
// headers, stale JS-bundles, brukere måtte unregistrere SW
// manuelt fra DevTools). Vi kan ikke be 30 foreldre om å åpne
// DevTools, så all caching er fjernet.
//
// Denne SW-en cacher INGENTING. Den finnes utelukkende for å
// støtte to features som krever en Service Worker:
//
//   1. Push notifications — pushManager.subscribe() krever SW.
//      send-push Edge Function pusher til disse subscriptions.
//   2. Chrome/Android PWA-install — Chrome krever en SW med
//      fetch-handler for at "Legg til på hjemskjerm" skal være
//      tilgjengelig. iOS Safari trenger ikke SW for install.
//
// Fetch-handleren er en BEVISST passthrough. Den lar browseren
// håndtere alle requests direkte via standard HTTP-stack. IKKE
// legg til caching her uten å først forstå hvorfor det ble
// fjernet — se commit-melding for 'fix(sw): remove caching to
// prevent stale-bundle bugs'.
//
// Install-handleren finnes KUN for å trigge self.skipWaiting().
// Den gjør INGEN caching — ikke addAll, ikke put, ikke pre-fetch.
// skipWaiting trengs for at nye SW-versjoner skal aktivere
// umiddelbart i stedet for å henge i waiting-state til alle
// PWA-tabs lukkes (kan ta dager for power-users). IKKE legg til
// pre-caching av offline URLs her — det var nettopp det som
// skapte stale-bundle-bugs vi nettopp fjernet.
//
// Activate-handleren er beholdt som engangs-cleanup: når
// eksisterende brukere får denne SW-en, slettes alle gamle
// cache-buckets (inkludert dugnadplus-v1) automatisk. Det
// rydder opp stale state for alle med den gamle SW-en
// installert, uten manuell DevTools-aksjon.
// =============================================================

const CACHE = 'dugnadplus-v2';

self.addEventListener('install', () => {
  // Ingen caching. Bare hopper over waiting-state slik at nye SW-
  // versjoner aktiverer umiddelbart på neste navigasjon i stedet
  // for å henge i waiting til alle tabs lukkes. Krever ikke
  // e.waitUntil() siden vi ikke gjør noe asynkront.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', () => {
  // Passthrough — ingen caching. Tilfredsstiller Chrome PWA-
  // install-kriteriet (krever fetch-handler) uten å introdusere
  // cache-bugs. Ikke legg til caches.put eller caches.match her.
});

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(self.registration.showNotification(data.title ?? 'Dugnad+', {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/parent-dashboard' },
    actions: data.actions ?? []
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/parent-dashboard';
  e.waitUntil(clients.openWindow(url));
});
