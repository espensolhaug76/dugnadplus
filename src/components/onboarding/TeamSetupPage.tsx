import React, { useState } from 'react';

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

  const handleSubmit = (e: React.FormEvent) => {
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

    const team = {
      id: Date.now().toString(),
      clubId: club.id,
      sport: formData.sport,
      gender: formData.sport === 'dance' ? 'mixed' : formData.gender,
      birthYear: yearToSave,
      name: teamName,
      createdAt: new Date().toISOString(),
    };

    // Lagre til localStorage (mock database for setup-fasen)
    const existingTeams = localStorage.getItem('dugnad_teams');
    const teams = existingTeams ? JSON.parse(existingTeams) : [];
    teams.push(team);
    localStorage.setItem('dugnad_teams', JSON.stringify(teams));

    // VIKTIG: Sett dette som aktivt lag slik at dashboardet viser det
    localStorage.setItem('dugnad_current_team', JSON.stringify(team));

    window.location.href = '/coordinator-dashboard';
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);
  
  // Sjekk om valgt sport er Dans (brukes for å endre skjemaet)
  const isCustomNaming = formData.sport === 'dance';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Opprett ditt første lag
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            Du kan legge til flere lag senere
          </p>
        </div>

        {/* Form Card */}
        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* IDRETT VELGER */}
            <div>
              <label className="input-label">Idrett</label>
              <select name="sport" value={formData.sport} onChange={handleChange} className="input">
                <option value="football">⚽ Fotball</option>
                <option value="handball">🤾 Håndball</option>
                <option value="dance">💃 Dans</option> {/* <-- SJEKK AT DENNE ER HER */}
                <option value="ishockey">🏒 Ishockey</option>
                <option value="volleyball">🏐 Volleyball</option>
                <option value="basketball">🏀 Basketball</option>
                <option value="other">Annet</option>
              </select>
            </div>

            {/* DYNAMISK INNHOLD */}
            {isCustomNaming ? (
                /* SKJEMA FOR DANS (Fritekst) */
                <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <label className="input-label">Navn på parti / gruppe</label>
                    <input 
                        type="text" 
                        name="customTeamName"
                        value={formData.customTeamName} 
                        onChange={handleChange}
                        className="input" 
                        placeholder="F.eks. Hip Hop 10-12 år, Ballett Nivå 2..." 
                        autoFocus
                    />
                    <p style={{fontSize:'13px', color:'#0369a1', marginTop:'6px'}}>
                        ℹ️ For dans bruker vi egendefinerte navn i stedet for årskull.
                    </p>
                </div>
            ) : (
                /* SKJEMA FOR LAGIDRETT (Kjønn + År) */
                <>
                    <div>
                    <label className="input-label">Kjønn</label>
                    <select name="gender" value={formData.gender} onChange={handleChange} className="input">
                        <option value="gutter">Gutter</option>
                        <option value="jenter">Jenter</option>
                        <option value="mixed">Mixed</option>
                    </select>
                    </div>

                    <div>
                    <label className="input-label">Fødselsår</label>
                    <select name="birthYear" value={formData.birthYear} onChange={handleChange} className="input">
                        {years.map((year) => (
                        <option key={year} value={year}>
                            {year}
                        </option>
                        ))}
                    </select>
                    </div>
                </>
            )}

            {/* Preview */}
            <div
              style={{
                padding: '16px',
                background: 'var(--background)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Lagnavn:</p>
              <p style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {isCustomNaming 
                    ? (formData.customTeamName || '...') 
                    : `${formData.gender === 'gutter' ? 'Gutter' : formData.gender === 'jenter' ? 'Jenter' : 'Mixed'} ${formData.birthYear}`
                }
              </p>
            </div>

            {/* Submit Button */}
            <button type="submit" className="btn btn-primary btn-large" style={{ marginTop: '8px' }}>
              Fullfør og gå til dashboard
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};