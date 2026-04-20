import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import { csvRow, sanitizeCsvFilename } from '../../utils/csvSafe';
import { validateRequired, scrollToFirstError, ERROR_COLOR, type FormErrors } from '../../utils/formValidation';
import { GuideButton } from '../../utils/guides/GuideButton';
import { PremiumGateModal, hasPremium } from '../common/PremiumGateModal';

interface Campaign { id: string; title: string; description: string; product_name: string; unit_price: number; target_per_family: number; start_date: string; end_date: string; status: string; vipps_number: string; }
interface Sale { id: string; seller_family_id: string; buyer_name: string; quantity: number; amount: number; paid: boolean; delivered: boolean; sellerName: string; }

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '0.5px solid #dedddd',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#1a2e1f',
  background: '#ffffff',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '600',
  color: '#4a5e50',
  marginBottom: '6px',
};

export const SalesCampaignPage: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Form
  const [form, setForm] = useState({ title: '', product_name: '', unit_price: 100, target_per_family: 10, start_date: '', end_date: '', description: '', vipps_number: '' });

  const teamId = localStorage.getItem('dugnad_active_team_filter') || '';
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  const [createErrors, setCreateErrors] = useState<FormErrors>({});
  const createFieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const clearCreateError = (key: string) => {
    setCreateErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    // Hent aktiv kampanje
    let query = supabase.from('sales_campaigns').select('*').eq('status', 'active');
    if (teamId) query = query.eq('team_id', teamId);
    const { data: campaignData } = await query.maybeSingle();

    if (!campaignData) {
      // Sjekk draft (opprettet i prøve-modus)
      let qDraft = supabase.from('sales_campaigns').select('*').eq('status', 'draft');
      if (teamId) qDraft = qDraft.eq('team_id', teamId);
      const { data: draftData } = await qDraft.order('created_at', { ascending: false }).limit(1);
      if (draftData && draftData.length > 0) {
        setCampaign(draftData[0]);
      } else {
        // Sjekk completed
        let q2 = supabase.from('sales_campaigns').select('*').eq('status', 'completed');
        if (teamId) q2 = q2.eq('team_id', teamId);
        const { data: completed } = await q2.order('created_at', { ascending: false }).limit(1);
        if (completed && completed.length > 0) setCampaign(completed[0]);
        else setCampaign(null);
      }
    } else {
      setCampaign(campaignData);
    }

    // Hent salg
    if (campaignData || campaign) {
      const cid = (campaignData || campaign)?.id;
      if (cid) {
        const { data: salesData } = await supabase.from('campaign_sales').select('*, families:seller_family_id(name, family_members(name, role))').eq('campaign_id', cid);
        if (salesData) {
          setSales(salesData.map((s: any) => {
            const children = s.families?.family_members?.filter((m: any) => m.role === 'child') || [];
            return { ...s, sellerName: children.length > 0 ? children[0].name : s.families?.name || 'Ukjent' };
          }));
        }
      }
    }

    // Hent familier — team-avgrenset
    let famQuery = supabase.from('families').select('id, name, family_members(name, role)');
    if (teamId) famQuery = famQuery.eq('team_id', teamId);
    const { data: famData } = await famQuery;
    if (famData) setFamilies(famData.map((f: any) => {
      const children = f.family_members?.filter((m: any) => m.role === 'child') || [];
      return { id: f.id, name: children.length > 0 ? children[0].name : f.name };
    }));

    setLoading(false);
  };

  const createCampaign = async () => {
    const errors = validateRequired(
      { title: form.title, product_name: form.product_name, unit_price: form.unit_price, vipps_number: form.vipps_number },
      {
        title: 'Du må gi kampanjen et navn',
        product_name: 'Du må gi produktet et navn',
        unit_price: 'Velg pris per enhet',
        vipps_number: 'Vipps-nummer mangler — du finner det i Vipps Bedrift',
      }
    );
    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      scrollToFirstError(errors, createFieldRefs.current);
      return;
    }
    setCreateErrors({});
    await supabase.from('sales_campaigns').insert({ ...form, team_id: teamId || null, status: hasPremium() ? 'active' : 'draft' });
    setShowCreate(false);
    fetchData();
  };

  const endCampaign = async () => {
    if (!campaign || !confirm('Avslutte kampanjen? Leveringslisten genereres.')) return;
    await supabase.from('sales_campaigns').update({ status: 'completed' }).eq('id', campaign.id);
    fetchData();
  };

  const toggleDelivered = async (saleId: string, current: boolean) => {
    await supabase.from('campaign_sales').update({ delivered: !current }).eq('id', saleId);
    setSales(prev => prev.map(s => s.id === saleId ? { ...s, delivered: !current } : s));
  };

  const exportCsv = () => {
    // CSV-injection-beskyttelse: sellerName kommer fra campaign_sales, som
    // er skrivbar fra den anonyme CampaignShop-flyten. Se src/utils/csvSafe.ts.
    const header = 'Familie;Antall;Beløp;Status';
    const grouped = getSellerStats();
    const rows = grouped.map(s => csvRow([
      s.name,
      s.qty,
      s.amount,
      s.delivered ? 'Innlevert' : 'Venter',
    ])).join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leveringsliste_${sanitizeCsvFilename(campaign?.title, 'kampanje')}.csv`;
    a.click();
  };

  const getSellerStats = () => {
    const map: Record<string, { name: string; qty: number; amount: number; delivered: boolean }> = {};
    sales.forEach(s => {
      const id = s.seller_family_id || '__direct__';
      if (!map[id]) map[id] = { name: s.sellerName || 'Ukjent', qty: 0, amount: 0, delivered: s.delivered };
      map[id].qty += s.quantity;
      map[id].amount += s.amount;
      if (!s.delivered) map[id].delivered = false;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#4a5e50' }}>Laster...</div>;

  const totalQty = sales.reduce((s, x) => s + x.quantity, 0);
  const totalAmount = sales.reduce((s, x) => s + x.amount, 0);
  const sellerStats = getSellerStats();
  const familiesNotStarted = families.filter(f => !sales.some(s => s.seller_family_id === f.id));

  // --- TILSTAND 1: Ingen kampanje ---
  if (!campaign) {
    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto', background: '#faf8f4', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0 }}>← Tilbake til dashbordet</button>
          <GuideButton guideId="sales-campaign" />
        </div>

        {!showCreate ? (
          <>
            {/* Empty state hero */}
            <div data-guide="sales-campaign-hero" style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🛍️ Salgskampanje</div>
              <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Selg produkter uten <span style={{ color: '#7ec8a0' }}>organiserings-kaos</span></h1>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Skal laget selge kalendere, juleris eller noe annet? Du starter en kampanje, spillerne får egne salgslenker, og systemet holder full oversikt over hvem som har solgt hva. Pengene kommer rett inn på lagets Vipps — du slipper å jage etter betaling.</p>
              <button data-guide="sales-campaign-create" onClick={() => setShowCreate(true)} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Start ny kampanje</button>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Fungerer for alle typer produktsalg</div>
            </div>

            {/* Fordel-kort 3x2 */}
            <div data-guide="sales-campaign-benefits" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { icon: '📊', title: 'Full oversikt — alltid', desc: 'Se nøyaktig hvem som har solgt hva, og hvem som ikke har startet. Send purring med ett klikk.' },
                { icon: '🔗', title: 'Personlig lenke per spiller', desc: 'Hver familie deler sin lenke til familie og venner. Salget registreres automatisk på riktig spiller.' },
                { icon: '💸', title: 'Slipper å jage betaling', desc: 'Kjøpere betaler med Vipps direkte. Ingen kontanter å samle inn, ingen purringer på ubetalte beløp.' },
                { icon: '📦', title: 'Leveringsliste på slutten', desc: 'Når kampanjen er ferdig får du en komplett liste: hvem har solgt hva og skal ha hvilke produkter.' },
                { icon: '🏆', title: 'Toppliste motiverer', desc: 'Familiene ser hvem som er best — det gir en ekstra dytt til de som henger etter.' },
                { icon: '💰', title: '100% til lagets Vipps', desc: 'All betaling går direkte til lagets konto. Ingenting til oss.' },
              ].map((f, i) => (
                <div key={i} style={{ padding: '14px', background: '#ffffff', borderRadius: '10px', border: '0.5px solid #dedddd', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                  <div style={{ fontWeight: '600', fontSize: '12px', color: '#1a2e1f', marginBottom: '4px' }}>{f.title}</div>
                  <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{f.desc}</div>
                </div>
              ))}
            </div>

            {/* Slik gjør du det */}
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Slik gjør du det</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { n: '1', title: 'Opprett kampanje', desc: 'Gi produktet et navn, sett pris og velg varighet' },
                { n: '2', title: 'Del salgslenker', desc: 'Systemet genererer unike lenker per familie automatisk' },
                { n: '3', title: 'Følg salget live', desc: 'Se toppliste og statistikk i sanntid' },
                { n: '4', title: 'Hent leveringsliste', desc: 'Last ned hvem som skal ha hva når kampanjen er ferdig' },
              ].map((s, i) => (
                <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e8f5ef', color: '#2d6a4f', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>{s.n}</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '3px' }}>{s.title}</div>
                  <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* OPPRETT-SKJEMA */
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px' }}>
            <h2 style={{ margin: '0 0 20px', color: '#1a2e1f', fontSize: '20px', fontWeight: '700' }}>Ny salgskampanje</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Kampanjenavn *</label>
                <input
                  ref={el => { createFieldRefs.current.title = el; }}
                  style={{ ...inputStyle, ...(createErrors.title ? { border: `1px solid ${ERROR_COLOR}` } : {}) }}
                  value={form.title}
                  onChange={e => { setForm({ ...form, title: e.target.value }); clearCreateError('title'); }}
                  placeholder="F.eks. Julekalender 2025"
                />
                {createErrors.title && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{createErrors.title}</p>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Produktnavn *</label>
                  <input
                    ref={el => { createFieldRefs.current.product_name = el; }}
                    style={{ ...inputStyle, ...(createErrors.product_name ? { border: `1px solid ${ERROR_COLOR}` } : {}) }}
                    value={form.product_name}
                    onChange={e => { setForm({ ...form, product_name: e.target.value }); clearCreateError('product_name'); }}
                    placeholder="F.eks. Julekalender"
                  />
                  {createErrors.product_name && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{createErrors.product_name}</p>}
                </div>
                <div>
                  <label style={labelStyle}>Utsalgspris per enhet (kr) *</label>
                  <input
                    ref={el => { createFieldRefs.current.unit_price = el; }}
                    type="number"
                    style={{ ...inputStyle, ...(createErrors.unit_price ? { border: `1px solid ${ERROR_COLOR}` } : {}) }}
                    value={form.unit_price}
                    onChange={e => { setForm({ ...form, unit_price: parseInt(e.target.value) || 0 }); clearCreateError('unit_price'); }}
                  />
                  {createErrors.unit_price && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{createErrors.unit_price}</p>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Mål per familie</label>
                  <input type="number" style={inputStyle} value={form.target_per_family} onChange={e => setForm({ ...form, target_per_family: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={labelStyle}>Startdato</label>
                  <input type="date" style={inputStyle} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Sluttdato</label>
                  <input type="date" style={inputStyle} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Vipps-nummer *</label>
                <input
                  ref={el => { createFieldRefs.current.vipps_number = el; }}
                  style={{ ...inputStyle, ...(createErrors.vipps_number ? { border: `1px solid ${ERROR_COLOR}` } : {}) }}
                  value={form.vipps_number}
                  onChange={e => { setForm({ ...form, vipps_number: e.target.value }); clearCreateError('vipps_number'); }}
                  placeholder="For betaling"
                />
                {createErrors.vipps_number && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{createErrors.vipps_number}</p>}
              </div>
              <div>
                <label style={labelStyle}>Beskrivelse (valgfritt)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowCreate(false)} style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: '#4a5e50' }}>Avbryt</button>
                <button onClick={createCampaign} style={{ background: '#2d6a4f', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Start kampanje</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- TILSTAND 3: Avsluttet → Leveringsliste ---
  if (campaign.status === 'completed') {
    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto', background: '#faf8f4', minHeight: '100vh' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '24px', display: 'block' }}>← Tilbake til dashbordet</button>

        {/* Active header bar - completed */}
        <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0, color: '#ffffff', fontSize: '20px', fontWeight: '700' }}>{campaign.title}</h1>
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '10px', background: 'rgba(126,200,160,0.2)', color: '#7ec8a0', fontWeight: '600' }}>Avsluttet</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', fontSize: '13px' }}>Totalt {totalQty} {campaign.product_name} solgt · {totalAmount.toLocaleString('nb-NO')} kr innsamlet</p>
          </div>
          <button onClick={exportCsv} style={{ fontSize: '13px', color: '#1e3a2f', background: '#7ec8a0', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>📥 Last ned leveringsliste</button>
        </div>

        {/* Table */}
        <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead><tr style={{ background: '#faf8f4', borderBottom: '1px solid #dedddd' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', color: '#4a5e50', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' as const }}>Familie / spiller</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#4a5e50', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' as const }}>Enheter</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', color: '#4a5e50', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' as const }}>Beløp</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', color: '#4a5e50', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' as const }}>Status</th>
            </tr></thead>
            <tbody>
              {sellerStats.map((s, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #dedddd' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '600', color: '#1a2e1f' }}>{s.name}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#1a2e1f' }}>{s.qty}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#2d6a4f', fontWeight: '600' }}>{s.amount.toLocaleString('nb-NO')} kr</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button onClick={() => { const sale = sales.find(x => x.sellerName === s.name); if (sale) toggleDelivered(sale.id, s.delivered); }}
                      style={{ fontSize: '11px', padding: '4px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '600',
                        background: s.qty === 0 ? '#f3f4f6' : s.delivered ? '#e8f5ef' : '#fff8e6',
                        color: s.qty === 0 ? '#6b7f70' : s.delivered ? '#2d6a4f' : '#854f0b' }}>
                      {s.qty === 0 ? 'Ingen salg' : s.delivered ? 'Innlevert' : 'Venter'}
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#faf8f4', fontWeight: '700' }}>
                <td style={{ padding: '12px 16px', color: '#1a2e1f' }}>Totalt</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#1a2e1f' }}>{totalQty}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#2d6a4f' }}>{totalAmount.toLocaleString('nb-NO')} kr</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- TILSTAND 2: Aktiv eller utkast-kampanje ---
  const isDraft = campaign.status === 'draft';
  const daysLeft = campaign.end_date ? Math.max(0, Math.ceil((new Date(campaign.end_date).getTime() - Date.now()) / 86400000)) : null;
  const totalTarget = families.length * (campaign.target_per_family || 10);
  const maxSeller = sellerStats[0]?.qty || 1;

  const publishCampaign = async () => {
    if (!hasPremium()) { setShowPremiumGate(true); return; }
    await supabase.from('sales_campaigns').update({ status: 'active' }).eq('id', campaign.id);
    fetchData();
  };

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto', background: '#faf8f4', minHeight: '100vh' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '24px', display: 'block' }}>← Tilbake til dashbordet</button>

      {/* Active/Draft header bar */}
      <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, color: '#ffffff', fontSize: '20px', fontWeight: '700' }}>{campaign.title}</h1>
            <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '10px', background: isDraft ? 'rgba(250,199,117,0.2)' : 'rgba(126,200,160,0.2)', color: isDraft ? '#fac775' : '#7ec8a0', fontWeight: '600' }}>{isDraft ? 'Utkast' : 'Aktiv'}</span>
            {!isDraft && daysLeft !== null && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{daysLeft} dager igjen</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: '4px 0 0', fontSize: '13px' }}>{campaign.product_name} · {campaign.unit_price} kr/stk{isDraft ? ' · Ikke synlig for kjøpere ennå' : ''}</p>
        </div>
        {isDraft ? (
          <button onClick={publishCampaign} style={{ fontSize: '13px', color: '#1e3a2f', background: '#7ec8a0', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Publiser kampanje →</button>
        ) : (
          <button onClick={endCampaign} style={{ fontSize: '13px', color: '#854f0b', border: '1px solid #fac775', background: '#fff8e6', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Avslutt kampanje</button>
        )}
      </div>
      {showPremiumGate && <PremiumGateModal featureName="salgskampanjen" onClose={() => setShowPremiumGate(false)} />}

      {/* Stats */}
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Oversikt</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div style={{ padding: '16px', background: '#ffffff', borderRadius: '8px', border: '0.5px solid #dedddd', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a2e1f' }}>{totalQty}</div>
          <div style={{ fontSize: '12px', color: '#4a5e50' }}>enheter solgt</div>
        </div>
        <div style={{ padding: '16px', background: '#ffffff', borderRadius: '8px', border: '0.5px solid #dedddd', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#2d6a4f' }}>{totalAmount.toLocaleString('nb-NO')} kr</div>
          <div style={{ fontSize: '12px', color: '#4a5e50' }}>innsamlet</div>
        </div>
        <div style={{ padding: '16px', background: familiesNotStarted.length > 0 ? '#fff8e6' : '#ffffff', borderRadius: '8px', border: familiesNotStarted.length > 0 ? '1px solid #fac775' : '0.5px solid #dedddd', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: familiesNotStarted.length > 0 ? '#854f0b' : '#1a2e1f' }}>{familiesNotStarted.length}</div>
          <div style={{ fontSize: '12px', color: familiesNotStarted.length > 0 ? '#854f0b' : '#4a5e50' }}>ikke startet</div>
        </div>
        <div style={{ padding: '16px', background: '#ffffff', borderRadius: '8px', border: '0.5px solid #dedddd', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a2e1f' }}>{families.length}</div>
          <div style={{ fontSize: '12px', color: '#4a5e50' }}>familier totalt</div>
        </div>
      </div>

      {/* Progress */}
      {totalTarget > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#4a5e50', marginBottom: '4px' }}>
            <span>{Math.round((totalQty / totalTarget) * 100)}% av mål</span>
            <span>{totalQty} / {totalTarget}</span>
          </div>
          <div style={{ height: '6px', background: '#e8e0d0', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (totalQty / totalTarget) * 100)}%`, background: '#2d6a4f', borderRadius: '3px' }} />
          </div>
        </div>
      )}

      {/* Toppliste */}
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Toppliste</div>
      <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 16px', color: '#1a2e1f', fontSize: '16px', fontWeight: '700' }}>🏅 Hvem selger mest</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sellerStats.map((s, idx) => (
            <div key={idx} style={{ padding: '10px 12px', background: '#faf8f4', borderRadius: '8px', border: '0.5px solid #dedddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a2e1f' }}>
                  {idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : ''}{s.name}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#2d6a4f' }}>{s.qty} stk · {s.amount.toLocaleString('nb-NO')} kr</div>
              </div>
              <div style={{ height: '4px', background: '#e8e0d0', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.qty / maxSeller) * 100}%`, background: idx === 0 ? '#2d6a4f' : '#7ec8a0', borderRadius: '2px' }} />
              </div>
            </div>
          ))}
          {familiesNotStarted.length > 0 && (
            <div style={{ padding: '10px 12px', fontSize: '13px', color: '#854f0b', background: '#fff8e6', borderRadius: '8px', border: '1px solid #fac775' }}>
              {familiesNotStarted.length} familier har ikke startet ennå
            </div>
          )}
        </div>
      </div>

      {/* Purre-knapp */}
      <button onClick={() => alert('📢 Purring sendt til familier som ikke har startet.')} style={{ width: '100%', padding: '12px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#4a5e50', fontWeight: '500' }}>
        📢 Send purring til familier som ikke har startet
      </button>
    </div>
  );
};
