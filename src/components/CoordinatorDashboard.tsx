import React, { useState, useEffect } from 'react';

interface DashboardStats {
  totalShifts: number;
  assignedShifts: number;
  pendingShifts: number;
  completedShifts: number;
}

export const CoordinatorDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalShifts: 48,
    assignedShifts: 38,
    pendingShifts: 7,
    completedShifts: 3,
  });
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
        color: 'white', 
        padding: '30px', 
        borderRadius: '12px',
        marginBottom: '30px'
      }}>
        <h1 style={{ fontSize: '2em', marginBottom: '10px' }}>Dugnadsoversikt</h1>
        <p>Kil Fotball G9 - Sesong 2025</p>
      </div>

      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#333' }}>{stats.totalShifts}</div>
          <div style={{ color: '#666', marginTop: '10px' }}>Totalt vakter</div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#48bb78' }}>{stats.assignedShifts}</div>
          <div style={{ color: '#666', marginTop: '10px' }}>Tildelt</div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#f6ad55' }}>{stats.pendingShifts}</div>
          <div style={{ color: '#666', marginTop: '10px' }}>Venter</div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', color: '#667eea' }}>{stats.completedShifts}</div>
          <div style={{ color: '#666', marginTop: '10px' }}>Fullført</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginBottom: '20px' }}>Handlinger</h2>
        
        <button style={{
          width: '100%',
          backgroundColor: '#667eea',
          color: 'white',
          padding: '15px',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '500',
          cursor: 'pointer',
          marginBottom: '15px'
        }}>
          📅 Legg inn vakter for sesongen
        </button>

        <button style={{
          width: '100%',
          backgroundColor: '#48bb78',
          color: 'white',
          padding: '15px',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '500',
          cursor: 'pointer',
          marginBottom: '15px'
        }}>
          ⚡ Tildel automatisk ({stats.pendingShifts} vakter)
        </button>

        <button style={{
          width: '100%',
          backgroundColor: 'white',
          color: '#667eea',
          padding: '15px',
          border: '2px solid #667eea',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '500',
          cursor: 'pointer'
        }}>
          👥 Se familier og poeng
        </button>
      </div>

      {/* How It Works */}
      <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginTop: '30px' }}>
        <h2 style={{ marginBottom: '20px' }}>Hvordan det fungerer</h2>
        
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#667eea', minWidth: '30px' }}>1</div>
          <div>
            <p style={{ fontWeight: '600', marginBottom: '5px' }}>Legg inn vakter:</p>
            <p style={{ color: '#666' }}>Opprett alle vakter for sesongen én gang</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#667eea', minWidth: '30px' }}>2</div>
          <div>
            <p style={{ fontWeight: '600', marginBottom: '5px' }}>Automatisk tildeling:</p>
            <p style={{ color: '#666' }}>Systemet fordeler vakter rettferdig basert på poeng</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#667eea', minWidth: '30px' }}>3</div>
          <div>
            <p style={{ fontWeight: '600', marginBottom: '5px' }}>Familier får 14 dager:</p>
            <p style={{ color: '#666' }}>Buffer for bytte eller finne vikar før eskalering</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#667eea', minWidth: '30px' }}>4</div>
          <div>
            <p style={{ fontWeight: '600', marginBottom: '5px' }}>Kun varsler ved behov:</p>
            <p style={{ color: '#666' }}>Du får beskjed kun når noe trenger oppfølging</p>
          </div>
        </div>
      </div>
    </div>
  );
};
