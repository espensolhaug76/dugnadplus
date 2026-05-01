import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Footer } from '../common/Footer';

interface InviteRow {
  id: string;
  team_id: string;
  club_id: string | null;
  invite_type: 'coordinator' | 'club_admin';
  invited_email: string;
  invited_name: string | null;
  invited_by: string;
  expires_at: string;
  status: string;
}

interface ClubInfo {
  name: string;
}

const COLORS = {
  bg: '#faf8f4',
  text: '#1a2e1f',
  secondary: '#4a5e50',
  muted: '#6b7f70',
  border: '#e8e0d0',
  primary: '#2d6a4f',
  accent: '#7ec8a0',
  danger: '#c0392b',
  warningBg: '#fff8e6',
  warningBorder: '#fac775',
};

const FONT_SERIF = '"DM Serif Display", serif';
const FONT_SANS = '"DM Sans", sans-serif';

export const CoordinatorInvitePage: React.FC = () => {
  const [token, setToken] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);
  const [authedEmail, setAuthedEmail] = useState<string>('');
  const [accepting, setAccepting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [acceptedSuccess, setAcceptedSuccess] = useState<{ teamId: string; role: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setErrorMsg('Mangler invitasjonstoken i lenken.');
      setLoading(false);
      return;
    }
    setToken(t);
    void load(t);
  }, []);

  const load = async (t: string) => {
    setLoading(true);
    setErrorMsg('');

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setAuthedUserId(user.id);
      setAuthedEmail(user.email || '');
    }

    const { data, error } = await supabase
      .from('coordinator_invites')
      .select('id, team_id, club_id, invite_type, invited_email, invited_name, invited_by, expires_at, status')
      .eq('token', t)
      .maybeSingle();

    if (error) {
      setErrorMsg('Kunne ikke slå opp invitasjon: ' + error.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setErrorMsg('Invitasjonen finnes ikke. Sjekk at lenken er riktig.');
      setLoading(false);
      return;
    }
    if (data.status !== 'pending') {
      setErrorMsg('Denne invitasjonen er allerede brukt eller avslått.');
      setLoading(false);
      return;
    }
    if (new Date(data.expires_at) < new Date()) {
      setErrorMsg('Invitasjonen er utløpt. Be om en ny.');
      setLoading(false);
      return;
    }

    setInvite(data as InviteRow);

    if (data.club_id) {
      const { data: clubRow } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', data.club_id)
        .maybeSingle();
      if (clubRow) setClub(clubRow as ClubInfo);
    }

    setLoading(false);
  };

  const handleAccept = async () => {
    if (!token || !authedUserId) return;
    setAccepting(true);
    setErrorMsg('');

    const { data, error } = await supabase.rpc('accept_coordinator_invite', { p_token: token });
    setAccepting(false);

    if (error) {
      setErrorMsg('Kunne ikke akseptere: ' + error.message);
      return;
    }

    const result = data as { success: boolean; team_id: string; club_id: string | null; role: string };
    setAcceptedSuccess({ teamId: result.team_id, role: result.role });

    // Lagre klubb i localStorage så coordinator-layout ikke krever
    // ny onboarding for inviterte brukere.
    if (result.club_id && club) {
      try {
        const stored = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
        if (!stored.id) {
          localStorage.setItem('dugnad_club', JSON.stringify({ id: result.club_id, name: club.name }));
        }
      } catch {}
    }

    if (result.role === 'club_admin') {
      window.setTimeout(() => { window.location.href = '/club-admin-dashboard'; }, 1200);
    } else {
      window.setTimeout(() => { window.location.href = '/coordinator-dashboard'; }, 1200);
    }
  };

  const goLogin = () => {
    const back = encodeURIComponent(`/coordinator-invite?token=${token}`);
    window.location.href = `/login?next=${back}`;
  };
  const goRegister = () => {
    const back = encodeURIComponent(`/coordinator-invite?token=${token}`);
    window.location.href = `/register?next=${back}`;
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: FONT_SANS, color: COLORS.text, display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 24px', borderBottom: `0.5px solid ${COLORS.border}`, textAlign: 'center' }}>
        <a href="/" style={{ fontFamily: FONT_SERIF, fontSize: 22, color: COLORS.text, textDecoration: 'none' }}>
          Dugnad<span style={{ color: COLORS.accent }}>+</span>
        </a>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          {loading ? (
            <p style={{ color: COLORS.muted, textAlign: 'center' }}>Laster invitasjon...</p>
          ) : errorMsg ? (
            <div
              style={{
                background: '#fef2f2',
                border: `1px solid ${COLORS.danger}`,
                borderRadius: 12,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <h1 style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: 500, color: COLORS.danger, margin: '0 0 12px' }}>
                Invitasjonen er ikke gyldig
              </h1>
              <p style={{ color: COLORS.secondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
              <a href="/" style={{ display: 'inline-block', marginTop: 16, color: COLORS.primary, fontWeight: 600 }}>
                Tilbake til forsiden
              </a>
            </div>
          ) : acceptedSuccess ? (
            <div
              style={{
                background: '#fff',
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 28,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 56, height: 56, borderRadius: '50%', background: COLORS.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', fontSize: 28, color: '#fff',
                }}
              >
                ✓
              </div>
              <h1 style={{ fontFamily: FONT_SERIF, fontSize: 24, fontWeight: 500, margin: '0 0 8px' }}>
                Velkommen!
              </h1>
              <p style={{ color: COLORS.secondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Du er nå {acceptedSuccess.role === 'club_admin' ? 'klubbansvarlig' : 'koordinator'}. Tar deg til dashboardet...
              </p>
            </div>
          ) : invite ? (
            <div
              style={{
                background: '#fff',
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: 14,
                padding: 28,
              }}
            >
              <h1 style={{ fontFamily: FONT_SERIF, fontSize: 26, fontWeight: 500, margin: '0 0 8px', textAlign: 'center' }}>
                Du er invitert
              </h1>
              <p style={{ textAlign: 'center', color: COLORS.muted, fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
                {invite.invited_name && <span>Hei {invite.invited_name}! </span>}
                Du er invitert som <strong>{invite.invite_type === 'club_admin' ? 'klubbansvarlig' : 'koordinator'}</strong>
                {club ? ` for ${club.name}` : ''}
                {invite.invite_type === 'coordinator' && !invite.team_id.startsWith('club:') ? ` (lag ${invite.team_id})` : ''}
                .
              </p>

              <div
                style={{
                  background: '#f8f8f5',
                  border: `0.5px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: 14,
                  fontSize: 13,
                  color: COLORS.secondary,
                  marginBottom: 20,
                  lineHeight: 1.5,
                }}
              >
                <div><strong>Sendt til:</strong> {invite.invited_email}</div>
                <div style={{ marginTop: 4 }}><strong>Utløper:</strong> {new Date(invite.expires_at).toLocaleString('nb-NO')}</div>
              </div>

              {authedUserId ? (
                <>
                  {authedEmail && authedEmail.toLowerCase() !== invite.invited_email.toLowerCase() && (
                    <div
                      style={{
                        background: COLORS.warningBg,
                        border: `1px solid ${COLORS.warningBorder}`,
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 12,
                        color: '#854f0b',
                        marginBottom: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      Du er innlogget som <strong>{authedEmail}</strong>, men invitasjonen er sendt til <strong>{invite.invited_email}</strong>. Du kan likevel akseptere — rollen blir tilknyttet din innloggede konto.
                    </div>
                  )}

                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    style={{
                      width: '100%',
                      background: COLORS.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '14px 18px',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: accepting ? 'not-allowed' : 'pointer',
                      opacity: accepting ? 0.7 : 1,
                      marginBottom: 10,
                    }}
                  >
                    {accepting ? 'Aksepterer...' : 'Aksepter invitasjon'}
                  </button>

                  <button
                    onClick={() => { window.location.href = '/'; }}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      color: COLORS.muted,
                      border: `0.5px solid ${COLORS.border}`,
                      borderRadius: 10,
                      padding: '12px 18px',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Avslå
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: COLORS.secondary, margin: '0 0 14px', lineHeight: 1.6 }}>
                    Logg inn med eksisterende konto eller registrer ny konto for å akseptere.
                  </p>
                  <button
                    onClick={goLogin}
                    style={{
                      width: '100%',
                      background: COLORS.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '14px 18px',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: 10,
                    }}
                  >
                    Logg inn
                  </button>
                  <button
                    onClick={goRegister}
                    style={{
                      width: '100%',
                      background: '#fff',
                      color: COLORS.primary,
                      border: `1px solid ${COLORS.primary}`,
                      borderRadius: 10,
                      padding: '14px 18px',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Registrer ny konto
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  );
};
