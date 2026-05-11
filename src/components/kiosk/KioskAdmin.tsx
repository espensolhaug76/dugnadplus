import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import { validateRequired, scrollToFirstError, ERROR_COLOR, type FormErrors } from '../../utils/formValidation';
import { GuideButton } from '../../utils/guides/GuideButton';
import { runGuide, hasSeenGuide, markGuideSeen } from '../../utils/guides';
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

interface KioskTransaction {
  id: string;
  created_at: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  items: { name: string; emoji: string; price: number; qty: number }[];
  total_amount: number;
  status: string;
}

// Status som teller som "ekte salg" — speiler LotteryAdmin sin definisjon.
// AUTHORIZED inkluderes fordi auto-capture er fire-and-forget; hvis
// capture feiler teknisk beholder vi AUTHORIZED, og pengene er
// reservert hos kjøperen. CANCELLED/EXPIRED/FAILED/TERMINATED teller
// ikke. CREATED er ikke endelig — kan ende som AUTHORIZED eller bli
// ryddet vekk av Vipps EXPIRED-event.
const PAID_STATUSES = new Set(['AUTHORIZED', 'CAPTURED']);
const isPaidSale = (s: { status: string }) => PAID_STATUSES.has(s.status);

// Status-badge styling — speiler LotteryAdmin sin farge- og label-bruk
// for konsistens på tvers av admin-flatene.
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

const DEFAULT_ITEMS = [
  { name: 'Kaffe', price: 20, emoji: '☕' },
  { name: 'Brus', price: 15, emoji: '🧃' },
  { name: 'Pølse', price: 30, emoji: '🌭' },
  { name: 'Kake', price: 25, emoji: '🍕' },
  { name: 'Bolle', price: 15, emoji: '🥐' },
  { name: 'Vann', price: 10, emoji: '💧' },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const VALIDATE_FN_URL = `${SUPABASE_URL}/functions/v1/vipps-validate-merchant`;

export const KioskAdmin: React.FC = () => {
  const [items, setItems] = useState<KioskItem[]>([]);
  const [salesByEvent, setSalesByEvent] = useState<SalesSummary[]>([]);
  const [transactions, setTransactions] = useState<KioskTransaction[]>([]);
  const [, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vippsNumber, setVippsNumber] = useState('');
  const [teamId, setTeamId] = useState('');
  const [clubName, setClubName] = useState('');

  // Vipps-validering (format-only) — speiler LotteryAdmin-mønsteret.
  // Ekte MSN-validering skjer fail-fast ved første betalingsforsøk.
  type VnvState = 'idle' | 'validating' | 'valid_format' | 'invalid_format';
  const [vippsValidation, setVippsValidation] = useState<VnvState>('idle');
  const [vippsValidationMessage, setVippsValidationMessage] = useState('');
  const [showVippsHelpModal, setShowVippsHelpModal] = useState(false);
  const [vippsValidationFailedAt, setVippsValidationFailedAt] = useState<string | null>(null);
  const [vippsValidationError, setVippsValidationError] = useState<string | null>(null);
  const [vippsSaving, setVippsSaving] = useState(false);

  // Ny vare
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState(0);
  const [newEmoji, setNewEmoji] = useState('🛒');
  const [showSetup, setShowSetup] = useState(false);
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  // Validering ved "Legg til vare"
  const [itemErrors, setItemErrors] = useState<FormErrors>({});
  const itemFieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const clearItemError = (key: string) => {
    setItemErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  // State-aware guide-trigger:
  // - showSetup === true || items.length > 0: vis V2 'kiosk-admin-setup'
  //   og marker V1 som seen for å hindre duplikat fra Layout.
  // - Ellers: la Layout's path-baserte trigger håndtere V1.
  useEffect(() => {
    if (loading) return;
    if (!showSetup && items.length === 0) return;
    markGuideSeen('kiosk-admin');
    if (hasSeenGuide('kiosk-admin-setup')) return;
    const t = window.setTimeout(() => runGuide('kiosk-admin-setup'), 800);
    return () => window.clearTimeout(t);
  }, [loading, showSetup, items.length]);

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

    // Hent salg — team-avgrenset. Tar med alle statuser (paid +
    // pending + cancelled) til transaksjonslisten; aggregering filtrerer
    // til PAID_STATUSES nedenfor så cancelled ikke teller mot omsetning.
    let salesQuery = supabase
      .from('kiosk_sales')
      .select('id, created_at, buyer_name, buyer_phone, event_id, items, total_amount, status')
      .order('created_at', { ascending: false });
    if (currentTeamId) salesQuery = salesQuery.eq('team_id', currentTeamId);
    const { data: salesData } = await salesQuery;

    if (salesData) {
      // Normalisér items-feltet (kan være string eller objekt avhengig
      // av Postgres jsonb-håndtering) for hele transaksjonslisten.
      const allTransactions: KioskTransaction[] = salesData.map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        buyer_name: s.buyer_name,
        buyer_phone: s.buyer_phone,
        items: typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []),
        total_amount: s.total_amount || 0,
        status: s.status || 'CREATED',
      }));
      setTransactions(allTransactions);

      // Aggregering per event — KUN paid (AUTHORIZED/CAPTURED).
      if (eventsData) {
        const byEvent: Record<string, { totalAmount: number; count: number; itemCounts: Record<string, number> }> = {};
        allTransactions.filter(isPaidSale).forEach((s) => {
          const eid = (salesData.find((row: any) => row.id === s.id)?.event_id) || '__none__';
          if (!byEvent[eid]) byEvent[eid] = { totalAmount: 0, count: 0, itemCounts: {} };
          byEvent[eid].totalAmount += s.total_amount;
          byEvent[eid].count++;
          if (Array.isArray(s.items)) {
            s.items.forEach((item) => {
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
    }

    // Vipps-nummer leses fra kiosk_settings (server-side sannhet
    // siden 2026-05-10). localStorage-fallback ble fjernet i steg 8.
    if (currentTeamId) {
      const { data: settings } = await supabase
        .from('kiosk_settings')
        .select('vipps_number, vipps_validation_failed_at, vipps_validation_error')
        .eq('team_id', currentTeamId)
        .maybeSingle();
      if (settings?.vipps_number) {
        setVippsNumber(settings.vipps_number);
        // Allerede lagret i DB → behandle som validert format
        setVippsValidation('valid_format');
        setVippsValidationMessage('Lagret.');
      }
      setVippsValidationFailedAt(settings?.vipps_validation_failed_at ?? null);
      setVippsValidationError(settings?.vipps_validation_error ?? null);
    }

    setLoading(false);
  };

  // Validér Vipps-nummer-format mot Edge Function. Gjenbruker samme
  // funksjon som LotteryAdmin. Format-only — ekte MSN-validering skjer
  // ved første betalingsforsøk i vipps-initiate-payment.
  const validateVippsFormat = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setVippsValidation('idle');
      setVippsValidationMessage('');
      return;
    }
    setVippsValidation('validating');
    setVippsValidationMessage('Sjekker format…');
    try {
      const resp = await fetch(VALIDATE_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ vipps_number: trimmed }),
      });
      const data = await resp.json();
      if (data?.valid) {
        setVippsValidation('valid_format');
        setVippsValidationMessage('Format er gyldig. Vipps-nummeret kontrolleres ved første betaling.');
      } else {
        setVippsValidation('invalid_format');
        setVippsValidationMessage(data?.message || 'Ugyldig Vipps-nummer.');
      }
    } catch {
      setVippsValidation('invalid_format');
      setVippsValidationMessage('Kunne ikke kontakte server. Prøv igjen.');
    }
  };

  // UPSERT til kiosk_settings. Krever at vippsValidation === 'valid_format'
  // (knappen er disabled ellers, men vi sjekker også her som defense-in-depth).
  const saveVipps = async () => {
    if (!teamId) {
      alert('Mangler team — last siden på nytt.');
      return;
    }
    if (vippsValidation !== 'valid_format') return;
    setVippsSaving(true);
    const { error } = await supabase
      .from('kiosk_settings')
      .upsert({
        team_id: teamId,
        vipps_number: vippsNumber.trim(),
        // Ny aktivering rydder eventuell tidligere fail-fast-tilstand
        vipps_validation_failed_at: null,
        vipps_validation_error: null,
      }, { onConflict: 'team_id' });
    setVippsSaving(false);
    if (error) {
      alert(`Kunne ikke lagre: ${error.message}`);
      return;
    }
    setVippsValidationFailedAt(null);
    setVippsValidationError(null);
    setVippsValidationMessage('Lagret.');
    clearItemError('vippsNumber');
  };

  const reactivateVipps = async () => {
    if (!teamId) return;
    if (!confirm('Aktivere kiosken på nytt? Sørg for at Vipps-nummeret nå er korrekt.')) return;
    const { error } = await supabase
      .from('kiosk_settings')
      .update({ vipps_validation_failed_at: null, vipps_validation_error: null })
      .eq('team_id', teamId);
    if (error) { alert(error.message); return; }
    setVippsValidationFailedAt(null);
    setVippsValidationError(null);
  };

  const addItem = async () => {
    const errors = validateRequired(
      { newName, newPrice, vippsNumber },
      {
        newName: 'Du må gi varen et navn',
        newPrice: 'Velg pris for varen',
        vippsNumber: 'Vipps-nummer mangler — du finner det i Vipps Bedrift',
      }
    );
    if (Object.keys(errors).length > 0) {
      setItemErrors(errors);
      scrollToFirstError(errors, itemFieldRefs.current);
      return;
    }
    setItemErrors({});
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <button
              onClick={() => window.location.href = '/coordinator-dashboard'}
              style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0 }}
            >
              ← Tilbake til dashbordet
            </button>
            <GuideButton guideId="kiosk-admin" />
          </div>

          {/* Hero */}
          <div data-guide="kiosk-admin-hero" style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🛒 Kiosk</div>
            <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Sett opp kiosken på <span style={{ color: '#7ec8a0' }}>2 minutter</span> — kjøperne betaler selv</h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Perfekt til kaffe, kaker og brus på treninger og kampdager. Du lager en enkel meny, henger opp en QR-kode, og kjøperne ordner resten selv med Vipps. Du slipper å sitte og ta imot penger — og alt går rett til laget.</p>
            <button data-guide="kiosk-admin-setup" onClick={() => setShowSetup(true)} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Sett opp kiosk</button>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Ingen kasse, ingen kontanter, ingen stress</div>
          </div>

          {/* Fordel-kort 3x2 */}
          <div data-guide="kiosk-admin-benefits" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button
            onClick={() => window.location.href = '/coordinator-dashboard'}
            style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >
            ← Tilbake til dashbordet
          </button>
          <GuideButton guideId="kiosk-admin" />
        </div>

        {/* Fail-fast-banner: Vipps avviste mottakernummeret */}
        {vippsValidationFailedAt && (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#b91c1c', marginBottom: '6px' }}>
              ⚠️ Vipps-nummeret fungerer ikke
            </div>
            <div style={{ fontSize: '12px', color: '#991b1b', lineHeight: '1.6', marginBottom: '10px' }}>
              En kunde forsøkte å betale, men Vipps avviste mottakernummeret <strong>{vippsNumber}</strong>. Kiosken er midlertidig skjult for kjøpere.
              Sjekk at det er riktig 5–7-sifret Salgssted-nummer med Payment Integration aktivert.
              {vippsValidationError && (
                <div style={{ marginTop: '6px', fontStyle: 'italic' }}>Vipps-feil: {vippsValidationError}</div>
              )}
            </div>
            <button
              onClick={reactivateVipps}
              style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#b91c1c', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
            >
              Aktiver på nytt
            </button>
          </div>
        )}

        {/* Active header bar */}
        <div data-guide="kiosk-setup-header" style={{ background: '#1e3a2f', borderRadius: '10px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff' }}>Kiosk</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#1e3a2f', background: '#7ec8a0', padding: '2px 10px', borderRadius: '20px' }}>
              {items.filter(i => i.is_active).length} varer
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              data-guide="kiosk-setup-print"
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
              <div data-guide="kiosk-setup-vipps">
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Vipps-nummer</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    ref={el => { itemFieldRefs.current.vippsNumber = el; }}
                    value={vippsNumber}
                    onChange={e => {
                      setVippsNumber(e.target.value);
                      clearItemError('vippsNumber');
                      if (vippsValidation !== 'idle') {
                        setVippsValidation('idle');
                        setVippsValidationMessage('');
                      }
                    }}
                    onBlur={e => validateVippsFormat(e.target.value)}
                    placeholder="F.eks. 12345"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '14px',
                      border: itemErrors.vippsNumber || vippsValidation === 'invalid_format'
                        ? `1px solid ${ERROR_COLOR}`
                        : vippsValidation === 'valid_format'
                          ? '1px solid #2d6a4f'
                          : '0.5px solid #dedddd',
                      borderRadius: '6px',
                      background: '#ffffff',
                      color: '#1a2e1f',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    onClick={saveVipps}
                    disabled={vippsValidation !== 'valid_format' || vippsSaving}
                    title={vippsValidation !== 'valid_format' ? 'Skriv inn et gyldig Vipps-nummer først' : ''}
                    style={{
                      padding: '8px 14px',
                      fontSize: '13px',
                      fontWeight: '600',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#2d6a4f',
                      color: '#fff',
                      cursor: (vippsValidation !== 'valid_format' || vippsSaving) ? 'not-allowed' : 'pointer',
                      opacity: (vippsValidation !== 'valid_format' || vippsSaving) ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {vippsSaving ? 'Lagrer…' : 'Lagre'}
                  </button>
                </div>
                {itemErrors.vippsNumber && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{itemErrors.vippsNumber}</p>}
                {vippsValidation === 'validating' && (
                  <p style={{ color: '#6b7f70', fontSize: '12px', margin: '6px 0 0 0' }}>{vippsValidationMessage}</p>
                )}
                {vippsValidation === 'valid_format' && vippsValidationMessage && (
                  <p style={{ color: '#2d6a4f', fontSize: '12px', margin: '6px 0 0 0' }}>✓ {vippsValidationMessage}</p>
                )}
                {vippsValidation === 'invalid_format' && (
                  <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>✗ {vippsValidationMessage}</p>
                )}
                <button
                  type="button"
                  onClick={() => setShowVippsHelpModal(true)}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: '6px', color: '#2d6a4f', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  ⓘ Hvor finner jeg Vipps-nummeret?
                </button>
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
                data-guide="kiosk-setup-seed"
                onClick={seedDefaults}
                style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: 'none', background: '#7ec8a0', color: '#1e3a2f', cursor: 'pointer' }}
              >
                Legg til standardvarer
              </button>
            )}
          </div>

          <div data-guide="kiosk-setup-menu" style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px 24px' }}>
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
            <div data-guide="kiosk-setup-add" style={{ padding: '18px 20px', background: '#faf8f4', borderRadius: '8px', border: '1px dashed #dedddd' }}>
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
                    ref={el => { itemFieldRefs.current.newName = el; }}
                    value={newName}
                    onChange={e => { setNewName(e.target.value); clearItemError('newName'); }}
                    placeholder="F.eks. Vaffel"
                    onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', height: '42px', border: itemErrors.newName ? `1px solid ${ERROR_COLOR}` : '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', color: '#1a2e1f', boxSizing: 'border-box' }}
                  />
                  {itemErrors.newName && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{itemErrors.newName}</p>}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', marginBottom: '6px', display: 'block' }}>Pris (kr)</label>
                  <input
                    ref={el => { itemFieldRefs.current.newPrice = el; }}
                    type="number"
                    value={newPrice || ''}
                    onChange={e => { setNewPrice(parseInt(e.target.value) || 0); clearItemError('newPrice'); }}
                    placeholder="25"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '14px', height: '42px', border: itemErrors.newPrice ? `1px solid ${ERROR_COLOR}` : '0.5px solid #dedddd', borderRadius: '6px', background: '#ffffff', color: '#1a2e1f', boxSizing: 'border-box' }}
                  />
                  {itemErrors.newPrice && <p style={{ color: ERROR_COLOR, fontSize: '12px', margin: '6px 0 0 0' }}>{itemErrors.newPrice}</p>}
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

        {/* Transaksjoner — per-rad detalj med status-badge.
            Aggregeringene ovenfor (omsetning, salg per kampdag) teller
            kun AUTHORIZED/CAPTURED. Denne listen viser ALLE statuser
            slik at koordinator kan se cancelled/expired/failed-rader
            og forstå hvorfor totalene avviker fra rå antall forsøk. */}
        {transactions.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: '8px' }}>Transaksjoner ({transactions.length})</div>
            <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #dedddd', textAlign: 'left', background: '#faf8f4' }}>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>Dato</th>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Kjøper</th>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Telefon</th>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px', textAlign: 'right' }}>Varer</th>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px', textAlign: 'right' }}>Beløp</th>
                      <th style={{ padding: '10px 12px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const badge = statusBadge(tx.status);
                      const itemCount = tx.items.reduce((sum, it) => sum + (it.qty || 0), 0);
                      const isPaid = isPaidSale(tx);
                      return (
                        <tr key={tx.id} style={{ borderBottom: '0.5px solid #eee', opacity: isPaid ? 1 : 0.7 }}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#4a5e50' }}>
                            {new Date(tx.created_at).toLocaleDateString('nb-NO')} {new Date(tx.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '500', color: '#1a2e1f' }}>{tx.buyer_name || '–'}</td>
                          <td style={{ padding: '10px 12px', color: '#4a5e50' }}>{tx.buyer_phone || '–'}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1a2e1f' }}>{itemCount}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '500', color: isPaid ? '#2d6a4f' : '#6b7f70' }}>{tx.total_amount} kr</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: badge.bg, color: badge.fg, fontWeight: '500', whiteSpace: 'nowrap' }}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      {showPremiumGate && <PremiumGateModal featureName="kiosken" onClose={() => setShowPremiumGate(false)} />}

      {/* INFO-MODAL: Hvor finner jeg Vipps-nummeret? — speiler LotteryAdmin */}
      {showVippsHelpModal && (
        <div
          onClick={() => setShowVippsHelpModal(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowVippsHelpModal(false); }}
          tabIndex={-1}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', padding: '28px', maxWidth: '520px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#1a2e1f' }}>Hvor finner du lagets Vipps-nummer</h3>
              <button onClick={() => setShowVippsHelpModal(false)} aria-label="Lukk" style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7f70', padding: 0, lineHeight: 1 }}>×</button>
            </div>

            <div style={{ fontSize: '13px', color: '#4a5e50', lineHeight: '1.7' }}>
              <p style={{ marginTop: 0 }}>
                Lagets Vipps-nummer er det 5–7-sifrede nummeret som er knyttet til lagets Vipps Salgssted. Det er ikke et privat Vipps-nummer.
              </p>

              <p style={{ fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>Hvordan finne det:</p>
              <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>
                <li>Logg inn på <strong>business.vipps.no</strong> med BankID</li>
                <li>Velg laget i øverste meny (hvis du administrerer flere)</li>
                <li>Klikk <strong>«Salgssteder»</strong> i venstre meny</li>
                <li>Vipps-nummeret står øverst på Salgsstedet — eks: <code>123456</code></li>
              </ol>

              <p style={{ fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>Vippsen må ha «Payment Integration» aktivert.</p>
              <p style={{ marginTop: 0 }}>
                Hvis Salgsstedet kun har «Cash register integration» (for kiosk-bruk), må noen i klubben aktivere Payment Integration:
              </p>
              <ol style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>
                <li>Gå til <strong>business.vipps.no</strong></li>
                <li>Bestill produkt → <strong>«Payment Integration»</strong></li>
                <li>Aktivering tar normalt 1–2 dager</li>
                <li>Kom tilbake hit når dere har bekreftelse fra Vipps</li>
              </ol>

              <p style={{ fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>Har laget ikke Salgssted ennå?</p>
              <p>Da må klubbens kasserer eller styre bestille det først. Kontakt Vipps via <strong>business.vipps.no</strong>.</p>

              <div style={{ background: '#fff8e6', border: '1px solid #fac775', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#854f0b', marginTop: '16px' }}>
                💡 <strong>Vipps-nummeret kontrolleres ved første betaling.</strong> Hvis nummeret er feil, ser dere det da og kan rette opp.
              </div>

              <p style={{ marginTop: '16px', fontSize: '12px', color: '#6b7f70' }}>
                Trenger du hjelp? Klubbens kasserer eller styre kan hjelpe.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
