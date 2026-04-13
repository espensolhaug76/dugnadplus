// Felles helper for join_code-generering og -normalisering.
//
// `family_members.join_code` er koden en koordinator deler ut til
// foreldre slik at de kan koble seg til barnet sitt via /join eller
// /claim-family. Formatet er {PREFIX}{4 siffer}, f.eks. "KIL8583".
//
// Historikk: tidligere ble koden generert som {PREFIX}-{4 siffer}
// (med bindestrek). Vi dropper bindestreken i nye koder og migrerer
// eksisterende koder via en SQL-migrering, fordi brukere naturlig
// skriver dem både med og uten dash. normalizeJoinCode() gjør input-
// normaliseringen tolerant så begge varianter fungerer — pluss
// whitespace og understrek.
//
// ============================================================
// REGRESSION TESTS (manuelt verifisert 2026-04-13)
// ============================================================
//
// normalizeJoinCode('kon8583')           -> 'KON8583'            ✓
// normalizeJoinCode('KON8583')           -> 'KON8583'            ✓
// normalizeJoinCode('KON-8583')          -> 'KON8583'            ✓
// normalizeJoinCode('kon 8583')          -> 'KON8583'            ✓
// normalizeJoinCode('  KON_8583  ')      -> 'KON8583'            ✓
// normalizeJoinCode('kon-8 5 8 3')       -> 'KON8583'            ✓
// normalizeJoinCode('')                  -> ''                   ✓
// normalizeJoinCode(null as any)         -> ''                   ✓
// normalizeJoinCode(undefined as any)    -> ''                   ✓
//
// generateJoinCode() er ikke-deterministisk (Math.random), men har
// stabil form: klubb-prefix (maks 3 bokstaver) etterfulgt av 4 siffer
// i intervallet 1000-9999. Eksempler:
//   "KIL8583", "DUG4271", "HØN9901"
// Klubb-prefix hentes fra localStorage.dugnad_club.name, med 'DUG'
// som fallback hvis klubb ikke er satt eller mangler navn.


/**
 * Generer en ny join_code. Prefix hentes fra localStorage.dugnad_club.
 * Returnerer en streng på formen "{PREFIX}{NNNN}", f.eks. "KIL8583".
 */
export function generateJoinCode(): string {
  let prefix = 'DUG';
  try {
    const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
    if (club.name) {
      prefix = club.name
        .replace(/[^a-zA-ZæøåÆØÅ]/g, '')
        .substring(0, 3)
        .toUpperCase();
    }
  } catch {
    // localStorage kan være utilgjengelig — bruk DUG fallback.
  }
  const num = Math.floor(1000 + Math.random() * 9000); // 4-sifret
  return `${prefix}${num}`;
}

/**
 * Normaliser bruker-input til kanonisk join_code-format.
 *
 * Stripper:
 *  - All whitespace (space, tab, newline)
 *  - Bindestrek (-)
 *  - Understrek (_)
 *
 * Uppercaser deretter resultatet. Null/undefined/tom input returnerer
 * tom streng slik at callers kan sjekke `.length === 0` trygt.
 */
export function normalizeJoinCode(input: string): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\s\-_]/g, '')
    .toUpperCase();
}
