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

const SPORT_LABELS: Record<string, string> = {
    football: 'FOTBALL', handball: 'HÅNDBALL', dance: 'DANS', ishockey: 'ISHOCKEY', volleyball: 'VOLLEYBALL', basketball: 'BASKETBALL', other: 'ANDRE LAG'
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

  useEffect(() => {
    loadTeams();
    loadClubInfo();
  }, []);

  const loadClubInfo = () => {
      const storedClub = localStorage.getItem('dugnad_club');
      if (storedClub) {
          try {
              const club = JSON.parse(storedClub);
              if (club.name) setClubName(club.name);
          } catch (e) {}
      }
  };

  const loadTeams = () => {
    try {
      const storedTeams = localStorage.getItem('dugnad_teams');
      const teams: StoredTeam[] = storedTeams ? JSON.parse(storedTeams) : [];

      const groups: Record<string, StoredTeam[]> = {};
      teams.forEach(team => {
          const sport = team.sport || 'other';
          if (!groups[sport]) groups[sport] = [];
          groups[sport].push(team);
      });

      setGroupedTeams(groups);

      const activeFilter = localStorage.getItem('dugnad_active_team_filter');
      if (activeFilter && teams.some(t => t.id === activeFilter)) {
          setSelectedTeam(activeFilter);
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
      // Naviger til dashboard (fungerer som lagets startside)
      if (window.location.pathname !== '/coordinator-dashboard') {
          window.location.href = '/coordinator-dashboard';
      } else {
          window.location.reload();
      }
  };

  const toggleTeamSeason = (teamId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
          const stored = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
          const updated = stored.map((t: any) => t.id === teamId ? { ...t, isActive: !(t.isActive !== false) } : t);
          localStorage.setItem('dugnad_teams', JSON.stringify(updated));
          loadTeams();
      } catch {}
  };

  const deleteTeam = (teamId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const team = Object.values(groupedTeams).flat().find(t => t.id === teamId);
      if (!confirm(`Slette laget "${team?.name || ''}"? Laget fjernes fra sidebar.`)) return;
      try {
          const stored = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
          const updated = stored.filter((t: any) => t.id !== teamId);
          localStorage.setItem('dugnad_teams', JSON.stringify(updated));
          if (selectedTeam === teamId) localStorage.removeItem('dugnad_active_team_filter');
          loadTeams();
          if (selectedTeam === teamId) window.location.reload();
      } catch {}
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
  const activeTeamInfo = getActiveTeamInfo();
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
    { path: '/sponsor-admin', label: 'Sponsorer', icon: '🏪', revenue: true },
  ];

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
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ingen lag. <a href="/setup-team" style={{ color: '#1a7a4a' }}>Opprett lag</a></div>
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

        {/* SEKSJON 3: PREMIUM */}
        <div style={{ padding: '12px 16px' }}>
          {planLevel === 'free' && (
            <>
              {/* UPSELL BANNER */}
              <div style={{ background: '#1a7a4a', borderRadius: '10px', padding: '16px', color: 'white', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700' }}>★ Premium</span>
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px' }}>Ikke aktivert</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>Tjen penger til lagkassen</div>
                <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '12px' }}>Loddbok, kiosk og sponsoravtaler — alt i ett</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '800' }}>12 500</div>
                    <div style={{ fontSize: '9px', opacity: 0.7 }}>kr/loddsalg snitt</div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: '800' }}>100%</div>
                    <div style={{ fontSize: '9px', opacity: 0.7 }}>til lagkassen</div>
                  </div>
                </div>
                <div style={{ fontSize: '10px', opacity: 0.8, marginBottom: '8px' }}>Trenger du bare SMS-varsler? <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigateTo('/premium')}>Aktiv-plan fra 99 kr/mnd</span></div>
                <button onClick={() => navigateTo('/premium')} style={{ width: '100%', padding: '10px', background: 'white', color: '#1a7a4a', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                  Se hva dere kan tjene...
                </button>
              </div>
              {/* Låste elementer */}
              <div style={{ background: '#f2faf6', borderRadius: '8px', padding: '8px' }}>
                {premiumItems.map(item => (
                  <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px' }}>🔒</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {planLevel === 'aktiv' && (
            <>
              <div style={{ background: '#e6f0e8', borderRadius: '8px', padding: '12px', borderBottom: '2px solid #2d6a4f', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#2d6a4f' }}>★ Aktiv</span>
                  <span style={{ fontSize: '10px', background: '#2d6a4f', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Aktivert</span>
                </div>
                <div style={{ fontSize: '12px', color: '#2d6a4f' }}>SMS-varsler aktivert</div>
                <div style={{ fontSize: '11px', color: '#4a5e50', marginTop: '4px' }}>📱 SMS-kreditter → <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigateTo('/settings/sms')}>Innstillinger</span></div>
              </div>
              {/* SMS settings link */}
              <button onClick={() => navigateTo('/settings/sms')}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 10px', margin: '1px 0', borderRadius: '6px', border: 'none', background: currentPath === '/settings/sms' ? '#e8f5ef' : 'transparent', color: currentPath === '/settings/sms' ? '#0f6e56' : 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: currentPath === '/settings/sms' ? '500' : '400' }}>
                <span>📱</span><span style={{ flex: 1, textAlign: 'left' }}>SMS-varsler</span>
              </button>
              {/* Locked premium items */}
              <div style={{ marginTop: '8px' }}>
                {premiumItems.filter(item => item.revenue).map(item => (
                  <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.5 }}>
                    <span>{item.icon}</span><span>{item.label}</span><span style={{ marginLeft: 'auto', fontSize: '11px' }}>🔒</span>
                  </div>
                ))}
                <div style={{ fontSize: '10px', color: '#4a5e50', padding: '8px', textAlign: 'center' }}>
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigateTo('/premium')}>Oppgrader til Premium</span> for loddbok og kiosk
                </div>
              </div>
            </>
          )}
          {planLevel === 'premium' && (
            <>
              {/* AKTIVERT */}
              <div style={{ background: '#f2faf6', borderRadius: '8px', padding: '12px', borderBottom: '2px solid #1a7a4a', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>★ Premium</span>
                  <span style={{ fontSize: '10px', background: '#e8f5ef', color: '#0f6e56', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Aktivert</span>
                </div>
                <div style={{ fontSize: '12px', color: '#1a7a4a' }}>Tjen penger til lagkassen</div>
              </div>
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
                  {item.revenue && <span style={{ fontSize: '10px', color: '#1a7a4a' }}>+ inntekt</span>}
                </button>
              ))}
              {/* SMS-varsler */}
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
            </>
          )}
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