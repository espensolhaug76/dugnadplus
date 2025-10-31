import React, { useState } from 'react';

export const SportSelectionPage: React.FC = () => {
  const clubName = localStorage.getItem('newClubName') || 'Min Klubb';
  const [customSport, setCustomSport] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const sports = [
    { id: 'fotball', name: 'Fotball', icon: '⚽', color: '#4CAF50' },
    { id: 'handball', name: 'Håndball', icon: '🤾', color: '#FF9800' },
    { id: 'swimming', name: 'Svømming', icon: '🏊', color: '#2196F3' },
    { id: 'hockey', name: 'Ishockey', icon: '🏒', color: '#9C27B0' },
    { id: 'gymnastics', name: 'Gymnastikk', icon: '🤸', color: '#E91E63' },
    { id: 'basketball', name: 'Basketball', icon: '🏀', color: '#FF5722' },
  ];

  const selectSport = (sportName: string) => {
    localStorage.setItem('selectedSport', sportName);
    window.location.href = '/team-creation';
  };

  const handleCustomSport = () => {
    if (customSport.trim()) {
      selectSport(customSport.trim());
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/club-search'}
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
            Oppretter klubb:
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#333' }}>
            {clubName}
          </div>
        </div>

        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Velg idrett
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Hvilken idrett vil du administrere dugnader for?
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '15px',
          marginBottom: '20px'
        }}>
          {sports.map(sport => (
            <button
              key={sport.id}
              onClick={() => selectSport(sport.name)}
              style={{
                backgroundColor: 'white',
                border: 'none',
                borderRadius: '16px',
                padding: '30px 20px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                textAlign: 'center'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>
                {sport.icon}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>
                {sport.name}
              </div>
            </button>
          ))}
        </div>

        {!showCustomInput ? (
          <button
            onClick={() => setShowCustomInput(true)}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#2196F3',
              border: '2px dashed #2196F3',
              borderRadius: '12px',
              padding: '20px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ➕ Annen idrett...
          </button>
        ) : (
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <input
              type="text"
              placeholder="Skriv inn idrettsnavn"
              value={customSport}
              onChange={(e) => setCustomSport(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                marginBottom: '10px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#2196F3'}
              onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleCustomSport}
                style={{
                  flex: 1,
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Fortsett
              </button>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomSport('');
                }}
                style={{
                  backgroundColor: '#f5f5f5',
                  color: '#666',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};