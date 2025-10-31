import React, { useState } from 'react';

export const ClubSearchPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock data - in real app this comes from database
  const existingClubs = [
    { id: 1, name: 'Kongsvinger IL', sports: 3, teams: 8 },
    { id: 2, name: 'Elverum IL', sports: 2, teams: 5 },
    { id: 3, name: 'Hamar IL', sports: 4, teams: 12 },
  ];

  const filteredClubs = existingClubs.filter(club =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showCreateNew = searchQuery.length > 2 && filteredClubs.length === 0;

  const joinClub = (clubName: string) => {
    alert('Joining club: ' + clubName + ' (coming soon)');
  };

  const createNewClub = () => {
    // Store the club name for next screen
    localStorage.setItem('newClubName', searchQuery);
    window.location.href = '/sport-selection';
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/role-selection'}
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
        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Finn eller opprett klubb
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Søk etter din klubb eller opprett en ny
        </p>

        <div style={{ position: 'relative', marginBottom: '30px' }}>
          <input 
            type="text"
            placeholder="🔍 Søk etter klubb..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '18px 20px',
              fontSize: '16px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2196F3'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
        </div>

        {searchQuery.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            {filteredClubs.length > 0 ? (
              <div>
                <h3 style={{ fontSize: '1.1em', marginBottom: '15px', color: '#333' }}>
                  Forslag:
                </h3>
                {filteredClubs.map(club => (
                  <div 
                    key={club.id}
                    onClick={() => joinClub(club.name)}
                    style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      border: '2px solid transparent',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#2196F3';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        backgroundColor: '#e3f2fd',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px'
                      }}>
                        🏢
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '5px' }}>
                          {club.name}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666' }}>
                          {club.sports} idretter • {club.teams} lag registrert
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {showCreateNew && (
              <div style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '12px',
                border: '2px dashed #2196F3',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '15px' }}>🆕</div>
                <h3 style={{ fontSize: '1.2em', marginBottom: '10px', color: '#333' }}>
                  Finner ikke klubben din?
                </h3>
                <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '20px' }}>
                  Opprett "{searchQuery}" som ny klubb
                </p>
                <button 
                  onClick={createNewClub}
                  style={{
                    backgroundColor: '#2196F3',
                    color: 'white',
                    padding: '14px 30px',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)'
                  }}
                >
                  Opprett ny klubb
                </button>
              </div>
            )}
          </div>
        )}

        {searchQuery.length === 0 && (
          <div style={{
            backgroundColor: 'white',
            padding: '40px 20px',
            borderRadius: '12px',
            textAlign: 'center',
            color: '#666'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔍</div>
            <p>Begynn å skrive for å søke etter din klubb</p>
          </div>
        )}

        <div style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: '#e3f2fd',
          borderRadius: '12px',
          border: '1px solid #2196F3'
        }}>
          <div style={{ fontSize: '20px', marginBottom: '10px' }}>💡 Tips</div>
          <ul style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', paddingLeft: '20px' }}>
            <li>Skriv hele klubbnavnet: "Kongsvinger IL" ikke "KIL"</li>
            <li>Sjekk om klubben allerede eksisterer før du oppretter ny</li>
            <li>Du kan legge til logo senere i innstillinger</li>
          </ul>
        </div>
      </div>
    </div>
  );
};