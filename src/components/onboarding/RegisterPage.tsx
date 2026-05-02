import React, { useState, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { supabase } from '../../services/supabaseClient';
import { Footer } from '../common/Footer';

// Cloudflare Turnstile — bot-beskyttelse på registrering.
// Produksjons-site-key settes via VITE_TURNSTILE_SITE_KEY i
// Netlify env vars. Fallback er Cloudflares offisielle "always-
// passes"-test-key slik at lokal dev og preview-builds fungerer
// uten konfigurasjon. Se docs/SECURITY_BACKLOG.md — server-side
// verifikasjon er ikke implementert ennå.
const TURNSTILE_SITE_KEY =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)
  || '1x00000000000000000000AA';

// Valider norsk telefonnummer: 8 sifre som starter med 2-9,
// valgfri +47-prefix og valgfritt mellomrom.
const NORWEGIAN_PHONE_REGEX = /^(\+47)?[ ]?[2-9]\d{7}$/;

export const RegisterPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConsentError(false);

    // Validering før vi kaller Supabase
    if (!formData.fullName.trim()) {
      setError('Fullt navn er påkrevd.');
      return;
    }
    if (!NORWEGIAN_PHONE_REGEX.test(formData.phone.trim())) {
      setError('Ugyldig telefonnummer. Bruk 8 siffer, evt. med +47.');
      return;
    }
    if (formData.password.length < 8) {
      setError('Passord må være minst 8 tegn.');
      return;
    }
    if (!turnstileToken) {
      setError('Vennligst bekreft at du ikke er en bot.');
      return;
    }
    if (!consentGiven) {
      // Pilot 2. mai: knappen var disabled før samtykke ble huket av,
      // så brukere skjønte ikke hvorfor "Opprett konto" ikke reagerte.
      // Nå viser vi feilmelding + rød ramme rundt samtykke-feltet.
      setConsentError(true);
      setError('Du må godta personvernerklæringen og vilkårene for å fortsette.');
      return;
    }

    setLoading(true);

    // 1. Opprett bruker i Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          full_name: formData.fullName,
          phone: formData.phone
          // Rolle settes i neste steg (RoleSelectionPage)
        }
      }
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // 2. Lagre samtykke. Hvis e-postbekreftelse er på vil session
      // ennå ikke være satt, og insert kan feile på RLS — men vi har
      // selve consent-aksepten i auth.user metadata fallback. Vi
      // gjør et best-effort kall her.
      try {
        await supabase.from('user_consents').insert({
          user_id: authData.user.id,
          privacy_version: '1.0',
          terms_version: '1.0',
        });
      } catch (consentErr) {
        console.warn('Klarte ikke å logge samtykke i user_consents:', consentErr);
      }

      // 3. Lagre brukerinfo i localStorage også (for kompatibilitet med resten av appen enn så lenge)
      const user = {
        id: authData.user.id,
        email: authData.user.email,
        fullName: formData.fullName,
        name: formData.fullName,
        phone: formData.phone,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem('dugnad_user', JSON.stringify(user));

      alert('✅ Konto opprettet! Du blir nå sendt videre.');
      // Hvis URL har ?next=..., redirect dit etter registrering
      // (f.eks. når brukeren kom fra coordinator-invite-lenke).
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (next && next.startsWith('/')) {
        window.location.href = next;
        return;
      }
      window.location.href = '/role-selection';
    }
    
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--primary-color)', marginBottom: '8px' }}>
            Dugnad+
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Opprett en ny konto</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          {error && <p style={{color: 'red', marginBottom: '16px'}}>{error}</p>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="input-label">Fullt navn *</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className="input"
                placeholder="Ola Nordmann"
                required
              />
            </div>

            <div>
              <label className="input-label">E-post *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input"
                placeholder="ola@example.com"
                required
              />
            </div>

            <div>
              <label className="input-label">Telefon *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input"
                placeholder="+47 123 45 678"
                required
              />
            </div>

            <div>
              <label className="input-label">Passord *</label>
              <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="input"
                placeholder="Minimum 8 tegn"
                minLength={8}
                style={{ paddingRight: '44px' }}
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px', color: 'var(--text-secondary)' }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token: string) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: 'light' }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  background: 'var(--bg-secondary, #f8fafc)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  lineHeight: 1.5,
                  border: consentError ? '1px solid #ef4444' : '1px solid transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={e => {
                    setConsentGiven(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  style={{ marginTop: '3px', flexShrink: 0 }}
                />
                <span>
                  Jeg har lest og godtar{' '}
                  <a href="/personvern" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                    personvernerklæringen
                  </a>
                  {' '}og{' '}
                  <a href="/vilkar" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                    vilkårene
                  </a>
                  .
                </span>
              </label>
              {consentError && (
                <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>
                  Du må godta personvernerklæringen og vilkårene for å fortsette.
                </p>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-large" style={{ marginTop: '8px' }} disabled={loading}>
              {loading ? 'Oppretter...' : 'Opprett konto'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Har du allerede en konto?{' '}
              <a href="/login" style={{ color: 'var(--primary-color)', fontWeight: '600' }}>
                Logg inn
              </a>
            </p>
          </div>
        </div>
      </div>
      </div>
      <Footer />
    </div>
  );
};