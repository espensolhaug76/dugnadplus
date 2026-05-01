import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

type Role = 'coordinator' | 'family' | 'substitute' | null;
type Phase = 'role' | 'family-code-choice';

export const RoleSelectionPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [phase, setPhase] = useState<Phase>('role');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Persist valgt rolle til localStorage + auth-metadata.
  // Brukes av alle tre rolle-utfall og av begge family-valgene.
  const persistRole = async (role: Exclude<Role, null>) => {
    const storedUser = localStorage.getItem('dugnad_user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      user.role = role;
      localStorage.setItem('dugnad_user', JSON.stringify(user));
      try {
        await supabase.auth.updateUser({ data: { role } });
      } catch {}
    }
  };

  const handleContinue = async () => {
    if (!selectedRole) {
      alert('Vennligst velg en rolle');
      return;
    }

    setIsSubmitting(true);
    await persistRole(selectedRole);

    if (selectedRole === 'coordinator') {
      window.location.href = '/create-club';
      return;
    }
    if (selectedRole === 'substitute') {
      window.location.href = '/substitute-marketplace';
      return;
    }
    if (selectedRole === 'family') {
      // Gå til code-choice fase i samme komponent. Vi oppretter
      // IKKE families-raden ennå — det skjer bare hvis brukeren
      // eksplisitt velger "Nei, opprett ny familie" nedenfor.
      setPhase('family-code-choice');
      setIsSubmitting(false);
      return;
    }
  };

  // Bruker har en kode fra koordinator -> send til /claim-family.
  // ClaimFamilyPage oppretter family_members parent-raden inne i
  // den eksisterende familien via join_code-flyten. Vi oppretter
  // aldri families-rader fra denne komponenten lenger — det er
  // koordinator sitt ansvar. Brukere uten kode må henvises til
  // koordinator.
  const handleHasCode = () => {
    window.location.href = '/claim-family';
  };

  const roles = [
    {
      id: 'coordinator' as Role,
      icon: '👔',
      title: 'Jeg starter ny klubb/lag',
      description: 'Jeg er dugnadsansvarlig eller skal sette opp ny klubb',
      badge: 'Koordinator',
    },
    {
      id: 'family' as Role,
      icon: '👨‍👩‍👧‍👦',
      title: 'Jeg er forelder',
      description: '',
      badge: 'Familie',
    },
    {
      id: 'substitute' as Role,
      icon: '💼',
      title: 'Jeg vil jobbe som vikar',
      description: 'Jeg vil ta vikarvakter mot betaling',
      badge: 'Vikar',
    },
  ];

  // Fase 2 — code-choice etter "Jeg er forelder". Rendres i samme
  // komponent, ikke som egen rute, slik at brukeren ikke mister
  // kontekst. "Ja, jeg har en kode" går til /claim-family, "Nei"
  // oppretter en ny familie og går til /family-dashboard.
  if (phase === 'family-code-choice') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', paddingTop: '80px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Har du fått en kode fra koordinator?
            </h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
              Hvis koordinator allerede har importert familien din, har du fått en kode (f.eks. KIL8583) via Spond, SMS eller e-post.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
            <button
              onClick={handleHasCode}
              className="btn btn-primary btn-large"
              style={{ width: '100%', padding: '18px', fontSize: '16px', fontWeight: 600 }}
              disabled={isSubmitting}
            >
              ✓ Ja, jeg har en kode
            </button>
          </div>

          {/* Hjelpetekst for brukere uten kode. Vi oppretter ikke
              families-rader fra denne komponenten lenger — alle
              familier skal eksistere i DB fra koordinator-import
              før foreldre kobler seg til. */}
          <div style={{ padding: '20px', background: '#fff8e6', border: '1px solid #fac775', borderRadius: '12px', marginBottom: '20px' }}>
            <p style={{ fontSize: '14px', color: '#854f0b', margin: '0 0 8px', fontWeight: 600 }}>
              Har du ikke fått en kode?
            </p>
            <p style={{ fontSize: '13px', color: '#6b5017', margin: 0, lineHeight: 1.55 }}>
              Spør koordinatoren i klubben din — de sender ut en kode per barn.{' '}
              Hvis du skal koordinere et lag selv, kan du{' '}
              <button
                onClick={() => setPhase('role')}
                style={{ background: 'none', border: 'none', padding: 0, color: '#854f0b', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                gå tilbake og velge «Jeg starter ny klubb/lag»
              </button>
              .
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => { setPhase('role'); }}
              className="btn"
              style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}
              disabled={isSubmitting}
            >
              ← Tilbake
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fase 1 — rolle-valg (default).
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Hva får deg hit?
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
            Velg rollen som passer deg best
          </p>
        </div>

        {/* Role Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className="card"
              style={{
                padding: '24px',
                cursor: 'pointer',
                border: selectedRole === role.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                transition: 'all 0.2s',
                background: selectedRole === role.id ? 'rgba(22, 168, 184, 0.05)' : 'white',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: selectedRole === role.id ? 'var(--primary-color)' : 'var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {selectedRole === role.id && (
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: 'var(--primary-color)',
                      }}
                    />
                  )}
                </div>

                <div style={{ fontSize: '48px', flexShrink: 0 }}>{role.icon}</div>

                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>
                    {role.title}
                  </h3>
                  {role.description && (
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{role.description}</p>
                  )}
                </div>

                <div
                  className="badge"
                  style={{
                    background: selectedRole === role.id ? 'var(--primary-color)' : 'var(--background)',
                    color: selectedRole === role.id ? 'white' : 'var(--text-secondary)',
                    padding: '6px 16px',
                    fontSize: '13px',
                  }}
                >
                  {role.badge}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          className="btn btn-primary btn-large"
          style={{ width: '100%' }}
          disabled={!selectedRole || isSubmitting}
        >
          {isSubmitting ? 'Lagrer...' : 'Fortsett'}
        </button>

        {/* Den gamle "Har du fått en Dugnads-kode?"-seksjonen er
            fjernet. Funksjonen er flyttet inn i "Jeg er forelder"-
            flowen som en inline code-choice-fase (se phase ===
            'family-code-choice' over). */}
      </div>
    </div>
  );
};