import React, { useState } from 'react';

export const FamilyTeamSelectionPage: React.FC = () => {
  const clubData = JSON.parse(localStorage.getItem('selectedClubData') || '{}');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const toggleTeam = (teamId: string) => {
    if (selectedTeams.includes(teamId)) {
      setSelectedTeams(selectedTeams.filter(t => t !== teamId));
    } else {
      setSelectedTeams([...selectedTeams, teamId]);
    }
  };

  const continueToFamilyInfo = () => {
    localStorage.setItem('selectedTeams', JSON.stringify(selectedTeams));
    window.location.href = '/family-members';
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/family-club-search'}
        style={{
          background: 'none',
          border: 'none',
          color: '#333',
          fontSize: '24px',
          cursor: 'pointer',
          padding: '10px',
          marginBottom: '20px'
        }}
      >
        ←
      </button>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '30px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
            Valgt klubb:
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#333' }}>
            {clubData.name}
          </div>
        </div>

        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Velg lag
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Velg alle lag barna dine er medlem av (du kan velge flere)
        </p>

        {clubData.sports && clubData.sports.map((sport: any, sportIdx: number) => (
          <div key={sportIdx} style={{ marginBottom: '30px' }}>
            <h3 style={{ 
              fontSize: '1.3em', 
              color: '#333', 
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span>{sport.name === 'Fotball' ? '⚽' : sport.name === 'Håndball' ? '🤾' : '🏊'}</span>
              {sport.name}
            </h3>
            
            {sport.teams.map((team: string, teamIdx: number) => {
              const teamId = sport.name + '-' + team;
              const isSelected = selectedTeams.includes(teamId);
              
              return (
                <button
                  key={teamIdx}
                  onClick={() => toggleTeam(teamId)}
                  style={{
                    width: '100%',
                    backgroundColor: isSelected ? '#e3f2fd' : 'white',
                    border: isSelected ? '2px solid #2196F3' : '2px solid #e0e0e0',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    marginBottom: '10px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#2196F3';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.borderColor = '#e0e0e0';
                    }
                  }}
                >
                  <div>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      color: isSelected ? '#2196F3' : '#333',
                      marginBottom: '4px'
                    }}>
                      {team}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      {sport.name}
                    </div>
                  </div>
                  {isSelected && (
                    <div style={{ fontSize: '24px', color: '#2196F3' }}>✓</div>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        <button
          onClick={continueToFamilyInfo}
          disabled={selectedTeams.length === 0}
          style={{
            width: '100%',
            backgroundColor: selectedTeams.length === 0 ? '#ccc' : '#2196F3',
            color: 'white',
            padding: '18px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: selectedTeams.length === 0 ? 'not-allowed' : 'pointer',
            marginTop: '20px',
            boxShadow: selectedTeams.length === 0 ? 'none' : '0 4px 12px rgba(33, 150, 243, 0.3)'
          }}
        >
          Fortsett ({selectedTeams.length} lag valgt)
        </button>
      </div>
    </div>
  );
};