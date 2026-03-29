import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // 1. Logg inn med Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setError('Feil e-post eller passord.');
      setLoading(false);
      return;
    }

    if (data.user) {
      // 2. Hent mer info om brukeren (metadata lagret ved registrering)
      const userMeta = data.user.user_metadata;
      
      // 3. Oppdater localStorage (for kompatibilitet)
      const localUser = {
        id: data.user.id,
        email: data.user.email,
        fullName: userMeta.full_name,
        role: userMeta.role || 'family', // Default rolle
        createdAt: data.user.created_at
      };
      localStorage.setItem('dugnad_user', JSON.stringify(localUser));

      // 4. Send til riktig side basert på rolle
      if (localUser.role === 'coordinator') {
        window.location.href = '/coordinator-dashboard';
      } else if (localUser.role === 'substitute') {
        window.location.href = '/substitute-marketplace';
      } else {
        // Default for familier
        window.location.href = '/family-dashboard';
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--primary-color)', marginBottom: '8px' }}>
            Dugnad+
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>Logg inn på din konto</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          {error && <p style={{color: 'red', marginBottom: '16px', textAlign: 'center'}}>{error}</p>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="input-label">E-post</label>
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
              <label className="input-label">Passord</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="input"
                placeholder="Ditt passord"
                required
              />
            </div>

            <div style={{ textAlign: 'right' }}>
              <a href="#" style={{ color: 'var(--primary-color)', fontSize: '14px', fontWeight: '500' }}>
                Glemt passord?
              </a>
            </div>

            <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
              {loading ? 'Logger inn...' : 'Logg inn'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Har du ikke en konto?{' '}
              <a href="/register" style={{ color: 'var(--primary-color)', fontWeight: '600' }}>
                Registrer deg
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};