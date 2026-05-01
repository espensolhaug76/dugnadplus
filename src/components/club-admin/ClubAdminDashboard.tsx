import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Footer } from '../common/Footer';

interface ClubInfo {
  id: string;
  name: string;
  county: string | null;
  municipality: string | null;
  sport_primary: string | null;
  logo_url: string | null;
}

interface TeamRow {
  team_id: string;
  team_name: string;
  family_count: number;
  coordinator_count: number;
}

interface RoleChange {
  id: string;
  team_id: string;
  action: string;
  role: string;
  created_at: string;
  notes: string | null;
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

export const ClubAdminDashboard: React.FC = () => {
  const [authGate, setAuthGate] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [coordinatorTotal, setCoordinatorTotal] = useState(0);
  const [familyTotal, setFamilyTotal] = useState(0);
  const [roleChanges, setRoleChanges] = useState<RoleChange[]>([]);
  const [hasCoordinatorRole, setHasCoordinatorRole] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [showInviteModal, setShowInviteModal] = useState<'coordinator' | 'club_admin' | null>(null);
  const [inviteTeamId, setInviteTeamId] = useState<string>('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setErrorMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    // Sjekk at brukeren har club_admin-rolle
    const { data: memberships } = await supabase
      .from('team_members')
      .select('team_id, club_id, role')
      .eq('auth_user_id', user.id);

    const adminRow = (memberships || []).find(m => m.role === 'club_admin');
    if (!adminRow || !adminRow.club_id) {
      setAuthGate('denied');
      return;
    }
    setAuthGate('allowed');
    setHasCoordinatorRole((memberships || []).some(m => m.role === 'coordinator'));

    const clubId = adminRow.club_id;

    const [{ data: clubData }, { data: clubMembers }, { data: roleChangesData }] = await Promise.all([
      supabase.from('clubs').select('id, name, county, municipality, sport_primary, logo_url').eq('id', clubId).maybeSingle(),
      supabase.from('team_members').select('team_id, role, auth_user_id').eq('club_id', clubId),
      supabase.from('role_changes').select('id, team_id, action, role, created_at, notes').eq('club_id', clubId).order('created_at', { ascending: false }).limit(20),
    ]);

    if (clubData) setClub(clubData as ClubInfo);

    // Aggreger per team_id, men hopp over syntetiske 'club:'-rader
    const teamMap = new Map<string, { coordinators: Set<string> }>();
    let coordTotal = 0;
    (clubMembers || []).forEach(m => {
      if (m.team_id?.startsWith('club:')) return;
      if (!teamMap.has(m.team_id)) teamMap.set(m.team_id, { coordinators: new Set() });
      if (m.role === 'coordinator' || m.role === 'club_admin') {
        teamMap.get(m.team_id)!.coordinators.add(m.auth_user_id);
        coordTotal += 1;
      }
    });
    setCoordinatorTotal(coordTotal);

    // Hent familier per team_id (kun tellinger, ingen navn)
    const teamIds = Array.from(teamMap.keys());
    const familyCounts: Record<string, number> = {};
    let famTotal = 0;
    if (teamIds.length > 0) {
      const { data: famData } = await supabase
        .from('families')
        .select('id, team_id')
        .in('team_id', teamIds);
      (famData || []).forEach(f => {
        familyCounts[f.team_id] = (familyCounts[f.team_id] || 0) + 1;
        famTotal += 1;
      });
    }
    setFamilyTotal(famTotal);

    // Slå opp lagnavn fra localStorage hvis vi finner det (kosmetisk fallback)
    const localTeams = (() => { try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; } })();

    const rows: TeamRow[] = teamIds.map(tid => {
      const localMatch = localTeams.find((t: any) => t.id === tid);
      return {
        team_id: tid,
        team_name: localMatch?.name || tid,
        family_count: familyCounts[tid] || 0,
        coordinator_count: teamMap.get(tid)!.coordinators.size,
      };
    });
    setTeamRows(rows);

    setRoleChanges((roleChangesData || []) as RoleChange[]);
  };

  const buildInviteUrl = (token: string) => `${window.location.origin}/coordinator-invite?token=${token}`;

  const handleSendInvite = async () => {
    if (!club || !showInviteModal) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      alert('Ugyldig e-postadresse.');
      return;
    }
    if (showInviteModal === 'coordinator' && !inviteTeamId) {
      alert('Velg et lag.');
      return;
    }

    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const teamIdForInsert = showInviteModal === 'club_admin'
      ? `club:${club.id}`
      : inviteTeamId;

    const { data: invite, error } = await supabase
      .from('coordinator_invites')
      .insert({
        team_id: teamIdForInsert,
        club_id: club.id,
        invite_type: showInviteModal,
        invited_by: user.id,
        invited_email: inviteEmail.trim(),
        invited_name: inviteName.trim() || null,
      })
      .select('token')
      .single();

    setSubmitting(false);
    if (error || !invite) {
      alert('Kunne ikke opprette invitasjon: ' + (error?.message || 'ukjent feil'));
      return;
    }
    setCreatedInviteUrl(buildInviteUrl(invite.token));
    void load();
  };

  const closeModal = () => {
    setShowInviteModal(null);
    setInviteEmail('');
    setInviteName('');
    setInviteTeamId('');
    setCreatedInviteUrl(null);
  };

  if (authGate === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontFamily: FONT_SANS }}>
        Laster...
      </div>
    );
  }
  if (authGate === 'denied') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: COLORS.muted, fontFamily: FONT_SANS, padding: 24 }}>
        <p>Du har ikke klubbansvarlig-rolle.</p>
        <a href="/" style={{ color: COLORS.primary, fontWeight: 600 }}>Tilbake til forsiden</a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: FONT_SANS, color: COLORS.text }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 48px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          {club?.logo_url && (
            <img src={club.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
          )}
          <div>
            <h1 style={{ fontFamily: FONT_SERIF, fontSize: 28, fontWeight: 500, margin: '0 0 4px' }}>
              {club?.name || 'Klubb'}
            </h1>
            <div style={{ fontSize: 13, color: COLORS.muted }}>
              {club?.municipality}, {club?.county} · Klubbansvarlig
            </div>
          </div>
        </div>

        {hasCoordinatorRole && (
          <div style={{ marginBottom: 20, padding: 12, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: COLORS.secondary }}>
              Du er også koordinator for et lag.
            </span>
            <button
              onClick={() => { window.location.href = '/coordinator-dashboard'; }}
              style={{ background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Bytt til koordinator-visning
            </button>
          </div>
        )}

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: `1px solid ${COLORS.danger}`, borderRadius: 8, padding: 12, marginBottom: 20, color: COLORS.danger, fontSize: 14 }}>
            {errorMsg}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Lag" value={teamRows.length} />
          <StatCard label="Koordinatorer" value={coordinatorTotal} />
          <StatCard label="Familier" value={familyTotal} />
        </div>

        {/* Lag-liste */}
        <section style={{ background: '#fff', border: `0.5px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: 0 }}>
              Lag i klubben ({teamRows.length})
            </h2>
            <button
              onClick={() => { window.location.href = '/setup-team'; }}
              style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              + Opprett nytt lag
            </button>
          </div>

          {teamRows.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>Ingen lag registrert ennå.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {teamRows.map(t => (
                <div
                  key={t.team_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: '#f8f8f5',
                    border: `0.5px solid ${COLORS.border}`,
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.team_name}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      {t.family_count} {t.family_count === 1 ? 'familie' : 'familier'} · {t.coordinator_count} {t.coordinator_count === 1 ? 'koordinator' : 'koordinatorer'}
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowInviteModal('coordinator'); setInviteTeamId(t.team_id); }}
                    style={{ background: 'transparent', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Inviter koordinator
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Inviter-knapper */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setShowInviteModal('club_admin')}
            style={{ background: '#fff', color: COLORS.primary, border: `1px solid ${COLORS.primary}`, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Inviter ny klubbansvarlig
          </button>
        </div>

        {/* Audit-logg */}
        <section style={{ background: '#fff', border: `0.5px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: '0 0 12px' }}>
            Aktivitetslogg
          </h2>
          {roleChanges.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>Ingen rolle-endringer registrert ennå.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleChanges.map(rc => (
                <li
                  key={rc.id}
                  style={{
                    fontSize: 13,
                    color: COLORS.secondary,
                    padding: '8px 10px',
                    background: '#f8f8f5',
                    borderRadius: 6,
                  }}
                >
                  <span style={{ fontWeight: 600, color: COLORS.text }}>{actionLabel(rc.action, rc.role)}</span>
                  {' — '}
                  <span style={{ color: COLORS.muted }}>
                    {rc.team_id.startsWith('club:') ? 'Klubbnivå' : `Lag ${rc.team_id}`}
                    {' · '}
                    {new Date(rc.created_at).toLocaleString('nb-NO')}
                  </span>
                  {rc.notes && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{rc.notes}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Invite-modal */}
      {showInviteModal && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              fontFamily: FONT_SANS,
            }}
          >
            <h3 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500, margin: '0 0 12px' }}>
              {showInviteModal === 'club_admin' ? 'Inviter ny klubbansvarlig' : 'Inviter koordinator'}
            </h3>

            {createdInviteUrl ? (
              <>
                <p style={{ fontSize: 13, color: COLORS.secondary, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Invitasjon opprettet. Send denne lenken til mottakeren. Lenken er gyldig i 7 dager.
                </p>
                <div style={{ background: '#f8f8f5', border: `0.5px solid ${COLORS.border}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 12 }}>
                  {createdInviteUrl}
                </div>
                <button
                  onClick={() => { void navigator.clipboard.writeText(createdInviteUrl); alert('Lenke kopiert'); }}
                  style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginRight: 8 }}
                >
                  Kopier lenke
                </button>
                <button
                  onClick={closeModal}
                  style={{ background: 'transparent', color: COLORS.muted, border: 'none', padding: '10px 0', fontSize: 13, cursor: 'pointer' }}
                >
                  Lukk
                </button>
              </>
            ) : (
              <>
                {showInviteModal === 'coordinator' && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: COLORS.secondary, display: 'block', marginBottom: 4 }}>
                      Lag *
                    </label>
                    <select
                      value={inviteTeamId}
                      onChange={e => setInviteTeamId(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 12, fontSize: 14 }}
                    >
                      <option value="">Velg lag</option>
                      {teamRows.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: COLORS.secondary, display: 'block', marginBottom: 4 }}>E-post *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="ola@example.com"
                    style={{ width: '100%', boxSizing: 'border-box', border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 12, fontSize: 14 }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: COLORS.secondary, display: 'block', marginBottom: 4 }}>Navn (valgfritt)</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    placeholder="Ola Nordmann"
                    style={{ width: '100%', boxSizing: 'border-box', border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: 12, fontSize: 14 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={closeModal}
                    disabled={submitting}
                    style={{ background: 'transparent', color: COLORS.secondary, border: `0.5px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleSendInvite}
                    disabled={submitting}
                    style={{ background: COLORS.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? 'Sender...' : 'Send invitasjon'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div
    style={{
      background: '#fff',
      border: `0.5px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 20,
      textAlign: 'center',
    }}
  >
    <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>{value}</div>
    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>{label}</div>
  </div>
);

const actionLabel = (action: string, role: string): string => {
  const roleLabel = role === 'club_admin' ? 'Klubbansvarlig' : 'Koordinator';
  switch (action) {
    case 'invited': return `${roleLabel} invitert`;
    case 'accepted': return `${roleLabel} aksepterte rolle`;
    case 'transferred': return `${roleLabel}-rolle overdratt`;
    case 'removed': return `${roleLabel} fjernet`;
    case 'self_removed': return `${roleLabel} trakk seg`;
    default: return action;
  }
};
