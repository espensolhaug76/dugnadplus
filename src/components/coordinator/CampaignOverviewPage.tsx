import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface CampaignItem {
  id: string;
  type: 'loddbok' | 'salgskampanje' | 'kiosk' | 'sponsor';
  name: string;
  status: 'active' | 'completed' | 'running';
  startDate: string;
  endDate?: string;
  revenue: number;
  goal?: number;
  meta: string[];
  warning?: string;
  daysLeft?: number;
  progress?: string;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  loddbok: { icon: '🎟️', label: 'Digital loddbok', color: '#2d6a4f', bg: '#e8f5ef' },
  salgskampanje: { icon: '🛍️', label: 'Salgskampanje', color: '#639922', bg: '#edf5e0' },
  kiosk: { icon: '🛒', label: 'Kiosk', color: '#97c459', bg: '#f0f7e4' },
  sponsor: { icon: '🤝', label: 'Sponsorer', color: '#c0dd97', bg: '#f5fae8' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

export const CampaignOverviewPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [completedFilter, setCompletedFilter] = useState('Alle');
  const [teamName, setTeamName] = useState('');

  const teamId = localStorage.getItem('dugnad_active_team_filter') || '';

  useEffect(() => {
    loadTeamInfo();
    fetchAll();
  }, []);

  const loadTeamInfo = () => {
    try {
      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      const active = teams.find((t: any) => t.id === teamId);
      if (active) setTeamName(active.name || '');
      else {
        const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
        setTeamName(club.name || '');
      }
    } catch { /* ignore */ }
  };

  const fetchAll = async () => {
    setLoading(true);
    const items: CampaignItem[] = [];
    const monthly: Record<string, number> = {};

    // Initialize last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
    }

    // --- LOTTERIES ---
    try {
      let lq = supabase.from('lotteries').select('*, prizes(*), lottery_sales(tickets, amount, created_at)');
      if (teamId) lq = lq.eq('team_id', teamId);
      const { data: lotteries } = await lq;
      if (lotteries) {
        for (const l of lotteries) {
          const sales = l.lottery_sales || [];
          const revenue = sales.reduce((s: number, r: any) => s + (r.amount || 0), 0);
          const totalSold = sales.reduce((s: number, r: any) => s + (r.tickets || 0), 0);
          const winnersDrawn = (l.prizes || []).filter((p: any) => p.winner_name).length;
          (l.prizes || []).length; // prizeCount reserved for future use

          // Monthly
          sales.forEach((s: any) => {
            if (s.created_at) {
              const key = s.created_at.slice(0, 7);
              if (monthly[key] !== undefined) monthly[key] += s.amount || 0;
            }
          });

          const meta: string[] = [];
          if (l.is_active) {
            // count families who sold
            const sellerIds = new Set(sales.filter((s: any) => s.seller_family_id).map((s: any) => s.seller_family_id));
            meta.push(`${sellerIds.size} familier har solgt`);
          } else {
            meta.push(`${totalSold} lodd solgt`);
            if (winnersDrawn > 0) meta.push(`${winnersDrawn} vinnere trukket`);
          }

          items.push({
            id: l.id,
            type: 'loddbok',
            name: l.name,
            status: l.is_active ? 'active' : 'completed',
            startDate: l.created_at?.slice(0, 10) || '',
            revenue,
            goal: l.goal || 0,
            meta,
            progress: l.goal > 0 ? `${totalSold} lodd solgt` : undefined,
          });
        }
      }
    } catch (e) { console.error('Lotteri-feil:', e); }

    // --- SALES CAMPAIGNS ---
    try {
      let sq = supabase.from('sales_campaigns').select('*, campaign_sales(quantity, amount, delivered, created_at)');
      if (teamId) sq = sq.eq('team_id', teamId);
      const { data: campaigns } = await sq;
      if (campaigns) {
        for (const c of campaigns) {
          const sales = c.campaign_sales || [];
          const revenue = sales.reduce((s: number, r: any) => s + (r.amount || 0), 0);
          const totalQty = sales.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
          const undelivered = sales.filter((s: any) => !s.delivered).reduce((sum: number, r: any) => sum + (r.quantity || 0), 0);

          sales.forEach((s: any) => {
            if (s.created_at) {
              const key = s.created_at.slice(0, 7);
              if (monthly[key] !== undefined) monthly[key] += s.amount || 0;
            }
          });

          const meta: string[] = [];
          const sellerIds = new Set(sales.filter((s: any) => s.seller_family_id).map((s: any) => s.seller_family_id));
          meta.push(`${sellerIds.size} familier har solgt`);
          if (undelivered > 0) meta.push(`${undelivered} uleverte enheter`);

          const daysLeft = c.end_date ? Math.max(0, Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000)) : undefined;

          items.push({
            id: c.id,
            type: 'salgskampanje',
            name: c.title,
            status: c.status === 'active' ? 'active' : 'completed',
            startDate: c.start_date || c.created_at?.slice(0, 10) || '',
            endDate: c.end_date,
            revenue,
            goal: (c.target_per_family || 10) * 44 * (c.unit_price || 0), // rough target
            meta,
            warning: undelivered > 0 ? `${undelivered} uleverte enheter` : undefined,
            daysLeft,
            progress: `${totalQty} enheter solgt`,
          });
        }
      }
    } catch (e) { console.error('Kampanje-feil:', e); }

    // --- KIOSK ---
    try {
      const { data: kioskSales } = await supabase.from('kiosk_sales').select('total_amount, created_at, event_id');
      if (kioskSales && kioskSales.length > 0) {
        const revenue = kioskSales.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
        const eventIds = new Set(kioskSales.map((s: any) => s.event_id).filter(Boolean));
        const avgPerDay = eventIds.size > 0 ? Math.round(revenue / eventIds.size) : 0;

        kioskSales.forEach((s: any) => {
          if (s.created_at) {
            const key = s.created_at.slice(0, 7);
            if (monthly[key] !== undefined) monthly[key] += s.total_amount || 0;
          }
        });

        // Find date range
        const dates = kioskSales.map((s: any) => s.created_at).filter(Boolean).sort();
        // startMonth/endMonth reserved for future date range display
        dates[0]?.slice(0, 7) || '';
        dates[dates.length - 1]?.slice(0, 7) || '';

        items.push({
          id: '__kiosk__',
          type: 'kiosk',
          name: `Kiosk — ${teamName || 'Kampdager'} ${now.getFullYear()}`,
          status: 'completed',
          startDate: dates[0]?.slice(0, 10) || '',
          revenue,
          meta: [`${avgPerDay} kr snitt per kampdag`, `${eventIds.size} kampdager`],
        });
      }
    } catch (e) { console.error('Kiosk-feil:', e); }

    // --- SPONSORS ---
    try {
      const { data: sponsors } = await supabase.from('sponsors').select('*').eq('is_active', true);
      if (sponsors && sponsors.length > 0) {
        const totalSponsorAmount = sponsors.reduce((s: number, r: any) => s + (r.sponsor_amount || 0), 0);
        const names = sponsors.map((s: any) => s.name).slice(0, 3);

        items.push({
          id: '__sponsors__',
          type: 'sponsor',
          name: `Sponsorer sesong ${now.getFullYear() - 1}/${now.getFullYear()}`,
          status: 'running',
          startDate: '',
          revenue: totalSponsorAmount,
          meta: [names.join(', ')],
        });
      }
    } catch (e) { console.error('Sponsor-feil:', e); }

    setCampaigns(items);
    setMonthlyRevenue(Object.values(monthly));
    setLoading(false);
  };

  // Derived data
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const completedCampaigns = campaigns.filter(c => c.status === 'completed' || c.status === 'running');
  const needsAttention = campaigns.reduce((s, c) => s + (c.warning ? 1 : 0), 0);

  const revenueByType: Record<string, number> = {};
  campaigns.forEach(c => { revenueByType[c.type] = (revenueByType[c.type] || 0) + c.revenue; });

  const avgRevenue = campaigns.length > 0 ? Math.round(totalRevenue / campaigns.length) : 0;
  const bestCampaign = campaigns.length > 0 ? campaigns.reduce((best, c) => c.revenue > best.revenue ? c : best) : null;

  const maxMonth = Math.max(...monthlyRevenue, 1);
  const monthKeys = (() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(MONTHS[d.getMonth()]);
    }
    return keys;
  })();

  const filteredCompleted = completedCampaigns.filter(c => {
    if (completedFilter === 'Alle') return true;
    if (completedFilter === 'Loddbok') return c.type === 'loddbok';
    if (completedFilter === 'Salg') return c.type === 'salgskampanje';
    if (completedFilter === 'Kiosk') return c.type === 'kiosk';
    if (completedFilter === 'Sponsorer') return c.type === 'sponsor';
    return true;
  });

  const navigateToCampaign = (c: CampaignItem) => {
    if (c.type === 'loddbok') window.location.href = '/lottery-admin';
    else if (c.type === 'salgskampanje') window.location.href = '/sales-campaign';
    else if (c.type === 'kiosk') window.location.href = '/kiosk-admin';
    else if (c.type === 'sponsor') window.location.href = '/sponsor-admin';
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${d.getFullYear()}`;
  };

  const formatKr = (n: number) => n.toLocaleString('nb-NO');

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#4a5e50' }}>Laster kampanjer...</div>;

  // --- EMPTY STATE ---
  if (campaigns.length === 0) {
    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '12px', padding: 0, marginBottom: '16px' }}>← Tilbake til dashbordet</button>
        <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>📊 Kampanjeoversikt</div>
          <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Du har ikke startet noen kampanjer ennå</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto', maxWidth: '520px' }}>Start din første kampanje for å begynne å samle inn penger til laget</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { icon: '🎟️', label: 'Start loddsalg', path: '/lottery-admin' },
            { icon: '🛍️', label: 'Start salgskampanje', path: '/sales-campaign' },
            { icon: '🛒', label: 'Sett opp kiosk', path: '/kiosk-admin' },
            { icon: '🤝', label: 'Legg til sponsor', path: '/sponsor-admin' },
          ].map((item, i) => (
            <button key={i} onClick={() => window.location.href = item.path} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '20px 14px', textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{item.icon}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f' }}>{item.label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- MAIN VIEW ---
  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '12px', padding: 0, marginBottom: '12px' }}>← Tilbake til dashbordet</button>

      {/* HERO */}
      <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '20px 20px 0', marginBottom: '16px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '500', color: '#fff', margin: '0 0 4px' }}>Kampanjeoversikt</h1>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{teamName} · Sesong {new Date().getFullYear()}</div>
          </div>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowNewMenu(!showNewMenu)} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>+ Ny kampanje</button>
            {showNewMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, minWidth: '220px', overflow: 'hidden' }}>
                {[
                  { icon: '🎟️', label: 'Start loddsalg', path: '/lottery-admin' },
                  { icon: '🛍️', label: 'Start salgskampanje', path: '/sales-campaign' },
                  { icon: '🛒', label: 'Sett opp kiosk', path: '/kiosk-admin' },
                  { icon: '🤝', label: 'Legg til sponsor', path: '/sponsor-admin' },
                ].map((item, i) => (
                  <button key={i} onClick={() => { setShowNewMenu(false); window.location.href = item.path; }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a2e1f', borderBottom: i < 3 ? '0.5px solid #f0f0f0' : 'none', textAlign: 'left' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', paddingBottom: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '4px' }}>Totalt innsamlet</div>
            <div style={{ fontSize: '20px', fontWeight: '500', color: '#7ec8a0' }}>{formatKr(totalRevenue)} kr</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Denne sesongen</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '4px' }}>Aktive kampanjer</div>
            <div style={{ fontSize: '20px', fontWeight: '500', color: '#fff' }}>{activeCampaigns.length}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Pågår nå</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '4px' }}>Fullførte kampanjer</div>
            <div style={{ fontSize: '20px', fontWeight: '500', color: '#fff' }}>{completedCampaigns.length}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Denne sesongen</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '4px' }}>Krever oppfølging</div>
            <div style={{ fontSize: '20px', fontWeight: '500', color: needsAttention > 0 ? '#fac775' : '#fff' }}>{needsAttention}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>Uleverte enheter</div>
          </div>
        </div>
      </div>

      {/* STATISTICS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {/* Monthly revenue chart */}
        <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Inntekt per måned</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
            {monthlyRevenue.map((val, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', height: `${Math.max(4, (val / maxMonth) * 100)}%`, background: i === monthlyRevenue.length - 1 ? '#2d6a4f' : '#e6f0e8', borderRadius: '3px', minHeight: '4px', transition: 'height 0.3s' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            {monthKeys.map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: '10px', color: '#6b7f70' }}>{m}</div>
            ))}
          </div>
        </div>

        {/* Revenue by type */}
        <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Fordeling per type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#1a2e1f', flex: 1 }}>{cfg.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: '#1a2e1f' }}>{formatKr(revenueByType[key] || 0)} kr</span>
              </div>
            ))}
          </div>
        </div>

        {/* Average per campaign */}
        <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Snitt per kampanje</div>
          <div style={{ fontSize: '22px', fontWeight: '500', color: '#1a2e1f', marginBottom: '2px' }}>{formatKr(avgRevenue)} kr</div>
          <div style={{ fontSize: '11px', color: '#4a5e50', marginBottom: '12px' }}>Basert på {campaigns.length} kampanjer</div>
          {bestCampaign && (
            <>
              <div style={{ borderTop: '0.5px solid #dedddd', paddingTop: '10px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: '#6b7f70', marginBottom: '2px' }}>Beste kampanje</div>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#2d6a4f' }}>{bestCampaign.name} — {formatKr(bestCampaign.revenue)} kr</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ACTIVE CAMPAIGNS */}
      {activeCampaigns.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Aktive kampanjer</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {activeCampaigns.map(c => {
              const cfg = TYPE_CONFIG[c.type];
              const pct = c.goal && c.goal > 0 ? Math.min(100, Math.round((c.revenue / c.goal) * 100)) : 0;
              return (
                <div key={c.id} onClick={() => navigateToCampaign(c)} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d6a4f')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#dedddd')}>
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{cfg.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#4a5e50' }}>{cfg.label} · Startet {formatDate(c.startDate)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#2d6a4f' }}>{formatKr(c.revenue)} kr</div>
                      <div style={{ fontSize: '10px', color: '#4a5e50' }}>Innsamlet</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {c.goal && c.goal > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7f70', marginBottom: '3px' }}>
                        <span>{c.progress}</span>
                        {c.daysLeft !== undefined && <span>{c.daysLeft} dager igjen</span>}
                      </div>
                      <div style={{ height: '4px', background: '#e8e0d0', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: '#2d6a4f', borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}

                  {/* Bottom meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: '#e8f5ef', color: '#2d6a4f', fontWeight: '500' }}>
                      {c.status === 'running' ? 'Løpende' : 'Aktiv'}
                    </span>
                    {c.meta.map((m, i) => (
                      <React.Fragment key={i}>
                        <span style={{ fontSize: '10px', color: '#6b7f70' }}>·</span>
                        <span style={{ fontSize: '11px', color: '#4a5e50' }}>{m}</span>
                      </React.Fragment>
                    ))}
                    {c.warning && (
                      <>
                        <span style={{ fontSize: '10px', color: '#6b7f70' }}>·</span>
                        <span style={{ fontSize: '11px', color: '#854f0b', fontWeight: '500' }}>{c.warning}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* COMPLETED CAMPAIGNS */}
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em' }}>Fullførte kampanjer</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['Alle', 'Loddbok', 'Salg', 'Kiosk', 'Sponsorer'].map(f => (
              <button key={f} onClick={() => setCompletedFilter(f)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: completedFilter === f ? '0.5px solid #2d6a4f' : '0.5px solid #dedddd', background: completedFilter === f ? '#e8f5ef' : '#fff', color: completedFilter === f ? '#2d6a4f' : '#6b7f70', cursor: 'pointer', fontWeight: completedFilter === f ? '500' : '400' }}>{f}</button>
            ))}
          </div>
        </div>
        {filteredCompleted.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#6b7f70' }}>Ingen fullførte kampanjer ennå</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredCompleted.map(c => {
              const cfg = TYPE_CONFIG[c.type];
              return (
                <div key={c.id} onClick={() => navigateToCampaign(c)} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px', cursor: 'pointer', transition: 'border-color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d6a4f')} onMouseLeave={e => (e.currentTarget.style.borderColor = '#dedddd')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{cfg.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#4a5e50' }}>{cfg.label} · {formatDate(c.startDate)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#2d6a4f' }}>{formatKr(c.revenue)} kr</div>
                      <div style={{ fontSize: '10px', color: '#4a5e50' }}>{c.type === 'sponsor' ? 'Sponsorinntekt' : 'Totalt innsamlet'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: c.status === 'running' ? '#e8f5ef' : '#f3f4f6', color: c.status === 'running' ? '#2d6a4f' : '#6b7f70', fontWeight: '500' }}>
                      {c.status === 'running' ? 'Løpende' : 'Fullført'}
                    </span>
                    {c.meta.map((m, i) => (
                      <React.Fragment key={i}>
                        <span style={{ fontSize: '10px', color: '#6b7f70' }}>·</span>
                        <span style={{ fontSize: '11px', color: '#4a5e50' }}>{m}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    </div>
  );
};
