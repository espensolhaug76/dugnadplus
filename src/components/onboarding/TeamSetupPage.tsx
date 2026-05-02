import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { generateTeamSlug } from '../../utils/teamSlug';

export const TeamSetupPage: React.FC = () => {
  // Bruker en funksjon i useState for å hente standardverdi kun én gang
  const [formData, setFormData] = useState(() => {
    // 1. Prøv å hente sport fra klubb-oppsettet (localStorage)
    const storedClub = localStorage.getItem('dugnad_club');
    let defaultSport = 'football';
    
    if (storedClub) {
        try {
            const club = JSON.parse(storedClub);
            if (club.sport) defaultSport = club.sport;
        } catch (e) {
            console.error("Kunne ikke lese klubbdata", e);
        }
    }

    return {
      sport: defaultSport,
      gender: 'gutter',
      birthYear: new Date().getFullYear() - 10,
      customTeamName: '' // Felt for lag som ikke følger standard navning (Dans)
    };
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let teamName = '';
    let yearToSave = 0;

    // LOGIKK: Hvis Dans, bruk egendefinert navn.
    if (formData.sport === 'dance') {
        if (!formData.customTeamName.trim()) {
            alert('Vennligst fyll inn navn på gruppen/partiet.');
            return;
        }
        teamName = formData.customTeamName;
        yearToSave = 0; // 0 indikerer blandet/ikke relevant årskull
    } else {
        // LOGIKK: Standard lagidrett (Kjønn + År)
        teamName = `${formData.gender === 'gutter' ? 'Gutter' : formData.gender === 'jenter' ? 'Jenter' : 'Mixed'} ${formData.birthYear}`;
        yearToSave = parseInt(formData.birthYear.toString());
    }

    // Hent klubbdata
    const storedClub = localStorage.getItem('dugnad_club');
    const club = storedClub ? JSON.parse(storedClub) : null;

    if (!club) {
      alert('Klubbinformasjon mangler (dugnad_club). Prøv å starte på nytt via DevTools.');
      return;
    }

    // Foreslått team_id via slug. RPC-en kan returnere en suffix-et
    // variant hvis sluggen kolliderer med en annen klubb (multi-tenant
    // collision — pilot 2026-05-02). Vi bruker derfor RETUR-verdien
    // fra RPC-en som autoritativ team_id, ikke den foreslåtte.
    const proposedTeamSlug = generateTeamSlug(
      formData.sport,
      formData.sport === 'dance' ? undefined : formData.gender,
      formData.sport === 'dance' ? undefined : yearToSave,
      formData.sport === 'dance' ? formData.customTeamName : undefined
    );

    // Bootstrap første koordinator. RPC-en (SECURITY DEFINER):
    //  - oppretter team_members-rad med role='coordinator' for
    //    auth.uid() — RLS hindrer normalt INSERT uten eksisterende
    //    rolle, så vi må gå via DB-funksjon for første binding.
    //  - oppdager kollisjon mot annen klubb og legger til 8-tegns
    //    hex-suffix derivert fra club_id slik at sluggen blir unik
    //    globalt selv om visningsnavnet er likt på tvers av klubber.
    //  - returnerer JSONB { team_id, collision_resolved, ... }.
    let resolvedTeamId: string;
    let collisionResolved = false;
    try {
        const { data: rpcData, error: bootstrapError } = await supabase.rpc('bootstrap_first_coordinator', {
            p_team_id: proposedTeamSlug,
            p_club_id: club.id,
        });
        if (bootstrapError) {
            if (/Team already exists in this club/i.test(bootstrapError.message || '')) {
                alert('Du har allerede et lag med dette navnet i klubben din. Velg et annet kjønn, årgang eller navn.');
                return;
            }
            if (/Slug collision could not be resolved/i.test(bootstrapError.message || '')) {
                alert('Klarte ikke å generere unik lag-ID. Prøv et annet navn.');
                return;
            }
            console.error('bootstrap_first_coordinator feilet:', bootstrapError);
            alert('Kunne ikke fullføre lagoppsettet: ' + bootstrapError.message);
            return;
        }
        resolvedTeamId = (rpcData as any)?.team_id || proposedTeamSlug;
        collisionResolved = !!(rpcData as any)?.collision_resolved;
    } catch (e: any) {
        console.error('bootstrap_first_coordinator kall feilet:', e);
        alert('Kunne ikke fullføre lagoppsettet: ' + (e?.message || 'ukjent feil'));
        return;
    }

    if (collisionResolved) {
        console.log(
          '[setup-team] team_id ble suffix-et pga kollisjon mot annen klubb:',
          { proposed: proposedTeamSlug, resolved: resolvedTeamId }
        );
    }

    const team = {
      id: resolvedTeamId,
      clubId: club.id,
      sport: formData.sport,
      gender: formData.sport === 'dance' ? 'mixed' : formData.gender,
      birthYear: yearToSave,
      name: teamName,
      createdAt: new Date().toISOString(),
    };

    // Skriv til localStorage ETTER at RPC-en har bekreftet sluggen,
    // slik at cachen aldri inneholder en team_id som ikke finnes i DB.
    const existingTeams = localStorage.getItem('dugnad_teams');
    const teams = existingTeams ? JSON.parse(existingTeams) : [];
    teams.push(team);
    localStorage.setItem('dugnad_teams', JSON.stringify(teams));

    // Sett som aktivt lag slik at dashboardet viser det
    localStorage.setItem('dugnad_current_team', JSON.stringify(team));
    localStorage.setItem('dugnad_active_team_filter', team.id);

    // Synk klubb+lag til Supabase user_metadata (overlever innlogging fra ny enhet)
    try {
        await supabase.auth.updateUser({ data: { club, teams } });
    } catch {}

    window.location.href = '/coordinator-dashboard';
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);
  
  // Sjekk om valgt sport er Dans (brukes for å endre skjemaet)
  const isCustomNaming = formData.sport === 'dance';

  const existingTeams = (() => {
    try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; }
  })();

  const SPORT_ICONS: Record<string, string> = { football: '⚽', handball: '🤾', dance: '💃', ishockey: '🏒', volleyball: '🏐', basketball: '🏀', other: '🏅' };
  const SPORT_LABELS: Record<string, string> = { football: 'Fotball', handball: 'Håndball', dance: 'Dans', ishockey: 'Ishockey', volleyball: 'Volleyball', basketball: 'Basketball', other: 'Annet' };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '40px' }}>

        <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake til dashboard</button>

        <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
          {existingTeams.length > 0 ? 'Opprett nytt lag' : 'Opprett ditt første lag'}
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '32px' }}>
          Velg idrett, kjønn og årskull. Du kan opprette flere lag.
        </p>

        {/* Eksisterende lag */}
        {existingTeams.length > 0 && (
          <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--card-bg, white)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Dine lag ({existingTeams.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {existingTeams.map((t: any) => (
                <span key={t.id} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '13px', background: '#f0fdfa', border: '1px solid #99f6e4', color: 'var(--color-primary)', fontWeight: '600' }}>
                  {SPORT_ICONS[t.sport] || '🏅'} {SPORT_LABELS[t.sport] || t.sport} · {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            <div>
              <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Idrett</label>
              <select name="sport" value={formData.sport} onChange={handleChange} className="input">
                <option value="football">⚽ Fotball</option>
                <option value="handball">🤾 Håndball</option>
                <option value="dance">💃 Dans</option>
                <option value="ishockey">🏒 Ishockey</option>
                <option value="volleyball">🏐 Volleyball</option>
                <option value="basketball">🏀 Basketball</option>
                <option value="other">Annet</option>
              </select>
            </div>

            {isCustomNaming ? (
                <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Navn på parti / gruppe</label>
                    <input type="text" name="customTeamName" value={formData.customTeamName} onChange={handleChange} className="input" placeholder="F.eks. Hip Hop 10-12 år" autoFocus />
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Kjønn</label>
                      <select name="gender" value={formData.gender} onChange={handleChange} className="input">
                          <option value="gutter">Gutter</option>
                          <option value="jenter">Jenter</option>
                          <option value="mixed">Mixed</option>
                      </select>
                    </div>
                    <div>
                      <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Fødselsår</label>
                      <select name="birthYear" value={formData.birthYear} onChange={handleChange} className="input">
                          {years.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </div>
                </div>
            )}

            {/* Preview */}
            <div style={{ padding: '16px', background: '#f0fdfa', borderRadius: '12px', border: '2px solid #99f6e4', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nytt lag:</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color: 'var(--color-primary)', margin: 0 }}>
                {SPORT_ICONS[formData.sport] || '🏅'} {SPORT_LABELS[formData.sport] || ''} · {isCustomNaming
                    ? (formData.customTeamName || '...')
                    : `${formData.gender === 'gutter' ? 'Gutter' : formData.gender === 'jenter' ? 'Jenter' : 'Mixed'} ${formData.birthYear}`
                }
              </p>
            </div>

            <button type="submit" className="btn btn-primary btn-large">
              Opprett lag
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};