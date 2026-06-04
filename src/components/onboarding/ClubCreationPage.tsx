import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { COUNTY_MUNICIPALITIES, SORTED_COUNTIES } from '../../utils/norwayGeo';

interface ClubSuggestion {
  id: string;
  name: string;
  county?: string;
  municipality?: string;
}

export const ClubCreationPage: React.FC = () => {
  const [clubName, setClubName] = useState('');
  const [county, setCounty] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [sport, setSport] = useState('football');
  const [logoUrl] = useState('');

  const [suggestions, setSuggestions] = useState<ClubSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<ClubSuggestion | null>(null);

  const municipalities = county ? COUNTY_MUNICIPALITIES[county] || [] : [];

  useEffect(() => {
    if (clubName.length < 2 || selectedExisting) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('clubs').select('*').ilike('name', `%${clubName}%`).limit(5);
      if (data && data.length > 0) { setSuggestions(data); setShowSuggestions(true); }
      else { setSuggestions([]); setShowSuggestions(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [clubName, selectedExisting]);

  const selectSuggestion = (club: ClubSuggestion) => {
    setClubName(club.name);
    setCounty(club.county || '');
    setMunicipality(club.municipality || '');
    setSelectedExisting(club);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clubName.trim()) { alert('Fyll inn klubbnavn.'); return; }
    if (!county) { alert('Velg fylke.'); return; }
    if (!municipality) { alert('Velg kommune.'); return; }

    const name = clubName.trim().replace(/\s+/g, ' ');
    let clubId = selectedExisting?.id;

    if (!clubId) {
      const { data: newClub, error } = await supabase.from('clubs').insert({
        name, county, municipality, sport_primary: sport, logo_url: logoUrl || null
      }).select().single();

      if (error) {
        if (error.code === '23505') { alert('Denne klubben finnes allerede i denne kommunen. Velg den fra listen.'); return; }
        console.error(error);
      } else {
        clubId = newClub.id;
      }
    }

    // Bootstrap club_admin-rad: gjør den innloggede brukeren til
    // første klubbansvarlig. RPC sjekker selv om klubben allerede
    // har en club_admin og kaster i så fall feil — den ignorerer
    // vi (brukeren blir da kun coordinator på sitt eget lag i
    // neste steg, ikke club_admin).
    if (clubId) {
      try {
        const { error: bootstrapError } = await supabase.rpc('bootstrap_first_club_admin', { p_club_id: clubId });
        if (bootstrapError && !/already has a club_admin/i.test(bootstrapError.message || '')) {
          console.warn('bootstrap_first_club_admin failed:', bootstrapError);
        }
      } catch (e) {
        console.warn('bootstrap_first_club_admin call failed:', e);
      }
    }

    localStorage.setItem('dugnad_club', JSON.stringify({
      id: clubId || Date.now().toString(), name, county, municipality, sport, logoUrl, createdAt: new Date().toISOString()
    }));
    window.location.href = '/setup-team';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '60px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '12px' }}>Registrer klubben din</h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Søk etter klubben — eller opprett ny</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Fylke og kommune FØRST */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label className="input-label">Fylke *</label>
                <select value={county} onChange={e => { setCounty(e.target.value); setMunicipality(''); }} className="input" required>
                  <option value="">Velg fylke</option>
                  {SORTED_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Kommune *</label>
                <select value={municipality} onChange={e => setMunicipality(e.target.value)} className="input" required disabled={!county}>
                  <option value="">{county ? 'Velg kommune' : 'Velg fylke først'}</option>
                  {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Klubbnavn med autocomplete */}
            <div style={{ position: 'relative' }}>
              <label className="input-label">Klubbnavn *</label>
              <input
                type="text" value={clubName}
                onChange={e => { setClubName(e.target.value); setSelectedExisting(null); }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="input" placeholder="F.eks. Kongsvinger IL, Brandval IF, Kobra" required
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '0 0 10px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10 }}>
                  {suggestions.map(s => (
                    <div key={s.id} onClick={() => selectSuggestion(s)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{s.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.municipality}, {s.county}</div>
                    </div>
                  ))}
                </div>
              )}
              {selectedExisting && <div style={{ marginTop: '6px', fontSize: '12px', color: '#10b981', fontWeight: '600' }}>✅ Eksisterende klubb valgt</div>}
            </div>

            {/* Sport */}
            <div>
              <label className="input-label">Primær idrett</label>
              <select value={sport} onChange={e => setSport(e.target.value)} className="input">
                <option value="football">⚽ Fotball</option>
                <option value="handball">🤾 Håndball</option>
                <option value="dance">💃 Dans</option>
                <option value="ishockey">🏒 Ishockey</option>
                <option value="volleyball">🏐 Volleyball</option>
                <option value="basketball">🏀 Basketball</option>
                <option value="tabletennis">🏓 Bordtennis</option>
                <option value="other">Annet</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary btn-large" style={{ marginTop: '8px' }}>Neste: Opprett lag</button>
          </form>
        </div>

        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Steg 1 av 2</p>
        </div>
      </div>
    </div>
  );
};
