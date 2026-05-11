import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Campaign {
  id: string;
  title: string;
  description: string | null;
  product_name: string;
  unit_price: number;
  vipps_number: string;
  status: string;
  vipps_validation_failed_at: string | null;
}

interface ResultItem {
  name: string;
  price: number;
  qty: number;
}

// Phase-modell for Vipps ePayment-integrasjon (2026-05-11 — salgskampanje
// migrert til samme arkitektur som lottery og kiosk):
//   shop                 — produktvelger + kjøperinfo (default)
//   initiating           — POST /vipps-initiate-payment, vis spinner
//   redirecting          — fikk redirectUrl, sender brukeren til Vipps
//   returning            — kommet tilbake fra Vipps, polling status
//   success              — CAPTURED eller AUTHORIZED — kjøp registrert
//   cancelled            — CANCELLED/TERMINATED
//   failed               — FAILED/EXPIRED eller teknisk feil
//   pending_confirmation — polling timet ut uten endelig status; vi
//                          lyver IKKE om success — viser eksplisitt
//                          "venter på bekreftelse" med retry-knapp.
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

const LS_REF_KEY = 'dugnad_campaign_pending_reference';

export const CampaignShop: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('en dugnadsfamilie');

  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('shop');
  const [errorMessage, setErrorMessage] = useState('');

  // Snapshot for kvitteringsskjermen — settes ved initiering så vi
  // har data å vise selv etter cart er tømt ved retur fra Vipps.
  const [resultItems, setResultItems] = useState<ResultItem[]>([]);
  const [resultTotal, setResultTotal] = useState(0);

  // Retry-state for pending_confirmation-skjermen.
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const [pollRetryCount, setPollRetryCount] = useState(0);

  const pollAbortRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const cid = params.get('campaign') || '';
        const sid = params.get('seller') || '';
        const reference = params.get('reference');

        if (sid) setSellerId(sid);

        // Last kampanje — primært fra ?campaign=<id>, men hvis vi
        // kommer tilbake fra Vipps med ?reference= og uten ?campaign=
        // (Edge Function's returnUrl inkluderer ikke campaign-param),
        // henter vi campaign_id fra campaign_sales-raden via reference.
        let campaignData: Campaign | null = null;
        if (cid) {
          const { data } = await supabase
            .from('sales_campaigns')
            .select('id, title, description, product_name, unit_price, vipps_number, status, vipps_validation_failed_at')
            .eq('id', cid)
            .maybeSingle();
          if (data) campaignData = data as Campaign;
        } else if (reference) {
          const { data: sale } = await supabase
            .from('campaign_sales')
            .select('campaign_id, sales_campaigns(id, title, description, product_name, unit_price, vipps_number, status, vipps_validation_failed_at)')
            .eq('vipps_reference', reference)
            .maybeSingle();
          if (sale && (sale as any).sales_campaigns) {
            campaignData = (sale as any).sales_campaigns as Campaign;
          }
        }
        if (campaignData) setCampaign(campaignData);

        // Last selger-info (hvis ?seller= er satt) — vises i header
        // som "Støtt {sellerName} og laget!"
        if (sid) {
          const { data: family } = await supabase
            .from('families')
            .select('name, family_members(name, role)')
            .eq('id', sid)
            .maybeSingle();
          if (family) {
            const child = (family as any).family_members?.find((m: any) => m.role === 'child');
            setSellerName(child?.name || (family as any).name || 'en dugnadsfamilie');
          }
        }

        // Retur fra Vipps?
        if (reference) {
          setPhase('returning');
          // Strip reference fra URL — bevar campaign + seller så
          // "Kjøp mer"-flyten har riktig kontekst etterpå.
          const cleanParams = new URLSearchParams();
          if (campaignData?.id) cleanParams.set('campaign', campaignData.id);
          if (sid) cleanParams.set('seller', sid);
          const qs = cleanParams.toString();
          const cleanUrl = window.location.pathname + (qs ? `?${qs}` : '');
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
  // brukeren prøve på nytt eller lukke.
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
    // lyve om success.
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

  const total = campaign ? campaign.unit_price * quantity : 0;

  // Steg 1: kall vipps-initiate-payment, send brukeren til Vipps.
  const handlePurchase = async () => {
    if (!campaign) return;
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

    // Snapshot for kvitteringen — campaign-data kan tapes ved reload
    const itemsSnapshot: ResultItem[] = [{
      name: campaign.product_name,
      price: campaign.unit_price,
      qty: quantity,
    }];
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
          source: 'campaign',
          campaign_id: campaign.id,
          seller_family_id: sellerId || null,
          quantity,
          buyer_name: buyerName.trim(),
          buyer_phone: phoneClean,
          amount_nok: total,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        if (data?.reason === 'merchant_invalid') {
          setErrorMessage('Kampanjen er midlertidig utilgjengelig. Klubben er varslet og fikser saken.');
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
    setQuantity(1);
    setErrorMessage('');
    setResultItems([]);
    setResultTotal(0);
    setPendingReference(null);
    setPollRetryCount(0);
    setPhase('shop');
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', color: '#1a2e1f' }}>Laster kampanje…</div>;
  }

  if (!campaign) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🔗</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kampanjen finnes ikke</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            Sjekk at lenken er riktig, eller kontakt familien som delte den.
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== Kampanjen er ikke åpen ennå =====
  if (phase === 'shop' && (campaign.status !== 'active' || !campaign.vipps_number)) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛍️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kampanjen er ikke åpen</h2>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#4a5e50', lineHeight: '1.6' }}>
            {campaign.status === 'completed'
              ? 'Kampanjen er avsluttet.'
              : 'Laget er ikke ferdig med å sette opp kampanjen. Prøv igjen senere.'}
          </p>
        </div>
      </CenteredCard>
    );
  }

  // ===== Kampanjen midlertidig utilgjengelig pga. ugyldig Vipps-nummer =====
  if (phase === 'shop' && campaign.vipps_validation_failed_at) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏸️</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1a2e1f' }}>Kampanjen er midlertidig utilgjengelig</h2>
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
          {resultItems.length > 0 ? (
            <div style={{ marginTop: '20px', textAlign: 'left', background: '#faf8f4', borderRadius: '10px', padding: '16px' }}>
              {resultItems.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '14px', color: '#1a2e1f' }}>
                  <span>{it.qty}× {it.name}</span>
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
      <div style={{ maxWidth: '440px', width: '100%', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        {/* Header */}
        <div style={{ background: '#1e3a2f', padding: '32px 20px', color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🛍️</div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>{campaign.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '8px', fontSize: '14px' }}>Støtt {sellerName} og laget!</p>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Produktinfo */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a2e1f' }}>{campaign.product_name}</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#2d6a4f', marginTop: '4px' }}>{campaign.unit_price} kr/stk</div>
          </div>

          {/* Antall-velger */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '24px' }}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{ width: '44px', height: '44px', borderRadius: '50%', border: '0.5px solid #dedddd', background: '#ffffff', cursor: 'pointer', fontSize: '20px', color: '#1a2e1f' }}
            >−</button>
            <span style={{ fontSize: '32px', fontWeight: '800', minWidth: '50px', textAlign: 'center', color: '#1a2e1f' }}>{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              style={{ width: '44px', height: '44px', borderRadius: '50%', border: '0.5px solid #dedddd', background: '#ffffff', cursor: 'pointer', fontSize: '20px', color: '#1a2e1f' }}
            >+</button>
          </div>

          {/* Total */}
          <div style={{ background: '#faf8f4', borderRadius: '10px', padding: '16px', textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', color: '#4a5e50' }}>Du betaler</div>
            <div style={{ fontSize: '32px', fontWeight: '800', color: '#2d6a4f' }}>{total} kr</div>
            <div style={{ fontSize: '12px', color: '#4a5e50' }}>for {quantity} × {campaign.product_name}</div>
          </div>

          {/* Kjøperinfo */}
          <div style={{ marginBottom: '24px' }}>
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
        </div>

        {campaign.description && (
          <div style={{ background: '#faf8f4', padding: '20px 24px', borderTop: '0.5px solid #dedddd', fontSize: '13px', color: '#4a5e50', lineHeight: '1.6' }}>
            {campaign.description}
          </div>
        )}
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
