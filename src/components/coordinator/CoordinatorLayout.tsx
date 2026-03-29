import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import './CoordinatorLayout.css';

interface CoordinatorLayoutProps {
  children: React.ReactNode;
}

const getSportFromTeamName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('håndball') || lower.includes('handball')) return 'handball';
    if (lower.includes('fotball') || lower.includes('football')) return 'football';
    if (lower.includes('dans') || lower.includes('dance')) return 'dance';
    if (lower.includes('hockey') || lower.includes('ishockey')) return 'ishockey';
    if (lower.includes('volleyball')) return 'volleyball';
    return 'other';
};

const SPORT_ICONS: Record<string, string> = {
    football: '⚽', handball: '🤾', dance: '💃', ishockey: '🏒', volleyball: '🏐', other: 'Vi' 
};

const SPORT_LABELS: Record<string, string> = {
    football: 'FOTBALL', handball: 'HÅNDBALL', dance: 'DANS', ishockey: 'ISHOCKEY', volleyball: 'VOLLEYBALL', other: 'ANDRE LAG'
};

export const CoordinatorLayout: React.FC<CoordinatorLayoutProps> = ({ children }) => {
  const [groupedTeams, setGroupedTeams] = useState<Record<string, string[]>>({});
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState('Min Klubb');

  useEffect(() => {
    fetchTeams();
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

  const fetchTeams = async () => {
    try {
      const { data } = await supabase
        .from('family_members')
        .select('subgroup')
        .not('subgroup', 'is', null);

      let uniqueTeams: string[] = [];

      if (data) {
        uniqueTeams = Array.from(new Set(data.map(d => d.subgroup).filter(g => g && g.trim() !== '')));
      }

      const storedCurrentTeam = localStorage.getItem('dugnad_current_team');
      if (storedCurrentTeam) {
          try {
              const teamObj = JSON.parse(storedCurrentTeam);
              if (teamObj.name && !uniqueTeams.includes(teamObj.name)) {
                  uniqueTeams.push(teamObj.name);
              }
          } catch (e) {}
      }

      uniqueTeams.sort();
      
      const groups: Record<string, string[]> = {};
      uniqueTeams.forEach(team => {
          const sport = getSportFromTeamName(team);
          if (!groups[sport]) groups[sport] = [];
          groups[sport].push(team);
      });

      setGroupedTeams(groups);
      
      const activeFilter = localStorage.getItem('dugnad_active_team_filter');
      if (activeFilter && uniqueTeams.includes(activeFilter)) {
          setSelectedTeam(activeFilter);
      }

    } catch (error) {
      console.error('Feil ved henting av lag:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTeamClick = (team: string) => {
      setSelectedTeam(team);
      localStorage.setItem('dugnad_active_team_filter', team);
      window.location.reload(); 
  };

  const navigateTo = (path: string) => { window.location.href = path; };
  const switchToFamilyView = () => { window.location.href = '/family-dashboard'; };
  const sportOrder = ['dance', 'football', 'handball', 'ishockey', 'volleyball', 'other'];

  // NY: LOGG UT FUNKSJON
  const handleLogout = async () => {
      if(confirm('Vil du logge ut?')) {
          await supabase.auth.signOut();
          localStorage.removeItem('dugnad_user');
          window.location.href = '/';
      }
  };

  return (
    <div className="coordinator-layout">
      <aside className="coordinator-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">D+</div>
          <h2 className="sidebar-club-name">{clubName}</h2>
          <p className="sidebar-season">Sesong {new Date().getFullYear()}</p>
        </div>

        <div className="sidebar-section">
          {loading ? (
              <div style={{padding:'10px', fontSize:'12px', color:'#9ca3af'}}>Laster lag...</div>
          ) : (
              Object.keys(groupedTeams).length === 0 ? (
                  <div style={{padding:'10px', fontSize:'12px', color:'#9ca3af'}}>Ingen lag funnet. <br/><a href="/setup-team">Opprett et lag nå</a></div>
              ) : (
                  sportOrder.map(sportKey => {
                      const teamsInGroup = groupedTeams[sportKey];
                      if (!teamsInGroup || teamsInGroup.length === 0) return null;

                      return (
                          <div key={sportKey} style={{marginBottom: '20px'}}>
                              <h3 className="sidebar-section-title">
                                  {SPORT_ICONS[sportKey]} {SPORT_LABELS[sportKey]}
                              </h3>
                              {teamsInGroup.map(team => (
                                <button
                                    key={team}
                                    onClick={() => handleTeamClick(team)}
                                    className={`team-button ${selectedTeam === team ? 'active' : ''}`}
                                >
                                    <div className="team-info">
                                        <div className="team-dot" style={{ background: selectedTeam === team ? 'white' : 'transparent', border: selectedTeam === team ? 'none' : '2px solid #cbd5e0' }} />
                                        <span>{team}</span>
                                    </div>
                                </button>
                              ))}
                          </div>
                      );
                  })
              )
          )}
        </div>

        <div className="sidebar-actions">
          <h3 className="sidebar-section-title">HANDLINGER</h3>
          <button onClick={() => navigateTo('/create-event')} className="btn btn-primary action-button">➕ Nytt arrangement</button>
          <button onClick={() => navigateTo('/events-list')} className="btn btn-secondary action-button">📅 Mine arrangementer</button>
          <button onClick={() => navigateTo('/attendance')} className="btn btn-secondary action-button">✅ Godkjenning</button>
          <button onClick={() => navigateTo('/lottery-admin')} className="btn btn-secondary action-button">🎟️ Digitalt Lotteri</button>
          <button onClick={() => navigateTo('/manage-families')} className="btn btn-secondary action-button">👥 Administrer familier</button>
        </div>

        <div style={{marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border-color)'}}>
            <button onClick={switchToFamilyView} className="btn" style={{width: '100%', fontSize: '13px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', marginBottom: '8px'}}>
                👨‍👩‍👧 Bytt til foresatt-visning
            </button>
            <button onClick={handleLogout} className="btn" style={{width: '100%', fontSize: '13px', color: '#ef4444', border: '1px solid #fee2e2', background: '#fff5f5'}}>
                🚪 Logg ut
            </button>
        </div>
      </aside>

      <main className="coordinator-main">
        {children}
      </main>
    </div>
  );
};