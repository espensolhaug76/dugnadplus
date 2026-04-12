import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface KioskItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

interface CartEntry {
  item: KioskItem;
  qty: number;
}

export const KioskShop: React.FC = () => {
  const [items, setItems] = useState<KioskItem[]>([]);
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState('');
  const [vippsNumber, setVippsNumber] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadShop();
  }, []);

  const loadShop = async () => {
    const params = new URLSearchParams(window.location.search);
    const teamId = params.get('team') || '';

    // Hent varer
    const query = supabase.from('kiosk_items').select('*').eq('is_active', true);
    if (teamId) query.eq('team_id', teamId);
    const { data } = await query.order('name');
    if (data) setItems(data);

    // Klubbnavn
    try {
      const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
      setClubName(club.name || '');
    } catch {}

    // Vipps-nummer
    const storedVipps = localStorage.getItem('dugnad_kiosk_vipps');
    if (storedVipps) setVippsNumber(storedVipps);

    setLoading(false);
  };

  const addToCart = (item: KioskItem) => {
    setCart(prev => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, qty: (existing?.qty || 0) + 1 } };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing || existing.qty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...existing, qty: existing.qty - 1 } };
    });
  };

  const cartEntries = Object.values(cart).filter(e => e.qty > 0);
  const total = cartEntries.reduce((sum, e) => sum + e.item.price * e.qty, 0);

  const handlePay = () => {
    if (total <= 0) return;
    const message = `Kiosk ${clubName || 'lag'}`;
    const vippsUrl = `vipps://?amt=${total}&msg=${encodeURIComponent(message)}`;

    // Prøv å åpne Vipps
    window.location.href = vippsUrl;

    // Vis bekreftelsesside etter kort delay
    setTimeout(() => setConfirmed(true), 1000);
  };

  const handleConfirmSale = async () => {
    setSaving(true);
    const params = new URLSearchParams(window.location.search);

    const saleItems = cartEntries.map(e => ({ name: e.item.name, emoji: e.item.emoji, price: e.item.price, qty: e.qty }));

    await supabase.from('kiosk_sales').insert({
      items: saleItems,
      total_amount: total,
      vipps_number: vippsNumber,
      event_id: null
    });

    setSaving(false);
    setCart({});
    setConfirmed(false);
    alert('Takk for handelen!');
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Laster kiosk...</div>;

  // Bekreftelsesside
  if (confirmed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>Betalt?</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Trykk bekreft etter at du har betalt i Vipps.</p>

          <div style={{ background: 'var(--card-bg, white)', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid #bbf7d0' }}>
            {cartEntries.map(e => (
              <div key={e.item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '15px' }}>
                <span>{e.item.emoji} {e.item.name} × {e.qty}</span>
                <strong>{e.item.price * e.qty} kr</strong>
              </div>
            ))}
            <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '12px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800', color: 'var(--color-primary)' }}>
              <span>Totalt</span><span>{total} kr</span>
            </div>
          </div>

          <button onClick={handleConfirmSale} disabled={saving} style={{ width: '100%', padding: '16px', fontSize: '18px', fontWeight: '700', background: '#10b981', color: 'white', border: 'none', borderRadius: '30px', cursor: 'pointer' }}>
            {saving ? 'Registrerer...' : 'Bekreft betaling'}
          </button>
          <button onClick={() => setConfirmed(false)} style={{ marginTop: '12px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
            Tilbake til kiosken
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', padding: '24px 20px', color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '4px' }}>🛒</div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>{clubName || 'Kiosk'}</h1>
        <p style={{ opacity: 0.9, fontSize: '14px', margin: 0 }}>Velg varer og betal med Vipps</p>
      </div>

      {/* Meny */}
      <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {items.map(item => {
            const inCart = cart[item.id]?.qty || 0;
            return (
              <div key={item.id} onClick={() => addToCart(item)} style={{
                padding: '20px 16px', borderRadius: '16px', textAlign: 'center', cursor: 'pointer',
                background: inCart > 0 ? '#f0fdfa' : 'white',
                border: inCart > 0 ? '2px solid #0d9488' : '2px solid #e5e7eb',
                transition: 'all 0.15s', position: 'relative'
              }}>
                {inCart > 0 && (
                  <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '28px', height: '28px', borderRadius: '50%', background: '#0d9488', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>{inCart}</div>
                )}
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>{item.emoji}</div>
                <div style={{ fontWeight: '600', fontSize: '16px', color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-primary)', marginTop: '4px' }}>{item.price} kr</div>
              </div>
            );
          })}
        </div>

        {/* Handlekurv */}
        {cartEntries.length > 0 && (
          <div style={{ background: 'var(--card-bg, white)', borderRadius: '16px', padding: '20px', border: '2px solid #0d9488', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '600' }}>Din bestilling</h3>
            {cartEntries.map(e => (
              <div key={e.item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: '15px' }}>{e.item.emoji} {e.item.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={(ev) => { ev.stopPropagation(); removeFromCart(e.item.id); }} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--card-bg, white)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                  <span style={{ fontWeight: '700', minWidth: '20px', textAlign: 'center' }}>{e.qty}</span>
                  <button onClick={(ev) => { ev.stopPropagation(); addToCart(e.item); }} style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid var(--border-color)', background: 'var(--card-bg, white)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  <span style={{ fontWeight: '700', minWidth: '60px', textAlign: 'right', color: 'var(--color-primary)' }}>{e.item.price * e.qty} kr</span>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', marginTop: '8px', borderTop: '2px solid #e5e7eb', fontSize: '20px', fontWeight: '800', color: 'var(--color-primary)' }}>
              <span>Totalt</span><span>{total} kr</span>
            </div>
          </div>
        )}

        {/* Betal */}
        {total > 0 && (
          <button onClick={handlePay} style={{
            width: '100%', padding: '18px', fontSize: '20px', fontWeight: '700',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white',
            border: 'none', borderRadius: '30px', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
          }}>
            Betal {total} kr med Vipps
          </button>
        )}

        {total === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', marginTop: '20px' }}>Trykk på en vare for å legge til</p>
        )}
      </div>
    </div>
  );
};
