import React, { useState } from 'react';

export const ClubCreationPage: React.FC = () => {
  const [formData, setFormData] = useState({
    clubName: '',
    sport: 'football',
    logoUrl: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clubName) {
      alert('Vennligst fyll inn klubbnavn');
      return;
    }

    // Save club data
    const club = {
      id: Date.now().toString(),
      name: formData.clubName,
      sport: formData.sport,
      logoUrl: formData.logoUrl,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem('dugnad_club', JSON.stringify(club));

    // Go to team setup
    window.location.href = '/setup-team';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Opprett din klubb
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            La oss komme i gang med grunnleggende informasjon
          </p>
        </div>

        {/* Form Card */}
        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Club Name */}
            <div>
              <label className="input-label">Klubbnavn *</label>
              <input
                type="text"
                name="clubName"
                value={formData.clubName}
                onChange={handleChange}
                className="input"
                placeholder="F.eks. Kongsvinger IL"
                required
              />
            </div>

            {/* Primary Sport */}
            <div>
              <label className="input-label">Primær idrett</label>
              <select name="sport" value={formData.sport} onChange={handleChange} className="input">
                <option value="football">⚽ Fotball</option>
                <option value="handball">🤾 Håndball</option>
                <option value="dance">💃 Dans</option>
                <option value="ishockey">🏒 Ishockey</option>
                <option value="volleyball">🏐 Volleyball</option>
                <option value="basketball">🏀 Basketball</option>
                <option value="other">Annet</option>
              </select>
            </div>

            {/* Logo URL (Optional) */}
            <div>
              <label className="input-label">Logo URL (valgfritt)</label>
              <input
                type="url"
                name="logoUrl"
                value={formData.logoUrl}
                onChange={handleChange}
                className="input"
                placeholder="https://example.com/logo.png"
              />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Du kan laste opp logo senere
              </p>
            </div>

            {/* Submit Button */}
            <button type="submit" className="btn btn-primary btn-large" style={{ marginTop: '8px' }}>
              Neste: Opprett lag
            </button>
          </form>
        </div>

        {/* Progress Indicator */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Steg 1 av 2
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            <div style={{ width: '40px', height: '4px', background: 'var(--primary-color)', borderRadius: '2px' }} />
            <div style={{ width: '40px', height: '4px', background: 'var(--border-color)', borderRadius: '2px' }} />
          </div>
        </div>
      </div>
    </div>
  );
};