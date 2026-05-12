import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';

// MyCampaigns — liste over aktive sales_campaigns for familiens lag,
// med per-kampanje preview av eget salg + framgang mot
// target_per_family (hvis satt). Klikk på et kort → detalj.
//
// Status-filter speiler SalesCampaignPage step 7-mønsteret:
// kun AUTHORIZED/CAPTURED teller som "mitt salg".

const PAID_STATUSES = new Set(['AUTHORIZED', 'CAPTURED']);

interface CampaignListItem {
  id: string;
  title: string;
  description: string | null;
  product_name: string;
  unit_price: number;
  target_per_family: number | null;
  start_date: string | null;
  end_date: string | null;
  mySoldQty: number;
  mySoldAmount: number;
}

export const MyCampaigns: React.FC = () => {
  const fam = useCurrentFamily();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);

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

      const { data: campaignsData } = await supabase
        .from('sales_campaigns')
        .select('id, title, description, product_name, unit_price, target_per_family, start_date, end_date')
        .eq('team_id', teamId)
        .eq('status', 'active');

      if (!campaignsData || campaignsData.length === 0) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const campaignIds = campaignsData.map((c: any) => c.id);
      const { data: mySales } = await supabase
        .from('campaign_sales')
        .select('campaign_id, quantity, amount, status')
        .eq('seller_family_id', familyId)
        .in('campaign_id', campaignIds);

      const salesByCampaign: Record<string, { qty: number; amount: number }> = {};
      (mySales || []).forEach((s: any) => {
        if (!PAID_STATUSES.has(s.status)) return;
        if (!salesByCampaign[s.campaign_id]) salesByCampaign[s.campaign_id] = { qty: 0, amount: 0 };
        salesByCampaign[s.campaign_id].qty += s.quantity || 0;
        salesByCampaign[s.campaign_id].amount += s.amount || 0;
      });

      setCampaigns(campaignsData.map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        product_name: c.product_name,
        unit_price: c.unit_price,
        target_per_family: c.target_per_family,
        start_date: c.start_date,
        end_date: c.end_date,
        mySoldQty: salesByCampaign[c.id]?.qty || 0,
        mySoldAmount: salesByCampaign[c.id]?.amount || 0,
      })));
    } catch (err) {
      console.error('Feil ved lasting av kampanjer:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#1a2e1f' }}>Laster...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: '#fff' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#fff' }}>Mine salgskampanjer</h1>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        {campaigns.length === 0 ? (
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛍️</div>
            <p style={{ color: '#1a2e1f', fontWeight: '600', marginBottom: '8px' }}>Ingen aktive kampanjer</p>
            <p style={{ color: '#4a5e50', fontSize: '14px' }}>
              Koordinator må starte en salgskampanje før du kan begynne å selge.
            </p>
          </div>
        ) : (
          campaigns.map(c => {
            const target = c.target_per_family || 0;
            const pct = target > 0 ? Math.min(100, Math.round((c.mySoldQty / target) * 100)) : 0;
            return (
              <button
                key={c.id}
                onClick={() => window.location.href = `/my-campaign/${c.id}`}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px',
                  padding: '20px', marginBottom: '12px', cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a2e1f' }}>{c.title}</div>
                {c.description && (
                  <div style={{ fontSize: '13px', color: '#4a5e50', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.description}
                  </div>
                )}
                <div style={{ fontSize: '13px', color: '#2d6a4f', marginTop: '4px', fontWeight: '600' }}>{c.unit_price} kr/stk</div>

                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid #eee' }}>
                  <div style={{ fontSize: '12px', color: '#4a5e50', marginBottom: '4px' }}>DITT SALG</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#1a2e1f' }}>
                    {c.mySoldAmount} kr <span style={{ fontSize: '13px', fontWeight: '500', color: '#4a5e50' }}>· {c.mySoldQty} stk</span>
                  </div>
                  {target > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ height: '6px', background: '#e8e0d0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#2d6a4f', width: `${pct}%`, borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#4a5e50', marginTop: '4px', textAlign: 'right' }}>
                        {pct}% av mål ({target} stk)
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '12px', fontSize: '13px', color: '#2d6a4f', fontWeight: '600', textAlign: 'right' }}>Åpne →</div>
              </button>
            );
          })
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', background: '#ffffff', borderTop: '0.5px solid #dedddd', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
        <button onClick={() => window.location.href = '/sell'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#2d6a4f', fontWeight: 600, cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>💰</div>Selg</button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>📅</div>Vakter</button>
        <button onClick={() => window.location.href = '/family-members'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>👨‍👩‍👧</div>Familie</button>
        <button onClick={() => window.location.href = '/profile'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>👤</div>Profil</button>
      </div>
    </div>
  );
};
