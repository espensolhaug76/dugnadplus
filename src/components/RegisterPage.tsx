import React, { useState } from 'react';

export const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleSocialLogin = (provider: string) => {
    alert('Logging in with ' + provider + '... (coming soon)');
  };

  const handleEmailRegister = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Registration functionality coming soon!');
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
      <button 
        onClick={() => window.location.href = '/'}
        style={{
          alignSelf: 'flex-start',
          background: 'none',
          border: 'none',
          color: 'white',
          fontSize: '28px',
          cursor: 'pointer',
          padding: '10px',
          marginBottom: '20px'
        }}
      >
        ←
      </button>

      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        maxWidth: '450px',
        margin: '0 auto',
        width: '100%',
        padding: '0 10px'
      }}>
        <h1 style={{ fontSize: '2.5em', marginBottom: '10px', fontWeight: '700', textAlign: 'center' }}>
          Opprett konto
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '40px', opacity: 0.9, textAlign: 'center' }}>
          Velg hvordan du vil registrere deg
        </p>

        <div style={{ width: '100%', marginBottom: '20px' }}>
          <button style={{
            width: '100%',
            backgroundColor: 'white',
            color: '#333',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s',
            boxSizing: 'border-box'
          }}
          onClick={() => handleSocialLogin('Google')}
          >
            🔵 Fortsett med Google
          </button>

          <button style={{
            width: '100%',
            backgroundColor: '#1877F2',
            color: 'white',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s',
            boxSizing: 'border-box'
          }}
          onClick={() => handleSocialLogin('Facebook')}
          >
            📘 Fortsett med Facebook
          </button>

          <button style={{
            width: '100%',
            backgroundColor: 'black',
            color: 'white',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s',
            boxSizing: 'border-box'
          }}
          onClick={() => handleSocialLogin('Apple')}
          >
            🍎 Fortsett med Apple
          </button>
        </div>

        <div style={{ 
          width: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          margin: '20px 0', 
          opacity: 0.7 
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <span style={{ padding: '0 15px', fontSize: '14px' }}>eller</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
        </div>

        <form onSubmit={handleEmailRegister} style={{ width: '100%' }}>
          <input 
            type="text" 
            placeholder="Fullt navn" 
            value={fullName} 
            onChange={(e) => setFullName(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '16px', 
              marginBottom: '12px', 
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              backgroundColor: 'rgba(255,255,255,0.9)', 
              color: '#333',
              boxSizing: 'border-box'
            }}
            required
          />
          
          <input 
            type="email" 
            placeholder="E-postadresse" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '16px', 
              marginBottom: '12px', 
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              backgroundColor: 'rgba(255,255,255,0.9)', 
              color: '#333',
              boxSizing: 'border-box'
            }}
            required
          />
          
          <input 
            type="password" 
            placeholder="Passord" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '16px', 
              marginBottom: '20px', 
              border: 'none', 
              borderRadius: '12px', 
              fontSize: '16px', 
              backgroundColor: 'rgba(255,255,255,0.9)', 
              color: '#333',
              boxSizing: 'border-box'
            }}
            required
          />

          <button 
            type="submit" 
            style={{
              width: '100%',
              backgroundColor: '#2196F3',
              color: 'white',
              padding: '16px',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(33, 150, 243, 0.4)',
              boxSizing: 'border-box'
            }}
          >
            Opprett konto
          </button>
        </form>

        <p style={{ marginTop: '20px', fontSize: '14px', opacity: 0.9, textAlign: 'center' }}>
          Har du allerede en konto?{' '}
          <a href="/login" style={{ color: '#2196F3', fontWeight: '600', textDecoration: 'none' }}>
            Logg inn
          </a>
        </p>
      </div>
    </div>
  );
};