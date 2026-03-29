import React from 'react';

export const FamilyManagementPage: React.FC = () => {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--background)' }}>
      <div className="sidebar">
        <button className="sidebar-nav-item" onClick={() => window.location.href = '/coordinator-dashboard'}>
          ← Tilbake
        </button>
      </div>
      <div className="main-content">
        <h1>Administrer familier</h1>
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Familie-administrasjon kommer snart!</p>
        </div>
      </div>
    </div>
  );
};
