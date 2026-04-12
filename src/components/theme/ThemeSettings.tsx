import React, { useState } from 'react';
import { useTheme, SPORT_THEMES, MODE_CONFIG } from './ThemeContext';
import type { ThemeMode } from './ThemeContext';

export const ThemeSettings: React.FC = () => {
  const theme = useTheme();
  const [customColor, setCustomColor] = useState(theme.primaryColor);

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>

      <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>🎨 Tema</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Tilpass farger og utseende for ditt lag.</p>

      {/* Modus */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)' }}>Modus</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          {(Object.keys(MODE_CONFIG) as ThemeMode[]).map(m => {
            const cfg = MODE_CONFIG[m];
            const isActive = theme.mode === m;
            return (
              <button
                key={m}
                onClick={() => theme.setMode(m)}
                style={{
                  flex: 1, padding: '20px', borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
                  border: isActive ? `3px solid var(--color-primary)` : '2px solid var(--border-color)',
                  background: cfg.bg, color: cfg.text,
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ fontSize: '28px', marginBottom: '6px' }}>{cfg.icon}</div>
                <div style={{ fontSize: '14px', fontWeight: isActive ? '700' : '400' }}>{cfg.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sport-temaer */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)' }}>Lagfarge</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {SPORT_THEMES.map(st => {
            const isActive = theme.sportThemeId === st.id;
            return (
              <button
                key={st.id}
                onClick={() => theme.setSportTheme(st.id)}
                style={{
                  padding: '16px 8px', borderRadius: '12px', cursor: 'pointer', textAlign: 'center',
                  border: isActive ? '3px solid var(--text-primary)' : '2px solid var(--border-color)',
                  background: 'var(--card-bg)', transition: 'all 0.15s'
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: st.primary, margin: '0 auto 8px', boxShadow: isActive ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${st.primary}` : 'none' }} />
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>{st.emoji}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: isActive ? '700' : '400' }}>{st.name}</div>
              </button>
            );
          })}
        </div>

        {/* Egendefinert farge */}
        <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Egendefinert farge:</label>
            <input
              type="color"
              value={customColor}
              onChange={e => setCustomColor(e.target.value)}
              style={{ width: '40px', height: '36px', padding: 0, border: '2px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer' }}
            />
            <input
              className="input"
              value={customColor}
              onChange={e => setCustomColor(e.target.value)}
              placeholder="#0d9488"
              style={{ width: '100px', fontFamily: 'monospace', textAlign: 'center' }}
            />
            <button onClick={() => theme.setPrimaryColor(customColor)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>Bruk</button>
          </div>
        </div>
      </div>

      {/* Forhåndsvisning */}
      <div className="card" style={{ padding: '24px', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', color: 'var(--text-primary)' }}>Forhåndsvisning</h3>
        <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {/* Mini-banner */}
          <div style={{ background: 'var(--color-primary)', borderRadius: '10px', padding: '16px 20px', color: 'white', marginBottom: '16px' }}>
            <div style={{ fontWeight: '700', fontSize: '18px' }}>Hei, Koordinator! 👋</div>
            <div style={{ opacity: 0.85, fontSize: '13px' }}>Kongsvinger IL · Sesong 2026</div>
          </div>

          {/* Mini-kort */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div style={{ padding: '14px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-primary)' }}>12</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Vakter tildelt</div>
            </div>
            <div style={{ padding: '14px', background: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>20</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Familier</div>
            </div>
          </div>

          {/* Mini-knapper */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>Primær-knapp</button>
            <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>Sekundær</button>
          </div>
        </div>
      </div>
    </div>
  );
};
