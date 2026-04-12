import React from 'react';

export const PointsTierPage: React.FC = () => {
  const tiers = [
    { name: 'Basis', points: 0, benefits: ['Grunnrabatter', 'Tilgang til vikar-markedsplass'] },
    { name: 'Aktiv', points: 100, benefits: ['Bedre rabatter', 'Prioritet ved bytter'] },
    { name: 'Premium', points: 300, benefits: ['Premium fordeler', 'VIP-arrangementer'] },
    { name: 'VIP', points: 500, benefits: ['Maksimale fordeler', 'Minimale dugnadskrav'] }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: 'white' }}>Poeng & Nivå</h1>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', padding: '8px 24px', display: 'inline-block', background: '#e8f5ef', color: '#2d6a4f', borderRadius: '20px', fontWeight: '600' }}>Basis Nivå</div>
          <div style={{ fontSize: '48px', fontWeight: '700', color: '#2d6a4f', marginTop: '16px' }}>0 poeng</div>
        </div>
        {tiers.map((tier) => (
          <div key={tier.name} style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#1a2e1f' }}>{tier.name}</h3>
              <span style={{ color: '#2d6a4f', fontWeight: '600' }}>{tier.points}+ poeng</span>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tier.benefits.map((benefit, i) => (
                <li key={i} style={{ fontSize: '14px', color: '#4a5e50', marginBottom: '4px' }}>
                  ✓ {benefit}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '0.5px solid #dedddd', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>🏠</div>
          Hjem
        </button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>📅</div>
          Vakter
        </button>
        <button onClick={() => window.location.href = '/family-members'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>👨‍👩‍👧</div>
          Familie
        </button>
        <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#2d6a4f', fontSize: '11px', fontWeight: '700', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>⭐</div>
          Poeng
        </button>
      </div>
    </div>
  );
};
