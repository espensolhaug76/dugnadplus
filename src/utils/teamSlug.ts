// Kanonisk team_id-generator.
//
// Alle team_id-verdier i Dugnad+-databasen skal være URL-safe slugs
// generert via generateTeamSlug(). Formatet er kanonisk og
// deterministisk:
//
//   Lagsporter:         "{sport}-{gender}-{birthYear}"
//                       -> "handball-gutter-2016"
//   Individuelle:       "{sport}-{slug-av-fritekst}"
//                       -> "dans-victory-dance"
//
// Regler for slug-normalisering:
//   1. Lowercase
//   2. Norsk transliterasjon: æ -> ae, ø -> oe, å -> aa
//   3. Alle ikke-alfanumeriske tegn (inkl. mellomrom) byttes til "-"
//   4. Flere dash-er kollapses til én
//   5. Dash trimmes fra start og slutt
//
// Legacy-team_id-er fra før denne refaktoren var numeriske Date.now()
// timestamps ("1774859592394"). isLegacyTeamId() kan brukes defensivt
// for å detektere dem i fremtidig kode.
//
// ============================================================
// REGRESSION TESTS (manuelt verifisert 2026-04-13)
// ============================================================
//
// generateTeamSlug('handball', 'gutter', 2016)
//   -> "handball-gutter-2016"                                   ✓
// generateTeamSlug('fotball', 'jenter', 2015)
//   -> "fotball-jenter-2015"                                    ✓
// generateTeamSlug('dans', undefined, undefined, 'Victory Dance')
//   -> "dans-victory-dance"                                     ✓
// generateTeamSlug('ishockey', 'jenter', 2011)
//   -> "ishockey-jenter-2011"                                   ✓
// generateTeamSlug('dans', undefined, undefined, 'Æ Ø Å test')
//   -> "dans-ae-oe-aa-test"                                     ✓
// generateTeamSlug('handball', 'GUTTER', 2016)
//   -> "handball-gutter-2016"                                   ✓
//
// Ekstra edge cases (ikke i oppdraget men verifisert manuelt):
// generateTeamSlug('  football  ', 'gutter', 2010)
//   -> "football-gutter-2010"      (trim via dash-regex)        ✓
// generateTeamSlug('dans', undefined, undefined, 'Parti -- 1')
//   -> "dans-parti-1"              (kollapser doble dasher)     ✓
// generateTeamSlug('dans', undefined, undefined, '')
//   -> "dans"                      (tom customName faller til lag-mønster,
//                                   men gender+year er også undefined)
//
// isLegacyTeamId('1774859592394') -> true   (13 siffer, Date.now-format)
// isLegacyTeamId('handball-gutter-2016') -> false
// isLegacyTeamId('123') -> false            (for kort)
// isLegacyTeamId('17748595923940') -> false (for lang)


/**
 * Normaliser en vilkårlig streng til en URL-safe slug-del.
 * Se topp-kommentaren for regelsettet.
 */
function normalizeToSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generer kanonisk team_id for et nytt lag.
 *
 * @param sport       Sport-verdi (f.eks. 'football', 'handball', 'dans').
 *                    Tas som den er og slugifiseres.
 * @param gender      Valgfri. For lagsporter: 'gutter' | 'jenter' | 'mixed'.
 *                    For individuelle sporter: utelat.
 * @param birthYear   Valgfri. Årstall som tall. For lagsporter: 2016, 2010, etc.
 *                    For individuelle sporter: utelat.
 * @param customName  Valgfri. Brukes for individuelle sporter (f.eks. Dans)
 *                    hvor laget har et egendefinert navn. Hvis satt,
 *                    overstyrer den gender+birthYear.
 *
 * @returns Slug på formen "{sport}-{gender}-{year}" eller
 *          "{sport}-{custom-slug}".
 */
export function generateTeamSlug(
  sport: string,
  gender?: string,
  birthYear?: number,
  customName?: string
): string {
  const sportSlug = normalizeToSlug(sport);

  if (customName && customName.trim()) {
    return `${sportSlug}-${normalizeToSlug(customName)}`;
  }

  const genderSlug = gender ? normalizeToSlug(gender) : '';
  const yearPart = birthYear ? String(birthYear) : '';

  return [sportSlug, genderSlug, yearPart].filter(Boolean).join('-');
}

/**
 * Detekter om en verdi ser ut som en legacy Date.now()-basert team_id
 * (13-sifret numerisk streng). Returnerer true hvis det ligner en
 * legacy-ID, false for kanoniske slugs eller annet.
 *
 * Defensiv — brukes ikke noe sted i dagens kode, men er tilgjengelig
 * for fremtidig logging/deteksjon hvis vi skulle finne gammel data
 * som slapp gjennom refaktoren.
 */
export function isLegacyTeamId(value: string): boolean {
  return /^\d{13}$/.test(value);
}
