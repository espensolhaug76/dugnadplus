import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface SubstituteStats {
  completedJobs: number;
  upcomingJobs: number;
  totalHours: number;
}

export const SubstituteProfilePage: React.FC = () => {
  // profile.id = substitutes.id (ikke auth.users.id). Fra Fase 4B er
  // substitutes.id den kanoniske vikar-referansen. assignments.family_id
  // og requests.bid_family_id peker på denne (polymorfi-gjeld — Fase 5
  // splitter til actor_kind + actor_id).
  const [profile, setProfile] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    age: '',
    experience: '',
    availability: [] as string[]
  });

  const [stats, setStats] = useState<SubstituteStats>({ completedJobs: 0, upcomingJobs: 0, totalHours: 0 });
  const [upcomingDates, setUpcomingDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
            .select('id, name, phone, age, experience')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (!sub) {
            const { data: created, error: createErr } = await supabase
                .from('substitutes')
                .insert({
                    auth_user_id: user.id,
                    name: user.user_metadata?.full_name || ''
                })
                .select('id, name, phone, age, experience')
                .single();
            if (createErr) throw createErr;
            sub = created;
        }

        const { data: availRows } = await supabase
            .from('substitute_availability')
            .select('date')
            .eq('substitute_id', sub!.id);

        setProfile({
            id: sub!.id,
            name: sub!.name || '',
            email: user.email || '',
            phone: sub!.phone || '',
            age: sub!.age != null ? String(sub!.age) : '',
            experience: sub!.experience || '',
            availability: (availRows || []).map((r: any) => r.date)
        });

        // POLYMORFI-GJELD (Fase 4B → Fase 5): assignments.family_id
        // kan inneholde families.id eller substitutes.id. Her filtrerer
        // vi på substitutes.id for vikar-statistikk.
        const { data: assignments } = await supabase
            .from('assignments')
            .select(`id, shift:shifts (start_time, end_time, event:events (date))`)
            .eq('family_id', sub!.id);

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

        const { data: futureEvents } = await supabase.from('events').select('date').gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true });
        if (futureEvents) {
            const dates = Array.from(new Set(futureEvents.map((e: any) => e.date)));
            setUpcomingDates(dates);
        }
    } catch (error) { console.error('Feil ved lasting av profil:', error); } finally { setLoading(false); }
  };

  const toggleAvailability = (date: string) => {
    const newAvailability = profile.availability.includes(date) ? profile.availability.filter(d => d !== date) : [...profile.availability, date];
    setProfile({ ...profile, availability: newAvailability });
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
                experience: profile.experience || null
            })
            .eq('id', profile.id);
        if (dbError) throw dbError;

        // Sync substitute_availability: diff mot DB.
        const { data: existing } = await supabase
            .from('substitute_availability')
            .select('date')
            .eq('substitute_id', profile.id);

        const existingDates = new Set((existing || []).map((r: any) => r.date));
        const desiredDates = new Set(profile.availability);

        const toInsert = [...desiredDates]
            .filter(d => !existingDates.has(d))
            .map(date => ({ substitute_id: profile.id, date }));
        const toDelete = [...existingDates].filter(d => !desiredDates.has(d));

        if (toInsert.length > 0) {
            const { error: insErr } = await supabase
                .from('substitute_availability')
                .insert(toInsert);
            if (insErr) throw insErr;
        }
        if (toDelete.length > 0) {
            const { error: delErr } = await supabase
                .from('substitute_availability')
                .delete()
                .eq('substitute_id', profile.id)
                .in('date', toDelete);
            if (delErr) throw delErr;
        }

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
            <h3 style={{ marginTop: 0, marginBottom: '8px' }}>📅 Når kan du jobbe?</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Kryss av datoene du er ledig. Du vil havne øverst på listen hos familier som trenger hjelp disse dagene.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {upcomingDates.length === 0 ? <p style={{ fontSize: '13px', fontStyle: 'italic' }}>Ingen kommende arrangementer funnet.</p> : upcomingDates.map(date => {
                        const isSelected = profile.availability.includes(date);
                        return <button key={date} onClick={() => toggleAvailability(date)} style={{ padding: '8px 12px', borderRadius: '20px', border: isSelected ? '2px solid #16a8b8' : '1px solid #e2e8f0', background: isSelected ? '#e0f7fa' : 'white', color: isSelected ? '#0e7490' : 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: isSelected ? '600' : '400' }}>{isSelected ? '✅ ' : ''}{new Date(date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</button>
                    })
                }
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