import React, { useState } from 'react';

export const CoordinatorDashboard: React.FC = () => {
  const [stats] = useState({
    totalShifts: 48,
    assignedShifts: 38,
    pendingShifts: 7,
    completedShifts: 3,
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Top Banner with Background */}
      <div style={{ 
        background: 'linear-gradient(180deg, rgba(70, 130, 180, 0.95) 0%, rgba(100, 149, 237, 0.9) 100%), url(https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=1200) center/cover',
        backgroundBlendMode: 'overlay',
        padding: '30px 20px',
        color: 'white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        {/* Club Logo */}
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <div style={{
            width: '70px',
            height: '70px',
            backgroundColor: 'white',
            borderRadius: '50%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#4682b4',
            border: '3px solid white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            KIL
          </div>
        </div>

        {/* Header Text */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '2em', 
            margin: '10px 0', 
            fontWeight: '700', 
            textShadow: '0 2px 4px rgba(0,0,0,0.3)' 
          }}>
            Dugnadsoversikt
          </h1>
          <p style={{ fontSize: '1.1em', opacity: 0.95, margin: '5px 0' }}>
            KIL Gutter 2016
          </p>
          <p style={{ fontSize: '0.9em', opacity: 0.9, margin: '5px 0' }}>
            Sesong 2025
          </p>
        </div>
      </div>

      {/* Content Area (on regular background) */}
      <div style={{ padding: '20px' }}>
        {/* Stats Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '15px',
          marginBottom: '30px',
          maxWidth: '500px',
          margin: '0 auto 30px'
        }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '16px', 
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '2.5em', marginBottom: '5px' }}>📅</div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#333' }}>{stats.totalShifts}</div>
            <div style={{ color: '#666', fontSize: '0.9em' }}>Totalt vakter</div>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '16px', 
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '2.5em', marginBottom: '5px' }}>✅</div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#48bb78' }}>{stats.assignedShifts}</div>
            <div style={{ color: '#666', fontSize: '0.9em' }}>Tildelt</div>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '16px', 
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '2.5em', marginBottom: '5px' }}>🏆</div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#f6ad55' }}>{stats.completedShifts}</div>
            <div style={{ color: '#666', fontSize: '0.9em' }}>Fullført</div>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '20px', 
            borderRadius: '16px', 
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '2.5em', marginBottom: '5px' }}>⏰</div>
            <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#718096' }}>{stats.pendingShifts}</div>
            <div style={{ color: '#666', fontSize: '0.9em' }}>Venter</div>
          </div>
        </div>

        {/* Action Section */}
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ 
            color: '#333', 
            marginBottom: '15px', 
            fontSize: '1.3em',
            textAlign: 'center'
          }}>
            Handalinger
          </h2>
          
          <button style={{
            width: '100%',
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span style={{ fontSize: '20px' }}>📅</span>
            Legg inn vakter for sesongen
          </button>

          <button style={{
            width: '100%',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '16px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span style={{ fontSize: '20px' }}>⚡</span>
            Tildel automatisk ({stats.pendingShifts} vakter)
          </button>

          <button style={{
            width: '100%',
            backgroundColor: 'white',
            color: '#2196F3',
            padding: '16px',
            border: '2px solid #2196F3',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span style={{ fontSize: '20px' }}>👥</span>
            Se familier og poeng
          </button>
        </div>
      </div>
    </div>
  );
};
