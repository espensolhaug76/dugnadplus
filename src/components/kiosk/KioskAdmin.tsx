import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { PremiumGateModal, hasPremium } from '../common/PremiumGateModal';

interface KioskItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
  is_active: boolean;
}

interface SalesSummary {
  eventName: string;
  eventDate: string;
  totalAmount: number;
  transactionCount: number;
  topItem: string;
}

const DEFAULT_ITEMS = [
  { name: 'Kaffe', price: 20, emoji: '☕' },
  { name: 'Brus', price: 15, emoji: '🧃' },
  { name: 'Pølse', price: 30, emoji: '🌭' },
  { name: 'Kake', price: 25, emoji: '🍕' },
  { name: 'Bolle', price: 15, emoji: '🥐' },
  { name: 'Vann', price: 10, emoji: '💧' },
];

export const KioskAdmin: React.FC = () => {
  const [items, setItems] = useState<KioskItem[]>([]);
  const [salesByEvent, setSalesByEvent] = useState<SalesSummary[]>([]);
  const [, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vippsNumber, setVippsNumber] = useState('');
  const [teamId, setTeamId] = useState('');
  const [clubName, setClubName] = useState('');

  // Ny vare
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState(0);
  const [newEmoji, setNewEmoji] = useState('🛒');
  const [showSetup, setShowSetup] = useState(false);
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    // Klubbinfo
    try {
      const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
      setClubName(club.name || 'Mitt lag');
      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
      const activeTeam = activeTeamId ? teams.find((t: any) => t.id === activeTeamId) : teams[0];
      if (activeTeam) setTeamId(activeTeam.id);
    } catch {}

    // Hent varer for dette laget
    const currentTeamId = localStorage.getItem('dugnad_active_team_filter') || '';
    let itemQuery = supabase.from('kiosk_items').select('*');
    if (currentTeamId) itemQuery = itemQuery.eq('team_id', currentTeamId);
    const { data: itemsData } = await itemQuery.order('name');
    if (itemsData) setItems(itemsData);

    // Hent arrangementer for salgsstatistikk — team-avgrenset
    let eventsQuery = supabase
      .from('events')
      .select('id, name, date')
      .order('date', { ascending: false })
      .limit(20);
    if (currentTeamId) eventsQuery = eventsQuery.eq('team_id', currentTeamId);
    const { data: eventsData } = await eventsQuery;
    if (eventsData) setEvents(eventsData);

    // Hent salg — team-avgrenset
    let salesQuery = supabase
      .from('kiosk_sales')
      .select('event_id, items, total_amount');
    if (currentTeamId) salesQuery = salesQuery.eq('team_id', currentTeamId);
    const { data: salesData } = await salesQuery;

    if (salesData && eventsData) {
      const byEvent: Record<string, { totalAmount: number; count: number; itemCounts: Record<string, number> }> = {};
      salesData.forEach((s: any) => {
        const eid = s.event_id || '__none__';
        if (!byEvent[eid]) byEvent[eid] = { totalAmount: 0, count: 0, itemCounts: {} };
        byEvent[eid].totalAmount += s.total_amount || 0;
        byEvent[eid].count++;
        const saleItems = typeof s.items === 'string' ? JSON.parse(s.items) : s.items;
        if (Array.isArray(saleItems)) {
          saleItems.forEach((item: any) => {
            byEvent[eid].itemCounts[item.name] = (byEvent[eid].itemCounts[item.name] || 0) + (item.qty || 1);
          });
        }
      });

      const summaries: SalesSummary[] = Object.entries(byEvent).map(([eid, data]) => {
        const event = eventsData.find((e: any) => e.id === eid);
        const topEntry = Object.entries(data.itemCounts).sort((a, b) => b[1] - a[1])[0];
        return {
          eventName: event?.name || 'Uten arrangement',
          eventDate: event?.date || '',
          totalAmount: data.totalAmount,
          transactionCount: data.count,
          topItem: topEntry ? `${topEntry[0]} (${topEntry[1]} stk)` : '-'
        };
      }).sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
      setSalesByEvent(summaries);
    }

    // Vipps-nummer
    try {
      const stored = localStorage.getItem('dugnad_kiosk_vipps');
      if (stored) setVippsNumber(stored);
    } catch {}

    setLoading(false);
  };

  const saveVipps = (val: string) => {
    setVippsNumber(val);
    localStorage.setItem('dugnad_kiosk_vipps', val);
  };

  const addItem = async () => {
    if (!newName.trim() || newPrice <= 0) return;
    const { error } = await supabase.from('kiosk_items').insert({
      team_id: teamId,
      name: newName.trim(),
      price: newPrice,
      emoji: newEmoji || '🛒',
      is_active: true
    });
    if (error) alert(error.message);
    else { setNewName(''); setNewPrice(0); setNewEmoji('🛒'); loadData(); }
  };

  const seedDefaults = async () => {
    if (items.length > 0 && !confirm('Du har allerede varer. Vil du legge til standardvarene i tillegg?')) return;
    const inserts = DEFAULT_ITEMS.map(d => ({ team_id: teamId, name: d.name, price: d.price, emoji: d.emoji, is_active: true }));
    await supabase.from('kiosk_items').insert(inserts);
    loadData();
  };

  const toggleItem = async (id: string, active: boolean) => {
    await supabase.from('kiosk_items').update({ is_active: !active }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: !active } : i));
  };

  const deleteItem = async (id: string) => {
    await supabase.from('kiosk_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateItemPrice = async (id: string, price: number) => {
    await supabase.from('kiosk_items').update({ price }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, price } : i));
  };

  const kioskUrl = `${window.location.origin}/kiosk?team=${teamId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(kioskUrl);
    alert('Lenke kopiert!');
  };

  const printQR = () => {
    // Print-vinduet bygges via DOM-API med textContent, IKKE innerHTML
    // eller document.write. Tidligere versjon interpolerte clubName og
    // kioskUrl direkte inn i en HTML-streng, noe som ga stored XSS:
    // en koordinator kunne sette klubbnavn til `<img src=x onerror=...>`
    // og eksfiltrere auth-token fra window.opener.localStorage når en
    // annen koordinator i samme klubb printet QR-koden.
    //
    // Ved å bruke createElement + textContent blir <, >, ", ', & og
    // andre tegn i bruker-kontrollert state rendret som ren tekst av
    // nettleseren — ingen mulighet for HTML-injeksjon. Print-knappen
    // bruker addEventListener i stedet for inline onclick for å unngå
    // å måtte skrive JavaScript som streng (og være CSP-kompatibel
    // når vi slår på Content-Security-Policy med restriktiv script-src).
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(kioskUrl)}`;
    const win = window.open('', '_blank');
    if (!win) return;
    const doc = win.document;

    doc.title = 'Kiosk QR-kode';

    const style = doc.createElement('style');
    style.textContent = 'body{font-family:sans-serif;text-align:center;padding:40px}@media print{button{display:none}}';
    doc.head.appendChild(style);

    const h1 = doc.createElement('h1');
    h1.style.fontSize = '36px';
    h1.style.marginBottom = '8px';
    h1.textContent = `🛒 ${clubName || 'Kiosk'}`;
    doc.body.appendChild(h1);

    const intro = doc.createElement('p');
    intro.style.fontSize = '20px';
    intro.style.color = '#6b7f70';
    intro.style.marginBottom = '32px';
    intro.textContent = 'Skann QR-koden for å bestille og betale med Vipps';
    doc.body.appendChild(intro);

    const img = doc.createElement('img');
    img.src = qrApiUrl;           // qrApiUrl er bygget av encodeURIComponent(kioskUrl)
    img.width = 300;
    img.height = 300;
    img.alt = 'QR-kode';
    img.style.border = '8px solid #2d6a4f';
    img.style.borderRadius = '16px';
    doc.body.appendChild(img);

    const urlLine = doc.createElement('p');
    urlLine.style.fontSize = '14px';
    urlLine.style.color = '#6b7f70';
    urlLine.style.marginTop = '24px';
    urlLine.textContent = kioskUrl;
    doc.body.appendChild(urlLine);

    const printBtn = doc.createElement('button');
    printBtn.textContent = 'Skriv ut';
    printBtn.style.marginTop = '24px';
    printBtn.style.padding = '12px 32px';
    printBtn.style.fontSize = '16px';
    printBtn.style.background = '#2d6a4f';
    printBtn.style.color = 'white';
    printBtn.style.border = 'none';
    printBtn.style.borderRadius = '8px';
    printBtn.style.cursor = 'pointer';
    printBtn.addEventListener('click', () => win.print());
    doc.body.appendChild(printBtn);

    doc.close();
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#4a5e50' }}>Laster...</div>;

  const totalAllSales = salesByEvent.reduce((s, e) => s + e.totalAmount, 0);

  // --- LANDINGSSIDE når ingen varer er satt opp ---
  if (items.length === 0 && !showSetup) {
    return (
      <div style={{ background: '#faf8f4', minHeight: '100vh' }}>
        <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
          <button
            onClick={() => window.location.href = '/coordinator-dashboard'}
            style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '24px' }}
          >
            ← Tilbake til dashbordet
          </button>

          {/* Hero */}
          <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🛒 Kiosk</div>
            <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Sett opp kiosken på <span style={{ color: '#7ec8a0' }}>2 minutter</span> — kjøperne betaler selv</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Perfekt til kaffe, kaker og brus på treninger og kampdager. Du lager en enkel meny, henger opp en QR-kode, og kjøperne ordner resten selv med Vipps. Du slipper å sitte og ta imot penger — og alt går rett til laget.</p>
            <button onClick={() => setShowSetup(true)} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Sett opp kiosk</button>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Ingen kasse, ingen kontanter, ingen stress</div>
          </div>

          {/* Fordel-kort 3x2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { icon: '📱', title: 'QR-kode gjør jobben', desc: 'Print eller vis QR-koden. Kjøpere skanner, velger varer og betaler med Vipps. Du trenger ikke å gjøre noe.' },
              { icon: '🍕', title: 'Du bestemmer menyen', desc: 'Legg inn det dere selger — kaffe, kaker, brus, pølser. Sett priser og skru av det som er utsolgt.' },
              { icon: '💰', title: 'Direkte til lagets Vipps', desc: 'Ingen kontantkasse å telle opp. Pengene går rett dit de skal, og du ser totalen i dashbordet.' },
              { icon: '📊', title: 'Salgsstatistikk per dag', desc: 'Se hva som selger best og hvor mye laget har tjent per arrangement.' },
              { icon: '⚡', title: 'Klar på 2 minutter', desc: 'Legg inn varer, skriv ut QR-kode. Du er klar til å selge før neste trening starter.' },
              { icon: '🔄', title: 'Gjenbruk fra gang til gang', desc: 'Menyen din er lagret. Neste kamp er kiosken klar med ett klikk.' },
            ].map((f, i) => (
              <div key={i} style={{ padding: '14px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>{f.title}</div>
                <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Slik gjør du det */}
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Slik gjør du det</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
            {[
              { n: '1', title: 'Lag menyen', desc: 'Legg inn varer og priser — tar 2 minutter' },
              { n: '2', title: 'Skriv ut QR-kode', desc: 'Heng opp ved kiosken eller send lenken i Spond' },
              { n: '3', title: 'Kjøperne bestiller', desc: 'Skanner, velger og betaler med Vipps selv' },
              { n: '4', title: 'Se inntekten', desc: 'Sjekk dagsoversikten etterpå i dashbordet' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e8f5ef', color: '#2d6a4f', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>{s.n}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '3px' }}>{s.title}</div>
                <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- ADMIN-VISNING (varer finnes eller setup er startet) ---
  return (
    <div style={{ background: '#faf8f4', minHeight: '100vh' }}>
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        <button
          onClick={() => window.location.href = '/coordinator-dashboard'}
          style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '24px' }}
        >
          ← Tilbake til dashbordet
        </button>

        {/* Active header bar */}
        <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>Kiosk</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#1e3a2f', background: '#7ec8a0', padding: '2px 10px', borderRadius: '20px' }}>
              {items.filter(i => i.is_active).length} varer
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { if (hasPremium()) printQR(); else setShowPremiumGate(true); }}
              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '6px', border: 'none', background: '#7ec8a0', color: '#1e3a2f', cursor: 'pointer' }}
            >
              Print QR-kode
            </button>
            <button
              onClick={() => { if (hasPremium()) copyLink(); else setShowPremiumGate(true); }}
              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: '600', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#ffffff', cursor: 'pointer' }}
            >
              Kopier lenke
            </button>
          </div>
        </div>

        {/* Stats */}
        {totalAllSales > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ padding: '20px', textAlign: 'center', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>{totalAllSales} kr</div>
              <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '2px' }}>Totalt innsamlet</div>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>{salesByEvent.reduce((s, e) => s + e.transactionCount, 0)}</div>
              <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '2px' }}>Transaksjoner</div>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>{items.filter(i => i.is_active).length}</div>
              <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '2px' }}>Aktive varer</div>
            </div>
          </div>
        )}

        {/* Innstillinger */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: '8px' }}>Innstillinger</div>
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Vipps-nummer</label>
                <input
                  value={vippsNumber}
                  onChange={e => saveVipps(e.target.value)}
                  placeholder="F.eks. 12345"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', border: '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', color: '#1a2e1f', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Kiosk-lenke (del denne eller lag QR-kode)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    readOnly
                    value={kioskUrl}
                    style={{ flex: 1, padding: '8px 12px', fontSize: '12px', border: '0.5px solid #dedddd', borderRadius: '6px', background: '#faf8f4', color: '#4a5e50', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={copyLink}
                    style={{ padding: '8px 16px', fontSize: '13px', fontWeight: '500', borderRadius: '6px', border: '1px solid #bbbbbb', background: '#ffffff', color: '#1a2e1f', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Kopier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Meny */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, letterSpacing: '.06em' }}>Meny ({items.length} varer)</div>
            {items.length === 0 && (
              <button
                onClick={seedDefaults}
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: 'none', background: '#7ec8a0', color: '#1e3a2f', cursor: 'pointer' }}
              >
                Legg til standardvarer
              </button>
            )}
          </div>

          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {items.map(item => (
                <div key={item.id} style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: item.is_active ? '0.5px solid #dedddd' : '1px dashed #dedddd',
                  background: item.is_active ? '#ffffff' : '#faf8f4',
                  opacity: item.is_active ? 1 : 0.5,
                  textAlign: 'center',
                  position: 'relative'
                }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{item.emoji}</div>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#1a2e1f' }}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
                    <input
                      type="number"
                      value={item.price}
                      onChange={e => updateItemPrice(item.id, parseInt(e.target.value) || 0)}
                      style={{ width: '50px', textAlign: 'center', border: '0.5px solid #dedddd', borderRadius: '6px', padding: '4px', fontSize: '14px', fontWeight: '700', color: '#2d6a4f' }}
                    />
                    <span style={{ fontSize: '13px', color: '#6b7f70' }}>kr</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
                    <button
                      onClick={() => toggleItem(item.id, item.is_active)}
                      style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bbbbbb', background: '#ffffff', cursor: 'pointer', color: item.is_active ? '#854f0b' : '#0f6e56' }}
                    >
                      {item.is_active ? 'Skjul' : 'Vis'}
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#ef4444' }}
                    >
                      Slett
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Legg til ny vare */}
            <div style={{ padding: '18px 20px', background: '#faf8f4', borderRadius: '8px', border: '1px dashed #dedddd' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#2d6a4f', marginBottom: '12px' }}>+ Legg til ny vare</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                <div style={{ width: '72px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Ikon</label>
                  <input
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    style={{ width: '100%', textAlign: 'center', fontSize: '24px', padding: '6px', height: '42px', border: '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Varenavn</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="F.eks. Vaffel"
                    onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', height: '42px', border: '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', color: '#1a2e1f', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Pris (kr)</label>
                  <input
                    type="number"
                    value={newPrice || ''}
                    onChange={e => setNewPrice(parseInt(e.target.value) || 0)}
                    placeholder="25"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', height: '42px', border: '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', color: '#1a2e1f', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  onClick={addItem}
                  style={{ padding: '0 18px', height: '42px', fontSize: '18px', fontWeight: '600', borderRadius: '6px', border: 'none', background: '#7ec8a0', color: '#1e3a2f', cursor: 'pointer' }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Salgshistorikk */}
        {salesByEvent.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: '8px' }}>Salg per kampdag</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {salesByEvent.map((s, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 18px',
                  background: '#ffffff',
                  borderRadius: '8px',
                  border: '0.5px solid #dedddd'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a2e1f' }}>{s.eventName}</div>
                    <div style={{ fontSize: '12px', color: '#6b7f70' }}>
                      {s.eventDate ? new Date(s.eventDate).toLocaleDateString('nb-NO') : ''} · {s.transactionCount} kjøp · Topp: {s.topItem}
                    </div>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#2d6a4f' }}>{s.totalAmount} kr</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {showPremiumGate && <PremiumGateModal featureName="kiosken" onClose={() => setShowPremiumGate(false)} />}
    </div>
  );
};
