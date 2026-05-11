import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Lottery {
  id: string;
  name: string;
  description: string;
  ticketPrice: number;
  vippsNumber: string;
  prizes: any[];
  vippsValidationFailedAt: string | null;
}

const TICKET_PACKAGES = [
    { count: 5, label: 'Småpotten' },
    { count: 10, label: 'Favoritten', popular: true },
    { count: 20, label: 'Storspiller' },
    { count: 50, label: 'Ivrig supporter' },
    { count: 100, label: 'Gullsjansen' }
];

// Phases for Vipps ePayment-integrasjon (2026-05-09 KIL pilot):
//   shop                 — kjøpsskjema (default)
//   initiating           — POST /vipps-initiate-payment, vis spinner
//   redirecting          — fikk redirectUrl, sender brukeren til Vipps
//   returning            — kommet tilbake fra Vipps, polling status
//   success              — CAPTURED eller AUTHORIZED — lodd registrert
//   cancelled            — CANCELLED/TERMINATED
//   failed               — FAILED/EXPIRED eller teknisk feil
//   pending_confirmation — polling timet ut uten endelig status; vi
//                          lyver IKKE om success — viser eksplisitt
//                          "venter på bekreftelse" med retry-knapp.
//                          Nødvendig fordi webhook-race kan gjøre at
//                          en avbrutt betaling ser ut som CREATED i
//                          hele polling-vinduet.
type Phase =
  | 'shop'
  | 'initiating'
  | 'redirecting'
  | 'returning'
  | 'success'
  | 'cancelled'
  | 'failed'
  | 'pending_confirmation';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FN = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

const LS_REF_KEY = 'dugnad_lottery_pending_reference';

export const LotteryShop: React.FC = () => {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [sellerName, setSellerName] = useState('en dugnadsfamilie');
  const [sellerId, setSellerId] = useState('');
  const [ticketCount, setTicketCount] = useState(10);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('shop');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultTickets, setResultTickets] = useState(0);
  const [resultAmount, setResultAmount] = useState(0);
  const [resultBuyer, setResultBuyer] = useState('');

  // Retry-state for pending_confirmation-skjermen. pendingReference
  // beholdes så "Sjekk på nytt"-knappen kan kjøre pollStatus igjen.
  // pollRetryCount=0 ved første timeout, ≥1 etter retry → viser
  // mer pessimistisk meldingstekst.
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pollRetryCount, setPollRetryCount] = useState(0);

  const pollAbortRef = useRef(false);

  // Hent lotteri og selger
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('seller');
        const reference = params.get('reference');

        const { data: lotteryData } = await supabase
          .from('lotteries')
          .select('*, prizes(*)')
          .eq('is_active', true)
          .maybeSingle();

        if (lotteryData) {
          setLottery({
            id: lotteryData.id,
            name: lotteryData.name,
            description: lotteryData.description,
            ticketPrice: lotteryData.ticket_price,
            vippsNumber: lotteryData.vipps_number,
            vippsValidationFailedAt: lotteryData.vipps_validation_failed_at || null,
            prizes: (lotteryData.prizes || []).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)),
          });
        }

        if (sid) {
          setSellerId(sid);
          const { data: family } = await supabase
            .from('families')
            .select('*, family_members(*)')
            .eq('id', sid)
            .maybeSingle();
          if (family) {
            const child = family.family_members?.find((m: any) => m.role === 'child');
            if (child) setSellerName(child.name);
            else if (family.family_members?.length > 0) setSellerName(family.family_members[0].name);
            else setSellerName(family.name);
          }
        }

        // Retur fra Vipps?
        if (reference) {
          setPhase('returning');
          // Fjern reference fra URL så reload ikke trigger ny poll
          const cleanUrl = window.location.pathname + (sid ? `?seller=${sid}` : '');
          window.history.replaceState({}, '', cleanUrl);
          pollStatus(reference);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => { pollAbortRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll vipps-poll-status. Første runde: 4 forsøk over ~6 sek.
  // Retry fra "Sjekk på nytt"-knapp: 3 forsøk over ~4.5 sek.
  // Webhook er sannhetskilde, men kan være litt forsinket.
  //
  // Race-vindu: hvis brukeren returnerer fra Vipps før webhook har
  // levert, ser alle polls fortsatt 'CREATED'. Vi LYVER IKKE om
  // success da — vi går til pending_confirmation-skjermen som lar
  // brukeren prøve på nytt eller lukke. console.warn logger
  // lastSeenStatus + pollAttempts for diagnose.
  const pollStatus = async (reference: string, isRetry = false) => {
    const delays = isRetry ? [0, 1500, 1500] : [0, 1500, 1500, 1500];
    let pollAttempts = 0;
    let lastSeenStatus: string | null = null;

    for (let i = 0; i < delays.length; i++) {
      if (pollAbortRef.current) return;
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        const resp = await fetch(`${FN('vipps-poll-status')}?reference=${encodeURIComponent(reference)}`, {
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        pollAttempts++;
        lastSeenStatus = data.status || null;
        setResultAmount(data.amount || 0);
        setResultTickets(data.tickets || 0);

        if (data.status === 'CAPTURED' || data.status === 'AUTHORIZED') {
          localStorage.removeItem(LS_REF_KEY);
          setPhase('success');
          return;
        }
        if (data.status === 'CANCELLED' || data.status === 'TERMINATED') {
          localStorage.removeItem(LS_REF_KEY);
          setPhase('cancelled');
          return;
        }
        if (data.status === 'EXPIRED') {
          localStorage.removeItem(LS_REF_KEY);
          setErrorMessage('Betalingen tok for lang tid og ble avbrutt av Vipps.');
          setPhase('failed');
          return;
        }
        if (data.status === 'FAILED') {
          localStorage.removeItem(LS_REF_KEY);
          setErrorMessage(data.failure_reason || 'Vipps avviste betalingen.');
          setPhase('failed');
          return;
        }
        // CREATED — fortsett å polle
      } catch (e) {
        console.error('[poll]', e);
      }
    }
    // Timeout uten endelig status. Vi vet ikke om betalingen lyktes
    // eller ble avbrutt. Vis pending_confirmation i stedet for å
    // lyve om success. pollAttempts=0 betyr nettverksfeil hele
    // veien; lastSeenStatus='CREATED' betyr webhook-race.
    console.warn('[poll] Timeout — ingen endelig status etter polling.', {
      reference,
      lastSeenStatus,
      pollAttempts,
      totalAttempts: delays.length,
      isRetry,
    });
    setPendingReference(reference);
    setPhase('pending_confirmation');
  };

  const handleRetryPoll = () => {
    if (!pendingReference) return;
    setPollRetryCount(c => c + 1);
    setPhase('returning');
    pollStatus(pendingReference, true);
  };

  const handleClosePending = () => {
    try { localStorage.removeItem(LS_REF_KEY); } catch { /* noop */ }
    resetForNewPurchase();
  };

  // Steg 1: kall vipps-initiate-payment, send brukeren til Vipps.
  const handlePurchase = async () => {
    if (!lottery) return;
    if (!buyerName.trim() || !buyerPhone.trim()) {
      alert('Vennligst fyll inn navn og mobilnummer.');
      return;
    }
    const phoneClean = buyerPhone.replace(/\D/g, '');
    if (!/^\d{8}$/.test(phoneClean)) {
      alert('Mobilnummer må være 8 sifre.');
      return;
    }

    setErrorMessage('');
    setResultBuyer(buyerName.trim());
    setPhase('initiating');

    try {
      const totalAmount = ticketCount * lottery.ticketPrice;
      const resp = await fetch(FN('vipps-initiate-payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          lottery_id: lottery.id,
          seller_family_id: sellerId || null,
          buyer_name: buyerName.trim(),
          buyer_phone: phoneClean,
          tickets: ticketCount,
          amount_nok: totalAmount,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data?.reason === 'merchant_invalid') {
          setErrorMessage('Lotteriet er midlertidig utilgjengelig. Klubben er varslet og fikser saken.');
        } else {
          setErrorMessage(data?.error || 'Kunne ikke starte Vipps-betaling. Prøv igjen om litt.');
        }
        setPhase('failed');
        return;
      }

      const { redirectUrl, vipps_reference } = data;
      if (!redirectUrl) {
        setErrorMessage('Vipps returnerte ingen URL. Prøv igjen.');
        setPhase('failed');
        return;
      }

      try { localStorage.setItem(LS_REF_KEY, vipps_reference); } catch { /* noop */ }
      setResultAmount(totalAmount);
      setResultTickets(ticketCount);
      setPhase('redirecting');
      window.location.href = redirectUrl;
    } catch (e: any) {
      console.error('[initiate]', e);
      setErrorMessage('Nettverksfeil. Sjekk forbindelsen og prøv igjen.');
      setPhase('failed');
    }
  };

  const resetForNewPurchase = () => {
    setBuyerName('');
    setBuyerPhone('');
    setTicketCount(10);
    setErrorMessage('');
    setResultAmount(0);
    setResultTickets(0);
    setResultBuyer('');
    setPendingReference(null);
    setPollRetryCount(0);
    setPhase('shop');
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', color: '#1a2e1f' }}>Laster lotteri...</div>;

  if (!lottery) return (
    <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', color: '#1a2e1f' }}>
      <h2 style={{ color: '#1a2e1f' }}>Ingen aktive lotterier</h2>
      <p style={{ color: '#4a5e50' }}>Det er ingen pågående lotterier for øyeblikket.</p>
    </div>
  );

  // ===== Lotteri midlertidig utilgjengelig pga. ugyldig Vipps-nummer =====
  if (lottery.vippsValidationFailedAt && phase === 'shop') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏸️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Lotteriet er midlertidig utilgjengelig</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Klubben er varslet og fikser saken. Prøv igjen om litt.
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== INITIATING =====
  if (phase === 'initiating') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏳</div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a2e1f' }}>Forbereder Vipps-betaling…</h2>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#4a5e50' }}>Et øyeblikk.</p>
        </div>
      </CenteredCard>
    );
  }

  // ===== REDIRECTING =====
  if (phase === 'redirecting') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>📱</div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a2e1f' }}>Sender deg til Vipps…</h2>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#4a5e50' }}>
            Hvis Vipps ikke åpner automatisk, sjekk om appen er installert eller lim inn lenken manuelt.
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== RETURNING =====
  if (phase === 'returning') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🔄</div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#1a2e1f' }}>Sjekker betalingsstatus…</h2>
          <p style={{ marginTop: '12px', fontSize: '13px', color: '#4a5e50' }}>Et øyeblikk.</p>
        </div>
      </CenteredCard>
    );
  }

  // ===== PENDING_CONFIRMATION =====
  // Polling timet ut uten endelig status. I stedet for å lyve om
  // success viser vi en eksplisitt "venter"-skjerm med retry.
  if (phase === 'pending_confirmation') {
    const isSecondTimeout = pollRetryCount >= 1;
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏱️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Vi venter på bekreftelse fra Vipps</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            {isSecondTimeout
              ? 'Hvis du har fullført betalingen, vises den i din Vipps-historikk. Kontakt klubben hvis du tror det er feil.'
              : 'Vi har ikke fått endelig svar ennå. Hvis du fullførte betalingen i Vipps, vil den bli registrert om kort tid.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
            <button
              onClick={handleRetryPoll}
              style={{ flex: 1, background: '#2d6a4f', color: 'white', border: 'none', fontSize: '15px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
            >
              Sjekk på nytt
            </button>
            <button
              onClick={handleClosePending}
              style={{ flex: 1, background: '#ffffff', color: '#1a2e1f', border: '0.5px solid #dedddd', fontSize: '15px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
            >
              Lukk
            </button>
          </div>
        </div>
      </CenteredCard>
    );
  }

  // ===== SUCCESS =====
  if (phase === 'success') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Takk for støtten!</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            {resultTickets > 0
              ? `${resultTickets} lodd${resultAmount > 0 ? ` (${resultAmount} kr)` : ''} er registrert`
              : 'Loddene er registrert'}
            {resultBuyer ? ` på ${resultBuyer}` : ''}. Du finner kvittering i Vipps.
          </p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Kjøp flere lodd
          </button>
        </div>
      </CenteredCard>
    );
  }

  // ===== CANCELLED =====
  if (phase === 'cancelled') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>↩️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Betalingen er avbrutt</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Ingen lodd er registrert.
          </p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Prøv igjen
          </button>
        </div>
      </CenteredCard>
    );
  }

  // ===== FAILED =====
  if (phase === 'failed') {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚠️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Noe gikk galt</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            {errorMessage || 'Vipps-betalingen kunne ikke fullføres.'}
          </p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Prøv igjen
          </button>
          <div style={{ marginTop: '16px', fontSize: '12px', color: '#6b7f70' }}>
            Trenger du hjelp? Klubbens kasserer eller styre kan hjelpe.
          </div>
        </div>
      </CenteredCard>
    );
  }

  // ===== SHOP =====
  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
      <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '0', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <div style={{ background: '#1e3a2f', padding: '32px 20px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎟️</div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'white' }}>{lottery.name}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px', fontSize: '16px' }}>Støtt {sellerName} og laget!</p>
        </div>

        <div style={{ padding: '24px' }}>
          <p style={{ color: '#4a5e50', marginBottom: '24px', textAlign: 'center', fontSize: '14px' }}>{lottery.description}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            {TICKET_PACKAGES.map((pkg) => (
              <button
                key={pkg.count}
                onClick={() => setTicketCount(pkg.count)}
                style={{ padding: '16px', border: ticketCount === pkg.count ? '2px solid #2d6a4f' : '0.5px solid #dedddd', background: ticketCount === pkg.count ? '#e8f5ef' : '#ffffff', borderRadius: '12px', cursor: 'pointer', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s' }}
              >
                {pkg.popular && (
                  <span style={{ position: 'absolute', top: '-10px', background: '#2d6a4f', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>MEST POPULÆR</span>
                )}
                <span style={{ fontSize: '20px', fontWeight: '800', color: '#1a2e1f' }}>{pkg.count} lodd</span>
                <span style={{ fontSize: '12px', color: '#4a5e50' }}>{pkg.count * lottery.ticketPrice} kr</span>
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', border: '0.5px solid #dedddd', borderRadius: '12px', background: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => setTicketCount(Math.max(1, ticketCount - 1))} style={{ padding: '4px 10px', borderRadius: '8px', border: '0.5px solid #dedddd', background: '#ffffff', color: '#1a2e1f', cursor: 'pointer', fontWeight: '600' }}>-</button>
                <span style={{ fontWeight: '700', color: '#1a2e1f' }}>{ticketCount}</span>
                <button onClick={() => setTicketCount(ticketCount + 1)} style={{ padding: '4px 10px', borderRadius: '8px', border: '0.5px solid #dedddd', background: '#ffffff', color: '#1a2e1f', cursor: 'pointer', fontWeight: '600' }}>+</button>
              </div>
            </div>
          </div>

          <div style={{ background: '#faf8f4', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: '#4a5e50' }}>Du betaler</div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#2d6a4f' }}>{ticketCount * lottery.ticketPrice} kr</div>
            <div style={{ fontSize: '12px', color: '#4a5e50' }}>for {ticketCount} lodd à {lottery.ticketPrice} kr</div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Ditt navn</label>
            <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Ola Nordmann" style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }} />
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px', marginTop: '12px' }}>Mobilnummer (Vipps)</label>
            <input type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="99 88 77 66" style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }} />
          </div>

          <button
            onClick={handlePurchase}
            style={{ width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '18px', padding: '16px', borderRadius: '10px', fontWeight: '700', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.3)', cursor: 'pointer' }}
          >
            Betal {ticketCount * lottery.ticketPrice} kr med Vipps
          </button>
        </div>

        <div style={{ background: '#faf8f4', padding: '24px', borderTop: '0.5px solid #dedddd' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1a2e1f', textAlign: 'center' }}>🏆 Premieoversikt</h4>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            {lottery.prizes.map((p: any) => (
              <li key={p.id}>
                <strong>{p.name}</strong> {p.donor && <span style={{ color: '#2d6a4f', fontSize: '12px' }}> (Sponset av {p.donor})</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const CenteredCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
    <div style={{ maxWidth: '500px', width: '100%', height: 'fit-content', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '32px 24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
      {children}
    </div>
  </div>
);
