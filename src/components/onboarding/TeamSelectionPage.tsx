import React, { useState, useEffect } from 'react';

interface Team {
  id: string;
  sport: string;
  gender: string;
  birthYear: number;
  name: string;
}

export const TeamSelectionPage: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    // Load teams from localStorage
    const storedTeams = localStorage.getItem('dugnad_teams');
    if (storedTeams) {
      setTeams(JSON.parse(storedTeams));
    }
  }, []);

  const handleContinue = () => {
    if (!selectedTeam) {
      alert('Vennligst velg et lag');
      return;
    }

    localStorage.setItem('dugnad_selected_team', JSON.stringify(selectedTeam));
    window.location.href = '/setup-family';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '60px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Velg lag
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            Hvilket lag skal barna dine være med på?
          </p>
        </div>

        {teams.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {teams.map((team) => (
              <div
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                className="card"
                style={{
                  padding: '20px',
                  cursor: 'pointer',
                  border: selectedTeam?.id === team.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                  background: selectedTeam?.id === team.id ? 'rgba(22, 168, 184, 0.05)' : 'white',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '24px',
                    }}
                  >
                    {team.sport === 'football' ? '⚽' : '🤾'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{team.name}</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {team.sport === 'football' ? 'Fotball' : team.sport === 'handball' ? 'Håndball' : 'Idrett'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '48px', textAlign: 'center', marginBottom: '24px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Ingen lag tilgjengelig</p>
          </div>
        )}

        <button
          onClick={handleContinue}
          className="btn btn-primary btn-large"
          style={{ width: '100%' }}
          disabled={!selectedTeam}
        >
          Fortsett
        </button>
      </div>
    </div>
  );
};
