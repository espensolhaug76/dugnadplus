// CSV-injection-beskyttelse (aka "formula injection").
//
// Bakgrunn:
// Når en CSV-fil åpnes i Excel, LibreOffice Calc eller Google Sheets,
// vil regnearket eksekvere en celle som starter med =, +, -, @, tab (\t)
// eller carriage return (\r) som en formel. En angriper som kan plante en
// streng som `=cmd|'/c calc'!A0` i en celle får dermed kodekjøring på
// maskinen til den som åpner fila. Se OWASP "CSV Injection" / CWE-1236.
//
// Dugnad+-spesifikt: eksporterer kjøres av koordinatorer, men mange
// celleverdier stammer fra anonyme flows (LotteryShop.buyer_name,
// CampaignShop.seller, JoinPage, Excel-import). Dette gir en direkte
// anon → koordinator-desktop RCE-kjede. Derfor må alle CSV-celler ut
// gjennom escapeCsvCell() før de konkateneres inn i en rad.
//
// Formatet vi beskytter (beholdt bevisst, norsk Excel-konvensjon):
//   - UTF-8 med BOM (\ufeff)
//   - Semikolon som delimiter
//   - \n som radskiller
//
// Filnavn på nedlastingen er også bruker-kontrollert enkelte steder
// (lottery.name, campaign.title). sanitizeCsvFilename() fjerner tegn
// som kan føre til sti-traversal eller Windows-reserverte navn.

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escape én CSV-celle for trygg konkatenering i en semikolon-separert fil.
 *
 * Regler:
 *  1. Null/undefined → tom streng.
 *  2. Hvis verdien (etter String-konvertering) starter med et
 *     formel-trigger-tegn, prefikses den med en apostrof ('). Apostrofen
 *     gjør at Excel/Calc tolker cellen som ren tekst, ikke formel.
 *  3. Hvis verdien inneholder et av spesialtegnene ; " \n \r, wrappes
 *     hele cellen i double quotes og interne double quotes dobles.
 *
 * Eksempler (dokumenterer den forventede oppførselen):
 *   escapeCsvCell("Ola Nordmann")          → `Ola Nordmann`
 *   escapeCsvCell("=1+1")                  → `'=1+1`
 *   escapeCsvCell("+47 900 00 000")        → `'+47 900 00 000`
 *   escapeCsvCell("-Rabatt")               → `'-Rabatt`
 *   escapeCsvCell("@bruker")               → `'@bruker`
 *   escapeCsvCell("\tinjected")            → `'\tinjected`
 *   escapeCsvCell("Hansen; Olsen")         → `"Hansen; Olsen"`
 *   escapeCsvCell('Sier "hei"')            → `"Sier ""hei"""`
 *   escapeCsvCell("linje 1\nlinje 2")      → `"linje 1\nlinje 2"`
 *   escapeCsvCell("=cmd|'/c calc'!A0")     → `"'=cmd|'/c calc'!A0"`
 *       (både formel-prefix OG wrapping pga. intern ;/" — begge lagene
 *        trengs: apostrofen deaktiverer formelen, quotingen håndterer
 *        spesialtegnene.)
 *   escapeCsvCell(null)                    → ``
 *   escapeCsvCell(undefined)               → ``
 *   escapeCsvCell(42)                      → `42`
 *   escapeCsvCell(true)                    → `true`
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);

  // Steg 1: nøytraliser formel-prefix.
  if (s.length > 0 && FORMULA_PREFIXES.includes(s[0])) {
    s = "'" + s;
  }

  // Steg 2: quoting hvis nødvendig. Sjekker på den (potensielt
  // prefix-justerte) strengen slik at en opprinnelig `"=a"` (som
  // inneholder både `=` og `"`) håndteres riktig.
  const needsQuoting = /[;"\n\r]/.test(s);
  if (needsQuoting) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Bygg én CSV-rad fra en liste med celler. Bruker semikolon som skilletegn
 * og eksporterer escape-funksjonen konsistent. Returnerer IKKE med radskiller
 * — den legges til av caller for å matche eksisterende mønster i filene.
 *
 *   csvRow(["Ola", "=1+1", "med;semikolon"])
 *     → `Ola;'=1+1;"med;semikolon"`
 */
export function csvRow(cells: readonly unknown[]): string {
  return cells.map(escapeCsvCell).join(';');
}

/**
 * Sanitiser et filnavn som stammer fra bruker-input (lottery.name,
 * campaign.title) før det brukes som `<a download>`-attributt.
 *
 * Fjerner sti-tegn (/, \, ..), kontrolltegn, Windows-reserverte tegn
 * (< > : " | ? *) og kollapser whitespace. Tomt resultat erstattes med
 * fallback. Lengden klippes til 80 tegn for å unngå problemer med
 * path-max på enkelte filsystemer.
 *
 *   sanitizeCsvFilename("rapport")                → "rapport"
 *   sanitizeCsvFilename("../../etc/passwd")       → "etcpasswd"
 *   sanitizeCsvFilename("Julecup 2025")           → "Julecup 2025"
 *   sanitizeCsvFilename('ond"<script>')           → "ondscript"
 *   sanitizeCsvFilename("", "fallback")           → "fallback"
 */
export function sanitizeCsvFilename(name: unknown, fallback = 'eksport'): string {
  if (name === null || name === undefined) return fallback;
  let s = String(name);
  // Fjern sti-separatorer og foreldre-navigering.
  s = s.replace(/\.\./g, '').replace(/[\\/]/g, '');
  // Fjern Windows-reserverte og kontrolltegn.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[<>:"|?*\x00-\x1f]/g, '');
  // Kollaps whitespace.
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return fallback;
  return s.slice(0, 80);
}
