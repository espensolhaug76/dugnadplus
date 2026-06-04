import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { COUNTY_MUNICIPALITIES, SORTED_COUNTIES } from '../../utils/norwayGeo';

interface SubstituteStats {
  completedJobs: number;
  upcomingJobs: number;
  totalHours: number;
}

export const SubstituteProfilePage: React.FC = () => {
  // profile.id = substitutes.id. Stats-spørringen filtrerer på
  // assignments.substitute_id (Fase 5 — dedikert FK-kolonne).
  //
  // Fra Fase 4D: availability-feltet er fjernet (behov-drevet modell —
  // vikar ser åpne vakter i sin kommune i stedet for å krysse av datoer).
  // county + municipality erstatter det som geografisk filter.
  const [profile, setProfile] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    age: '',
    experience: '',
    county: '',
    municipality: ''
  });

  const [stats, setStats] = useState<SubstituteStats>({ completedJobs: 0, upcomingJobs: 0, totalHours: 0 });
  const [loading, setLoading] = useState(true);

  const municipalities = profile.county ? COUNTY_MUNICIPALITIES[profile.county] || [] : [];

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    setLoading(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        // Get-or-create substitutes-rad. Første besøk på profil-siden
        // oppretter en tom rad (UNIQUE-constraint på auth_user_id
        // forhindrer duplikater).
        let { data: sub } = await supabase
            .from('substitutes')
            .select('id, name, phone, age, experience, county, municipality')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (!sub) {
            const { data: created, error: createErr } = await supabase
                .from('substitutes')
                .insert({
                    auth_user_id: user.id,
                    name: user.user_metadata?.full_name || ''
                })
                .select('id, name, phone, age, experience, county, municipality')
                .single();
            if (createErr) throw createErr;
            sub = created;
        }

        setProfile({
            id: sub!.id,
            name: sub!.name || '',
            email: user.email || '',
            phone: sub!.phone || '',
            age: sub!.age != null ? String(sub!.age) : '',
            experience: sub!.experience || '',
            county: sub!.county || '',
            municipality: sub!.municipality || ''
        });

        // Vikar-stats: filter på den dedikerte substitute_id-kolonnen
        // (Fase 5).
        const { data: assignments } = await supabase
            .from('assignments')
            .select(`id, shift:shifts (start_time, end_time, event:events (date))`)
            .eq('substitute_id', sub!.id);

        let completed = 0; let upcoming = 0; let hours = 0;
        const now = new Date(); now.setHours(0,0,0,0);

        if (assignments) {
            assignments.forEach((a: any) => {
                if (a.shift && a.shift.event) {
                    const eventDate = new Date(a.shift.event.date);
                    const [startH, startM] = a.shift.start_time.slice(0,5).split(':').map(Number);
                    const [endH, endM] = a.shift.end_time.slice(0,5).split(':').map(Number);
                    const duration = (endH * 60 + endM) - (startH * 60 + startM);
                    if (eventDate < now) { completed++; hours += (duration / 60); } else { upcoming++; }
                }
            });
        }
        setStats({ completedJobs: completed, upcomingJobs: upcoming, totalHours: Math.round(hours * 10) / 10 });
    } catch (error) { console.error('Feil ved lasting av profil:', error); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!profile.id) return;
    try {
        const ageInt = profile.age.trim() ? parseInt(profile.age, 10) : null;
        if (profile.age.trim() && Number.isNaN(ageInt)) {
            alert('Alder må være et tall.');
            return;
        }

        const { error: dbError } = await supabase
            .from('substitutes')
            .update({
                name: profile.name,
                phone: profile.phone || null,
                age: ageInt,
                experience: profile.experience || null,
                county: profile.county || null,
                municipality: profile.municipality || null
            })
            .eq('id', profile.id);
        if (dbError) throw dbError;

        alert('✅ Profil lagret!');
    } catch (error: any) { alert('Kunne ikke lagre profil: ' + error.message); }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster profil... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
       <div style={{ background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Min Profil</h1>
        <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>Synlig for familier som søker vikar</p>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        <div className="card" style={{ padding: '20px', marginBottom: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <h3 style={{ marginTop: 0, fontSize: '16px', color: '#166534' }}>📊 Din Dugnad-statistikk</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#15803d' }}>{stats.completedJobs}</div>
                    <div style={{ fontSize: '12px', color: '#166534' }}>Jobber utført</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#15803d' }}>{stats.totalHours}t</div>
                    <div style={{ fontSize: '12px', color: '#166534' }}>Timer totalt</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#0369a1' }}>{stats.upcomingJobs}</div>
                    <div style={{ fontSize: '12px', color: '#075985' }}>Kommende</div>
                </div>
            </div>
        </div>

        <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>📝 Personalia</h3>
          <div style={{ marginBottom: '16px' }}>
            <label className="input-label">Navn</label>
            <input type="text" className="input" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
                <label className="input-label">Alder</label>
                <input type="number" className="input" value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} placeholder="F.eks. 17" />
            </div>
            <div>
                <label className="input-label">Telefon</label>
                <input type="tel" className="input" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} />
            </div>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Dugnad-CV / Erfaring</label>
            <textarea className="input" rows={4} value={profile.experience} onChange={e => setProfile({...profile, experience: e.target.value})} placeholder="F.eks: 'Erfaring fra kiosk på Norway Cup. Pliktoppfyllende og presis.'" />
          </div>
        </div>

        <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '8px' }}>📍 Hvor bor du?</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Du vil se åpne vakter i din kommune. La feltene stå tomme hvis du vil se vakter på tvers av kommuner.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="input-label">Fylke</label>
              <select
                value={profile.county}
                onChange={e => setProfile({ ...profile, county: e.target.value, municipality: '' })}
                className="input"
              >
                <option value="">Velg fylke</option>
                {SORTED_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Kommune</label>
              <select
                value={profile.municipality}
                onChange={e => setProfile({ ...profile, municipality: e.target.value })}
                className="input"
                disabled={!profile.county}
              >
                <option value="">{profile.county ? 'Velg kommune' : 'Velg fylke først'}</option>
                {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button onClick={handleSave} className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '16px' }}>💾 Lagre profil</button>
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-marketplace'}><div className="bottom-nav-icon">💼</div>Marked</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-substitute-jobs'}><div className="bottom-nav-icon">✅</div>Jobber</button>
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">👤</div>Profil</button>
      </div>
    </div>
  );
};
