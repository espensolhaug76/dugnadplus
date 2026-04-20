import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { ThemeToggle } from '../theme/ThemeToggle';
import './CoordinatorLayout.css';

interface CoordinatorLayoutProps {
  children: React.ReactNode;
}

interface StoredTeam {
  id: string;
  clubId: string;
  sport: string;
  gender: string;
  birthYear: number;
  name: string;
  createdAt: string;
  isActive?: boolean; // off-season = false
}

const SPORT_ICONS: Record<string, string> = {
    football: '⚽', handball: '🤾', dance: '💃', ishockey: '🏒', volleyball: '🏐', basketball: '🏀', other: '🏅'
};

const SPORT_LABELS_DISPLAY: Record<string, string> = {
    football: 'Fotball', handball: 'Håndball', dance: 'Dans', ishockey: 'Ishockey', volleyball: 'Volleyball', basketball: 'Basketball', other: 'Annet'
};

const formatTeamDisplayName = (team: StoredTeam): string => {
    // Sport vises allerede som kategori-overskrift, så vis bare navn
    if (team.sport === 'dance') {
        return team.name;
    }
    const genderLabel = team.gender === 'gutter' ? 'Gutter' : team.gender === 'jenter' ? 'Jenter' : 'Mixed';
    return `${genderLabel} ${team.birthYear}`;
};

export const CoordinatorLayout: React.FC<CoordinatorLayoutProps> = ({ children }) => {
  const [groupedTeams, setGroupedTeams] = useState<Record<string, StoredTeam[]>>({});
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState('Min Klubb');
  const [authGate, setAuthGate] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    // Auth-gate: verifiser at brukeren er coordinator/club_admin via
    // team_members før noe innhold rendres. Forhindrer flash-of-
    // unauthorized-content der koordinator-UI vises i et øyeblikk
    // før redirect slår inn.
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthGate('denied');
        window.location.href = '/login';
        return;
      }

      const { data: memberships } = await supabase
        .from('team_members')
        .select('role')
        .eq('auth_user_id', user.id)
        .in('role', ['coordinator', 'club_admin'])
        .limit(1);

      if (!memberships || memberships.length === 0) {
        setAuthGate('denied');
        window.location.href = '/family-dashboard';
        return;
      }

      setAuthGate('allowed');
    })();
  }, []);

  useEffect(() => {
    if (authGate !== 'allowed') return;
    loadTeams();
    loadClubInfo();
  }, [authGate]);

  const loadClubInfo = () => {
      const storedClub = localStorage.getItem('dugnad_club');
      if (storedClub) {
          try {
              const club = JSON.parse(storedClub);
              if (club.name) setClubName(club.name);
          } catch (e) {}
      }
  };

  const getUserId = (): string | null => {
    try {
      const stored = localStorage.getItem('dugnad_user');
      if (stored) return JSON.parse(stored).id || null;
    } catch {}
    return null;
  };

  // Lag leses fra team_members-tabellen (DB) som er kanonisk etter
  // RLS Steg A. localStorage brukes kun som CACHE for team-metadata
  // (navn, sport, birthYear) — team-eierskap valideres alltid mot
  // team_members først.
  //
  // Hvis en legacy timestamp-basert team_id ligger igjen i
  // localStorage (fra før team_id-normaliseringsrunden), blir den
  // filtrert bort her siden ingen team_members-rad matcher den.
  const loadTeams = async () => {
    try {
      // 1. Hent brukerens kanoniske team-medlemskap fra DB
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setGroupedTeams({});
        setLoading(false);
        return;
      }

      const { data: memberships, error } = await supabase
        .from('team_members')
        .select('team_id, role')
        .eq('auth_user_id', authUser.id)
        .in('role', ['coordinator', 'club_admin']);

      if (error) {
        console.error('Feil ved henting av team_members:', error);
        setGroupedTeams({});
        setLoading(false);
        return;
      }

      const myTeamIds = new Set((memberships || []).map(m => m.team_id));

      // 2. Berik med team-metadata fra localStorage-cachen. Bruker
      //    bare team-rader som faktisk matcher team_members — ingen
      //    fantom-team.
      const storedTeams = localStorage.getItem('dugnad_teams');
      const cachedTeams: StoredTeam[] = storedTeams ? JSON.parse(storedTeams) : [];
      const validTeams = cachedTeams.filter(t => myTeamIds.has(t.id));

      // 3. Hvis cachen er ufullstendig (mangler team-metadata for
      //    noen av medlemskapene våre), lag minimalistiske team-
      //    oppføringer fra bare team_id-slug-en. De kan parses
      //    for sport/kjønn/år via displayTeamName senere.
      const cachedIds = new Set(validTeams.map(t => t.id));
      myTeamIds.forEach(tid => {
        if (!cachedIds.has(tid)) {
          validTeams.push({
            id: tid,
            clubId: '',
            sport: tid.split('-')[0] || 'other',
            gender: '',
            birthYear: 0,
            name: tid,
            createdAt: new Date().toISOString(),
          });
        }
      });

      const groups: Record<string, StoredTeam[]> = {};
      validTeams.forEach(team => {
        const sport = team.sport || 'other';
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(team);
      });

      setGroupedTeams(groups);

      // 4. Velg aktivt lag: cached preference hvis den fortsatt
      //    finnes i team_members, ellers første lag, ellers ingen.
      const userId = authUser.id;
      const userLastTeam = localStorage.getItem(`dugnad_last_team_${userId}`);

      if (userLastTeam && myTeamIds.has(userLastTeam)) {
        setSelectedTeam(userLastTeam);
        localStorage.setItem('dugnad_active_team_filter', userLastTeam);
      } else if (validTeams.length > 0) {
        setSelectedTeam(validTeams[0].id);
        localStorage.setItem('dugnad_active_team_filter', validTeams[0].id);
      } else {
        // Ingen lag — rydd localStorage så legacy timestamps ikke
        // henger igjen og forvirrer andre komponenter.
        setSelectedTeam('');
        localStorage.removeItem('dugnad_active_team_filter');
      }
    } catch (error) {
      console.error('Feil ved henting av lag:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamClick = (teamId: string) => {
      setSelectedTeam(teamId);
      localStorage.setItem('dugnad_active_team_filter', teamId);
      // Lagre bruker-spesifikk preferanse
      const userId = getUserId();
      if (userId) {
          localStorage.setItem(`dugnad_last_team_${userId}`, teamId);
      }
      // Naviger til dashboard (fungerer som lagets startside)
      if (window.location.pathname !== '/coordinator-dashboard') {
          window.location.href = '/coordinator-dashboard';
      } else {
          window.location.reload();
      }
  };

  const navigateTo = (path: string) => { setMobileMenuOpen(false); window.location.href = path; };
  const switchToFamilyView = () => { window.location.href = '/family-dashboard'; };
  const sportOrder = ['dance', 'football', 'handball', 'ishockey', 'volleyball', 'basketball', 'other'];

  // NY: LOGG UT FUNKSJON
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
      if(confirm('Vil du logge ut?')) {
          await supabase.auth.signOut();
          localStorage.removeItem('dugnad_user');
          window.location.href = '/';
      }
  };

  const [planLevel] = useState<'free' | 'aktiv' | 'premium'>(() => {
    try {
      const val = localStorage.getItem('dugnad_premium');
      if (val === 'premium' || val === 'true') return 'premium';
      if (val === 'aktiv') return 'aktiv';
      return 'free';
    } catch { return 'free'; }
  });

  // Hent aktivt lag-info for header
  const getActiveTeamInfo = () => {
    try {
      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      const activeId = localStorage.getItem('dugnad_active_team_filter');
      return activeId ? teams.find((t: any) => t.id === activeId) : teams[0];
    } catch { return null; }
  };
  getActiveTeamInfo();
  const currentPath = window.location.pathname;

  const navItems = [
    { path: '/coordinator-dashboard', label: 'Oversikt', icon: '📊' },
    { path: '/events-list', label: 'Arrangementer', icon: '📅' },
    { path: '/manage-families', label: 'Spillere & familier', icon: '👥' },
    { path: '/attendance', label: 'Historikk', icon: '📋' },
  ];

  const premiumItems = [
    { path: '/lottery-admin', label: 'Digital loddbok', icon: '🎟️', revenue: true },
    { path: '/sales-campaign', label: 'Salgskampanje', icon: '🛍️', revenue: true },
    { path: '/kiosk-admin', label: 'Kiosk', icon: '🛒', revenue: true },
    { path: '/marketplace', label: 'Marked', icon: '🏷️', revenue: false },
    // TODO: Skru på igjen når sponsor-modulen er klar for pilot
    // { path: '/sponsor-admin', label: 'Sponsorer', icon: '🏪', revenue: true },
  ];

  // Auth-gate: vis nøytral loading mens sjekken kjører, render aldri
  // koordinator-innhold før tilgang er verifisert.
  if (authGate === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5e50' }}>Laster...</div>;
  }
  if (authGate === 'denied') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5e50' }}>Omdirigerer...</div>;
  }

  return (
    <div className="coordinator-layout">
      <aside className={`coordinator-sidebar ${mobileMenuOpen ? '' : 'collapsed'}`}>
        <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        {/* HEADER */}
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="sidebar-logo">D+</div>
              <div>
                <h2 className="sidebar-club-name">{clubName}</h2>
                <p className="sidebar-season">Sesong {new Date().getFullYear()}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* SEKSJON 1: LAG-VELGER */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>LAG</div>
          {loading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Laster...</div>
          ) : Object.keys(groupedTeams).length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Ingen lag ennå.<br />
              <a href="/setup-team" style={{ color: '#1a7a4a', fontWeight: 600 }}>+ Opprett første lag</a>
            </div>
          ) : (
            sportOrder.map(sportKey => {
              const teamsInGroup = groupedTeams[sportKey];
              if (!teamsInGroup || teamsInGroup.length === 0) return null;
              return (
                <div key={sportKey} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '500', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {SPORT_ICONS[sportKey]} {SPORT_LABELS_DISPLAY[sportKey]}
                  </div>
                  {teamsInGroup.map(team => {
                    const isActive = selectedTeam === team.id;
                    const isOff = team.isActive === false;
                    return (
                      <button key={team.id} onClick={() => handleTeamClick(team.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                          padding: '8px 10px', margin: '2px 0', borderRadius: '6px', border: 'none',
                          background: isActive ? '#e8f5ef' : 'transparent',
                          color: isActive ? '#0f6e56' : isOff ? 'var(--text-secondary)' : 'var(--text-primary)',
                          fontWeight: isActive ? '600' : '400', fontSize: '14px', cursor: 'pointer',
                          opacity: isOff ? 0.5 : 1, fontStyle: isOff ? 'italic' : 'normal',
                          transition: 'background 0.15s'
                        }}
                      >
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#1a7a4a' : '#cbd5e0', flexShrink: 0 }} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{formatTeamDisplayName(team)}{isOff ? ' (pause)' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
          <button onClick={() => navigateTo('/setup-team')} style={{ width: '100%', marginTop: '4px', padding: '6px', fontSize: '12px', background: 'none', border: '1px dashed #cbd5e0', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>+ Nytt lag</button>
        </div>

        {/* SEKSJON 2: KJERNENAVIGASJON */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', flex: 1 }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>NAVIGASJON</div>
          {navItems.map(item => {
            const isActive = currentPath === item.path || (item.path === '/coordinator-dashboard' && currentPath === '/coordinator-dashboard');
            return (
              <button key={item.path} onClick={() => navigateTo(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                  padding: '9px 10px', margin: '1px 0', borderRadius: '6px', border: 'none',
                  background: isActive ? '#e8f5ef' : 'transparent',
                  color: isActive ? '#0f6e56' : 'var(--text-primary)',
                  fontWeight: isActive ? '500' : '400', fontSize: '14px', cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              </button>
            );
          })}
          {/* Uløste saker med badge */}
          <button onClick={() => navigateTo('/coordinator-dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
              padding: '9px 10px', margin: '1px 0', borderRadius: '6px', border: 'none',
              background: 'transparent', color: '#c0392b',
              fontWeight: '500', fontSize: '14px', cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>⚠️</span>
            <span style={{ flex: 1, textAlign: 'left' }}>Uløste saker</span>
            <span style={{ background: '#c0392b', color: 'white', fontSize: '10px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>3</span>
          </button>
        </div>

        {/* SEKSJON 3: INNTEKT */}
        <div style={{ padding: '12px 16px' }}>
          {/* Upsell-banner for ikke-premium */}
          {planLevel !== 'premium' && (
            <div style={{ background: '#f2faf6', borderRadius: '8px', padding: '12px', borderBottom: '2px solid #2d6a4f', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#2d6a4f' }}>★ {planLevel === 'aktiv' ? 'Aktiv' : 'Gratis'}-plan</span>
              </div>
              <div style={{ fontSize: '12px', color: '#2d6a4f' }}>Du bruker {planLevel === 'aktiv' ? 'Aktiv' : 'Gratis'}-planen</div>
              <div style={{ fontSize: '11px', color: '#4a5e50', marginTop: '4px' }}>
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigateTo('/premium')}>Se Premium-planen →</span>
              </div>
            </div>
          )}
          {planLevel === 'premium' && (
            <div style={{ background: '#f2faf6', borderRadius: '8px', padding: '12px', borderBottom: '2px solid #1a7a4a', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>★ Premium</span>
                <span style={{ fontSize: '10px', background: '#e8f5ef', color: '#0f6e56', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Aktivert</span>
              </div>
              <div style={{ fontSize: '12px', color: '#1a7a4a' }}>Tjen penger til lagkassen</div>
            </div>
          )}
          {/* Alle premium-features er alltid tilgjengelige for utforsking */}
          {premiumItems.map(item => (
            <button key={item.path} onClick={() => navigateTo(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '8px 10px', margin: '1px 0', borderRadius: '6px', border: 'none',
                background: currentPath === item.path ? '#e8f5ef' : 'transparent',
                color: currentPath === item.path ? '#0f6e56' : 'var(--text-primary)',
                fontSize: '13px', cursor: 'pointer', fontWeight: currentPath === item.path ? '500' : '400'
              }}
            >
              <span>{item.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            </button>
          ))}
          {/* SMS-varsler (aktiv/premium) */}
          {planLevel !== 'free' && (
            <button onClick={() => navigateTo('/settings/sms')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '8px 10px', margin: '1px 0', borderRadius: '6px', border: 'none',
                background: currentPath === '/settings/sms' ? '#e8f5ef' : 'transparent',
                color: currentPath === '/settings/sms' ? '#0f6e56' : 'var(--text-primary)',
                fontSize: '13px', cursor: 'pointer', fontWeight: currentPath === '/settings/sms' ? '500' : '400'
              }}
            >
              <span>📱</span>
              <span style={{ flex: 1, textAlign: 'left' }}>SMS-varsler</span>
            </button>
          )}
          {/* Kampanjeoversikt */}
          <button onClick={() => navigateTo('/campaign-overview')}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
              padding: '8px 10px', margin: '4px 0 1px', borderRadius: '6px', border: 'none',
              borderTop: '0.5px solid #e8e0d0',
              background: currentPath === '/campaign-overview' ? '#e8f5ef' : 'transparent',
              color: currentPath === '/campaign-overview' ? '#0f6e56' : 'var(--text-primary)',
              fontSize: '13px', cursor: 'pointer', fontWeight: currentPath === '/campaign-overview' ? '500' : '400'
            }}
          >
            <span>📊</span>
            <span style={{ flex: 1, textAlign: 'left' }}>Kampanjeoversikt</span>
          </button>
        </div>

        {/* FOOTER */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
          <button onClick={() => navigateTo('/theme-settings')} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', marginBottom: '4px' }}>🎨 Tema</button>
          <button onClick={switchToFamilyView} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', border: 'none', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', marginBottom: '4px' }}>👨‍👩‍👧 Foresatt-visning</button>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', border: 'none', background: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>🚪 Logg ut</button>
        </div>
      </aside>

      <main className="coordinator-main">
        {children}
      </main>
    </div>
  );
};