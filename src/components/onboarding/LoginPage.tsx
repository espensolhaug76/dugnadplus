import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const accountDeleted = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('deleted');

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
      const userMeta = data.user.user_metadata;

      // 2. Bestem rolle fra team_members (kanonisk kilde).
      //    Aldri bruk localStorage eller user_metadata som autoritativ
      //    rolle-kilde — de kan inneholde stale data fra en tidligere
      //    sesjon med en annen bruker i samme nettleser.
      const { data: memberships } = await supabase
        .from('team_members')
        .select('role')
        .eq('auth_user_id', data.user.id);

      const roles = (memberships || []).map(m => m.role);
      let role: string;
      if (roles.includes('coordinator')) {
        role = 'coordinator';
      } else if (roles.includes('club_admin')) {
        role = 'club_admin';
      } else if (roles.includes('parent')) {
        role = 'parent';
      } else {
        // Ingen team_members-rad — bruker trenger onboarding
        role = '';
      }

      // 3. Oppdater localStorage med ferske data fra DB-oppslaget,
      //    slik at eventuelle stale verdier fra forrige sesjon overskrives.
      const localUser = {
        id: data.user.id,
        email: data.user.email,
        fullName: userMeta.full_name || data.user.email?.split('@')[0],
        name: userMeta.full_name || data.user.email?.split('@')[0],
        role: role || 'family',
        createdAt: data.user.created_at
      };
      localStorage.setItem('dugnad_user', JSON.stringify(localUser));

      // 4. Gjenopprett klubb/lag fra metadata hvis localStorage mangler
      const existingClub = localStorage.getItem('dugnad_club');
      const existingTeams = localStorage.getItem('dugnad_teams');
      if (userMeta.club && !existingClub) {
        localStorage.setItem('dugnad_club', JSON.stringify(userMeta.club));
      }
      if (userMeta.teams && !existingTeams) {
        localStorage.setItem('dugnad_teams', JSON.stringify(userMeta.teams));
      }

      // 5. Redirect basert på DB-verifisert rolle.
      //    Hvis URL har ?next=... (f.eks. fra invitasjons-flyten),
      //    går vi dit i stedet for default-dashboard.
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      if (next && next.startsWith('/')) {
        window.location.href = next;
        return;
      }

      if (role === 'coordinator') {
        window.location.href = '/coordinator-dashboard';
      } else if (role === 'club_admin') {
        window.location.href = '/club-admin-dashboard';
      } else if (role === 'parent') {
        window.location.href = '/family-dashboard';
      } else {
        window.location.href = '/role-selection';
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
          {accountDeleted && (
            <div style={{ background: '#e8f5ef', border: '1px solid #b7e0c8', color: '#0f6e56', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14, textAlign: 'center' }}>
              Kontoen din er slettet.
            </div>
          )}
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="input"
                  placeholder="Ditt passord"
                  required
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px', color: 'var(--text-secondary)' }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
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