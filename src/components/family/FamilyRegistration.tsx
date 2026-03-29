import React, { useState, useEffect } from 'react';

export const FamilyRegistration: React.FC = () => {
  const [family, setFamily] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Get token from URL
    const pathParts = window.location.pathname.split('/');
    const token = pathParts[pathParts.length - 1];

    // Find family by token
    const families = JSON.parse(localStorage.getItem('dugnad_families') || '[]');
    const foundFamily = families.find((f: any) => f.registrationToken === token);

    if (foundFamily) {
      setFamily(foundFamily);
      setEmail(foundFamily.email || '');
      setPhone(foundFamily.phone || '');
    }
    setLoading(false);
  }, []);

  const handleSubmit = () => {
    if (!email || !phone) {
      alert('Vennligst fyll ut både e-post og telefon');
      return;
    }

    // Update family with contact info
    const families = JSON.parse(localStorage.getItem('dugnad_families') || '[]');
    const updated = families.map((f: any) => {
      if (f.id === family.id) {
        return {
          ...f,
          email,
          phone,
          status: 'completed',
          completedAt: new Date().toISOString()
        };
      }
      return f;
    });

    localStorage.setItem('dugnad_families', JSON.stringify(updated));
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Laster...</p>
      </div>
    );
  }

  if (!family) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card" style={{ padding: '48px', textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>❌</div>
          <h2 style={{ marginBottom: '8px' }}>Ugyldig link</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Denne registreringslinken er ugyldig eller utløpt.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="card" style={{ padding: '48px', textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <h2 style={{ marginBottom: '8px' }}>Takk for registreringen!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Din familie er nå registrert i Dugnad+ systemet. Du vil motta informasjon om dugnadsvakter på e-post.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="btn btn-primary"
          >
            Gå til forsiden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '40px 20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div className="card" style={{ padding: '40px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
            Familieregistrering
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
            Bekreft din families informasjon og legg til kontaktdetaljer
          </p>

          {/* Family info */}
          <div style={{ marginBottom: '32px', padding: '20px', background: 'var(--background)', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
              📍 Familie
            </h3>
            <p style={{ marginBottom: '8px' }}><strong>Foresatte:</strong> {family.parents.join(', ')}</p>
            <p style={{ marginBottom: '8px' }}><strong>Adresse:</strong> {family.address}, {family.postalCode} {family.city}</p>
            <p><strong>Spillere:</strong> {family.players.map((p: any) => p.name).join(', ')}</p>
          </div>

          {/* Contact form */}
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">E-postadresse *</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="din@epost.no"
            />
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label className="input-label">Telefonnummer *</label>
            <input
              type="tel"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+47 123 45 678"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            style={{ width: '100%', padding: '16px', fontSize: '16px' }}
          >
            ✓ Bekreft registrering
          </button>
        </div>
      </div>
    </div>
  );
};
