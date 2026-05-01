import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { Footer } from '../common/Footer';

interface CoordinatorRow {
  team_member_id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  joined_at: string;
  is_self: boolean;
}

interface PendingInvite {
  id: string;
  token: string;
  invited_email: string;
  invited_name: string | null;
  created_at: string;
  expires_at: string;
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
  successBg: '#e8f5ef',
  successBorder: '#b7e0c8',
};

export const TeamCoordinatorsPage: React.FC = () => {
  const [activeTeam, setActiveTeam] = useState<{ id: string; name: string; clubId: string | null } | null>(null);
  const [coordinators, setCoordinators] = useState<CoordinatorRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [createdForTransfer, setCreatedForTransfer] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    setErrorMsg('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = '/login';
      return;
    }

    // Hent aktivt lag fra localStorage
    const teams = (() => { try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; } })();
    const activeId = localStorage.getItem('dugnad_active_team_filter');
    const team = activeId ? teams.find((t: any) => t.id === activeId) : teams[0];
    if (!team) {
      setErrorMsg('Ingen aktivt lag valgt.');
      setLoading(false);
      return;
    }
    setActiveTeam({ id: team.id, name: team.name || team.id, clubId: team.clubId || null });

    // Hent koordinator-rader for laget
    const { data: members, error: memErr } = await supabase
      .from('team_members')
      .select('id, auth_user_id, role, created_at')
      .eq('team_id', team.id)
      .in('role', ['coordinator', 'club_admin']);

    if (memErr) {
      setErrorMsg('Kunne ikke laste koordinatorer: ' + memErr.message);
      setLoading(false);
      return;
    }

    // Slå opp navn fra family_members hvis det finnes (parent-rad
    // kan ha registrert navn) ellers bruk e-post som fallback. Vi
    // kan ikke joine direkte mot auth.users via RLS. Pragmatisk
    // løsning: vis e-post for innlogget bruker, og auth_user_id
    // (forkortet) for andre — Espen kan utvide hvis behov.
    const memberRows: CoordinatorRow[] = (members || []).map(m => ({
      team_member_id: m.id,
      auth_user_id: m.auth_user_id,
      email: m.auth_user_id === user.id ? (user.email || '') : '',
      display_name: m.auth_user_id === user.id
        ? (user.user_metadata?.full_name || user.email || 'Du')
        : `Bruker ${m.auth_user_id.slice(0, 8)}`,
      joined_at: m.created_at,
      is_self: m.auth_user_id === user.id,
    }));
    setCoordinators(memberRows);

    // Hent pending invitasjoner for dette laget
    const { data: invites } = await supabase
      .from('coordinator_invites')
      .select('id, token, invited_email, invited_name, created_at, expires_at')
      .eq('team_id', team.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    setPendingInvites((invites || []) as PendingInvite[]);
    setLoading(false);
  };

  const buildInviteUrl = (token: string) => {
    const origin = window.location.origin;
    return `${origin}/coordinator-invite?token=${token}`;
  };

  // UUID v1-v5 (eller hex med bindestreker, 36 tegn). Brukes til å
  // fange tilfeller der dugnad_club.id eller dugnad_teams[].clubId
  // er en gammel timestamp-streng (Date.now().toString()) i stedet
  // for klubb-UUID — den banen ga tidligere "invalid input syntax
  // for type uuid" og kan komme tilbake hvis localStorage er stale.
  const isUuid = (s: string | null | undefined): boolean =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  const handleSendInvite = async (isTransfer: boolean) => {
    setErrorMsg('');

    // 1) Validér aktivt lag
    if (!activeTeam || !activeTeam.id) {
      setErrorMsg('Mangler lag-tilknytning. Logg ut og inn igjen.');
      return;
    }

    // 2) Validér club_id — hvis den er satt må den være UUID. Hvis
    // den mangler aksepterer vi det og sender club_id: null (RLS for
    // 'coordinator'-invitasjoner avhenger kun av team_id, ikke
    // club_id).
    let clubIdForInsert: string | null = null;
    if (activeTeam.clubId) {
      if (!isUuid(activeTeam.clubId)) {
        setErrorMsg(
          'Klubb-ID i nettleseren er ikke gyldig (sannsynligvis stale localStorage). ' +
          'Logg ut og inn igjen for å hente fersk klubb-info.'
        );
        return;
      }
      clubIdForInsert = activeTeam.clubId;
    }

    // 3) E-post: ikke obligatorisk, men hvis fylt inn må den være
    // gyldig format. invited_email er NOT NULL i DB, så vi sender
    // en placeholder hvis brukeren lar feltet stå tomt.
    const trimmedEmail = inviteEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMsg('E-postadressen ser ikke gyldig ut. La feltet stå tomt eller fyll inn en gyldig adresse.');
      return;
    }
    const emailForInsert = trimmedEmail || '(ikke oppgitt)';

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      setErrorMsg('Du er ikke innlogget lenger. Last siden på nytt.');
      return;
    }

    const payload = {
      team_id: activeTeam.id,
      club_id: clubIdForInsert,
      invite_type: 'coordinator' as const,
      invited_by: user.id,
      invited_email: emailForInsert,
      invited_name: inviteName.trim() || null,
    };

    // Diagnostisk logging — gir neste debug-runde nøyaktig hva som
    // sendes. Lar oss skille mellom RLS-blokade, type-feil og
    // network-feil uten å måtte gjette.
    // eslint-disable-next-line no-console
    console.log('[coordinator_invites.insert] payload', payload);

    const { data: invite, error } = await supabase
      .from('coordinator_invites')
      .insert(payload)
      .select('token')
      .single();

    // eslint-disable-next-line no-console
    console.log('[coordinator_invites.insert] response', { invite, error });

    if (error) {
      // Vis full server-feil — kode + melding + detaljer + hint —
      // slik at vi kan diagnostisere RLS-blokader, FK-brudd, osv.
      const parts: string[] = [];
      if ((error as any).code) parts.push(`Kode ${(error as any).code}`);
      if (error.message) parts.push(error.message);
      if ((error as any).details) parts.push((error as any).details);
      if ((error as any).hint) parts.push(`Tips: ${(error as any).hint}`);
      setErrorMsg('Kunne ikke opprette invitasjon. ' + parts.join(' · '));
      setSubmitting(false);
      return;
    }

    if (!invite || !invite.token) {
      // RLS kan returnere data: null uten error hvis insertet ble
      // blokkert i visse Supabase-versjoner. Vis en konkret melding
      // som peker brukeren mot mest sannsynlige årsak.
      setErrorMsg(
        'Invitasjonen ble ikke opprettet (tomt svar fra serveren). ' +
        'Mest sannsynlig blokkert av sikkerhetsregler — sjekk at du har koordinator-rolle for dette laget.'
      );
      setSubmitting(false);
      return;
    }

    setCreatedInviteUrl(buildInviteUrl(invite.token));
    setCreatedForTransfer(isTransfer);
    setSubmitting(false);
    void load();
  };

  const handleCopyLink = async () => {
    if (!createdInviteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInviteUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      alert('Klarte ikke kopiere — marker lenken manuelt.');
    }
  };

  const handleCancelInvite = async (id: string) => {
    if (!confirm('Avbryt denne invitasjonen?')) return;
    const { error } = await supabase.from('coordinator_invites').delete().eq('id', id);
    if (error) { alert('Klarte ikke slette: ' + error.message); return; }
    void load();
  };

  const handleRemoveCoordinator = async (targetUserId: string, isSelf: boolean) => {
    if (!activeTeam) return;
    const msg = isSelf
      ? 'Er du sikker på at du vil fjerne deg selv som koordinator? Du mister tilgangen til dette laget.'
      : 'Er du sikker på at du vil fjerne denne koordinatoren?';
    if (!confirm(msg)) return;

    const { error } = await supabase.rpc('remove_coordinator', {
      p_team_id: activeTeam.id,
      p_target_user_id: targetUserId,
    });
    if (error) {
      alert('Kunne ikke fjerne: ' + error.message);
      return;
    }
    if (isSelf) {
      alert('Du er fjernet som koordinator.');
      window.location.href = '/login';
      return;
    }
    void load();
  };

  const closeModal = () => {
    setShowInviteModal(false);
    setShowTransferModal(false);
    setInviteEmail('');
    setInviteName('');
    setCreatedInviteUrl(null);
    setCreatedForTransfer(false);
    setLinkCopied(false);
    setErrorMsg('');
  };

  const onlyCoordinator = coordinators.length <= 1;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: '"DM Sans", sans-serif', color: COLORS.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 48px' }}>
        <button
          onClick={() => { window.location.href = '/coordinator-dashboard'; }}
          style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 20 }}
        >
          ← Tilbake til dashboard
        </button>

        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 28, fontWeight: 500, margin: '0 0 6px' }}>
          Koordinatorer
        </h1>
        <p style={{ color: COLORS.muted, fontSize: 14, margin: '0 0 28px' }}>
          {activeTeam ? `For laget ${activeTeam.name}` : 'Laster lag...'}
        </p>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: `1px solid ${COLORS.danger}`, borderRadius: 8, padding: 12, marginBottom: 20, color: COLORS.danger, fontSize: 14 }}>
            {errorMsg}
          </div>
        )}

        {/* Nåværende koordinatorer */}
        <section
          style={{
            background: '#fff',
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, fontWeight: 500, margin: '0 0 12px' }}>
            Nåværende koordinatorer ({coordinators.length})
          </h2>

          {loading ? (
            <p style={{ color: COLORS.muted, fontSize: 14 }}>Laster...</p>
          ) : coordinators.length === 0 ? (
            <p style={{ color: COLORS.muted, fontSize: 14 }}>Ingen koordinatorer registrert.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {coordinators.map(c => (
                <div
                  key={c.team_member_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    background: c.is_self ? COLORS.successBg : 'transparent',
                    border: `0.5px solid ${c.is_self ? COLORS.successBorder : COLORS.border}`,
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {c.display_name}
                      {c.is_self && (
                        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', background: COLORS.primary, color: '#fff', borderRadius: 10 }}>
                          Du
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      {c.email && <span>{c.email} · </span>}
                      Koordinator · Joined {new Date(c.joined_at).toLocaleDateString('nb-NO')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveCoordinator(c.auth_user_id, c.is_self)}
                    disabled={onlyCoordinator}
                    title={onlyCoordinator ? 'Kan ikke fjerne siste koordinator' : 'Fjern koordinator'}
                    style={{
                      background: 'transparent',
                      color: onlyCoordinator ? COLORS.muted : COLORS.danger,
                      border: `1px solid ${onlyCoordinator ? COLORS.border : COLORS.danger}`,
                      borderRadius: 8,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: onlyCoordinator ? 'not-allowed' : 'pointer',
                      opacity: onlyCoordinator ? 0.6 : 1,
                    }}
                  >
                    Fjern
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending invitasjoner */}
        {pendingInvites.length > 0 && (
          <section
            style={{
              background: '#fff',
              border: `0.5px solid ${COLORS.border}`,
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, fontWeight: 500, margin: '0 0 12px' }}>
              Pending invitasjoner ({pendingInvites.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingInvites.map(inv => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 12px',
                    background: COLORS.warningBg,
                    border: `0.5px solid ${COLORS.warningBorder}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {inv.invited_name || inv.invited_email}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                      {inv.invited_email} · Invitert {new Date(inv.created_at).toLocaleDateString('nb-NO')} ·
                      Utløper {new Date(inv.expires_at).toLocaleDateString('nb-NO')}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const url = buildInviteUrl(inv.token);
                      void navigator.clipboard.writeText(url);
                      alert('Lenke kopiert');
                    }}
                    style={{ background: '#fff', color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Kopier lenke
                  </button>
                  <button
                    onClick={() => handleCancelInvite(inv.id)}
                    style={{ background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Avbryt
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Handlinger */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              background: COLORS.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Inviter medkoordinator
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            style={{
              background: '#fff',
              color: COLORS.primary,
              border: `1px solid ${COLORS.primary}`,
              borderRadius: 10,
              padding: '12px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Overdra rollen min
          </button>
        </div>
      </div>

      {/* Inviter-modal */}
      {(showInviteModal || showTransferModal) && (
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
              fontFamily: '"DM Sans", sans-serif',
              color: COLORS.text,
            }}
          >
            <h3 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, fontWeight: 500, margin: '0 0 12px' }}>
              {showTransferModal ? 'Overdra rollen' : 'Inviter medkoordinator'}
            </h3>

            {showTransferModal && (
              <p style={{ fontSize: 13, color: COLORS.secondary, lineHeight: 1.6, margin: '0 0 14px' }}>
                Når du overdrar koordinator-rollen, mister du selv tilgangen og den nye personen tar over.
                Du kan fortsatt være forelder hvis du har barn på laget.
              </p>
            )}

            {createdInviteUrl ? (
              <>
                <div
                  style={{
                    background: COLORS.successBg,
                    border: `1px solid ${COLORS.successBorder}`,
                    borderRadius: 10,
                    padding: 16,
                    fontSize: 14,
                    color: COLORS.primary,
                    marginBottom: 14,
                    lineHeight: 1.6,
                    fontWeight: 500,
                  }}
                >
                  Invitasjonen er klar! Send denne lenken til {inviteName || inviteEmail || 'mottakeren'} via Spond, SMS eller e-post.
                  Lenken er gyldig i 7 dager.
                </div>

                <div
                  style={{
                    background: '#f8f8f5',
                    border: `0.5px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    marginBottom: 14,
                  }}
                >
                  {createdInviteUrl}
                </div>

                <button
                  onClick={handleCopyLink}
                  style={{
                    width: '100%',
                    background: COLORS.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '14px 18px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {linkCopied ? '✓ Kopiert' : '📋 Kopier lenke'}
                </button>

                {createdForTransfer && (
                  <p style={{ marginTop: 14, fontSize: 13, color: COLORS.warningBorder.replace('#fac775', '#854f0b'), lineHeight: 1.5 }}>
                    <strong>Viktig:</strong> Når mottakeren aksepterer invitasjonen, må du selv klikke "Fjern" på din egen rad
                    for å fullføre overdragelsen.
                  </p>
                )}

                <button
                  onClick={closeModal}
                  style={{
                    background: 'transparent',
                    color: COLORS.muted,
                    border: 'none',
                    padding: '10px 0 0',
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'block',
                    marginTop: 8,
                  }}
                >
                  Lukk
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: COLORS.secondary, lineHeight: 1.6, margin: '0 0 14px' }}>
                  Vi sender ingen e-post automatisk — du får en lenke du selv kan dele via Spond, SMS eller e-post.
                  Feltene under brukes kun til å huske hvem du har invitert.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: COLORS.secondary, display: 'block', marginBottom: 4 }}>
                      Navn
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="Ola Nordmann"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: `0.5px solid ${COLORS.border}`,
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 500, color: COLORS.secondary, display: 'block', marginBottom: 4 }}>
                      E-post (valgfritt)
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="ola@example.com"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        border: `0.5px solid ${COLORS.border}`,
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                    <p style={{ fontSize: 11, color: COLORS.muted, margin: '4px 0 0' }}>
                      Brukes kun for sporing. Vi sender ingen e-post.
                    </p>
                  </div>
                </div>

                {errorMsg && (
                  <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{errorMsg}</p>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    onClick={closeModal}
                    disabled={submitting}
                    style={{
                      background: 'transparent',
                      color: COLORS.secondary,
                      border: `0.5px solid ${COLORS.border}`,
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={() => handleSendInvite(showTransferModal)}
                    disabled={submitting}
                    style={{
                      background: COLORS.primary,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? 'Lager lenke...' : (showTransferModal ? 'Lag overdragelseslenke' : 'Lag invitasjonslenke')}
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
