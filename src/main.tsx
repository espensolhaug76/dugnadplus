import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './services/supabaseClient'
import './index.css'
import App from './App.tsx'

// ============================================================
// localStorage schema-version-sjekk
// ============================================================
// Versjon 2 (2026-04-13): team_id ble normalisert fra Date.now()-
// timestamps til kanoniske slugs (f.eks. "handball-gutter-2016").
// Tidligere "dugnad_teams"- og "dugnad_active_team_filter"-verdier
// er ugyldige mot den nye DB-en etter wipe. Denne sjekken rydder
// alle team-relaterte nøkler og auth-metadata ved første load av
// den nye koden, slik at brukeren får en ren /setup-team-flow
// i stedet for en usynlig mismatch-tilstand.
const LOCALSTORAGE_SCHEMA_VERSION = '2';
(() => {
  try {
    const current = localStorage.getItem('dugnad_schema_version');
    if (current === LOCALSTORAGE_SCHEMA_VERSION) return;

    // Wipe team-relaterte nøkler. Aggressiv — bedre at noen må
    // velge lag på nytt enn å debugge spøkelses-state.
    const keysToWipe = [
      'dugnad_teams',
      'dugnad_active_team_filter',
      'dugnad_current_team',
      'dugnad_selected_team',
    ];
    keysToWipe.forEach(k => localStorage.removeItem(k));

    // Per-bruker "sist brukte lag"-nøkler (dugnad_last_team_<uid>)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dugnad_last_team_')) {
        localStorage.removeItem(key);
      }
    }

    // Tøm teams-arrayet i auth.users.raw_user_meta_data hvis
    // brukeren er innlogget. Fire-and-forget — vi venter ikke
    // på response siden dette kjøres i load-path.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        supabase.auth.updateUser({ data: { teams: [] } }).catch(() => {});
      }
    }).catch(() => {});

    localStorage.setItem('dugnad_schema_version', LOCALSTORAGE_SCHEMA_VERSION);
  } catch {
    // localStorage kan være deaktivert (private mode, osv.).
    // Ikke la sjekken knekke appen.
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
