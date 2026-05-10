import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';

interface KioskItem {
  id: string;
  name: string;
  price: number;
  emoji: string;
}

interface CartEntry {
  item: KioskItem;
  qty: number;
}

interface KioskSettings {
  vippsNumber: string;
  vippsValidationFailedAt: string | null;
}

interface ResultItem {
  name: string;
  emoji: string;
  price: number;
  qty: number;
}

// Phase-modell for Vipps ePayment-integrasjon (2026-05-10 — kiosk
// migrert til samme arkitektur som lottery):
//   shop                 — meny + handlekurv + kjøperinfo (default)
//   initiating           — POST /vipps-initiate-payment, vis spinner
//   redirecting          — fikk redirectUrl, sender brukeren til Vipps
//   returning            — kommet tilbake fra Vipps, polling status
//   success              — CAPTURED eller AUTHORIZED — kjøp registrert
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

const LS_REF_KEY = 'dugnad_kiosk_pending_reference';

export const KioskShop: React.FC = () => {
  const [items, setItems] = useState<KioskItem[]>([]);
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [loading, setLoading] = useState(true);
  const [clubName, setClubName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [settings, setSettings] = useState<KioskSettings | null>(null);

  const [phase, setPhase] = useState<Phase>('shop');
  const [errorMessage, setErrorMessage] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  // Snapshot for kvitteringsskjermen — settes ved initiering så vi
  // har data å vise selv etter cart er tømt ved retur fra Vipps.
  // Tom array hvis brukeren reloadet siden under retur-flyten
  // (da viser vi kun totalbeløp).
  const [resultItems, setResultItems] = useState<ResultItem[]>([]);
  const [resultTotal, setResultTotal] = useState(0);

  // Retry-state for pending_confirmation-skjermen. pendingReference
  // beholdes så "Sjekk på nytt"-knappen kan kjøre pollStatus igjen.
  // pollRetryCount=0 ved første timeout, ≥1 etter retry → viser
  // mer pessimistisk meldingstekst.
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pollRetryCount, setPollRetryCount] = useState(0);

  const pollAbortRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const tid = params.get('team') || '';
        const reference = params.get('reference');

        setTeamId(tid);

        try {
          const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
          setClubName(club.name || '');
        } catch { /* noop */ }

        if (tid) {
          const [itemsRes, settingsRes] = await Promise.all([
            supabase
              .from('kiosk_items')
              .select('*')
              .eq('team_id', tid)
              .eq('is_active', true)
              .order('name'),
            supabase
              .from('kiosk_settings')
              .select('vipps_number, vipps_validation_failed_at')
              .eq('team_id', tid)
              .maybeSingle(),
          ]);
          if (itemsRes.data) setItems(itemsRes.data);
          setSettings({
            vippsNumber: settingsRes.data?.vipps_number || '',
            vippsValidationFailedAt: settingsRes.data?.vipps_validation_failed_at || null,
          });
        }

        // Retur fra Vipps?
        if (reference) {
          setPhase('returning');
          // Fjern reference fra URL så reload ikke trigger ny poll
          const cleanUrl = window.location.pathname + (tid ? `?team=${encodeURIComponent(tid)}` : '');
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
        setResultTotal(data.amount || 0);

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

  const addToCart = (item: KioskItem) => {
    setCart(prev => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, qty: (existing?.qty || 0) + 1 } };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev[itemId];
      if (!existing || existing.qty <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: { ...existing, qty: existing.qty - 1 } };
    });
  };

  const cartEntries = Object.values(cart).filter(e => e.qty > 0);
  const total = cartEntries.reduce((sum, e) => sum + e.item.price * e.qty, 0);

  // Steg 1: kall vipps-initiate-payment, send brukeren til Vipps.
  const handlePurchase = async () => {
    if (!teamId || cartEntries.length === 0) return;
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

    // Snapshot for kvitteringen — cart kan endres/tømmes etterpå
    const itemsSnapshot: ResultItem[] = cartEntries.map(e => ({
      name: e.item.name,
      emoji: e.item.emoji,
      price: e.item.price,
      qty: e.qty,
    }));
    setResultItems(itemsSnapshot);
    setResultTotal(total);
    setPhase('initiating');

    try {
      const resp = await fetch(FN('vipps-initiate-payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          source: 'kiosk',
          team_id: teamId,
          items: itemsSnapshot,
          buyer_name: buyerName.trim(),
          buyer_phone: phoneClean,
          amount_nok: total,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data?.reason === 'merchant_invalid') {
          setErrorMessage('Kiosken er midlertidig utilgjengelig. Klubben er varslet og fikser saken.');
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
      setPhase('redirecting');
      window.location.href = redirectUrl;
    } catch (e) {
      console.error('[initiate]', e);
      setErrorMessage('Nettverksfeil. Sjekk forbindelsen og prøv igjen.');
      setPhase('failed');
    }
  };

  const resetForNewPurchase = () => {
    setBuyerName('');
    setBuyerPhone('');
    setCart({});
    setErrorMessage('');
    setResultItems([]);
    setResultTotal(0);
    setPendingReference(null);
    setPollRetryCount(0);
    setPhase('shop');
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', color: '#1a2e1f' }}>Laster kiosk…</div>;
  }

  // ===== Mangler team-parameter =====
  if (!teamId) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🔗</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kiosk-lenken mangler</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Skann QR-koden ved kiosken eller bruk lenken laget har delt.
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== Kiosken er ikke åpen ennå (mangler vipps_number eller varer) =====
  if (phase === 'shop' && (!settings?.vippsNumber || items.length === 0)) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛒</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kiosken er ikke åpen ennå</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Laget er ikke ferdig med å sette opp kiosken. Prøv igjen senere.
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== Kiosken midlertidig utilgjengelig pga. ugyldig Vipps-nummer =====
  if (phase === 'shop' && settings?.vippsValidationFailedAt) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏸️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kiosken er midlertidig utilgjengelig</h2>
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
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Takk for handelen!</h2>
          {resultItems.length > 0 ? (
            <div style={{ marginTop: '20px', textAlign: 'left', background: '#faf8f4', borderRadius: '10px', padding: '16px' }}>
              {resultItems.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '14px', color: '#1a2e1f' }}>
                  <span>{it.qty}× {it.emoji} {it.name}</span>
                  <span style={{ color: '#4a5e50' }}>{it.price * it.qty} kr</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #dedddd', marginTop: '8px', paddingTop: '8px', fontSize: '16px', fontWeight: '700', color: '#2d6a4f' }}>
                <span>Totalt</span>
                <span>{resultTotal} kr</span>
              </div>
            </div>
          ) : (
            <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50' }}>
              {resultTotal > 0 ? `Du har betalt ${resultTotal} kr.` : 'Betalingen er registrert.'}
            </p>
          )}
          <p style={{ marginTop: '16px', fontSize: '12px', color: '#6b7f70' }}>Du finner kvittering i Vipps.</p>
          <button
            onClick={resetForNewPurchase}
            style={{ marginTop: '24px', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '16px', padding: '14px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
          >
            Kjøp mer
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
            Ingen kjøp er registrert.
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
      <div style={{ maxWidth: '500px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <div style={{ background: '#1e3a2f', padding: '32px 20px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛒</div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{clubName || 'Kiosk'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px', fontSize: '14px' }}>Velg varer og betal med Vipps</p>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {items.map(item => {
              const inCart = cart[item.id]?.qty || 0;
              return (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  style={{
                    padding: '20px 16px', borderRadius: '12px', textAlign: 'center', cursor: 'pointer',
                    background: inCart > 0 ? '#e8f5ef' : '#ffffff',
                    border: inCart > 0 ? '2px solid #2d6a4f' : '0.5px solid #dedddd',
                    transition: 'all 0.15s', position: 'relative',
                  }}
                >
                  {inCart > 0 && (
                    <div style={{ position: 'absolute', top: '-8px', right: '-8px', width: '28px', height: '28px', borderRadius: '50%', background: '#2d6a4f', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>{inCart}</div>
                  )}
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>{item.emoji}</div>
                  <div style={{ fontWeight: '600', fontSize: '16px', color: '#1a2e1f' }}>{item.name}</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#2d6a4f', marginTop: '4px' }}>{item.price} kr</div>
                </div>
              );
            })}
          </div>

          {/* Handlekurv */}
          {cartEntries.length > 0 && (
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px', border: '0.5px solid #dedddd', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#1a2e1f' }}>Din bestilling</h3>
              {cartEntries.map(e => (
                <div key={e.item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: '14px', color: '#1a2e1f' }}>{e.item.emoji} {e.item.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); removeFromCart(e.item.id); }}
                      style={{ width: '28px', height: '28px', borderRadius: '50%', border: '0.5px solid #dedddd', background: '#ffffff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2e1f' }}
                    >−</button>
                    <span style={{ fontWeight: '700', minWidth: '20px', textAlign: 'center', color: '#1a2e1f' }}>{e.qty}</span>
                    <button
                      onClick={(ev) => { ev.stopPropagation(); addToCart(e.item); }}
                      style={{ width: '28px', height: '28px', borderRadius: '50%', border: '0.5px solid #dedddd', background: '#ffffff', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2e1f' }}
                    >+</button>
                    <span style={{ fontWeight: '700', minWidth: '60px', textAlign: 'right', color: '#2d6a4f' }}>{e.item.price * e.qty} kr</span>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', marginTop: '8px', borderTop: '1px solid #dedddd', fontSize: '18px', fontWeight: '800', color: '#2d6a4f' }}>
                <span>Totalt</span><span>{total} kr</span>
              </div>
            </div>
          )}

          {/* Kjøperinfo + betal */}
          {cartEntries.length > 0 ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Ditt navn</label>
                <input
                  value={buyerName}
                  onChange={e => setBuyerName(e.target.value)}
                  placeholder="Ola Nordmann"
                  style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                />
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px', marginTop: '12px' }}>Mobilnummer (Vipps)</label>
                <input
                  type="tel"
                  value={buyerPhone}
                  onChange={e => setBuyerPhone(e.target.value)}
                  placeholder="99 88 77 66"
                  style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                />
              </div>
              <button
                onClick={handlePurchase}
                style={{ width: '100%', background: '#2d6a4f', color: 'white', border: 'none', fontSize: '18px', padding: '16px', borderRadius: '10px', fontWeight: '700', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.3)', cursor: 'pointer' }}
              >
                Betal {total} kr med Vipps
              </button>
            </>
          ) : (
            <p style={{ textAlign: 'center', color: '#6b7f70', fontSize: '14px', marginTop: '20px' }}>Trykk på en vare for å legge til</p>
          )}
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
