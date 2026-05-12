import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';

// SellMenu — drilldown-meny fra bottom-nav-knappen "💰 Selg".
// Viser to kort: lotteri og salgskampanjer, men kun de som er
// aktive for familiens lag. Hvis ingen er aktive: tom-state.
//
// Aktiv-state for "Selg" i bottom-nav matcher pathene
// /sell, /my-lottery, /my-campaigns, /my-campaign/*.

interface ActiveLottery {
  id: string;
  name: string;
}

interface ActiveCampaignPreview {
  count: number;
  productNames: string[]; // first 3 for preview
}

export const SellMenu: React.FC = () => {
  const fam = useCurrentFamily();
  const [loading, setLoading] = useState(true);
  const [lottery, setLottery] = useState<ActiveLottery | null>(null);
  const [campaignsPreview, setCampaignsPreview] = useState<ActiveCampaignPreview | null>(null);

  useEffect(() => {
    if (fam.loading) return;
    if (fam.unauthenticated) { window.location.href = '/login'; return; }
    if (fam.noFamily) { window.location.href = '/claim-family'; return; }
    if (fam.familyId) loadData(fam.familyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fam.loading, fam.unauthenticated, fam.noFamily, fam.familyId]);

  const loadData = async (familyId: string) => {
    setLoading(true);
    try {
      const { data: familyRow } = await supabase
        .from('families')
        .select('team_id')
        .eq('id', familyId)
        .maybeSingle();

      const teamId = familyRow?.team_id;
      if (!teamId) {
        setLoading(false);
        return;
      }

      const [lotteryRes, campaignsRes] = await Promise.all([
        supabase
          .from('lotteries')
          .select('id, name')
          .eq('team_id', teamId)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('sales_campaigns')
          .select('id, product_name')
          .eq('team_id', teamId)
          .eq('status', 'active'),
      ]);

      if (lotteryRes.data) {
        setLottery({ id: lotteryRes.data.id, name: lotteryRes.data.name });
      }
      if (campaignsRes.data && campaignsRes.data.length > 0) {
        setCampaignsPreview({
          count: campaignsRes.data.length,
          productNames: campaignsRes.data.slice(0, 3).map((c: any) => c.product_name).filter(Boolean),
        });
      }
    } catch (err) {
      console.error('Feil ved lasting av selg-meny:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#1a2e1f' }}>Laster...</div>;
  }

  const hasLottery = !!lottery;
  const hasCampaigns = !!campaignsPreview;
  const hasAny = hasLottery || hasCampaigns;

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: '#fff' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#fff' }}>💰 Selg for laget</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0', fontSize: '14px' }}>Velg hva du vil jobbe med</p>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        {!hasAny && (
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💤</div>
            <p style={{ color: '#1a2e1f', fontWeight: '600', marginBottom: '8px' }}>Ingen aktive salg akkurat nå</p>
            <p style={{ color: '#4a5e50', fontSize: '14px' }}>
              Verken lotteri eller salgskampanjer er aktive for laget ditt. Sjekk tilbake senere — eller spør koordinator.
            </p>
          </div>
        )}

        {hasLottery && (
          <button
            onClick={() => window.location.href = '/my-lottery'}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px',
              padding: '20px', marginBottom: '12px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>🎟️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a2e1f' }}>Lodd</div>
                <div style={{ fontSize: '13px', color: '#4a5e50', marginTop: '2px' }}>{lottery!.name}</div>
                <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '4px' }}>Selg digitale lodd via Vipps</div>
              </div>
              <div style={{ fontSize: '20px', color: '#2d6a4f' }}>→</div>
            </div>
          </button>
        )}

        {hasCampaigns && (
          <button
            onClick={() => window.location.href = '/my-campaigns'}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px',
              padding: '20px', marginBottom: '12px', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>🛍️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a2e1f' }}>Salgskampanjer</div>
                <div style={{ fontSize: '13px', color: '#4a5e50', marginTop: '2px' }}>
                  {campaignsPreview!.count} {campaignsPreview!.count === 1 ? 'aktiv' : 'aktive'}
                  {campaignsPreview!.productNames.length > 0 && `: ${campaignsPreview!.productNames.join(', ')}`}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '4px' }}>Selg produkter via Vipps</div>
              </div>
              <div style={{ fontSize: '20px', color: '#2d6a4f' }}>→</div>
            </div>
          </button>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', background: '#ffffff', borderTop: '0.5px solid #dedddd', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
        <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#2d6a4f', fontWeight: 600, cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>💰</div>Selg</button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>📅</div>Vakter</button>
        <button onClick={() => window.location.href = '/family-members'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>👨‍👩‍👧</div>Familie</button>
        <button onClick={() => window.location.href = '/profile'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>👤</div>Profil</button>
      </div>
    </div>
  );
};
