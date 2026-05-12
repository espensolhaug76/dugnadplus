import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';

// MyCampaignDetail — full statistikk + delefunksjonalitet for én
// salgskampanje. Verifiserer at kampanjen tilhører familiens lag
// før render — hvis ikke, redirect til /my-campaigns. Mine salg-
// listen viser ALLE statuser med badges (samme mønster som
// SalesCampaignPage step 7), men kun paid teller i stats-kortet.

const PAID_STATUSES = new Set(['AUTHORIZED', 'CAPTURED']);
const isPaidSale = (s: { status: string }) => PAID_STATUSES.has(s.status);

function statusBadge(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'CAPTURED':   return { label: 'Betalt',     bg: '#e8f5ef', fg: '#2d6a4f' };
    case 'AUTHORIZED': return { label: 'Bekreftet',  bg: '#fff8e6', fg: '#854f0b' };
    case 'CREATED':    return { label: 'Venter',     bg: '#f3f4f6', fg: '#6b7f70' };
    case 'CANCELLED':
    case 'TERMINATED': return { label: 'Avbrutt',    bg: '#fff5f5', fg: '#b91c1c' };
    case 'EXPIRED':    return { label: 'Utløpt',     bg: '#fff5f5', fg: '#b91c1c' };
    case 'FAILED':     return { label: 'Mislyktes',  bg: '#fff5f5', fg: '#b91c1c' };
    case 'REFUNDED':   return { label: 'Refundert',  bg: '#f3f4f6', fg: '#6b7f70' };
    default:           return { label: status,       bg: '#f3f4f6', fg: '#6b7f70' };
  }
}

const getCampaignIdFromUrl = (): string => {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || '';
};

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  product_name: string;
  unit_price: number;
  target_per_family: number | null;
  start_date: string | null;
  end_date: string | null;
  team_id: string | null;
}

interface MySale {
  id: string;
  quantity: number;
  amount: number;
  status: string;
  created_at: string;
  buyer_name: string | null;
}

export const MyCampaignDetail: React.FC = () => {
  const fam = useCurrentFamily();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignClosed, setCampaignClosed] = useState(false);
  const [mySales, setMySales] = useState<MySale[]>([]);
  const [copiedToast, setCopiedToast] = useState(false);

  const campaignId = getCampaignIdFromUrl();

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
      const familyTeamId = familyRow?.team_id;

      const { data: campaignData } = await supabase
        .from('sales_campaigns')
        .select('id, title, description, product_name, unit_price, target_per_family, start_date, end_date, team_id, status')
        .eq('id', campaignId)
        .maybeSingle();

      // TEMP DEBUG (kan fjernes når completed-redirect-bug er løst)
      console.log('[MyCampaignDetail debug]', {
        campaignId,
        familyId,
        familyTeamId,
        campaignData,
        redirect_reason: !campaignData ? 'no_data'
          : campaignData.team_id !== familyTeamId ? 'team_mismatch'
          : 'will_continue'
      });

      // Cross-team-tilgang blokkeres: parent skal ikke kunne åpne en
      // annen klubbs kampanje selv ved direkte URL-manipulasjon.
      // Manglende kampanje (slettet) behandles likt — tilbake til liste.
      if (!campaignData || campaignData.team_id !== familyTeamId) {
        window.location.href = '/my-campaigns';
        return;
      }

      setCampaign(campaignData as Campaign);

      // Avsluttede/utkast-kampanjer: vis siden i lese-modus med en
      // informativ banner. Parent kan ha klikket en gammel delt lenke
      // og må forstå hvorfor de ikke kan dele/selge mer.
      if (campaignData.status !== 'active') {
        setCampaignClosed(true);
      }

      const { data: salesData } = await supabase
        .from('campaign_sales')
        .select('id, quantity, amount, status, created_at, buyer_name')
        .eq('seller_family_id', familyId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      setMySales((salesData || []) as MySale[]);
    } catch (err) {
      console.error('Feil ved lasting av kampanje:', err);
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = fam.familyId ? `${window.location.origin}/campaign-shop?campaign=${campaignId}&seller=${fam.familyId}` : '';

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      alert('Kunne ikke kopiere. Marker og kopier manuelt.');
    }
  };

  const shareLink = async () => {
    if (!shareUrl || !campaign) return;
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: campaign.title,
          text: `Støtt laget ved å kjøpe ${campaign.product_name}!`,
          url: shareUrl,
        });
      } catch { /* bruker avbrøt — ingen action */ }
    } else {
      copyLink();
    }
  };

  const openShop = () => {
    if (!shareUrl) return;
    window.location.href = shareUrl;
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#1a2e1f' }}>Laster...</div>;
  }
  if (!campaign) return null;

  const paidSales = mySales.filter(isPaidSale);
  const mySoldQty = paidSales.reduce((s, x) => s + (x.quantity || 0), 0);
  const mySoldAmount = paidSales.reduce((s, x) => s + (x.amount || 0), 0);
  const target = campaign.target_per_family || 0;
  const pct = target > 0 ? Math.min(100, Math.round((mySoldQty / target) * 100)) : 0;

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }) : '';

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: '#fff' }}>
        <button
          onClick={() => window.location.href = '/my-campaigns'}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, fontSize: '13px', marginBottom: '8px' }}
        >← Mine kampanjer</button>
        <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: '#fff' }}>{campaign.title}</h1>
        {campaign.description && (
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '4px 0 0 0', fontSize: '14px' }}>{campaign.description}</p>
        )}
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {campaignClosed && (
          <div style={{ background: '#fff8e6', border: '1px solid #fac775', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#854f0b', marginBottom: '4px' }}>⏸ Kampanjen er avsluttet</div>
            <div style={{ fontSize: '13px', color: '#854f0b' }}>
              Du kan ikke selge flere produkter, men dine tidligere salg vises nedenfor.
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', marginBottom: '8px' }}>Ditt salg</div>
          <div style={{ fontSize: '48px', fontWeight: '800', color: '#2d6a4f' }}>{mySoldAmount} kr</div>
          <div style={{ fontSize: '14px', color: '#1a2e1f', fontWeight: '600' }}>{mySoldQty} stk solgt</div>
          {target > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ height: '8px', background: '#e8e0d0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#2d6a4f', width: `${pct}%`, borderRadius: '4px', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: '#4a5e50', marginTop: '6px' }}>
                {pct}% av mål ({mySoldQty} av {target} stk)
              </div>
            </div>
          )}
        </div>

        {/* Del — skjules når kampanjen er avsluttet */}
        {!campaignClosed && (
        <div style={{ background: '#e8f5ef', border: '2px solid #2d6a4f', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 4px 0', color: '#2d6a4f', fontSize: '16px' }}>📢 Del salgslenke</h3>
          <p style={{ fontSize: '13px', color: '#4a5e50', margin: '0 0 12px 0' }}>
            Send til familie, venner og naboer. De betaler enkelt med Vipps.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              readOnly
              value={shareUrl}
              style={{ flex: 1, fontSize: '12px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px 12px', color: '#1a2e1f', minWidth: 0 }}
            />
            <button
              onClick={copyLink}
              style={{ whiteSpace: 'nowrap', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '600', cursor: 'pointer' }}
            >Kopier</button>
          </div>
          {copiedToast && (
            <div style={{ fontSize: '12px', color: '#2d6a4f', marginBottom: '8px' }}>✓ Kopiert til utklippstavlen</div>
          )}
          <button
            onClick={shareLink}
            style={{ width: '100%', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '8px' }}
          >📤 Del med Vipps/SMS/Spond</button>
          <button
            onClick={openShop}
            style={{ background: 'none', border: 'none', color: '#2d6a4f', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >Vis min salgsside (slik kjøper ser den) →</button>
        </div>
        )}

        {/* Produktinfo */}
        <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1a2e1f', fontWeight: '700' }}>🛍️ Produktinfo</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#4a5e50', marginBottom: '4px' }}>
            <span>Produkt</span><span style={{ color: '#1a2e1f', fontWeight: '500' }}>{campaign.product_name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#4a5e50', marginBottom: '4px' }}>
            <span>Pris</span><span style={{ color: '#1a2e1f', fontWeight: '500' }}>{campaign.unit_price} kr/stk</span>
          </div>
          {(campaign.start_date || campaign.end_date) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#4a5e50' }}>
              <span>Periode</span>
              <span style={{ color: '#1a2e1f', fontWeight: '500' }}>
                {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
              </span>
            </div>
          )}
        </div>

        {/* Mine salg */}
        {mySales.length > 0 && (
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#1a2e1f', fontWeight: '700' }}>Mine salg ({mySales.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mySales.map(s => {
                const badge = statusBadge(s.status);
                const isPaid = isPaidSale(s);
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #eee', opacity: isPaid ? 1 : 0.7, gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.buyer_name || '–'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7f70' }}>
                        {new Date(s.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} · {s.quantity} stk
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: isPaid ? '#2d6a4f' : '#6b7f70' }}>{s.amount} kr</div>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: badge.bg, color: badge.fg, fontWeight: '500', whiteSpace: 'nowrap' }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
