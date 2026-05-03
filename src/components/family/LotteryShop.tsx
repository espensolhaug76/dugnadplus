import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Lottery {
  id: string;
  name: string;
  description: string;
  ticketPrice: number;
  vippsNumber: string;
  prizes: any[];
}

const TICKET_PACKAGES = [
    { count: 5, label: 'Småpotten' },
    { count: 10, label: 'Favoritten', popular: true },
    { count: 20, label: 'Storspiller' },
    { count: 50, label: 'Ivrig supporter' },
    { count: 100, label: 'Gullsjansen' }
];

// To-stegs Vipps-flyt (tillit-basert):
//   'shop'      → kjøpsskjema (default)
//   'awaiting'  → "Fullførte du betalingen i Vipps?" — vises etter
//                 at Vipps deep link er åpnet. INGEN DB-INSERT
//                 ennå — vi venter på forelders bekreftelse.
//   'pending'   → "Takk for støtten!"-skjerm. INSERT skjedde nå.
//   'cancelled' → "Kjøpet er avbrutt"-skjerm. Ingen INSERT.
//
// Pilot 3. mai-revert: Tidligere A-løsning insertet med
// status='pending_confirmation' før Vipps-link, og DA bekreftet
// senere i admin-flyten. Vi gikk bort fra det — Dugnad+ holder
// ikke per-kjøp status. Avstemming skjer mot Vipps-konto ved
// sesongslutt (papirloddbok-prinsipp).
type Phase = 'shop' | 'awaiting' | 'pending' | 'cancelled';

export const LotteryShop: React.FC = () => {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [sellerName, setSellerName] = useState('en dugnadsfamilie');
  const [sellerId, setSellerId] = useState('');
  const [ticketCount, setTicketCount] = useState(10);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [phase, setPhase] = useState<Phase>('shop');
  // Snapshot av kjøps-intensjon, brukt for å vise riktig beløp/antall
  // i awaiting/pending/cancelled-skjermene selv om brukeren skulle
  // endre antallet i shop-skjemaet etterpå.
  const [pendingTicketCount, setPendingTicketCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [pendingMessage, setPendingMessage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
        try {
            const { data: lotteryData } = await supabase
                .from('lotteries')
                .select('*, prizes(*)')
                .eq('is_active', true)
                .single();

            if (lotteryData) {
                setLottery({
                    id: lotteryData.id,
                    name: lotteryData.name,
                    description: lotteryData.description,
                    ticketPrice: lotteryData.ticket_price,
                    vippsNumber: lotteryData.vipps_number,
                    prizes: (lotteryData.prizes || []).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
                });
            }

            const params = new URLSearchParams(window.location.search);
            const sid = params.get('seller');

            if (sid) {
                setSellerId(sid);
                const { data: family } = await supabase
                    .from('families')
                    .select('*, family_members(*)')
                    .eq('id', sid)
                    .single();

                if (family) {
                    const child = family.family_members?.find((m: any) => m.role === 'child');
                    if (child) {
                        setSellerName(child.name);
                    } else if (family.family_members?.length > 0) {
                        setSellerName(family.family_members[0].name);
                    } else {
                        setSellerName(family.name);
                    }
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, []);

  // Steg 1: åpne Vipps. Vi INSERTer IKKE ennå — først etter at
  // forelder eksplisitt bekrefter "Ja, jeg har betalt". På den
  // måten lager vi ikke rader for kjøp som blir avbrutt i Vipps.
  const handlePurchase = () => {
    if (!lottery) return;
    if (!buyerName || !buyerPhone) {
        alert('Vennligst fyll inn navn og telefonnummer.');
        return;
    }

    const totalAmount = Number(ticketCount) * Number(lottery.ticketPrice);
    const message = `Lodd ${sellerName}`.trim();

    // Defensiv validering før vi åpner Vipps. NaN/0/negativ amt
    // gir Vipps-feil, og tom msg ville gitt en meningsløs betaling
    // som DA ikke kan avstemme mot ved sesongslutt.
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      alert('Beløpet er ugyldig. Velg antall lodd og prøv igjen.');
      return;
    }
    if (!message) {
      alert('Mangler selgerinfo. Last siden på nytt og prøv igjen.');
      return;
    }

    setPendingTicketCount(ticketCount);
    setPendingAmount(totalAmount);
    setPendingMessage(message);

    // Åpne Vipps via deep link — samme format som KioskShop.tsx og
    // CampaignShop.tsx (som er bekreftet fungerende i prod). Vipps
    // støtter ikke phone-parameter for privat/alias-numre i deep
    // links, så forelder må skrive mottakernummeret selv i Vipps —
    // det vises tydelig på "Fullførte du betalingen?"-skjermen.
    // På mobil hopper appen ut til Vipps; på desktop skjer
    // ingenting (forventet — Vipps har ikke desktop-app).
    window.location.href = `vipps://?amt=${totalAmount}&msg=${encodeURIComponent(message)}`;

    setPhase('awaiting');
  };

  // Steg 2a: forelder sier "Ja, jeg har betalt". NÅ inserter vi
  // raden. Vi har ingen måte å verifisere betalingen automatisk
  // (Vipps tilbyr ikke callback for deep links), så vi stoler på
  // forelderens svar. DA avstemmer mot Vipps-konto ved sesongslutt.
  const handleConfirmPaid = async () => {
    if (!lottery) return;
    setPurchasing(true);
    try {
      const { error } = await supabase
        .from('lottery_sales')
        .insert({
          lottery_id: lottery.id,
          seller_family_id: sellerId || null,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
          tickets: pendingTicketCount,
          amount: pendingAmount,
        });
      if (error) throw error;
      setPhase('pending');
    } catch (error: any) {
      console.error('Kjøp feilet:', error);
      alert('Beklager, noe gikk galt med registreringen: ' + (error?.message || 'ukjent feil'));
      // Bli i awaiting-fasen så forelder kan prøve igjen.
    } finally {
      setPurchasing(false);
    }
  };

  // Steg 2b: forelder sier "Nei, avbryt". Ingen DB-handling —
  // raden ble aldri opprettet. Bare nullstill og vis bekreftelse.
  const handleCancel = () => {
    setPhase('cancelled');
  };

  const resetForNewPurchase = () => {
    setBuyerName('');
    setBuyerPhone('');
    setTicketCount(10);
    setPendingTicketCount(0);
    setPendingAmount(0);
    setPendingMessage('');
    setPhase('shop');
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center', background: '#faf8f4', color: '#1a2e1f'}}>Laster lotteri...</div>;

  if (!lottery) return (
      <div style={{padding:'40px', textAlign:'center', background: '#faf8f4', color: '#1a2e1f'}}>
          <h2 style={{ color: '#1a2e1f' }}>Ingen aktive lotterier</h2>
          <p style={{ color: '#4a5e50' }}>Det er ingen pågående lotterier for øyeblikket.</p>
      </div>
  );

  // ===== AWAITING — vises mens forelder er i Vipps =====
  if (phase === 'awaiting') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
        <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px 24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>📱</div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Fullførte du betalingen i Vipps?</h2>
            <p style={{ marginTop: '12px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
              Vipps åpner. Send <strong>{pendingAmount} kr</strong> til <strong>{lottery.vippsNumber}</strong> med melding <strong>{pendingMessage}</strong> ({pendingTicketCount} lodd).
            </p>
          </div>

          <button
            onClick={handleConfirmPaid}
            disabled={purchasing}
            style={{ width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.3)', cursor: purchasing ? 'wait' : 'pointer', marginBottom: '12px', opacity: purchasing ? 0.7 : 1 }}
          >
            {purchasing ? 'Registrerer...' : 'Ja, jeg har betalt'}
          </button>
          <button
            onClick={handleCancel}
            disabled={purchasing}
            style={{ width: '100%', background: '#fff', color: '#6b7f70', border: '0.5px solid #dedddd', fontSize: '14px', padding: '12px', borderRadius: '10px', fontWeight: '500', cursor: purchasing ? 'wait' : 'pointer' }}
          >
            Nei, avbryt
          </button>

          <div style={{ marginTop: '20px', padding: '12px', background: '#faf8f4', borderRadius: '8px', fontSize: '12px', color: '#6b7f70', lineHeight: '1.5' }}>
            ℹ️ Vipps åpner ikke i nettleseren. Sjekk Vipps-appen din for å fullføre betalingen.
          </div>
        </div>
      </div>
    );
  }

  // ===== PENDING — etter "Ja, jeg har betalt" =====
  if (phase === 'pending') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
        <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px 24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Takk for støtten!</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Loddene ({pendingTicketCount} stk for {pendingAmount} kr) er registrert under ditt navn. Bekreftelse på betalingen kommer i Vipps-appen.
          </p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Kjøp flere lodd
          </button>
        </div>
      </div>
    );
  }

  // ===== CANCELLED — etter "Nei, avbryt" =====
  if (phase === 'cancelled') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
        <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px 24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>↩️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kjøpet er avbrutt</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Ingen lodd er registrert. Hvis du ombestemmer deg kan du prøve igjen.
          </p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Tilbake til lotteriet
          </button>
        </div>
      </div>
    );
  }

  // ===== SHOP — kjøpsskjema =====
  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
        <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '0', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>

            {/* Header */}
            <div style={{ background: '#1e3a2f', padding: '32px 20px', color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎟️</div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{lottery.name}</h1>
                <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px', fontSize: '16px' }}>Støtt {sellerName} og laget!</p>
            </div>

            <div style={{ padding: '24px' }}>
                <p style={{ color: '#4a5e50', marginBottom: '24px', textAlign: 'center', fontSize: '14px' }}>{lottery.description}</p>

                {/* PAKKEVELGER */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                    {TICKET_PACKAGES.map((pkg) => (
                        <button
                            key={pkg.count}
                            onClick={() => setTicketCount(pkg.count)}
                            style={{
                                padding: '16px',
                                border: ticketCount === pkg.count ? '2px solid #2d6a4f' : '0.5px solid #dedddd',
                                background: ticketCount === pkg.count ? '#e8f5ef' : '#ffffff',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            {pkg.popular && (
                                <span style={{ position: 'absolute', top: '-10px', background: '#2d6a4f', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                    MEST POPULÆR
                                </span>
                            )}
                            <span style={{ fontSize: '20px', fontWeight: '800', color: '#1a2e1f' }}>{pkg.count} lodd</span>
                            <span style={{ fontSize: '12px', color: '#4a5e50' }}>{pkg.count * lottery.ticketPrice} kr</span>
                        </button>
                    ))}
                    {/* Egendefinert */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', border: '0.5px solid #dedddd', borderRadius: '12px', background: '#ffffff' }}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                            <button onClick={() => setTicketCount(Math.max(1, ticketCount-1))} style={{padding:'4px 10px', borderRadius:'8px', border: '0.5px solid #dedddd', background: '#ffffff', color: '#1a2e1f', cursor: 'pointer', fontWeight: '600'}}>-</button>
                            <span style={{fontWeight:'700', color: '#1a2e1f'}}>{ticketCount}</span>
                            <button onClick={() => setTicketCount(ticketCount+1)} style={{padding:'4px 10px', borderRadius:'8px', border: '0.5px solid #dedddd', background: '#ffffff', color: '#1a2e1f', cursor: 'pointer', fontWeight: '600'}}>+</button>
                        </div>
                    </div>
                </div>

                {/* TOTALSUM */}
                <div style={{ background: '#faf8f4', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#4a5e50' }}>Du betaler</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#2d6a4f' }}>
                        {ticketCount * lottery.ticketPrice} kr
                    </div>
                    <div style={{ fontSize: '12px', color: '#4a5e50' }}>for {ticketCount} lodd à {lottery.ticketPrice} kr</div>
                </div>

                {/* KJØPERS INFO */}
                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Ditt navn</label>
                    <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Ola Nordmann" style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }} />
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px', marginTop: '12px' }}>Mobilnummer (Vipps)</label>
                    <input type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="99 88 77 66" style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }} />
                </div>

                {/* BETALINGSKNAPP */}
                <button
                    onClick={handlePurchase}
                    style={{
                        width: '100%',
                        background: '#2d6a4f',
                        color: 'white',
                        border: 'none',
                        fontSize: '18px',
                        padding: '16px',
                        borderRadius: '10px',
                        fontWeight: '700',
                        boxShadow: '0 4px 12px rgba(45, 106, 79, 0.3)',
                        cursor: 'pointer'
                    }}
                >
                    Betal {ticketCount * lottery.ticketPrice} kr med Vipps
                </button>
            </div>

            {/* PREMIER */}
            <div style={{ background: '#faf8f4', padding: '24px', borderTop: '0.5px solid #dedddd' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1a2e1f', textAlign: 'center' }}>🏆 Premieoversikt</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
                    {lottery.prizes.map((p:any) => (
                        <li key={p.id}>
                            <strong>{p.name}</strong> {p.donor && <span style={{color: '#2d6a4f', fontSize: '12px'}}> (Sponset av {p.donor})</span>}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    </div>
  );
};
