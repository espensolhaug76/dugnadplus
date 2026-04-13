import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { normalizeJoinCode } from '../../utils/joinCode';

interface MatchedChild {
  id: string;
  name: string;
  familyId: string;
  familyName: string;
  code: string;
  subgroup?: string;
}

const COLORS = {
  darkGreen: '#1a3028',
  mediumGreen: '#2d6a4f',
  accent: '#7ec8a0',
  bg: '#faf8f4',
  text: '#1a2e1f',
  secondary: '#4a5e50',
  muted: '#6b7f70',
  border: '#e8e0d0',
  warning: '#854f0b',
};

const FONT_SERIF = '"DM Serif Display", serif';
const FONT_SANS = '"DM Sans", sans-serif';

export const JoinPage: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [codeInput, setCodeInput] = useState('');
  const [matchedChildren, setMatchedChildren] = useState<MatchedChild[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);

  const [parentName, setParentName] = useState('');
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Step 2: add-more inline state
  const [showAddMore, setShowAddMore] = useState(false);
  const [addMoreCode, setAddMoreCode] = useState('');
  const [addMoreError, setAddMoreError] = useState('');
  const [addMoreLooking, setAddMoreLooking] = useState(false);

  const lookupCode = async (code: string, opts?: { isAddMore?: boolean }) => {
    const trimmed = normalizeJoinCode(code);
    if (!trimmed || trimmed.length < 4) {
      const msg = 'Skriv inn en gyldig kode.';
      if (opts?.isAddMore) setAddMoreError(msg); else setLookupError(msg);
      return false;
    }
    if (matchedChildren.some(c => c.code === trimmed)) {
      const msg = 'Denne koden er allerede lagt til.';
      if (opts?.isAddMore) setAddMoreError(msg); else setLookupError(msg);
      return false;
    }

    if (opts?.isAddMore) { setAddMoreLooking(true); setAddMoreError(''); }
    else { setLooking(true); setLookupError(''); }

    const { data, error } = await supabase
      .from('family_members')
      .select('id, name, family_id, subgroup, families(name)')
      .eq('join_code', trimmed)
      .eq('role', 'child')
      .single();

    if (error || !data) {
      const msg = 'Koden ble ikke funnet. Sjekk at du har skrevet riktig.';
      if (opts?.isAddMore) { setAddMoreError(msg); setAddMoreLooking(false); }
      else { setLookupError(msg); setLooking(false); }
      return false;
    }

    setMatchedChildren(prev => [...prev, {
      id: data.id,
      name: data.name,
      familyId: data.family_id,
      familyName: (data as any).families?.name || '',
      code: trimmed,
      subgroup: data.subgroup,
    }]);

    if (opts?.isAddMore) { setAddMoreCode(''); setAddMoreLooking(false); }
    else { setCodeInput(''); setLooking(false); }
    return true;
  };

  const handleStep1Continue = async () => {
    const success = await lookupCode(codeInput);
    if (success) setStep(2);
  };

  const handleStep2Confirm = () => {
    if (!parentName.trim()) return;
    setStep(3);
  };

  const handleSubmit = async () => {
    if (matchedChildren.length === 0) return;
    if (loginMethod === 'phone' && !phone.trim()) return;
    if (loginMethod === 'email' && (!email.trim() || !password.trim())) return;

    setSubmitting(true);
    try {
      const uniqueFamilies = [...new Set(matchedChildren.map(c => c.familyId))];
      for (const familyId of uniqueFamilies) {
        const childrenInFamily = matchedChildren.filter(c => c.familyId === familyId);
        await supabase.from('pending_parents').insert({
          family_id: familyId,
          child_member_id: childrenInFamily[0].id,
          name: parentName.trim(),
          email: loginMethod === 'email' ? email.trim() : null,
          phone: loginMethod === 'phone' ? phone.trim() : null,
          status: 'pending',
          login_method: loginMethod === 'phone' ? 'phone' : 'password',
        });
      }
      setDone(true);
    } catch (err: any) {
      alert('Noe gikk galt: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Shared styles ---
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: COLORS.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: FONT_SANS,
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: 440,
    width: '100%',
  };

  const logoStyle: React.CSSProperties = {
    fontFamily: FONT_SERIF,
    fontSize: 20,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 24,
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: FONT_SERIF,
    fontSize: 22,
    fontWeight: 500,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 0,
  };

  const subStyle: React.CSSProperties = {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 0,
    lineHeight: 1.5,
  };

  const primaryBtnStyle: React.CSSProperties = {
    background: COLORS.mediumGreen,
    color: '#fff',
    width: '100%',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    fontFamily: FONT_SANS,
  };

  const secondaryBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: `0.5px solid ${COLORS.border}`,
    color: COLORS.muted,
    width: '100%',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 10,
    fontFamily: FONT_SANS,
  };

  const inputStyle: React.CSSProperties = {
    background: '#fff',
    border: `0.5px solid ${COLORS.border}`,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: FONT_SANS,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: COLORS.secondary,
    marginBottom: 4,
    display: 'block',
  };

  // --- Progress dots ---
  const renderDots = () => (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 28 }}>
      {[1, 2, 3].map(s => (
        <div
          key={s}
          style={{
            width: s === step ? 24 : 8,
            height: 8,
            borderRadius: s === step ? 4 : 4,
            background: s === step ? COLORS.mediumGreen : COLORS.border,
            transition: 'width 0.2s ease',
          }}
        />
      ))}
    </div>
  );

  const renderLogo = () => (
    <div style={logoStyle}>
      Dugnad<span style={{ color: COLORS.accent }}>+</span>
    </div>
  );

  // --- Done state ---
  if (done) {
    return (
      <div style={pageStyle}>
        <div style={{ ...containerStyle, textAlign: 'center' }}>
          {renderLogo()}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: COLORS.mediumGreen,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28, color: '#fff',
          }}>
            ✓
          </div>
          <h1 style={{ ...titleStyle, fontSize: 22, marginBottom: 8 }}>Registrering mottatt!</h1>
          <p style={{ ...subStyle, marginBottom: 20 }}>
            Koordinator vil godkjenne registreringen din. Du får tilgang så snart den er godkjent.
          </p>
          <div style={{
            padding: 16, background: '#fff', borderRadius: 12,
            border: `0.5px solid ${COLORS.border}`, marginBottom: 24,
          }}>
            {matchedChildren.map(c => (
              <div key={c.code} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                fontSize: 14, color: COLORS.text,
              }}>
                <span style={{ color: COLORS.mediumGreen }}>✓</span>
                {c.name} {c.subgroup && <span style={{ color: COLORS.secondary }}>({c.subgroup})</span>}
              </div>
            ))}
          </div>
          <button
            onClick={() => { window.location.href = '/'; }}
            style={primaryBtnStyle}
          >
            Tilbake til forsiden
          </button>
        </div>
      </div>
    );
  }

  // --- Step 1: Child Code ---
  if (step === 1) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          {renderLogo()}
          {renderDots()}
          <h1 style={titleStyle}>Skriv inn barnekoden</h1>
          <p style={subStyle}>
            Koden finner du på arket fra lagledelsen eller i Spond-meldingen
          </p>

          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value.toUpperCase()); setLookupError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
            placeholder="KIL8583"
            maxLength={10}
            autoFocus
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              textAlign: 'center',
              letterSpacing: 3,
              fontSize: 20,
              padding: 14,
              marginBottom: 6,
            }}
          />
          <p style={{ fontSize: 11, color: COLORS.muted, margin: '0 0 20px', textAlign: 'center' }}>
            Har du barn på flere lag? Du kan legge inn flere koder etterpå
          </p>

          {lookupError && (
            <p style={{ color: COLORS.warning, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              {lookupError}
            </p>
          )}

          <button
            onClick={handleStep1Continue}
            disabled={looking}
            style={{ ...primaryBtnStyle, opacity: looking ? 0.7 : 1 }}
          >
            {looking ? 'Sjekker...' : 'Fortsett'}
          </button>

          <button
            onClick={() => { window.location.href = '/'; }}
            style={secondaryBtnStyle}
          >
            Jeg har ikke kode
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: Confirm Child ---
  if (step === 2) {
    const firstChild = matchedChildren[0];
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          {renderLogo()}
          {renderDots()}
          <h1 style={titleStyle}>Er dette ditt barn?</h1>
          <p style={subStyle}>
            Koden {firstChild.code} er knyttet til dette barnet
          </p>

          {/* Primary child card */}
          <div style={{
            background: '#fff', border: `2px solid ${COLORS.mediumGreen}`, borderRadius: 12,
            padding: 16, display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
            marginBottom: 4,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', background: '#1e3a2f',
              color: '#fff', fontWeight: 600, fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {firstChild.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{firstChild.name}</div>
              <div style={{ fontSize: 12, color: COLORS.secondary }}>
                {firstChild.familyName}{firstChild.subgroup ? ` — ${firstChild.subgroup}` : ''}
              </div>
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: COLORS.mediumGreen,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, position: 'absolute', top: 10, right: 10,
            }}>
              ✓
            </div>
          </div>

          {/* Extra matched children (from add-more) */}
          {matchedChildren.slice(1).map(child => (
            <div key={child.code} style={{
              background: '#fff', border: `0.5px solid ${COLORS.border}`, borderRadius: 10,
              padding: 12, display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', background: '#1e3a2f',
                color: '#fff', fontWeight: 600, fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {child.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{child.name}</div>
                <div style={{ fontSize: 11, color: COLORS.secondary }}>
                  {child.familyName}{child.subgroup ? ` — ${child.subgroup}` : ''}
                </div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: COLORS.mediumGreen,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                ✓
              </div>
            </div>
          ))}

          {/* Add more section */}
          <p style={{ fontSize: 13, color: COLORS.secondary, marginTop: 20, marginBottom: 8 }}>
            Har du flere barn i klubben?
          </p>

          {!showAddMore ? (
            <div
              onClick={() => setShowAddMore(true)}
              style={{
                background: '#fff', border: `0.5px dashed ${COLORS.border}`, borderRadius: 12,
                padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: '#fff8e6',
                color: COLORS.warning, fontSize: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                +
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>Legg til en kode til</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>For søsken på andre lag</div>
              </div>
            </div>
          ) : (
            <div style={{
              background: '#fff', border: `0.5px solid ${COLORS.border}`, borderRadius: 12,
              padding: 14,
            }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={addMoreCode}
                  onChange={e => { setAddMoreCode(e.target.value.toUpperCase()); setAddMoreError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') lookupCode(addMoreCode, { isAddMore: true }); }}
                  placeholder="KIL8583"
                  maxLength={10}
                  autoFocus
                  style={{
                    ...inputStyle,
                    fontFamily: 'monospace',
                    textAlign: 'center',
                    letterSpacing: 3,
                    fontSize: 16,
                    flex: 1,
                  }}
                />
                <button
                  onClick={() => lookupCode(addMoreCode, { isAddMore: true })}
                  disabled={addMoreLooking}
                  style={{
                    ...primaryBtnStyle,
                    width: 'auto',
                    padding: '10px 18px',
                    fontSize: 13,
                  }}
                >
                  {addMoreLooking ? '...' : 'Legg til'}
                </button>
              </div>
              {addMoreError && (
                <p style={{ color: COLORS.warning, fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                  {addMoreError}
                </p>
              )}
            </div>
          )}

          {/* Parent name input */}
          <div style={{ marginTop: 24 }}>
            <label style={labelStyle}>Ditt navn</label>
            <input
              value={parentName}
              onChange={e => setParentName(e.target.value)}
              placeholder="Ola Nordmann"
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleStep2Confirm}
            disabled={!parentName.trim()}
            style={{
              ...primaryBtnStyle,
              marginTop: 20,
              opacity: !parentName.trim() ? 0.6 : 1,
            }}
          >
            Ja, dette er mitt barn
          </button>

          <button
            onClick={() => {
              setMatchedChildren([]);
              setCodeInput('');
              setLookupError('');
              setShowAddMore(false);
              setAddMoreCode('');
              setAddMoreError('');
              setStep(1);
            }}
            style={secondaryBtnStyle}
          >
            Dette er ikke mitt barn
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: Choose Login ---
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {renderLogo()}
        {renderDots()}
        <h1 style={titleStyle}>Siste steg — velg innlogging</h1>
        <p style={subStyle}>
          Hvordan vil du logge inn neste gang?
        </p>

        {/* Choice cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div
            onClick={() => setLoginMethod('phone')}
            style={{
              border: loginMethod === 'phone' ? `2px solid ${COLORS.mediumGreen}` : `0.5px solid ${COLORS.border}`,
              borderRadius: 12, padding: 14, cursor: 'pointer', background: '#fff',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>
              📱 Engangskode på SMS
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              Vi sender en kode til telefonen — ingen passord å huske
            </div>
          </div>
          <div
            onClick={() => setLoginMethod('email')}
            style={{
              border: loginMethod === 'email' ? `2px solid ${COLORS.mediumGreen}` : `0.5px solid ${COLORS.border}`,
              borderRadius: 12, padding: 14, cursor: 'pointer', background: '#fff',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text, marginBottom: 2 }}>
              📧 E-post og passord
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              Tradisjonell innlogging — du velger passordet selv
            </div>
          </div>
        </div>

        {/* Conditional inputs */}
        {loginMethod === 'phone' && (
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Telefonnummer</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="99 88 77 66"
              style={inputStyle}
            />
          </div>
        )}

        {loginMethod === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>E-postadresse</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ola@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Passord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Velg et passord"
                style={inputStyle}
              />
            </div>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ ...primaryBtnStyle, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Registrerer...' : 'Fullfør registrering'}
        </button>

        <p style={{ fontSize: 11, color: COLORS.muted, textAlign: 'center', marginTop: 12 }}>
          Du kan endre dette i innstillingene senere
        </p>
      </div>
    </div>
  );
};
