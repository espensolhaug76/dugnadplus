import React from 'react';

export const RoleSelectionPage: React.FC = () => {
  const selectRole = (role: string) => {
    if (role === 'coordinator') {
      window.location.href = '/club-search';
    } else if (role === 'family') {
      window.location.href = '/family-club-search';
    } else if (role === 'substitute') {
      alert('Substitute flow coming soon!');
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, rgba(50, 80, 120, 0.85) 0%, rgba(30, 50, 80, 0.9) 100%), url(https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1200) center/cover',
      backgroundBlendMode: 'overlay',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '20px'
    }}>
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        maxWidth: '500px',
        margin: '0 auto',
        width: '100%',
        padding: '0 10px'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          backgroundColor: 'white',
          borderRadius: '50%',
          margin: '0 auto 30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '32px',
          fontWeight: 'bold',
          color: '#4682b4',
          border: '3px solid white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          D+
        </div>

        <h1 style={{ fontSize: '2.5em', marginBottom: '10px', fontWeight: '700', textAlign: 'center' }}>
          Hva vil du gjøre?
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '50px', opacity: 0.9, textAlign: 'center' }}>
          Velg din rolle for å komme i gang
        </p>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button 
            onClick={() => selectRole('coordinator')}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#333',
              padding: '25px 20px',
              border: 'none',
              borderRadius: '16px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              textAlign: 'left',
              transition: 'transform 0.2s',
              boxSizing: 'border-box'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>👨‍💼</div>
            <div style={{ fontSize: '20px', marginBottom: '5px' }}>Dugnadsansvarlig</div>
            <div style={{ fontSize: '14px', color: '#666', fontWeight: '400' }}>
              Opprett og administrer klubb og lag
            </div>
          </button>

          <button 
            onClick={() => selectRole('family')}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#333',
              padding: '25px 20px',
              border: 'none',
              borderRadius: '16px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              textAlign: 'left',
              transition: 'transform 0.2s',
              boxSizing: 'border-box'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>👨‍👩‍👧‍👦</div>
            <div style={{ fontSize: '20px', marginBottom: '5px' }}>Familie</div>
            <div style={{ fontSize: '14px', color: '#666', fontWeight: '400' }}>
              Bli med i eksisterende lag
            </div>
          </button>

          <button 
            onClick={() => selectRole('substitute')}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#333',
              padding: '25px 20px',
              border: 'none',
              borderRadius: '16px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              textAlign: 'left',
              transition: 'transform 0.2s',
              boxSizing: 'border-box'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🤝</div>
            <div style={{ fontSize: '20px', marginBottom: '5px' }}>Vikar</div>
            <div style={{ fontSize: '14px', color: '#666', fontWeight: '400' }}>
              Tilby vikartjenester mot betaling
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
