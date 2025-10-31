import React, { useState, useEffect } from 'react';

export const TeamCreationPage: React.FC = () => {
  const clubName = localStorage.getItem('newClubName') || 'Min Klubb';
  const sport = localStorage.getItem('selectedSport') || 'Fotball';
  
  const [gender, setGender] = useState<string>('gutter');
  const [year, setYear] = useState<string>('2016');
  const [teamName, setTeamName] = useState<string>('');

  // Auto-generate team name
  useEffect(() => {
    const genderText = gender === 'gutter' ? 'Gutter' : gender === 'jenter' ? 'Jenter' : 'Mixed';
    setTeamName(genderText + ' ' + year);
  }, [gender, year]);

  const createTeam = () => {
    // Store team data
    const teamData = {
      club: clubName,
      sport: sport,
      gender: gender,
      year: year,
      name: teamName
    };
    
    localStorage.setItem('teamData', JSON.stringify(teamData));
    
    // Go to dashboard
    window.location.href = '/dashboard';
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/sport-selection'}
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
            Oppretter lag for:
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#333' }}>
            {clubName} - {sport}
          </div>
        </div>

        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Opprett lag
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Fyll inn informasjon om laget
        </p>

        <div style={{
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <div style={{ marginBottom: '25px' }}>
            <label style={{ fontSize: '16px', fontWeight: '600', color: '#333', display: 'block', marginBottom: '12px' }}>
              Kjønn:
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {['gutter', 'jenter', 'mixed'].map(g => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    border: gender === g ? '2px solid #2196F3' : '2px solid #e0e0e0',
                    backgroundColor: gender === g ? '#e3f2fd' : 'white',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: gender === g ? '#2196F3' : '#666',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'capitalize'
                  }}
                >
                  {g === 'gutter' ? 'Gutter' : g === 'jenter' ? 'Jenter' : 'Mixed'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '25px' }}>
            <label style={{ fontSize: '16px', fontWeight: '600', color: '#333', display: 'block', marginBottom: '12px' }}>
              Årgang:
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min="2000"
              max="2025"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2196F3'}
              onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
            />
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label style={{ fontSize: '16px', fontWeight: '600', color: '#333', display: 'block', marginBottom: '12px' }}>
              Lagnavn: <span style={{ fontSize: '14px', fontWeight: '400', color: '#999' }}>(kan redigeres)</span>
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2196F3'}
              onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
            />
          </div>

          <button
            onClick={createTeam}
            style={{
              width: '100%',
              backgroundColor: '#2196F3',
              color: 'white',
              padding: '16px',
              border: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.3)';
            }}
          >
            Fullfør og opprett lag 🎉
          </button>
        </div>

        <div style={{
          marginTop: '30px',
          padding: '20px',
          backgroundColor: '#fff3cd',
          borderRadius: '12px',
          border: '1px solid #ffc107'
        }}>
          <div style={{ fontSize: '20px', marginBottom: '10px' }}>💡 Neste steg</div>
          <ul style={{ fontSize: '14px', color: '#666', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>Legg til familier (importer fra Spond eller Excel)</li>
            <li>Opprett vakter for hele sesongen på én gang</li>
            <li>La systemet fordele vakter automatisk</li>
            <li>Last opp klubblogo i innstillinger (valgfritt)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};