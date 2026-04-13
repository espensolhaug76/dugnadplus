import React, { useState } from 'react';

export const PremiumPage: React.FC = () => {
  const [players, setPlayers] = useState(20);
  const [loddsPerPlayer, setLoddsPerPlayer] = useState(25);
  const [pricePerLodd, setPricePerLodd] = useState(25);
  const estimated = players * loddsPerPlayer * pricePerLodd;

  const activate = () => {
    localStorage.setItem('dugnad_premium', 'premium');
    window.location.href = '/lottery-admin';
  };

  return (
    <div style={{ background: '#faf8f4', minHeight: '100vh', padding: '0 20px 60px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ padding: '20px 0' }}>
          <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#2d6a4f', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>← Tilbake til dashbordet</button>
        </div>

        {/* SEKSJON 1 — HERO */}
        <div className="mkt-hero-grid" style={{ background: '#1e3a2f', borderRadius: '16px', padding: '48px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '12px', fontWeight: '600' }}>★ Fra 99 kr/mnd — tre planer for alle lag</div>
            <h1 style={{ fontSize: '32px', fontWeight: '600', color: '#ffffff', margin: '0 0 16px', lineHeight: '1.2' }}>Tjen penger til <span style={{ color: '#a8e6c3' }}>lagkassen</span></h1>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', lineHeight: '1.7', margin: '0 0 24px' }}>Loddbok, kiosk og sponsoravtaler samlet i én løsning. Alt du tjener går direkte til laget — ingen mellommann, ingen cut.</p>
            <button onClick={activate} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '12px 24px', fontWeight: '500', fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}>Kom i gang</button>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Ingen bindingstid · Avbryt når som helst</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', marginBottom: '20px', letterSpacing: '.05em' }}>Hva kan ditt lag tjene?</div>
            {[
              { label: 'Antall spillere', value: players, set: setPlayers, min: 5, max: 60, step: 1, suffix: '' },
              { label: 'Lodd per spiller', value: loddsPerPlayer, set: setLoddsPerPlayer, min: 10, max: 50, step: 5, suffix: '' },
              { label: 'Pris per lodd', value: pricePerLodd, set: setPricePerLodd, min: 10, max: 50, step: 5, suffix: ' kr' },
            ].map((s, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>{s.label}</span>
                  <span style={{ fontSize: '13px', color: '#ffffff', fontWeight: '500' }}>{s.value}{s.suffix}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                  onChange={e => s.set(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#7ec8a0', height: '4px' }} />
              </div>
            ))}
            <div style={{ background: '#7ec8a0', borderRadius: '8px', padding: '14px 16px', marginTop: '8px' }}>
              <div style={{ fontSize: '11px', color: '#1e3a2f', opacity: 0.65 }}>Estimert per loddsalg</div>
              <div style={{ fontSize: '28px', fontWeight: '500', color: '#1e3a2f' }}>{estimated.toLocaleString('nb-NO')} kr</div>
              <div style={{ fontSize: '11px', color: '#1e3a2f', opacity: 0.55 }}>100% til lagkassen via Vipps</div>
            </div>
          </div>
        </div>

        {/* SEKSJON 2 — STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '40px' }}>
          {[
            { num: '100%', text: 'av inntektene går direkte til laget — ikke til oss' },
            { num: '3 min', text: 'å sette opp et digitalt loddsalg fra bunnen av' },
            { num: 'Vipps', text: 'direkte utbetaling til lagets konto, ingen omveier' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '500', color: '#2d6a4f', marginBottom: '6px' }}>{s.num}</div>
              <div style={{ fontSize: '12px', color: '#4a5e50', lineHeight: '1.5' }}>{s.text}</div>
            </div>
          ))}
        </div>

        {/* SEKSJON 3 — FEATURES */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '500', margin: '0 0 6px', color: '#1a2e1f' }}>Fire måter å fylle lagkassen</h2>
          <p style={{ fontSize: '13px', color: '#4a5e50', margin: 0 }}>Bruk én eller alle — du velger selv hva som passer laget</p>
        </div>
        <div className="mkt-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '40px' }}>
          {[
            { icon: '🎟️', iconBg: '#e6f0e8', iconColor: '#2d6a4f', badge: 'Ditt eget lotteri', title: 'Digital loddbok', text: 'Du setter opp premiene, du bestemmer prisen, og du beholder alt. Fungerer like bra for et lite klassisk loddsalg som for et stort sesongavslutningslotteri med storpremie. Foreldre betaler med Vipps og deler videre — ingen papirlodd, ingen kontanter.', earn: 'Snitt 12 500 kr per salg', earnBg: '#e6f0e8', earnColor: '#2d6a4f' },
            { icon: '🛒', iconBg: '#faeeda', iconColor: '#854f0b', badge: '', title: 'Kiosk', text: 'Selg mat og drikke på hjemmekamper med Vipps-betaling. Sett opp menyen på 2 minutter.', earn: '300–800 kr per kamp', earnBg: '#faeeda', earnColor: '#854f0b' },
            { icon: '🏷️', iconBg: '#e6f1fb', iconColor: '#185fa5', badge: '', title: 'Marked', text: 'La familiene kjøpe og selge brukt sportsutstyr seg imellom. Laget tar en liten andel av hvert salg.', earn: 'Passiv inntekt hele sesongen', earnBg: '#e6f1fb', earnColor: '#185fa5' },
            { icon: '🏪', iconBg: '#eeedfe', iconColor: '#534ab7', badge: '', title: 'Sponsorer', text: 'Lokale bedrifter kan vise tilbud til lagets familier. Du setter betingelsene og godkjenner hvem som er med.', earn: 'Faste sponsorinntekter', earnBg: '#eeedfe', earnColor: '#534ab7' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '12px', padding: '20px', display: 'flex', gap: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: f.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                {f.badge && <span style={{ fontSize: '10px', background: f.iconBg, color: f.iconColor, padding: '2px 7px', borderRadius: '6px', fontWeight: '600', marginBottom: '6px', display: 'inline-block' }}>{f.badge}</span>}
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 6px', color: '#1a2e1f' }}>{f.title}</h3>
                <p style={{ fontSize: '12px', color: '#4a5e50', lineHeight: '1.6', margin: '0 0 10px' }}>{f.text}</p>
                <span style={{ fontSize: '11px', background: f.earnBg, color: f.earnColor, padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>{f.earn}</span>
              </div>
            </div>
          ))}
        </div>

        {/* SEKSJON 3.5 — SMS */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '11px', color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '12px' }}>Aktiv-plan</div>
          <h2 style={{ fontSize: '22px', fontWeight: '500', color: '#1a2e1f', margin: '0 0 8px' }}>Foreldre som ikke svarer — løst med én knapp</h2>
          <p style={{ fontSize: '14px', color: '#4a5e50', margin: '0 0 20px', maxWidth: '600px' }}>Automatisk påminnelse sendes X dager før vakten. De som fortsatt ikke har bekreftet får en manuell purring. Alt på SMS, direkte til telefonen.</p>
          <div className="mkt-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="mkt-sms-card" style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏰</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>Automatisk påminnelse</div>
              <div style={{ fontSize: '12px', color: '#4a5e50', lineHeight: '1.55', marginBottom: '12px' }}>Velg 1, 2 eller 3 dager før vakten. Systemet sender SMS til alle ubekreftede automatisk.</div>
              <span style={{ background: '#e6f0e8', color: '#2d6a4f', fontSize: '11px', fontWeight: '500', padding: '3px 10px', borderRadius: '6px' }}>Spar 30 min per arrangement</span>
            </div>
            <div className="mkt-sms-card" style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📱</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>Manuell purring</div>
              <div style={{ fontSize: '12px', color: '#4a5e50', lineHeight: '1.55', marginBottom: '12px' }}>Se hvem som ikke har svart. Trykk én knapp — alle ubekreftede får SMS samtidig.</div>
              <span style={{ background: '#e6f0e8', color: '#2d6a4f', fontSize: '11px', fontWeight: '500', padding: '3px 10px', borderRadius: '6px' }}>200 SMS inkludert per sesong</span>
            </div>
          </div>
        </div>

        {/* SEKSJON 4 — SLIK FUNGERER DET */}
        <div className="mkt-howto-box" style={{ background: '#faf8f4', borderRadius: '12px', padding: '28px 32px', marginBottom: '40px', border: '0.5px solid #dedddd' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '500', margin: '0 0 4px', color: '#1a2e1f' }}>Slik fungerer det</h3>
          <p style={{ fontSize: '12px', color: '#4a5e50', margin: '0 0 24px' }}>Fra null til loddsalg på under fem minutter</p>
          <div className="mkt-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
            {[
              { num: '1', title: 'Aktiver premium', text: 'Velg abonnement for laget. Ingen binding, avbryt når du vil.' },
              { num: '2', title: 'Sett opp en kampanje', text: 'Loddbok, kiosk eller sponsor — klar på under 3 minutter.' },
              { num: '3', title: 'Pengene kommer rett inn', text: 'Vipps betaler direkte til lagets konto. Du ser alt i dashbordet.' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#2d6a4f', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', margin: '0 auto 12px' }}>{s.num}</div>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', color: '#1a2e1f' }}>{s.title}</div>
                <div style={{ fontSize: '12px', color: '#4a5e50', lineHeight: '1.5' }}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SEKSJON 5 — PRIS */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '12px' }}>Tre planer</div>
            <h2 style={{ fontSize: '22px', fontWeight: '500', color: '#1a2e1f', margin: '0 0 8px' }}>Gratis å starte — oppgrader når dere er klare</h2>
          </div>
          <div className="mkt-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            {/* Gratis */}
            <div style={{ border: '0.5px solid #dedddd', borderRadius: '14px', overflow: 'hidden' }}>
              <div className="mkt-price-header" style={{ background: '#faf8f4', padding: '18px' }}>
                <div style={{ fontSize: '10px', color: '#6b7f70', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Gratis</div>
                <div style={{ fontSize: '32px', fontWeight: '500', color: '#1a2e1f' }}>0 kr</div>
                <div style={{ fontSize: '11px', color: '#6b7f70' }}>Kom i gang uten risiko</div>
              </div>
              <div style={{ padding: '18px' }}>
                {['Automatisk vaktfordeling', 'Poengssystem', 'Vikarbørs', 'Push-varsler'].map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#1a2e1f', padding: '4px 0', display: 'flex', gap: '6px' }}><span style={{ color: '#2d6a4f' }}>✓</span> {f}</div>
                ))}
                {['SMS-varsler', 'Loddbok, kiosk'].map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#c0c0c0', padding: '4px 0', display: 'flex', gap: '6px' }}><span>—</span> {f}</div>
                ))}
                <button onClick={() => window.location.href = '/register'} style={{ width: '100%', marginTop: '14px', padding: '10px', background: '#fff', color: '#2d6a4f', border: '1.5px solid #2d6a4f', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Kom i gang gratis</button>
              </div>
            </div>
            {/* Aktiv */}
            <div style={{ border: '2px solid #2d6a4f', borderRadius: '14px', overflow: 'hidden', position: 'relative' }}>
              <div className="mkt-price-header" style={{ background: '#2d6a4f', padding: '18px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#7ec8a0', color: '#1e3a2f', fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px' }}>Mest valgt</span>
                <div style={{ fontSize: '10px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Aktiv</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: '500', color: '#fff' }}>490 kr</span>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>/ sesong</span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>eller 99 kr/mnd</div>
              </div>
              <div style={{ padding: '18px' }}>
                {['Alt i gratis', 'SMS-påminnelse før vakt', 'SMS-purring til ubekreftede', '200 SMS inkludert'].map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#1a2e1f', padding: '4px 0', display: 'flex', gap: '6px' }}><span style={{ color: '#2d6a4f' }}>✓</span> {f}</div>
                ))}
                {['Loddbok, kiosk, kampanjer'].map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#c0c0c0', padding: '4px 0', display: 'flex', gap: '6px' }}><span>—</span> {f}</div>
                ))}
                <button onClick={() => { localStorage.setItem('dugnad_premium', 'aktiv'); window.location.href = '/coordinator-dashboard'; }} style={{ width: '100%', marginTop: '14px', padding: '10px', background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Velg Aktiv</button>
              </div>
            </div>
            {/* Premium */}
            <div style={{ border: '0.5px solid #dedddd', borderRadius: '14px', overflow: 'hidden', position: 'relative' }}>
              <div className="mkt-price-header" style={{ background: '#1e3a2f', padding: '18px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: '#7ec8a0', color: '#1e3a2f', fontSize: '10px', fontWeight: '600', padding: '3px 8px', borderRadius: '6px' }}>★ Mest verdi</span>
                <div style={{ fontSize: '10px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '6px' }}>Premium</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: '500', color: '#fff' }}>990 kr</span>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>/ sesong</span>
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>eller 199 kr/mnd</div>
              </div>
              <div style={{ padding: '18px' }}>
                {['Alt i Aktiv (500 SMS inkl.)', 'Digital loddbok', 'Vipps-kiosk', 'Salgskampanjer', 'Sponsormodul', '100% til lagets Vipps'].map((f, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#1a2e1f', padding: '4px 0', display: 'flex', gap: '6px' }}><span style={{ color: '#2d6a4f' }}>✓</span> {f}</div>
                ))}
                <button onClick={activate} style={{ width: '100%', marginTop: '14px', padding: '10px', background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Se hva dere kan tjene...</button>
              </div>
            </div>
          </div>
        </div>

        {/* SEKSJON 6 — BUNN-BANNER */}
        <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', color: '#ffffff', margin: '0 0 8px', fontWeight: '500' }}>Klar til å fylle lagkassen?</h2>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', margin: '0 0 20px' }}>Bli med lagene som allerede bruker Dugnad+ Premium</p>
          <button onClick={activate} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '11px 28px', fontWeight: '500', fontSize: '14px', cursor: 'pointer' }}>Se hva dere kan tjene...</button>
        </div>
      </div>

      {/* Mobil-responsivitet (<768px). Samme mønster som LandingPage:
          @media + !important overstyrer inline styles uten å røre dem. */}
      <style>{`
        @media (max-width: 768px) {
          .mkt-hero-grid {
            grid-template-columns: 1fr !important;
            padding: 32px 24px !important;
            gap: 28px !important;
          }
          .mkt-grid-3 { grid-template-columns: 1fr !important; }
          .mkt-grid-2 { grid-template-columns: 1fr !important; }
          .mkt-howto-box { padding: 24px 20px !important; }

          /* Sentrér full-bredde kort på mobil — samme regler som LandingPage.
             Pris-header har indre flex-rad ("490 kr / sesong") som må
             justify-content: center. SMS-kortene har emoji + tittel + tekst
             + pill og leser bedre sentrert når kortet er full-bredde. */
          .mkt-price-header { text-align: center !important; }
          .mkt-price-header > div { justify-content: center !important; }
          .mkt-sms-card { text-align: center !important; }
        }
      `}</style>
    </div>
  );
};
