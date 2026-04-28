import React from 'react';

const COLORS = {
  border: '#e8e0d0',
  muted: '#6b7f70',
  text: '#1a2e1f',
};

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        marginTop: 40,
        padding: '20px 24px',
        borderTop: `0.5px solid ${COLORS.border}`,
        background: 'transparent',
        fontSize: 12,
        color: COLORS.muted,
        fontFamily: '"DM Sans", sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginBottom: 6 }}>
        <a href="/personvern" style={{ color: COLORS.muted, textDecoration: 'none' }}>Personvern</a>
        <span aria-hidden="true">·</span>
        <a href="/vilkar" style={{ color: COLORS.muted, textDecoration: 'none' }}>Vilkår</a>
        <span aria-hidden="true">·</span>
        <a href="mailto:espen.solhaug@gmail.com" style={{ color: COLORS.muted, textDecoration: 'none' }}>
          Kontakt: espen.solhaug@gmail.com
        </a>
      </div>
      <div style={{ fontSize: 11, color: COLORS.muted }}>
        © Dugnad+ — Espen Solhaug (Enkeltpersonforetak)
      </div>
    </footer>
  );
};
