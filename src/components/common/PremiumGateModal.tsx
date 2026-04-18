import React from 'react';

interface PremiumGateModalProps {
  featureName: string;
  onClose: () => void;
}

export const PremiumGateModal: React.FC<PremiumGateModalProps> = ({ featureName, onClose }) => (
  <div
    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    onClick={onClose}
  >
    <div
      style={{ background: 'white', borderRadius: '12px', maxWidth: '420px', width: '90%', overflow: 'hidden' }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ background: '#1e3a2f', padding: '24px 24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '6px' }}>★</div>
        <h2 style={{ color: '#fff', margin: '0 0 6px', fontSize: '18px', fontWeight: '600' }}>
          Premium-funksjon
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
          For å publisere {featureName}, trenger laget Premium-abonnement.
        </p>
      </div>
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a2e1f' }}>990 kr/sesong</div>
        <div style={{ fontSize: '13px', color: '#4a5e50', marginBottom: '20px' }}>Alt inkludert. Ingen binding.</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '500', borderRadius: '8px', border: '1px solid #dedddd', background: '#fff', color: '#4a5e50', cursor: 'pointer' }}
          >
            Tilbake
          </button>
          <button
            onClick={() => { window.location.href = '/premium'; }}
            style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '600', borderRadius: '8px', border: 'none', background: '#2d6a4f', color: '#fff', cursor: 'pointer' }}
          >
            Aktiver Premium →
          </button>
        </div>
      </div>
    </div>
  </div>
);

export const getPlanLevel = (): 'free' | 'aktiv' | 'premium' => {
  try {
    const val = localStorage.getItem('dugnad_premium');
    if (val === 'premium' || val === 'true') return 'premium';
    if (val === 'aktiv') return 'aktiv';
    return 'free';
  } catch { return 'free'; }
};

export const hasPremium = (): boolean => {
  const level = getPlanLevel();
  return level === 'premium' || level === 'aktiv';
};
