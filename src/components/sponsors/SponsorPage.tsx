import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Sponsor {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  website: string;
  phone: string;
  discount_level1: number;
  discount_level2: number;
  discount_level3: number;
  discount_level4: number;
  is_active: boolean;
}

const TIERS = [
  { name: 'Basis', min: 0, max: 99 },
  { name: 'Aktiv', min: 100, max: 299 },
  { name: 'Premium', min: 300, max: 499 },
  { name: 'VIP', min: 500, max: Infinity },
];

export const SponsorPage: React.FC = () => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [tierIndex, setTierIndex] = useState(0);
  const [isCoordinator, setIsCoordinator] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);

    // Hent aktive sponsorer
    const { data } = await supabase.from('sponsors').select('*').eq('is_active', true).order('name');
    if (data) setSponsors(data);

    // Hent brukerens poeng via den kanoniske family_members.auth_user_id-
    // lookup. Tidligere brukte vi families.id = user.id som ikke lenger
    // stemmer etter /claim-family-redesignet.
    try {
      const localUser = JSON.parse(localStorage.getItem('dugnad_user') || '{}');
      setIsCoordinator(localUser.role === 'coordinator');

      if (localUser.role === 'family') {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: parentRow } = await supabase
            .from('family_members')
            .select('family_id')
            .eq('auth_user_id', authUser.id)
            .eq('role', 'parent')
            .maybeSingle();

          if (parentRow?.family_id) {
            const { data: family } = await supabase
              .from('families')
              .select('total_points')
              .eq('id', parentRow.family_id)
              .maybeSingle();
            if (family) {
              const p = family.total_points || 0;
              setPoints(p);
              const idx = p >= 500 ? 3 : p >= 300 ? 2 : p >= 100 ? 1 : 0;
              setTierIndex(idx);
            }
          }
        }
      }
    } catch {}

    setLoading(false);
  };

  const getDiscount = (sponsor: Sponsor): number => {
    return [sponsor.discount_level1, sponsor.discount_level2, sponsor.discount_level3, sponsor.discount_level4][tierIndex];
  };

  const nextTier = TIERS[tierIndex + 1];
  const pointsToNext = nextTier ? nextTier.min - points : 0;
  const sponsorsAtNextLevel = nextTier ? sponsors.filter(s => {
    const nextDiscount = [s.discount_level1, s.discount_level2, s.discount_level3, s.discount_level4][tierIndex + 1];
    const currentDiscount = getDiscount(s);
    return nextDiscount > currentDiscount;
  }).length : 0;

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Laster sponsorer... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: 'white' }}>🏪 Sponsorrabatter</h1>
        <p style={{ opacity: 0.85, fontSize: '14px', marginTop: '4px', color: 'rgba(255,255,255,0.85)' }}>Dine fordeler som {TIERS[tierIndex].name}-medlem</p>
      </div>

      <div style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }}>
        {/* Nivå-kort */}
        {!isCoordinator && (
          <div className="card" style={{ padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Ditt nivå</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-primary)' }}>{TIERS[tierIndex].name}</div>
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>{points} poeng</div>
            {nextTier && (
              <div style={{ marginTop: '12px', padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Nå <strong>{pointsToNext} poeng</strong> til <strong>{nextTier.name}</strong>
                {sponsorsAtNextLevel > 0 && ` og få bedre rabatt hos ${sponsorsAtNextLevel} sponsor${sponsorsAtNextLevel > 1 ? 'er' : ''}`}
              </div>
            )}
          </div>
        )}

        {/* Sponsorliste */}
        {sponsors.length === 0 ? (
          <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏪</div>
            <p style={{ color: 'var(--text-secondary)' }}>Ingen sponsorer tilgjengelig ennå.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sponsors.map(s => {
              const discount = isCoordinator ? s.discount_level4 : getDiscount(s);
              return (
                <div key={s.id} className="card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {s.logo_url ? (
                    <img src={s.logo_url} alt={s.name} style={{ width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '56px', height: '56px', borderRadius: '10px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>🏪</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>{s.name}</div>
                    {s.description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.description}</div>}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {s.website && (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: 'var(--color-primary)', textDecoration: 'none' }}>🌐 Nettside</a>
                      )}
                      {s.phone && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>📞 {s.phone}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-primary)' }}>{discount}%</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>rabatt</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom nav for familier */}
      {!isCoordinator && (
        <div className="bottom-nav">
          <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
          <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}><div className="bottom-nav-icon">📅</div>Vakter</button>
          <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}><div className="bottom-nav-icon">👨‍👩‍👧</div>Familie</button>
          <button className="bottom-nav-item active"><div className="bottom-nav-icon">🏪</div>Sponsorer</button>
        </div>
      )}
    </div>
  );
};
