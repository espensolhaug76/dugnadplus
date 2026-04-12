import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

export const CampaignShop: React.FC = () => {
  const [campaign, setCampaign] = useState<any>(null);
  const [sellerName, setSellerName] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('campaign');
    const sid = params.get('seller');
    if (sid) setSellerId(sid);

    const load = async () => {
      if (campaignId) {
        const { data } = await supabase.from('sales_campaigns').select('*').eq('id', campaignId).single();
        if (data) setCampaign(data);
      }
      if (sid) {
        const { data: family } = await supabase.from('families').select('*, family_members(name, role)').eq('id', sid).single();
        if (family) {
          const child = family.family_members?.find((m: any) => m.role === 'child');
          setSellerName(child?.name || family.name);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const total = campaign ? quantity * campaign.unit_price : 0;

  const handlePay = () => {
    if (!campaign || !buyerName) { alert('Fyll inn navn.'); return; }
    const msg = `${campaign.product_name} ${sellerName}`;
    window.location.href = `vipps://?amt=${total}&msg=${encodeURIComponent(msg)}`;
    setTimeout(() => setConfirmed(true), 1000);
  };

  const handleConfirm = async () => {
    setSaving(true);
    await supabase.from('campaign_sales').insert({
      campaign_id: campaign.id,
      seller_family_id: sellerId || null,
      buyer_name: buyerName,
      buyer_phone: buyerPhone,
      quantity,
      amount: total,
      payment_method: 'vipps',
      paid: true
    });
    setSaving(false);
    alert('Takk for kjøpet!');
    setQuantity(1); setBuyerName(''); setBuyerPhone(''); setConfirmed(false);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Laster...</div>;
  if (!campaign) return <div style={{ padding: '40px', textAlign: 'center' }}><h2>Kampanjen finnes ikke</h2></div>;

  if (confirmed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>Betalt?</h1>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>Trykk bekreft etter at du har betalt i Vipps.</p>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', marginBottom: '8px' }}><span>{campaign.product_name} × {quantity}</span><strong>{total} kr</strong></div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>Selger: {sellerName}</div>
          </div>
          <button onClick={handleConfirm} disabled={saving} style={{ width: '100%', padding: '16px', fontSize: '18px', fontWeight: '700', background: '#10b981', color: 'white', border: 'none', borderRadius: '30px', cursor: 'pointer' }}>
            {saving ? 'Registrerer...' : 'Bekreft betaling'}
          </button>
          <button onClick={() => setConfirmed(false)} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '14px' }}>Tilbake</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '440px', width: '100%' }}>
        {/* Header */}
        <div style={{ background: '#1a7a4a', borderRadius: '16px 16px 0 0', padding: '28px 24px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛍️</div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 4px', color: 'white' }}>{campaign.title}</h1>
          <p style={{ opacity: 0.85, fontSize: '14px', margin: 0, color: 'rgba(255,255,255,0.85)' }}>Støtt {sellerName || 'laget'}!</p>
        </div>

        <div style={{ background: 'white', borderRadius: '0 0 16px 16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a2e1f' }}>{campaign.product_name}</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#1a7a4a', marginTop: '4px' }}>{campaign.unit_price} kr/stk</div>
          </div>

          {/* Antall */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '24px' }}>
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid #dedddd', background: 'white', cursor: 'pointer', fontSize: '20px' }}>−</button>
            <span style={{ fontSize: '32px', fontWeight: '800', minWidth: '50px', textAlign: 'center', color: '#1a2e1f' }}>{quantity}</span>
            <button onClick={() => setQuantity(quantity + 1)} style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1px solid #dedddd', background: 'white', cursor: 'pointer', fontSize: '20px' }}>+</button>
          </div>

          {/* Total */}
          <div style={{ background: '#f2faf6', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', color: '#4a5e50' }}>Totalsum</div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a7a4a' }}>{total} kr</div>
          </div>

          {/* Kjøper-info */}
          <div style={{ marginBottom: '20px' }}>
            <label className="input-label">Ditt navn *</label>
            <input className="input" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Ola Nordmann" />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Telefon</label>
            <input className="input" type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="99 88 77 66" />
          </div>

          <button onClick={handlePay} style={{
            width: '100%', padding: '16px', fontSize: '18px', fontWeight: '700',
            background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '30px', cursor: 'pointer'
          }}>
            Betal {total} kr med Vipps
          </button>
        </div>

        {campaign.description && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'white', borderRadius: '10px', border: '0.5px solid #dedddd', fontSize: '13px', color: '#4a5e50' }}>
            {campaign.description}
          </div>
        )}
      </div>
    </div>
  );
};
