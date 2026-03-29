import React from 'react';

export const LandingPage: React.FC = () => {
  const handleGetStarted = () => {
    window.location.href = '/register';
  };

  const handleLogin = () => {
    window.location.href = '/login';
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)',
        color: 'white',
      }}
    >
      {/* Header */}
      <header style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '24px', fontWeight: '700' }}>Dugnad+</div>
        <button 
            onClick={handleLogin} 
            className="btn" 
            style={{ 
                color: 'white', 
                background: 'transparent', 
                border: '1px solid white', 
                borderRadius: '20px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: '600'
            }}
        >
          Logg inn
        </button>
      </header>

      {/* Hero Section */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: '40px 20px',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 56px)', // ORIGINAL: Bruker clamp for god skalering
            fontWeight: '700',
            marginBottom: '24px',
            lineHeight: '1.2',
          }}
        >
          Velkommen til Dugnad+
        </h1>

        <p
          style={{
            fontSize: 'clamp(18px, 3vw, 24px)', // ORIGINAL
            marginBottom: '48px',
            maxWidth: '600px',
            opacity: 0.95,
          }}
        >
          Den smarte måten å organisere dugnad på. Rettferdig fordeling, enkel administrasjon, og fornøyde foreldre.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* KOM I GANG: Hvit bakgrunn, blå tekst */}
          <button 
            onClick={handleGetStarted} 
            className="btn" 
            style={{ 
                background: 'white', 
                color: '#16a8b8', 
                border: 'none',
                padding: '14px 32px',
                fontSize: '18px',
                fontWeight: '700',
                borderRadius: '30px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            Kom i gang
          </button>

          {/* LOGG INN: Gjennomsiktig, hvit tekst */}
          <button 
            onClick={handleLogin} 
            className="btn" 
            style={{ 
                background: 'transparent', 
                color: 'white', 
                border: '2px solid white',
                padding: '14px 32px',
                fontSize: '18px',
                fontWeight: '700',
                borderRadius: '30px',
                cursor: 'pointer'
            }}
          >
            Logg inn
          </button>
        </div>

        {/* Features */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '32px',
            marginTop: '80px',
            maxWidth: '900px',
            width: '100%',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Automatisk fordeling</h3>
            <p style={{ fontSize: '16px', opacity: 0.9 }}>Algoritme fordeler vakter rettferdig basert på poeng</p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Enkel for alle</h3>
            <p style={{ fontSize: '16px', opacity: 0.9 }}>Desktop for koordinatorer, mobil for foreldre</p>
          </div>

          <div style={{ fontSize: '48px', marginBottom: '16px', textAlign: 'center' }}>
            <div>🏆</div>
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Poengsystem</h3>
            <p style={{ fontSize: '16px', opacity: 0.9 }}>Fire nivåer med fordeler og sponsorrabatter</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: '24px', textAlign: 'center', opacity: 0.8, fontSize: '14px' }}>
        © 2025 Dugnad+ | Laget for norske idrettslag
      </footer>
    </div>
  );
};