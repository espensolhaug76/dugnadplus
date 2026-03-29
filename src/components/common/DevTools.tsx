import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

export const DevTools: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const userJson = localStorage.getItem('dugnad_user');
    if (userJson) {
      setCurrentUser(JSON.parse(userJson));
    }
    fetchFamilies();
  }, []);

  const fetchFamilies = async () => {
    const { data } = await supabase
      .from('families')
      .select('*, family_members(*)')
      .order('name');
    
    if (data) setFamilies(data);
  };

  // --- LOGIN HELPERS ---
  const loginAsCoordinator = () => {
    const user = { id: 'coordinator-id', role: 'coordinator', name: 'Admin Koordinator', email: 'admin@demo.no' };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/coordinator-dashboard';
  };

  const loginAsFamily = (family: any) => {
    const user = { role: 'family', id: family.id, name: family.name, email: family.contact_email };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/family-dashboard';
  };

  const loginAsSubstitute = () => {
      const user = { id: 'substitute-id', role: 'substitute', fullName: 'Vikar Vikarsen', email: 'vikar@demo.no' };
      localStorage.setItem('dugnad_user', JSON.stringify(user));
      window.location.href = '/substitute-marketplace';
  };

  // --- ONBOARDING SIMULATOR ---
  const startOnboardingSim = (sport: string) => {
      const clubName = prompt("Hva skal klubben hete?", sport === 'dance' ? "Victory Dance" : "Min Sportsklubb");
      if (!clubName) return;

      const club = {
          id: 'test-club-id',
          name: clubName,
          sport: sport,
          logoUrl: '',
          createdAt: new Date().toISOString()
      };
      localStorage.setItem('dugnad_club', JSON.stringify(club));

      const user = { id: 'coordinator-id', role: 'coordinator', name: 'Admin Koordinator', email: 'admin@demo.no' };
      localStorage.setItem('dugnad_user', JSON.stringify(user));

      window.location.href = '/setup-team';
  };

  // --- TESTDATA GENERATOR (SMART) ---
  const seedSportData = async (sport: 'football' | 'handball' | 'dance' | 'ishockey') => {
      setGenerating(true);
      
      // Hent klubbnavn fra storage, eller bruk generisk
      let clubPrefix = 'Klubb';
      try {
          const storedClub = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
          if (storedClub.name) clubPrefix = storedClub.name;
      } catch (e) {}

      // Dynamiske lagnavn basert på klubb
      const config = {
          football: { team: `${clubPrefix} G2016`, prefix: 'Fotball' },
          handball: { team: `${clubPrefix} J2015`, prefix: 'Håndball' },
          dance: { team: `${clubPrefix} Parti 1`, prefix: 'Dans' },
          ishockey: { team: `${clubPrefix} U12`, prefix: 'Hockey' }
      };

      const { team, prefix } = config[sport];

      try {
          for (let i = 1; i <= 5; i++) {
              const { data: fam, error: famError } = await supabase
                .from('families')
                .insert({ 
                    name: `Familien ${prefix}sen ${i}`, 
                    contact_email: `${prefix.toLowerCase()}${i}@demo.no`,
                    import_code: `${prefix.toUpperCase()}${i}X`
                })
                .select()
                .single();
              
              if (famError) throw famError;

              await supabase.from('family_members').insert([
                  { family_id: fam.id, name: `Forelder ${i}`, role: 'parent' },
                  { family_id: fam.id, name: `Barn ${i}`, role: 'child', birth_year: 2015, subgroup: team }
              ]);
          }
          
          alert(`✅ Genererte 5 familier for laget: ${team}!`);
          fetchFamilies();
          if (window.location.pathname.includes('coordinator')) {
              window.location.reload();
          }

      } catch (e: any) {
          alert('Feil: ' + e.message);
      } finally {
          setGenerating(false);
      }
  };

  const clearAllData = async () => {
    if (!confirm('⚠️ ER DU SIKKER? \n\nDette sletter ALLE data i databasen (Events, Familier, etc).')) return;

    // Sletter alt i riktig rekkefølge
    await supabase.from('requests').delete().neq('id', '0');
    await supabase.from('lottery_sales').delete().neq('id', '0');
    await supabase.from('assignments').delete().neq('id', '0');
    await supabase.from('shifts').delete().neq('id', '0');
    await supabase.from('events').delete().neq('id', '0');
    await supabase.from('family_members').delete().neq('id', '0');
    await supabase.from('families').delete().neq('id', '0'); // Sletter også familiene for full reset

    alert('🧹 Databasen er helt tom.');
    window.location.reload();
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px', background: '#374151', color: 'white',
          border: 'none', borderRadius: '50%', width: '50px', height: '50px', fontSize: '24px',
          cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
        title="Åpne Utviklerverktøy"
      >
        🛠️
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', width: '320px', background: 'white',
      borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb',
      zIndex: 9999, fontFamily: 'sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh'
    }}>
      <div style={{ padding: '16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#111827' }}>Utviklerverktøy</h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto' }}>
        <div style={{ marginBottom: '16px', padding: '10px', background: '#f3f4f6', borderRadius: '8px', fontSize: '12px' }}>
            <strong>Logget inn som:</strong><br/>
            {currentUser ? `${currentUser.name || currentUser.fullName} (${currentUser.role})` : 'Ingen'}
        </div>

        <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>Bytt rolle:</label>
            <div style={{display:'flex', gap:'8px'}}>
                <button onClick={loginAsCoordinator} style={{ flex:1, padding: '8px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>👮 Admin</button>
                <button onClick={loginAsSubstitute} style={{ flex:1, padding: '8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>💼 Vikar</button>
            </div>
        </div>

        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>Ny start (Onboarding):</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button onClick={() => startOnboardingSim('football')} className="btn" style={{fontSize:'12px', padding:'6px', background:'#fff', border:'1px solid #ddd'}}>⚽ Fotball</button>
                <button onClick={() => startOnboardingSim('dance')} className="btn" style={{fontSize:'12px', padding:'6px', background:'#fff', border:'1px solid #ddd'}}>💃 Dans</button>
            </div>
        </div>

        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '8px', textTransform: 'uppercase' }}>Generer Testdata (DB):</label>
            <p style={{fontSize:'10px', color:'#6b7280', margin:'0 0 8px 0'}}>Bruker klubbnavn fra localStorage hvis satt.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button disabled={generating} onClick={() => seedSportData('football')} className="btn" style={{fontSize:'12px', padding:'6px'}}>⚽ +5 Fotball</button>
                <button disabled={generating} onClick={() => seedSportData('dance')} className="btn" style={{fontSize:'12px', padding:'6px'}}>💃 +5 Dans</button>
                <button disabled={generating} onClick={() => seedSportData('handball')} className="btn" style={{fontSize:'12px', padding:'6px'}}>🤾 +5 Hånd</button>
                <button disabled={generating} onClick={() => seedSportData('ishockey')} className="btn" style={{fontSize:'12px', padding:'6px'}}>🏒 +5 Hockey</button>
            </div>
        </div>

        <div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Familier i DB ({families.length}):</label>
                <button onClick={clearAllData} style={{fontSize:'10px', background:'none', border:'none', color:'red', cursor:'pointer', textDecoration:'underline'}}>Nullstill ALT</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {families.map(fam => {
                    const children = fam.family_members?.filter((m:any) => m.role === 'child');
                    const displayName = children && children.length > 0 
                        ? children.map((c:any) => c.name.split(' ')[0]).join(' & ') 
                        : fam.name;
                    
                    const team = children && children.length > 0 ? children[0].subgroup : '';

                    return (
                        <button 
                            key={fam.id} 
                            onClick={() => loginAsFamily(fam)}
                            style={{ 
                                padding: '10px', background: 'white', border: '1px solid #e5e7eb', 
                                borderRadius: '6px', cursor: 'pointer', textAlign: 'left', 
                                display: 'flex', alignItems: 'center', gap: '10px'
                            }}
                        >
                            <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                                {displayName.charAt(0)}
                            </div>
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                                <div style={{ fontSize: '13px', color: '#374151', fontWeight: '600' }}>{displayName}</div>
                                <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                                    {team ? team : fam.name}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};