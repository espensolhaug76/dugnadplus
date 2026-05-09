// vipps-validate-merchant
// =============================================================
// Format-only validering av Vipps Salgssted-nummer (MSN).
//
// Hvorfor ikke API-validering: Vipps API-credentials er bundet til
// spesifikke MSN ved provisjonering. Uten Vipps Partner Program kan
// vi ikke validere arbitrære MSN — vi får 401/403 for alle nummer
// som ikke er knyttet til våre credentials. I test har vi kun
// MSN 486209.
//
// I stedet: vi validerer formatet her (4-7 sifre), og fail-fast
// i vipps-initiate-payment hvis MSN er feil — første mislykkede
// betaling triggerer push-varsel til DA og pauser lotteriet.
// =============================================================

import { CORS_HEADERS, corsResponse, handleOptions } from '../_shared/vipps-auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  if (req.method !== 'POST') {
    return corsResponse({ error: 'Method not allowed' }, 405);
  }

  let body: { vipps_number?: unknown };
  try {
    body = await req.json();
  } catch {
    return corsResponse({ error: 'Invalid JSON' }, 400);
  }

  const raw = typeof body.vipps_number === 'string' ? body.vipps_number.trim() : '';
  if (!raw) {
    return corsResponse({
      valid: false,
      reason: 'invalid_format',
      message: 'Vipps-nummer mangler.',
    });
  }

  // Format: kun siffer, 4-7 lange. Ingen mellomrom, ingen +47, ingen
  // bindestrek. DA skriver inn MSN, ikke privat-nummer.
  if (!/^\d{4,7}$/.test(raw)) {
    return corsResponse({
      valid: false,
      reason: 'invalid_format',
      message: 'Vipps-nummeret må bestå av 4–7 sifre uten mellomrom.',
    });
  }

  console.log(`[validate-merchant] format OK for nummer av lengde ${raw.length}`);

  return corsResponse({
    valid: true,
    msn: raw,
    note: 'Format er gyldig. Vipps-nummeret kontrolleres ved første betaling.',
  });
});
