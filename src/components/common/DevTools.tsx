import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

export const DevTools: React.FC = () => {
  // Hard kill-switch: utviklerverktøyet skal ALDRI rendres i produksjon.
  // Vite erstatter import.meta.env.DEV med en bokstavelig `false` ved
  // prod-build, så hele komponent-kroppen blir død kode. Selv hvis
  // tree-shakingen i App.tsx skulle feile og importen havner i bundlen,
  // stopper denne sjekken all logikk (inkludert fetchFamilies-queryen
  // mot families/family_members som i seg selv er en datalekkasje).
  if (!import.meta.env.DEV) return null;

  const [isOpen, setIsOpen] = useState(false);
  const [families, setFamilies] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const userJson = localStorage.getItem('dugnad_user');
    if (userJson) {
      try { setCurrentUser(JSON.parse(userJson)); } catch {}
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
    const stored = localStorage.getItem('dugnad_user');
    let name = 'Admin Koordinator';
    if (stored) { try { name = JSON.parse(stored).fullName || name; } catch {} }
    const user = { id: 'coordinator-id', role: 'coordinator', name, fullName: name, email: 'admin@demo.no' };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/coordinator-dashboard';
  };

  const loginAsFamily = (family: any) => {
    // Lagre ekte bruker for å kunne bytte tilbake
    const currentUser = localStorage.getItem('dugnad_user');
    if (currentUser) localStorage.setItem('dugnad_user_backup', currentUser);

    const children = family.family_members?.filter((m: any) => m.role === 'child') || [];
    const displayName = children.length > 0 ? children.map((c: any) => c.name).join(' & ') : family.name;
    const user = { role: 'family', id: family.id, name: displayName, fullName: displayName, email: family.contact_email };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/family-dashboard';
  };

  const loginAsSubstitute = () => {
    const user = { id: 'substitute-id', role: 'substitute', name: 'Vikar Vikarsen', fullName: 'Vikar Vikarsen', email: 'vikar@demo.no' };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/substitute-marketplace';
  };

  const backToCoordinator = () => {
    // Gjenopprett ekte bruker fra backup
    const backup = localStorage.getItem('dugnad_user_backup');
    if (backup) {
      localStorage.setItem('dugnad_user', backup);
      localStorage.removeItem('dugnad_user_backup');
    } else {
      localStorage.setItem('dugnad_user', JSON.stringify({ id: 'coordinator-id', role: 'coordinator', name: 'Admin Koordinator', fullName: 'Admin Koordinator', email: 'admin@demo.no' }));
    }
    window.location.href = '/coordinator-dashboard';
  };

  // --- ONBOARDING SIMULATOR ---
  const startOnboardingSim = (sport: string) => {
    const clubName = prompt("Hva skal klubben hete?", sport === 'dance' ? "Victory Dance" : "Min Sportsklubb");
    if (!clubName) return;
    const club = { id: 'test-club-id', name: clubName, sport, logoUrl: '', createdAt: new Date().toISOString() };
    localStorage.setItem('dugnad_club', JSON.stringify(club));
    const user = { id: 'coordinator-id', role: 'coordinator', name: 'Admin Koordinator', fullName: 'Admin Koordinator', email: 'admin@demo.no' };
    localStorage.setItem('dugnad_user', JSON.stringify(user));
    window.location.href = '/setup-team';
  };

  // --- TESTDATA GENERATOR ---
  const seedSportData = async (sport: 'football' | 'handball' | 'dance' | 'ishockey') => {
    setGenerating(true);
    let clubPrefix = 'Klubb';
    try { const c = JSON.parse(localStorage.getItem('dugnad_club') || '{}'); if (c.name) clubPrefix = c.name; } catch {}

    const config: Record<string, { team: string; prefix: string }> = {
      football: { team: `${clubPrefix} G2016`, prefix: 'Fotball' },
      handball: { team: `${clubPrefix} J2015`, prefix: 'Håndball' },
      dance: { team: `${clubPrefix} Parti 1`, prefix: 'Dans' },
      ishockey: { team: `${clubPrefix} U12`, prefix: 'Hockey' }
    };
    const { team, prefix } = config[sport];

    try {
      for (let i = 1; i <= 5; i++) {
        const childName = `${prefix}-spiller ${i}`;
        const parentName = `Forelder ${prefix}sen ${i}`;
        const { data: fam, error: famError } = await supabase
          .from('families')
          .insert({ name: childName.split(' ').pop() || 'Ukjent', contact_email: `${prefix.toLowerCase()}${i}@demo.no` })
          .select().single();
        if (famError) throw famError;
        await supabase.from('family_members').insert([
          { family_id: fam.id, name: parentName, role: 'parent', email: `${prefix.toLowerCase()}${i}@demo.no` },
          { family_id: fam.id, name: childName, role: 'child', birth_year: 2015, subgroup: team }
        ]);
      }
      alert(`✅ Genererte 5 familier for: ${team}!`);
      fetchFamilies();
      if (window.location.pathname.includes('coordinator')) window.location.reload();
    } catch (e: any) {
      alert('Feil: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const clearAllData = async () => {
    if (!confirm('⚠️ ER DU SIKKER?\n\nDette sletter ALLE data i databasen.')) return;
    try {
      await supabase.from('kiosk_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('lottery_sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('prizes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('lotteries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('family_members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('families').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch {}
    alert('🧹 Databasen er tom.');
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
      >🛠️</button>
    );
  }

  const isFamily = currentUser?.role === 'family';
  const hasBackup = !!localStorage.getItem('dugnad_user_backup');

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', width: '340px', background: 'var(--card-bg, white)',
      borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid var(--border-color, #e5e7eb)',
      zIndex: 9999, fontFamily: 'sans-serif', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh'
    }}>
      <div style={{ padding: '14px 16px', background: '#1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'white' }}>🛠️ Utviklerverktøy</h3>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto' }}>
        {/* Gjeldende bruker */}
        <div style={{ marginBottom: '16px', padding: '10px', background: isFamily ? '#eff6ff' : '#f0fdf4', borderRadius: '8px', fontSize: '12px', border: '1px solid ' + (isFamily ? '#bfdbfe' : '#bbf7d0') }}>
          <strong>Innlogget som:</strong><br/>
          {currentUser ? `${currentUser.name || currentUser.fullName || 'Ukjent'} (${currentUser.role})` : 'Ingen'}
        </div>

        {/* Tilbake til koordinator */}
        {(isFamily || hasBackup) && (
          <button onClick={backToCoordinator} style={{ width: '100%', padding: '12px', marginBottom: '16px', background: '#0d9488', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            ← Tilbake til min bruker
          </button>
        )}

        {/* Bytt rolle */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Bytt rolle:</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={loginAsCoordinator} style={{ flex: 1, padding: '8px', background: '#1e3a8a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>👮 Admin</button>
            <button onClick={loginAsSubstitute} style={{ flex: 1, padding: '8px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>💼 Vikar</button>
          </div>
        </div>

        {/* Onboarding */}
        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Ny start (Onboarding):</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button onClick={() => startOnboardingSim('football')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>⚽ Fotball</button>
            <button onClick={() => startOnboardingSim('handball')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>🤾 Håndball</button>
          </div>
        </div>

        {/* Testdata */}
        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Generer testdata:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button disabled={generating} onClick={() => seedSportData('football')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>⚽ +5 Fotball</button>
            <button disabled={generating} onClick={() => seedSportData('handball')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>🤾 +5 Håndball</button>
            <button disabled={generating} onClick={() => seedSportData('dance')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>💃 +5 Dans</button>
            <button disabled={generating} onClick={() => seedSportData('ishockey')} style={{ padding: '6px', fontSize: '12px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #ddd)', borderRadius: '6px', cursor: 'pointer' }}>🏒 +5 Hockey</button>
          </div>
        </div>

        {/* Familier — klikk for å logge inn som */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Familier ({families.length}) — klikk for å teste:</label>
            <button onClick={clearAllData} style={{ fontSize: '10px', background: 'none', border: 'none', color: 'red', cursor: 'pointer', textDecoration: 'underline' }}>Nullstill</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
            {families.map(fam => {
              const children = fam.family_members?.filter((m: any) => m.role === 'child') || [];
              const parents = fam.family_members?.filter((m: any) => m.role === 'parent') || [];
              const displayName = children.length > 0 ? children.map((c: any) => c.name).join(' & ') : fam.name;
              const subgroup = children.length > 0 ? children[0].subgroup : '';

              return (
                <button
                  key={fam.id}
                  onClick={() => loginAsFamily(fam)}
                  style={{
                    padding: '8px 10px', background: 'var(--card-bg, white)', border: '1px solid var(--border-color, #e5e7eb)',
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}
                >
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
                    {displayName.charAt(0)}
                  </div>
                  <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary, #374151)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary, #9ca3af)' }}>
                      {subgroup || fam.name} · {parents.length} foresatt{parents.length !== 1 ? 'e' : ''}
                    </div>
                  </div>
                </button>
              );
            })}
            {families.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', padding: '12px' }}>Ingen familier i databasen</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
