import React, { useState } from 'react';

const serif = "'DM Serif Display', serif";
const sans = "'DM Sans', sans-serif";

const gd = '#1a3028';
const gm = '#2d6a4f';
const gl = '#7ec8a0';
const gp = '#e6f0e8';
const cream = '#faf8f4';
const text = '#1a2e1f';
const muted = '#6b7f70';
const border = '#e8e0d0';

export const LandingPage: React.FC = () => {
  const [players, setPlayers] = useState(20);
  const [ticketsPerPlayer, setTicketsPerPlayer] = useState(25);
  const [pricePerTicket, setPricePerTicket] = useState(25);
  const estimated = players * ticketsPerPlayer * pricePerTicket;

  const go = (path: string) => { window.location.href = path; };

  return (
    <div data-theme="light" style={{ fontFamily: sans, color: text, background: cream }}>

      {/* ========== NAV ========== */}
      <nav style={{ height: '58px', background: gd, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontFamily: serif, fontSize: '22px', color: '#fff', cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Dugnad<span style={{ color: gl }}>+</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          {['Slik fungerer det', 'Premium', 'Priser'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`} style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px', textDecoration: 'none', fontWeight: 400 }}>{l}</a>
          ))}
          <button onClick={() => go('/register')} style={{ background: gl, color: gd, border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: sans }}>Kom i gang gratis</button>
        </div>
      </nav>

      {/* ========== HERO ========== */}
      <section style={{ background: gd, padding: '72px 48px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          {/* Pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(126,200,160,0.12)', border: '1px solid rgba(126,200,160,0.25)', borderRadius: '20px', padding: '5px 14px', marginBottom: '28px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: gl, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '11px', color: gl, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>For norske idrettslag</span>
          </div>

          <h1 style={{ fontFamily: serif, fontSize: '50px', color: '#fff', lineHeight: 1.08, margin: '0 0 20px' }}>
            Dugnad uten <em style={{ color: gl, fontStyle: 'italic' }}>kaos</em> — klar på 3 minutter
          </h1>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', maxWidth: '500px', margin: '0 auto 32px', lineHeight: 1.6 }}>
            Automatisk vaktfordeling, live oversikt og digital innsamling. Du slipper regneark, purringer og diskusjoner.
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '16px' }}>
            <button onClick={() => go('/register')} style={{ background: gl, color: gd, border: 'none', borderRadius: '10px', padding: '14px 30px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: sans }}>Prøv gratis — ingen kredittkort</button>
            <button onClick={() => { const el = document.getElementById('slik-fungerer-det'); el?.scrollIntoView({ behavior: 'smooth' }); }} style={{ background: 'rgba(255,255,255,0.07)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '14px 24px', fontSize: '15px', fontWeight: 400, cursor: 'pointer', fontFamily: sans }}>Se hvordan det fungerer</button>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)', margin: '0 0 40px' }}>Sett opp laget ditt gratis. Oppgrader når dere vil tjene penger til lagkassen.</p>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', border: '0.5px solid rgba(255,255,255,0.07)', overflow: 'hidden', gap: '1px' }}>
            {[
              { val: '80%', label: 'Mindre tid på dugnadsstyring' },
              { val: '100%', label: 'Av loddinntekten til laget' },
              { val: '3 min', label: 'Fra start til første arrangement' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', textAlign: 'center' }}>
                <div style={{ fontFamily: serif, fontSize: '30px', color: gl }}>{s.val}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== AKT 1: GRATIS ========== */}
      <section id="slik-fungerer-det" style={{ background: '#fff', padding: '64px 48px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', color: gm, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, marginBottom: '12px' }}>Gratis — alltid</div>
            <h2 style={{ fontFamily: serif, fontSize: '34px', color: text, margin: '0 0 12px' }}>Tre steg fra kaos til <em style={{ color: gm, fontStyle: 'italic' }}>full kontroll</em></h2>
            <p style={{ fontSize: '15px', color: muted, maxWidth: '540px', margin: '0 auto' }}>Sett opp laget, legg inn arrangement, og la systemet fordele vakter rettferdig. Ingen opplæring trengs.</p>
          </div>

          {/* Three steps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '40px' }}>
            {[
              { n: '1', badge: '2 min', icon: '📥', title: 'Importer laget', desc: 'Last opp spillerlisten fra Spond eller Excel. Systemet kobler familier til riktige barn automatisk.' },
              { n: '2', badge: '1 min', icon: '📅', title: 'Legg inn arrangement', desc: 'Opprett kamp eller dugnad med dato, sted og vaktbehov. Kopier til neste dag med ett klikk.' },
              { n: '3', badge: 'automatisk', icon: '⚖️', title: 'Vakter fordeles rettferdig', desc: 'Systemet tildeler vakter til familiene med lavest poeng. Ingen diskusjoner — alle vet det er rettferdig.' },
            ].map((s, i) => (
              <div key={i} style={{ background: '#fff', border: `0.5px solid ${border}`, borderRadius: '14px', padding: '22px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '14px', right: '14px', background: gp, color: gm, fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>{s.badge}</div>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: gd, color: '#fff', fontFamily: serif, fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>{s.n}</div>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: text, marginBottom: '6px' }}>{s.title}</div>
                <div style={{ fontSize: '13px', color: muted, lineHeight: 1.55 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          {/* App mockup */}
          <div style={{ background: gd, borderRadius: '14px', padding: '14px', marginBottom: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', marginBottom: '10px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28ca41' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: '8px' }}>Dugnad+ · Koordinatordashboard</span>
            </div>
            <div style={{ background: '#1a2e1f', borderRadius: '8px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>📅 Kommende arrangementer</span>
                <span style={{ background: gl, color: gd, fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px' }}>+ Nytt arrangement</span>
              </div>
              {[
                { day: '15', month: 'Mai', title: 'Seriespill hjemme — Gutter 2016', sub: 'Gjemselund · 6 vakter tildelt automatisk', pill: 'Alle fylt', pillBg: 'rgba(126,200,160,0.15)', pillColor: gl },
                { day: '22', month: 'Mai', title: 'Julecup dag 1', sub: 'Storhallen · 8 vakter · 2 mangler vikar', pill: '2 åpne', pillBg: 'rgba(250,199,117,0.15)', pillColor: '#fac775' },
                { day: '23', month: 'Mai', title: 'Julecup dag 2', sub: 'Storhallen · 8 vakter · ikke åpnet', pill: 'Planlegging', pillBg: 'rgba(255,255,255,0.08)', pillColor: 'rgba(255,255,255,0.4)' },
              ].map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderTop: i > 0 ? '0.5px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <div style={{ width: '42px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontFamily: serif, fontSize: '20px', color: '#fff' }}>{e.day}</div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>{e.month}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>{e.title}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{e.sub}</div>
                  </div>
                  <span style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '6px', background: e.pillBg, color: e.pillColor, fontWeight: 500 }}>{e.pill}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Assignment methods */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontFamily: serif, fontSize: '26px', color: text, margin: '0 0 8px' }}>Tre måter å fordele vakter — du velger hva som passer</h3>
            <p style={{ fontSize: '14px', color: muted, maxWidth: '560px', margin: '0 auto' }}>Noen lag vil ha full kontroll, andre vil at systemet gjør alt. Dugnad+ støtter alle tre — og du kan kombinere dem fritt.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Auto */}
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: gd, padding: '16px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: gl, color: gd, fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>★ Mest brukt</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Automatisk fordeling</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Systemet tildeler basert på poengssaldo</div>
              </div>
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: muted, lineHeight: 1.55, margin: '0 0 14px' }}>Du trykker én knapp. Systemet fordeler alle vakter rettferdig basert på hvem som har bidratt minst. Trenere og støtteapparat skjermes automatisk.</p>
                <div style={{ background: cream, borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
                  {['Hansen-familien · 12p → Kioskvakt', 'Berg-familien · 8p → Billettsalg', 'Olsen-familien · 5p → Ryddevakt'].map((r, i) => (
                    <div key={i} style={{ fontSize: '11px', color: text, padding: '5px 0', borderTop: i > 0 ? `0.5px solid ${border}` : 'none' }}>{r}</div>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: muted, background: cream, padding: '8px 10px', borderRadius: '6px' }}>💡 Passer best til faste dugnader der rettferdig fordeling er viktig.</div>
              </div>
            </div>

            {/* Manual */}
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: '#2a3f5f', padding: '16px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(147,197,253,0.2)', color: '#93c5fd', fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>Drag & drop</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Manuell plassering</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Du drar familier inn i vaktene du ønsker</div>
              </div>
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: muted, lineHeight: 1.55, margin: '0 0 14px' }}>Full kontroll. Dra og slipp familier inn i spesifikke vakter. Systemet viser poengssaldo og foreslår kandidater.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ background: cream, borderRadius: '8px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', color: muted, marginBottom: '4px' }}>Tilgjengelige</div>
                    {['⠿ Hansen', '⠿ Berg', '⠿ Olsen'].map((n, i) => (
                      <div key={i} style={{ fontSize: '11px', color: text, padding: '3px 0' }}>{n}</div>
                    ))}
                  </div>
                  <div style={{ border: `1.5px dashed ${border}`, borderRadius: '8px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', color: muted, marginBottom: '4px' }}>Kioskvakt</div>
                    <div style={{ fontSize: '11px', color: gm, padding: '3px 0' }}>✓ Johansen</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: muted, background: cream, padding: '8px 10px', borderRadius: '6px' }}>💡 Passer best når du kjenner laget godt.</div>
              </div>
            </div>

            {/* Self-service */}
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: '#3d2e1e', padding: '16px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(251,191,36,0.2)', color: '#fbbf24', fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px' }}>Selvvalg</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Familiene velger selv</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Vaktene legges ut — familiene melder seg på</div>
              </div>
              <div style={{ padding: '16px' }}>
                <p style={{ fontSize: '12px', color: muted, lineHeight: 1.55, margin: '0 0 14px' }}>Åpne vakter publiseres og familiene velger selv. Populært for cuper og frivillige arrangementer.</p>
                <div style={{ background: cream, borderRadius: '8px', padding: '8px', marginBottom: '12px' }}>
                  {[
                    { time: '10:00–12:00', task: 'Kioskvakt', btn: true },
                    { time: '12:00–14:00', task: 'Billettsalg', btn: true },
                    { time: '14:00–16:00', task: 'Ryddevakt', btn: false },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: text, padding: '5px 0', borderTop: i > 0 ? `0.5px solid ${border}` : 'none' }}>
                      <span>{r.time} · {r.task}</span>
                      {r.btn ? <span style={{ background: gp, color: gm, fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px' }}>Ta vakten</span> : <span style={{ fontSize: '10px', color: muted }}>Fullt</span>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: muted, background: cream, padding: '8px 10px', borderRadius: '6px' }}>💡 Passer best for cuper der folk har ulike preferanser.</div>
              </div>
            </div>
          </div>

          {/* Combine hint */}
          <div style={{ background: '#fff', border: `0.5px solid ${border}`, borderRadius: '12px', padding: '14px 18px', marginBottom: '48px', fontSize: '13px', color: muted }}>
            <strong style={{ color: text }}>🔀 Du kan kombinere fritt.</strong> Kjør automatisk på faste dugnader, selvvalg på cuper, drag & drop når du trenger full kontroll. Systemet holder oversikt over poeng uansett metode.
          </div>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            {[
              { icon: '⚖️', iconBg: gp, title: 'Automatisk og rettferdig fordeling', desc: 'Lavest-poeng-algoritmen sørger for at de som alltid stiller opp ikke overbelastes.', tag: 'Ingen diskusjoner' },
              { icon: '🔄', iconBg: '#e6f1fb', title: 'Vikarbørs — familiene løser det selv', desc: 'Kan ikke stille? Legg vakten ut på vikarbørs. Du trenger ikke involvere deg.', tag: 'Du kobles helt ut' },
              { icon: '🏆', iconBg: '#faeeda', title: 'Poengssystem som motiverer', desc: 'Alle familier ser sine poeng og nivå. Trenerteam skjermes automatisk.', tag: '4 nivåer med fordeler' },
              { icon: '📊', iconBg: '#eeedfe', title: 'Full oversikt til enhver tid', desc: 'Se hvem som har bekreftet, hvem som ikke har svart, alt på ett sted.', tag: 'Spar 2–3 timer per uke' },
              { icon: '📱', iconBg: '#e6f1fb', title: 'Foreldre svarer ikke? Ett klikk', desc: 'Send automatisk påminnelse før vakten og manuell purring til ubekreftede direkte på SMS. De som ikke svarer på e-post, svarer på SMS.', tag: 'Aktiv-plan' },
              { icon: '🔔', iconBg: '#faeeda', title: 'Push-varsler gratis', desc: 'Foreldre installerer appen på hjemskjermen og får automatiske varsler om nye vakter og påminnelser.', tag: 'Gratis' },
            ].map((f, i) => (
              <div key={i} style={{ background: '#fff', border: `0.5px solid ${border}`, borderRadius: '14px', padding: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: f.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: text, marginBottom: '4px' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: muted, lineHeight: 1.55, marginBottom: '8px' }}>{f.desc}</div>
                  <span style={{ fontSize: '10px', background: gp, color: gm, padding: '3px 8px', borderRadius: '6px', fontWeight: 500 }}>{f.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== AKT 2: PREMIUM ========== */}
      <section id="premium" style={{ background: gd, padding: '64px 48px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>Og så er det dette...</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '11px', color: gl, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, marginBottom: '12px' }}>Premium — 199 kr/mnd eller 990 kr/sesong</div>
            <h2 style={{ fontFamily: serif, fontSize: '34px', color: '#fff', margin: '0 0 12px' }}>Tjen penger til lagkassen — <em style={{ color: gl, fontStyle: 'italic' }}>uten ekstraarbeid</em></h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', maxWidth: '540px', margin: '0 auto' }}>Alt du trenger for å samle inn penger digitalt. Loddsalg, kiosk, salgskampanjer og sponsorer — på ett sted.</p>
          </div>

          {/* Income grid — 3 kort */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '32px' }}>
            {[
              { icon: '🎟️', title: 'Digital loddbok', desc: 'Ditt eget lotteri med egne premier. Hver spiller får en salgslenke å dele. Alt går rett til klubbens Vipps. Premiene trekkes automatisk. Settes opp på 2 minutter.', earn: 'Snitt 12 500 kr per salg' },
              { icon: '🛒', title: 'Kiosk på kampdag', desc: 'Skal dere selge kaker eller kaffe? Legg inn varer og priser, skriv ut QR-koden og heng den opp. Kjøperne skanner og betaler med Vipps. Kioskmenyen er klar på 2 minutter.', earn: '300–800 kr per kampdag' },
              { icon: '🛍️', title: 'Salgskampanjer', desc: 'Selg kalendere, juleris eller hva som helst. Hver spiller får sin egen salgslenke. Du ser hvem som har solgt hva i sanntid — og alle pengene går rett inn på lagets Vipps.', earn: 'Full oversikt — ingen jaging' },
            ].map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px' }}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>{c.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>{c.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, marginBottom: '12px' }}>{c.desc}</div>
                <span style={{ background: 'rgba(126,200,160,0.1)', color: gl, fontSize: '11px', fontWeight: 500, padding: '3px 10px', borderRadius: '6px' }}>{c.earn}</span>
              </div>
            ))}
          </div>

          {/* Calculator */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(126,200,160,0.2)', borderRadius: '14px', padding: '24px' }}>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '20px', textAlign: 'center' }}>Hva kan ditt lag tjene?</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {[
                { label: 'Antall spillere', val: players, set: setPlayers, min: 5, max: 60, step: 1, suffix: ' spillere' },
                { label: 'Lodd per spiller', val: ticketsPerPlayer, set: setTicketsPerPlayer, min: 5, max: 50, step: 5, suffix: ' lodd' },
                { label: 'Pris per lodd', val: pricePerTicket, set: setPricePerTicket, min: 10, max: 50, step: 5, suffix: ' kr' },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{s.val}{s.suffix}</span>
                  </div>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={s.val} onChange={e => s.set(Number(e.target.value))} style={{ width: '100%', accentColor: gl }} />
                </div>
              ))}
            </div>

            <div style={{ background: gl, borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: gd }}>Estimert per loddsalg</div>
                <div style={{ fontSize: '11px', color: 'rgba(26,48,40,0.6)' }}>100% til lagets Vipps</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: '28px', color: gd }}>{estimated.toLocaleString('nb-NO')} kr</div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== PRISER ========== */}
      <section id="priser" style={{ background: '#fff', padding: '64px 48px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: serif, fontSize: '34px', color: text, margin: '0 0 12px' }}>Gratis å starte — <em style={{ color: gm, fontStyle: 'italic' }}>tre planer for alle lag</em></h2>
          <p style={{ fontSize: '15px', color: muted, margin: '0 0 40px' }}>Sett opp alt gratis. Legg til SMS-varsler med Aktiv, eller lås opp loddsalg og kiosk med Premium.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'left' }}>
            {/* Gratis */}
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ background: cream, padding: '20px' }}>
                <div style={{ fontSize: '10px', color: muted, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Gratis — alltid</div>
                <div style={{ fontFamily: serif, fontSize: '38px', color: text }}>0 kr</div>
                <div style={{ fontSize: '12px', color: muted }}>Kom i gang uten risiko</div>
              </div>
              <div style={{ padding: '20px' }}>
                {['Automatisk vaktfordeling', 'Poengssystem', 'Vikarbørs', 'Familier ubegrenset', 'Push-varsler'].map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: text, padding: '6px 0', display: 'flex', gap: '8px' }}>
                    <span style={{ color: gm }}>✓</span> {f}
                  </div>
                ))}
                {['SMS-varsler', 'Loddbok, kiosk, kampanjer'].map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: '#c0c0c0', padding: '6px 0', display: 'flex', gap: '8px' }}>
                    <span>—</span> {f}
                  </div>
                ))}
                <button onClick={() => go('/register')} style={{ width: '100%', marginTop: '16px', padding: '12px', background: '#fff', color: gm, border: `1.5px solid ${gm}`, borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: sans }}>Kom i gang gratis</button>
              </div>
            </div>

            {/* Aktiv */}
            <div style={{ border: `2px solid ${gm}`, borderRadius: '14px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ background: gm, padding: '20px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '12px', right: '12px', background: gl, color: gd, fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '6px' }}>Mest valgt</span>
                <div style={{ fontSize: '10px', color: gl, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Aktiv</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontFamily: serif, fontSize: '38px', color: '#fff' }}>490 kr</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>/ sesong</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>eller 99 kr/mnd</div>
              </div>
              <div style={{ padding: '20px' }}>
                {['Alt i gratis', 'SMS-påminnelse før vakt', 'SMS-purring til ubekreftede', '200 SMS inkludert'].map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: text, padding: '6px 0', display: 'flex', gap: '8px' }}>
                    <span style={{ color: gm }}>✓</span> {f}
                  </div>
                ))}
                {['Loddbok, kiosk, kampanjer'].map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: '#c0c0c0', padding: '6px 0', display: 'flex', gap: '8px' }}>
                    <span>—</span> {f}
                  </div>
                ))}
                <button onClick={() => go('/register')} style={{ width: '100%', marginTop: '16px', padding: '12px', background: gl, color: gd, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: sans }}>Velg Aktiv</button>
              </div>
            </div>

            {/* Premium */}
            <div style={{ border: `0.5px solid ${border}`, borderRadius: '14px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ background: gd, padding: '20px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '12px', right: '12px', background: gl, color: gd, fontSize: '10px', fontWeight: 600, padding: '3px 10px', borderRadius: '6px' }}>★ Mest verdi</span>
                <div style={{ fontSize: '10px', color: gl, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '8px' }}>Premium</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontFamily: serif, fontSize: '38px', color: '#fff' }}>990 kr</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>/ sesong</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>eller 199 kr/mnd</div>
              </div>
              <div style={{ padding: '20px' }}>
                {['Alt i Aktiv (500 SMS inkl.)', 'Digital loddbok — snitt 12 500 kr/salg', 'Vipps-kiosk', 'Salgskampanjer', 'Sponsormodul', '100% til lagets Vipps'].map((f, i) => (
                  <div key={i} style={{ fontSize: '13px', color: text, padding: '6px 0', display: 'flex', gap: '8px' }}>
                    <span style={{ color: gm }}>✓</span> {f}
                  </div>
                ))}
                <button onClick={() => go('/register')} style={{ width: '100%', marginTop: '16px', padding: '12px', background: gl, color: gd, border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: sans }}>Se hva dere kan tjene...</button>
              </div>
            </div>
          </div>

          {/* ROI hint */}
          <div style={{ background: gp, borderRadius: '10px', padding: '12px 16px', marginTop: '24px', fontSize: '13px', color: text, textAlign: 'left', lineHeight: 1.6 }}>
            💡 De fleste lag starter med Aktiv. SMS-purringen alene sparer koordinatoren for 30 minutter per arrangement — og ett loddsalg betaler for 12 sesonger med Premium.
          </div>
        </div>
      </section>

      {/* ========== CTA BANNER ========== */}
      <section style={{ background: gm, padding: '56px 48px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: serif, fontSize: '32px', color: '#fff', margin: '0 0 12px' }}>Klar til å ta tilbake søndagene dine?</h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', margin: '0 0 28px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' }}>Kom i gang gratis i dag. Ingen kredittkort, ingen binding. Bare et verktøy som faktisk hjelper.</p>
        <button onClick={() => go('/register')} style={{ background: '#fff', color: gm, border: 'none', borderRadius: '10px', padding: '14px 34px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: sans, marginBottom: '16px' }}>Start gratis i dag</button>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
          Allerede bruker? <a href="/login" style={{ color: 'rgba(255,255,255,0.65)', textDecoration: 'none' }}>Logg inn her →</a>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer style={{ background: gd, padding: '22px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: serif, fontSize: '17px', color: '#fff' }}>Dugnad<span style={{ color: gl }}>+</span></div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>© 2026 Dugnad+ · Laget for norske idrettslag</div>
      </footer>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
};
