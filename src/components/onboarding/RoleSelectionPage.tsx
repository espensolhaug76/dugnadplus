import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

type Role = 'coordinator' | 'family' | 'substitute' | null;

export const RoleSelectionPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContinue = async () => {
    if (!selectedRole) {
      alert('Vennligst velg en rolle');
      return;
    }

    setIsSubmitting(true);

    // Update user with role in localStorage (beholder eksisterende logikk for komp.)
    const storedUser = localStorage.getItem('dugnad_user');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      user.role = selectedRole;
      localStorage.setItem('dugnad_user', JSON.stringify(user));

      // --- SUPABASE INTEGRASJON: OPPRETT NY FAMILIE ---
      // Hvis brukeren velger "Familie" (og ikke har trykket på "Har kode"-knappen),
      // oppretter vi en ny, tom familieprofil.
      if (selectedRole === 'family' && user.id) {
        try {
          // 1. Generer et familienavn (f.eks "Familien Hansen")
          const lastName = user.fullName ? user.fullName.split(' ').pop() : 'Ukjent';
          const familyName = `Familien ${lastName}`;

          // 2. Opprett rad i 'families' tabellen
          const { error: famError } = await supabase
            .from('families')
            .insert({
              id: user.id,
              name: familyName,
              contact_email: user.email,
              contact_phone: user.phone || ''
            });

          if (famError) {
             // Ignorer unique_violation (familien finnes allerede), ellers vis feil
             if (famError.code !== '23505') { 
                 console.error('Feil ved opprettelse av familie:', famError);
                 alert('Noe gikk galt ved opprettelse av familieprofilen. ' + famError.message);
                 setIsSubmitting(false);
                 return;
             }
          }

          // 3. Opprett første rad i 'family_members' (Forelderen selv)
          const { data: existingMember } = await supabase
            .from('family_members')
            .select('id')
            .eq('family_id', user.id)
            .eq('role', 'parent')
            .eq('name', user.fullName)
            .maybeSingle();

          if (!existingMember) {
              await supabase
                .from('family_members')
                .insert({
                  family_id: user.id,
                  name: user.fullName,
                  role: 'parent',
                  email: user.email,
                  phone: user.phone
                });
          }

        } catch (error: any) {
          console.error('Kritisk feil:', error);
          alert('En feil oppstod. Prøv igjen.');
          setIsSubmitting(false);
          return;
        }
      }
      // --- SLUTT SUPABASE ---
    }

    setIsSubmitting(false);

    // Route based on role
    if (selectedRole === 'coordinator') {
      window.location.href = '/create-club';
    } else if (selectedRole === 'family') {
      window.location.href = '/family-dashboard'; // Går direkte til dashbord nå som vi lagrer i DB
    } else if (selectedRole === 'substitute') {
      window.location.href = '/substitute-marketplace';
    }
  };

  const roles = [
    {
      id: 'coordinator' as Role,
      icon: '👔',
      title: 'Jeg starter ny klubb/lag',
      description: 'Jeg er dugnadsansvarlig eller koordinator',
      badge: 'Koordinator',
    },
    {
      id: 'family' as Role,
      icon: '👨‍👩‍👧‍👦',
      title: 'Jeg er forelder',
      description: 'Jeg skal registrere meg for å ta vakter',
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
                  <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{role.description}</p>
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

        {/* --- NY SEKSJON: CLAIM FAMILY --- */}
        <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
                Har du fått en Dugnads-kode?
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Hvis du har fått en kode av koordinator (f.eks. på Spond), kan du koble deg til barnet ditt her.
            </p>
            <button 
                onClick={() => window.location.href = '/claim-family'}
                className="btn btn-secondary"
                style={{ background: 'white', border: '2px solid #e2e8f0' }}
            >
                🔗 Jeg har en kode
            </button>
        </div>

      </div>
    </div>
  );
};