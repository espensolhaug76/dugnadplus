import React from 'react';

// Felles designelementer for alle premium-sider

interface EmptyHeroProps {
  icon: string;
  label: string;
  title: string;
  ingress: string;
  ctaLabel: string;
  onCta: () => void;
}

export const EmptyHero: React.FC<EmptyHeroProps> = ({ icon, label, title, ingress, ctaLabel, onCta }) => (
  <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '28px 24px', textAlign: 'center', marginBottom: '12px' }}>
    <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>{icon} {label}</div>
    <h1 style={{ fontSize: '20px', fontWeight: '500', color: '#fff', margin: '0 0 8px' }}>{title}</h1>
    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5', margin: '0 0 20px', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>{ingress}</p>
    <button onClick={onCta} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '9px 20px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>{ctaLabel}</button>
  </div>
);

interface BenefitCardProps {
  items: { icon: string; title: string; desc: string }[];
}

export const BenefitCards: React.FC<BenefitCardProps> = ({ items }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: '10px', marginBottom: '24px' }}>
    {items.map((item, i) => (
      <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
        <div style={{ fontSize: '20px', marginBottom: '6px' }}>{item.icon}</div>
        <div style={{ fontSize: '12px', fontWeight: '500', color: '#1a2e1f', marginBottom: '3px' }}>{item.title}</div>
        <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.4' }}>{item.desc}</div>
      </div>
    ))}
  </div>
);

interface ActiveHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const ActiveHeader: React.FC<ActiveHeaderProps> = ({ title, subtitle, badge, actionLabel, onAction }) => (
  <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: '500', color: '#fff' }}>{title}</span>
        {badge && <span style={{ fontSize: '10px', background: 'rgba(126,200,160,0.2)', color: '#7ec8a0', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' }}>{badge}</span>}
      </div>
      {subtitle && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{subtitle}</div>}
    </div>
    {actionLabel && onAction && (
      <button onClick={onAction} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>{actionLabel}</button>
    )}
  </div>
);

interface StatCardProps {
  items: { value: string | number; label: string; warn?: boolean }[];
}

export const StatCards: React.FC<StatCardProps> = ({ items }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: '8px', marginBottom: '12px' }}>
    {items.map((item, i) => (
      <div key={i} style={{ background: item.warn ? '#fff8e6' : '#fff', border: item.warn ? '1px solid #fac775' : '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
        <div style={{ fontSize: '17px', fontWeight: '500', color: item.warn ? '#854f0b' : '#1a2e1f' }}>{item.value}</div>
        <div style={{ fontSize: '10px', color: item.warn ? '#854f0b' : '#4a5e50', marginTop: '2px' }}>{item.label}</div>
      </div>
    ))}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', marginTop: '16px' }}>{children}</div>
);

export const PageShell: React.FC<{ children: React.ReactNode; backTo?: string }> = ({ children, backTo = '/coordinator-dashboard' }) => (
  <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
    <button onClick={() => window.location.href = backTo} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', padding: 0 }}>← Tilbake til dashbordet</button>
    {children}
  </div>
);

export const ProgressBar: React.FC<{ value: number; max: number }> = ({ value, max }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4a5e50', marginBottom: '3px' }}>
        <span>{pct}%</span><span>{value} / {max}</span>
      </div>
      <div style={{ height: '5px', background: '#e8e0d0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#2d6a4f', borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
    </div>
  );
};

interface ToplistItem { name: string; value: number; secondary?: string; }

export const Toplist: React.FC<{ items: ToplistItem[]; valueLabel?: string }> = ({ items, valueLabel }) => {
  const max = items[0]?.value || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {items.map((item, idx) => (
        <div key={idx} style={{ padding: '8px 10px', background: '#fff', borderRadius: '6px', border: '0.5px solid #dedddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>
              {idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : ''}{item.name}
            </span>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#2d6a4f' }}>{item.value} {valueLabel || ''}{item.secondary ? ` · ${item.secondary}` : ''}</span>
          </div>
          <div style={{ height: '4px', background: '#e8e0d0', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(item.value / max) * 100}%`, background: idx === 0 ? '#2d6a4f' : '#93c5fd', borderRadius: '2px' }} />
          </div>
        </div>
      ))}
    </div>
  );
};
