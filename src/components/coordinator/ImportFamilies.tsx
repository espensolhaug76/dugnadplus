import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabaseClient';
import { generateJoinCode } from '../../utils/joinCode';
import { runGuide, hasSeenGuide, markGuideSeen } from '../../utils/guides';

interface ParsedPlayer {
  name: string;
  birthDate: string;
  subgroup: string;
  address: string;
  postalCode: string;
  city: string;
  parents: string[];
  familyId: string;
}

interface ImportedFamilyResult {
  name: string;
  code: string;
  children: string[];
}

export const ImportFamilies: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedPlayer[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportedFamilyResult[]>([]);
  const [skipCount, setSkipCount] = useState(0);
  const [showSpondHelp, setShowSpondHelp] = useState(false);

  // Auto-trigger guide for før/etter-import. import-families-after
  // trigges når importResults går fra 0 til >0; import-families-before
  // markeres som seen samtidig siden brukeren da har fullført flyten.
  useEffect(() => {
    if (importResults.length === 0) {
      if (hasSeenGuide('import-families-before')) return;
      const t = window.setTimeout(() => runGuide('import-families-before'), 800);
      return () => window.clearTimeout(t);
    } else {
      markGuideSeen('import-families-before');
      if (hasSeenGuide('import-families-after')) return;
      const t = window.setTimeout(() => runGuide('import-families-after'), 600);
      return () => window.clearTimeout(t);
    }
  }, [importResults.length]);

  // Max 10 MB på import-fila. Beskytter mot klient-side DoS via en
  // stor Excel med millioner av tomme rader, og mot å fylle DB-quota
  // hvis XLSX-parseren produserer hundretusenvis av familie-rader.
  // En ekte Spond-eksport for et helt idrettslag er typisk <1 MB.
  const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (uploadedFile.size > MAX_IMPORT_FILE_BYTES) {
      alert('Fila er for stor. Maks 10 MB for familie-import.');
      e.target.value = '';
      return;
    }

    setFile(uploadedFile); // Her settes filen
    const reader = new FileReader();

    reader.onload = (event) => {
      const data = event.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const players: ParsedPlayer[] = jsonData.map((row: any) => {
        let subgroup = '';
        if (row['KIL BLÅ']) subgroup = 'KIL BLÅ';
        else if (row['KIL BRUN']) subgroup = 'KIL BRUN';
        else if (row['KIL HVIT']) subgroup = 'KIL HVIT';
        else if (row['KIL ORANSJE']) subgroup = 'KIL ORANSJE';
        else if (row['KIL RØD']) subgroup = 'KIL RØD';
        else if (row['Trener gjengen']) subgroup = 'Trener';
        else if (row['Trenere']) subgroup = 'Trener';

        const parents = [
          row["Parent 1's name"],
          row["Parent 2's name"],
          row["Parent 3's name"],
          row["Parent 4's name"]
        ].filter(p => p && p.trim());

        const childName = row["Child's name"] || row["Name"] || '';
        const uniqueKey = (row['Street address'] || parents[0] || childName || '').toLowerCase().replace(/\s/g, '');
        const familyId = `temp_${uniqueKey}`;

        return {
          name: childName,
          birthDate: row['Date of birth'] || '',
          subgroup,
          address: row['Street address'] || '',
          postalCode: row['Postal Code'] || '',
          city: row['City'] || '',
          parents,
          familyId
        };
      });

      setParsedData(players.filter(p => p.name));
    };

    reader.readAsBinaryString(uploadedFile);
  };

  const generateImportCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // generateJoinCode er flyttet til src/utils/joinCode.ts for deling
  // mellom ImportFamilies og ManageFamilies. Formatet er nå
  // "{PREFIX}{NNNN}" uten bindestrek — normaliseres tolerant ved
  // input via normalizeJoinCode().

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setImporting(true);
    setImportResults([]);
    setSkipCount(0);

    try {
      const familiesMap: Record<string, {
        address: string,
        postalCode: string,
        city: string,
        parents: string[],
        children: any[]
      }> = {};

      parsedData.forEach(p => {
        if (!familiesMap[p.familyId]) {
          familiesMap[p.familyId] = {
            address: p.address,
            postalCode: p.postalCode,
            city: p.city,
            parents: p.parents,
            children: []
          };
        }
        familiesMap[p.familyId].children.push(p);
      });

      const results: ImportedFamilyResult[] = [];
      let skipped = 0;

      for (const tempId in familiesMap) {
        const famData = familiesMap[tempId];
        
        let exists = false;
        for (const child of famData.children) {
            const birthYear = child.birthDate ? new Date(child.birthDate).getFullYear() : 2016;
            const { data: existingChild } = await supabase
                .from('family_members')
                .select('id')
                .eq('name', child.name)
                .eq('role', 'child')
                .eq('birth_year', birthYear)
                .maybeSingle();
            
            if (existingChild) {
                exists = true;
                break;
            }
        }

        if (exists) {
            skipped++;
            continue;
        }

        // Bruk barnets etternavn som familienavn
        let familyName = 'Ukjent';
        if (famData.children.length > 0) {
           familyName = famData.children[0].name.split(' ').pop() || 'Ukjent';
        } else if (famData.parents.length > 0) {
           familyName = famData.parents[0].split(' ').pop() || 'Ukjent';
        }

        const importCode = generateImportCode();

        // Hent aktivt lag-ID
        const activeTeamId = localStorage.getItem('dugnad_active_team_filter') || '';

        const { data: insertedFamily, error: famError } = await supabase
          .from('families')
          .insert({
            name: familyName,
            contact_email: '',
            contact_phone: '',
            import_code: importCode,
            team_id: activeTeamId || null
          })
          .select()
          .single();

        if (famError) {
            console.error('Feil ved oppretting av familie:', famError);
            continue;
        }

        const newFamilyUUID = insertedFamily.id;

        const uniqueParents = [...new Set(famData.parents)];
        const parentInserts = uniqueParents.map(pName => ({
          family_id: newFamilyUUID,
          team_id: activeTeamId || null,
          name: pName,
          role: 'parent'
        }));

        if (parentInserts.length > 0) {
            await supabase.from('family_members').insert(parentInserts);
        }

        const childCodesMap: Record<string, string> = {};
        const childInserts = famData.children.map(child => {
          const joinCode = generateJoinCode();
          childCodesMap[child.name] = joinCode;
          return {
            family_id: newFamilyUUID,
            team_id: activeTeamId || null,
            name: child.name,
            role: 'child',
            birth_year: child.birthDate ? new Date(child.birthDate).getFullYear() : 2016,
            subgroup: child.subgroup,
            join_code: joinCode
          };
        });

        if (childInserts.length > 0) {
            const { error: childError } = await supabase.from('family_members').insert(childInserts);
            if (childError) {
                console.error('Feil ved barn-insert:', childError);
                // Fallback: prøv uten join_code
                const withoutCode = childInserts.map(({ join_code, ...rest }) => rest);
                await supabase.from('family_members').insert(withoutCode);
            }
        }

        results.push({
            name: familyName,
            code: importCode,
            children: famData.children.map(c => `${c.name} → ${childCodesMap[c.name]} (${c.subgroup || 'Ingen gruppe'})`)
        });
      }

      setImportResults(results);
      setSkipCount(skipped);
      
      if (results.length > 0 || skipped > 0) {
          alert(`✅ Import ferdig!\n\nOpprettet: ${results.length}\nDuplikater hoppet over: ${skipped}`);
      }

    } catch (error: any) {
      console.error('Import failed:', error);
      alert('❌ Noe gikk galt under importen: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const copyResults = () => {
      const text = importResults.map(r => `${r.name} (Barn: ${r.children.join(', ')}): KODE = ${r.code}`).join('\n');
      navigator.clipboard.writeText(text);
      // Marker onboarding-steget "Inviter foreldre" som fullført. Brukes
      // av CoordinatorDashboard til å sette done: true på 4. steg.
      try { localStorage.setItem('dugnad_invitations_sent', new Date().toISOString()); } catch {}
      alert('Liste kopiert til utklippstavlen!');
  };

  // GDPR-banner: brukeren kan lukke den, lagres i localStorage.
  const [gdprBannerDismissed, setGdprBannerDismissed] = useState(() => {
    try { return localStorage.getItem('dugnad_import_gdpr_banner_dismissed') === '1'; }
    catch { return false; }
  });
  const [showInfoText, setShowInfoText] = useState(false);
  const [infoCopied, setInfoCopied] = useState(false);

  const dismissGdprBanner = () => {
    try { localStorage.setItem('dugnad_import_gdpr_banner_dismissed', '1'); } catch {}
    setGdprBannerDismissed(true);
  };

  const INFO_TEXT_TEMPLATE = `Hei alle foreldre på [LAGNAVN],

Vi tar i bruk Dugnad+ for å organisere dugnaden vår fra og med [DATO]. Det betyr at navn, telefonnummer og e-post flyttes fra Spond til Dugnad+.

Du vil få en personlig kode du bruker til å logge inn. Du kan se og endre dine egne data, og du kan slette kontoen din når som helst.

Les personvernerklæringen her:
https://dugnadpluss.netlify.app/personvern

Si fra hvis du har spørsmål.

Hilsen
[KOORDINATOR]`;

  const copyInfoText = async () => {
    try {
      await navigator.clipboard.writeText(INFO_TEXT_TEMPLATE);
      setInfoCopied(true);
      window.setTimeout(() => setInfoCopied(false), 2000);
    } catch {
      alert('Klarte ikke kopiere — marker teksten manuelt.');
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>

      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>Importer familier fra Spond</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Last opp "For import"-filen (CSV/Excel). Systemet leser lagtilhørighet og genererer koder.</p>

      {!gdprBannerDismissed && (
        <div
          style={{
            background: '#fff8e6',
            border: '1px solid #fac775',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 24,
            color: '#633806',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Husk å informere foreldrene først</div>
              <div>
                Foreldrene må være informert om at dataene flyttes til Dugnad+ før import.
                Bruk teksten under hvis du trenger hjelp til å informere dem.
              </div>
              <button
                onClick={() => setShowInfoText(s => !s)}
                style={{
                  marginTop: 10,
                  background: 'transparent',
                  border: '1px solid #fac775',
                  color: '#633806',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showInfoText ? 'Skjul forslag' : 'Vis forslag til informasjonstekst'}
              </button>

              {showInfoText && (
                <div style={{ marginTop: 12, background: '#fff', borderRadius: 8, border: '1px solid #fde2a8', padding: 12 }}>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      color: '#3d2305',
                      margin: 0,
                    }}
                  >
{INFO_TEXT_TEMPLATE}
                  </pre>
                  <button
                    onClick={copyInfoText}
                    style={{
                      marginTop: 10,
                      background: '#854f0b',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {infoCopied ? '✓ Kopiert' : '📋 Kopier teksten'}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={dismissGdprBanner}
              aria-label="Lukk"
              title="Lukk banneret"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#633806',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: '0 4px',
                opacity: 0.6,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {importResults.length > 0 ? (
          <div data-guide="import-success" className="card" style={{ padding: '32px', background: '#f0fdf4', border: '2px solid #16a8b8' }}>
              <div style={{textAlign:'center', marginBottom:'24px'}}>
                <div style={{fontSize:'48px'}}>🎉</div>
                <h2 style={{color:'#166534', margin:'8px 0'}}>Import Suksess!</h2>
                <p style={{color:'#15803d'}}>{importResults.length} familier opprettet. {skipCount > 0 && `(${skipCount} duplikater hoppet over)`}<br/>Del kodene med foreldrene.</p>
                <button data-guide="import-copy" onClick={copyResults} className="btn btn-primary">📋 Kopier liste for Spond</button>
              </div>

              <div style={{maxHeight:'500px', overflowY:'auto', background:'white', borderRadius:'8px', border:'1px solid #e5e7eb'}}>
                  <table style={{width:'100%', borderCollapse:'collapse'}}>
                      <thead style={{background:'#f9fafb', position:'sticky', top:0}}>
                          <tr>
                              <th style={{padding:'12px', textAlign:'left', borderBottom:'2px solid #e5e7eb'}}>Familie</th>
                              <th style={{padding:'12px', textAlign:'left', borderBottom:'2px solid #e5e7eb'}}>Barn (Lag)</th>
                              <th style={{padding:'12px', textAlign:'right', borderBottom:'2px solid #e5e7eb'}}>KODE</th>
                          </tr>
                      </thead>
                      <tbody>
                          {importResults.map((res, idx) => (
                              <tr key={idx} style={{borderBottom:'1px solid #f3f4f6'}}>
                                  <td style={{padding:'12px'}}>{res.name}</td>
                                  <td style={{padding:'12px', color:'#6b7280'}}>{res.children.join(', ')}</td>
                                  <td style={{padding:'12px', textAlign:'right', fontWeight:'bold', fontFamily:'monospace', fontSize:'16px', color:'#16a8b8'}}>{res.code}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              <button onClick={() => window.location.reload()} className="btn btn-secondary" style={{marginTop:'24px', width:'100%'}}>Start ny import</button>
          </div>
      ) : (
        <>
            <div data-guide="import-upload" className="card" style={{ padding: '32px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>📁 Last opp Excel/CSV</h3>
                <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    style={{ padding: '12px', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', width: '100%', cursor: 'pointer' }}
                />
                {/* Her bruker vi filnavnet, som fjerner feilmeldingen */}
                {file && (
                  <p style={{ marginTop: '12px', color: 'var(--color-primary)', fontSize: '14px', fontWeight: '600' }}>
                    ✓ Fil valgt: {file.name}
                  </p>
                )}
            </div>

            <div className="card" style={{ padding: '20px 24px', marginBottom: '24px' }}>
                <button
                    onClick={() => setShowSpondHelp(!showSpondHelp)}
                    style={{
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}
                    aria-expanded={showSpondHelp}
                >
                    <span>ℹ️ Hvor finner jeg medlemslista i Spond?</span>
                    <span style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{showSpondHelp ? '▾' : '▸'}</span>
                </button>
                {showSpondHelp && (
                    <div style={{ marginTop: '16px' }}>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '12px', lineHeight: 1.5 }}>
                            Åpne lagets Spond-gruppe → klikk de tre prikkene øverst til høyre → <strong>"Last ned medlemsliste (Excel)"</strong>.
                        </p>
                        <img
                            src="/spond-export-help.jpg"
                            alt="Skjermbilde av Spond med menyen åpen"
                            style={{
                                maxWidth: '100%',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                display: 'block',
                            }}
                        />
                    </div>
                )}
            </div>

            {parsedData.length > 0 && (
                <>
                <div data-guide="import-preview" className="card" style={{ padding: '32px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>📊 Forhåndsvisning ({parsedData.length} spillere)</h3>
                    <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                        <tr>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Navn</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Lag</th>
                            <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Foresatte</th>
                        </tr>
                        </thead>
                        <tbody>
                        {parsedData.slice(0, 20).map((player, idx) => (
                            <tr key={idx}>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>{player.name}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                                {player.subgroup ? <span className="badge" style={{fontSize:'11px'}}>{player.subgroup}</span> : '-'}
                            </td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>{player.parents.join(', ')}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                </div>

                <button data-guide="import-submit" onClick={handleImport} className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '18px' }} disabled={importing}>
                    {importing ? '⏳ Genererer koder og lagrer...' : '🚀 Importer og generer koder'}
                </button>
                </>
            )}
        </>
      )}
    </div>
  );
};