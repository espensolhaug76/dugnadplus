import React from 'react';

export const LandingPage: React.FC = () => {
  return (
    <div style={{ 
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: 'linear-gradient(180deg, rgba(50, 80, 120, 0.85) 0%, rgba(30, 50, 80, 0.9) 100%), url(https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1200) center/cover',
      backgroundBlendMode: 'overlay',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '40px 20px'
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <img 
          src="/dugnad-plus-logo.png" 
          alt="Dugnad+ Logo" 
          style={{
            width: '120px',
            height: '120px',
            margin: '0 auto',
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))'
          }}
        />
      </div>

      {/* Main Content */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        maxWidth: '500px',
        margin: '0 auto',
        width: '100%'
      }}>
        <h1 style={{ 
          fontSize: '3em', 
          marginBottom: '15px',
          fontWeight: '700',
          textShadow: '0 4px 12px rgba(0,0,0,0.4)'
        }}>
          Velkommen!
        </h1>
        
        <p style={{ 
          fontSize: '1.4em', 
          marginBottom: '60px',
          opacity: 0.95,
          textShadow: '0 2px 8px rgba(0,0,0,0.3)',
          fontWeight: '400'
        }}>
          Din sportsdugnad, forenklet.
        </p>

        {/* Buttons */}
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <button style={{
            width: '100%',
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '18px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '15px',
            boxShadow: '0 4px 16px rgba(33, 150, 243, 0.4)',
            transition: 'all 0.2s'
          }}
          onClick={() => window.location.href = '/login'}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(33, 150, 243, 0.5)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(33, 150, 243, 0.4)';
          }}
          >
            Logg inn
          </button>

          <button style={{
            width: '100%',
            backgroundColor: 'transparent',
            color: 'white',
            padding: '18px',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            transition: 'all 0.2s'
          }}
          onClick={() => window.location.href = '/register'}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            Registrer deg
          </button>
        </div>
      </div>

      {/* Pagination Dots */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center',
        gap: '10px',
        marginTop: '40px'
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: '#2196F3',
          boxShadow: '0 2px 8px rgba(33, 150, 243, 0.6)'
        }} />
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.4)'
        }} />
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.4)'
        }} />
      </div>
    </div>
  );
};
