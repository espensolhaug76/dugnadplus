import React from 'react';

export const PointsTierPage: React.FC = () => {
  const tiers = [
    { name: 'Basis', points: 0, benefits: ['Grunnrabatter', 'Tilgang til vikar-markedsplass'] },
    { name: 'Aktiv', points: 100, benefits: ['Bedre rabatter', 'Prioritet ved bytter'] },
    { name: 'Premium', points: 300, benefits: ['Premium fordeler', 'VIP-arrangementer'] },
    { name: 'VIP', points: 500, benefits: ['Maksimale fordeler', 'Minimale dugnadskrav'] }
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Poeng & Nivå</h1>
      </div>
      <div style={{ padding: '20px' }}>
        <div className="card" style={{ padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
          <div className="badge badge-basis" style={{ fontSize: '16px', padding: '8px 24px' }}>Basis Nivå</div>
          <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--primary-color)', marginTop: '16px' }}>0 poeng</div>
        </div>
        {tiers.map((tier) => (
          <div key={tier.name} className="card" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600' }}>{tier.name}</h3>
              <span style={{ color: 'var(--primary-color)', fontWeight: '600' }}>{tier.points}+ poeng</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {tier.benefits.map((benefit, i) => (
                <li key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  ✓ {benefit}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>
          Hjem
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}>
          <div className="bottom-nav-icon">📅</div>
          Vakter
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}>
          <div className="bottom-nav-icon">👨‍👩‍👧</div>
          Familie
        </button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
