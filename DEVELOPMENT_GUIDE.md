New-Item -Path "src\components\FamilyClubSearchPage.tsx" -ItemType File -Force -Value @'
import React, { useState } from 'react';

export const FamilyClubSearchPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const existingClubs = [
    { 
      id: 1, 
      name: 'Kongsvinger IL', 
      sports: [
        { name: 'Fotball', teams: ['Gutter 2016', 'Gutter 2018', 'Jenter 2015'] },
        { name: 'Håndball', teams: ['Gutter 2017', 'Mixed 2016'] }
      ]
    },
    { 
      id: 2, 
      name: 'Elverum IL', 
      sports: [
        { name: 'Fotball', teams: ['Gutter 2016'] },
        { name: 'Svømming', teams: ['Mixed 2017', 'Jenter 2018'] }
      ]
    },
  ];

  const filteredClubs = existingClubs.filter(club =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectClub = (club: any) => {
    localStorage.setItem('selectedClubData', JSON.stringify(club));
    window.location.href = '/family-team-selection';
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
        ?
      </button>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Finn din klubb
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Søk etter klubben dere er medlem av
        </p>

        <input 
          type="text"
          placeholder="?? Søk etter klubb..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '18px 20px',
            fontSize: '16px',
            border: '2px solid #e0e0e0',
            borderRadius: '12px',
            marginBottom: '30px',
            outline: 'none',
            boxSizing: 'border-box'
          }}
          onFocus={(e) => e.target.style.borderColor = '#2196F3'}
          onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
        />

        {searchQuery.length > 0 && filteredClubs.length > 0 && (
          <div>
            {filteredClubs.map(club => (
              <div 
                key={club.id}
                onClick={() => selectClub(club)}
                style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '12px',
                  marginBottom: '15px',
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
                    ??
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                      {club.name}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      {club.sports.map(s => s.name).join(', ')}
                    </div>
                  </div>
                  <div style={{ fontSize: '24px', color: '#2196F3' }}>?</div>
                </div>
              </div>
            ))}
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
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>???????????</div>
            <p>Begynn å skrive for å søke etter klubben din</p>
          </div>
        )}

        <div style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: '#fff3cd',
          borderRadius: '12px',
          border: '1px solid #ffc107'
        }}>
          <div style={{ fontSize: '20px', marginBottom: '10px' }}>?? Tips</div>
          <ul style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', paddingLeft: '20px' }}>
            <li>Finn klubben ditt barn er medlem av</li>
            <li>Du kan registrere flere barn samtidig</li>
            <li>Ett barn kan være med i flere lag/idretter</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
