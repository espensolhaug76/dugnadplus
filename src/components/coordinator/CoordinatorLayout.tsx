import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Footer } from '../common/Footer';
import { runGuide, hasSeenGuide, resetAllGuides } from '../../utils/guides';
import { displayTeamName } from '../../utils/teamSlug';
import './CoordinatorLayout.css';

const PATH_TO_GUIDE_ID: Record<string, string> = {
  '/coordinator-dashboard': 'coordinator-dashboard',
  '/manage-families': 'manage-families',
  '/lottery-admin': 'lottery-admin',
  '/kiosk-admin': 'kiosk-admin',
  '/sales-campaign': 'sales-campaign',
  '/create-event': 'create-event',
};

// Eksponer reset-funksjonen i konsollen for testing:
//   window.resetDugnadGuides()
if (typeof window !== 'undefined') {
  (window as any).resetDugnadGuides = () => {
    resetAllGuides();
    console.log('[guide] Alle guider nullstilt. Reload siden for å se guiden igjen.');
  };
}

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
  const [isClubAdmin, setIsClubAdmin] = useState(false);

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
        .in('role', ['coordinator', 'club_admin']);

      if (!memberships || memberships.length === 0) {
        setAuthGate('denied');
        window.location.href = '/family-dashboard';
        return;
      }

      setIsClubAdmin(memberships.some(m => m.role === 'club_admin'));
      setAuthGate('allowed');
    })();
  }, []);

  useEffect(() => {
    if (authGate !== 'allowed') return;
    loadTeams();
    loadClubInfo();
  }, [authGate]);

  // Auto-trigger onboarding-guide første gang en side besøkes.
  useEffect(() => {
    if (authGate !== 'allowed') return;
    const path = window.location.pathname;
    const guideId = PATH_TO_GUIDE_ID[path];
    if (!guideId) return;
    if (hasSeenGuide(guideId)) return;
    const t = window.setTimeout(() => {
      runGuide(guideId);
    }, 800);
    return () => window.clearTimeout(t);
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
  // RLS Steg A. Visningsmetadata (sport/gender/birthYear/name) er
  // utledet fra team_id-slug-en via displayTeamName, IKKE fra
  // localStorage. Det betyr at gamle test-sesjoner med stale cache
  // ikke kan lekke inn (f.eks. tidligere "handball-gutter-2016"
  // forblir ikke i sidebaren etter at brukeren har opprettet et
  // fotball-lag i en ny klubb).
  //
  // localStorage["dugnad_teams"] OPPDATERES med ferske verdier
  // etter hvert vellykket DB-kall — andre komponenter (f.eks.
  // CoordinatorDashboard.header) som leser cachen, får da også
  // riktige data.
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
        .select('team_id, club_id, role')
        .eq('auth_user_id', authUser.id)
        .in('role', ['coordinator', 'club_admin']);

      if (error) {
        console.error('Feil ved henting av team_members:', error);
        setGroupedTeams({});
        setLoading(false);
        return;
      }

      // Filtrer bort syntetiske 'club:'-rader (klubb-skopede
      // club_admin-bindinger uten reelt lag).
      const teamRows = (memberships || []).filter(
        m => m.team_id && !m.team_id.startsWith('club:')
      );
      const myTeamIds = new Set(teamRows.map(m => m.team_id));

      // 2. Bygg StoredTeam-objekter med metadata utledet fra slug.
      //    displayTeamName parser "{sport}-{gender}-{year}" eller
      //    "{sport}-{custom}". Vi parser også sport/gender/year
      //    direkte for å bevare strukturert data i cachen.
      const validTeams: StoredTeam[] = teamRows.map(m => {
        const slug = m.team_id;
        const parts = slug.split('-').filter(Boolean);
        const sportPart = parts[0] || 'other';
        // Normaliser legacy 'fotball'/'dans' til kanoniske keys
        const sportKey =
          sportPart === 'fotball' ? 'football'
          : sportPart === 'dans' ? 'dance'
          : sportPart;

        const isStandardLayout =
          parts.length >= 3 && ['gutter', 'jenter', 'mixed'].includes(parts[1]);

        const gender = isStandardLayout ? parts[1] : '';
        const birthYear = isStandardLayout ? Number(parts[2]) || 0 : 0;
        const displayName = isStandardLayout
          ? `${gender === 'gutter' ? 'Gutter' : gender === 'jenter' ? 'Jenter' : 'Mixed'} ${birthYear}`
          : displayTeamName(slug).replace(/^[^\s]+\s/, ''); // strip sport-prefix for custom-name

        return {
          id: slug,
          clubId: m.club_id || '',
          sport: sportKey,
          gender,
          birthYear,
          name: displayName,
          createdAt: new Date().toISOString(),
        };
      });

      // 3. Skriv tilbake til localStorage (selv-helbredende cache).
      //    Andre komponenter som leser dugnad_teams får da samme
      //    DB-validerte data uten egen DB-spørring.
      try {
        localStorage.setItem('dugnad_teams', JSON.stringify(validTeams));
      } catch {
        // Best effort — ignorer hvis localStorage er disabled.
      }

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
          // Tøm alle team-/klubb-skopede cacher slik at neste pålogging
          // ikke arver stale data fra forrige bruker (cross-session
          // lekkasje observert i pilot-test 2. mai).
          try {
            localStorage.removeItem('dugnad_user');
            localStorage.removeItem('dugnad_teams');
            localStorage.removeItem('dugnad_club');
            localStorage.removeItem('dugnad_active_team_filter');
            localStorage.removeItem('dugnad_current_team');
            // Bruker-spesifikke "siste lag"-nøkler — fjern alle.
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('dugnad_last_team_')) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
          } catch {}
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
    { path: '/team-coordinators', label: 'Koordinatorer', icon: '🤝' },
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

        {/* KLUBBNIVÅ — synlig kun for club_admin */}
        {isClubAdmin && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <button
              onClick={() => navigateTo('/club-admin-dashboard')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '10px 12px', borderRadius: '8px', border: '1px solid #99f6e4',
                background: '#f0fdfa', color: '#0f6e56',
                fontWeight: '600', fontSize: '13px', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: '16px' }}>🏛️</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Klubbnivå</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>→</span>
            </button>
          </div>
        )}

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
        <Footer />
      </main>
    </div>
  );
};