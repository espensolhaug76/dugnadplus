import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';
import { displayTeamWithClub } from '../../utils/teamSlug';

const COLORS = {
  bg: '#faf8f4',
  text: '#1a2e1f',
  secondary: '#4a5e50',
  muted: '#6b7f70',
  border: '#e8e0d0',
  primary: '#2d6a4f',
  danger: '#c0392b',
  warningBg: '#fff5f5',
  warningBorder: '#fee2e2',
};

const FONT_SERIF = '"DM Serif Display", serif';
const FONT_SANS = '"DM Sans", sans-serif';

interface ProfileData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  family_id: string;
}

interface ChildTeamRow {
  childId: string;
  childName: string;
  teamId: string | null;
  teamDisplay: string;
}

export const ProfilePage: React.FC = () => {
  const fam = useCurrentFamily();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [childTeams, setChildTeams] = useState<ChildTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (fam.loading) return;
    if (fam.unauthenticated) { window.location.href = '/login'; return; }
    if (fam.noFamily) { window.location.href = '/claim-family'; return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fam.loading, fam.parentRowId]);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setAuthEmail(user?.email || '');

    if (!fam.parentRowId || !user) { setLoading(false); return; }
    const { data } = await supabase
      .from('family_members')
      .select('id, name, email, phone, family_id')
      .eq('id', fam.parentRowId)
      .maybeSingle();

    if (data) setProfile(data as ProfileData);

    // Hent alle parent-rader for innlogget bruker (forelder kan
    // ha barn på flere lag representert som flere families-rader
    // — vi viser barn fra ALLE disse familiene). family_members.team_id
    // er kanonisk kilde per spec — overlever en fremtidig families-
    // konsolidering uendret.
    const { data: parentRows } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('auth_user_id', user.id)
      .eq('role', 'parent');

    const familyIds = Array.from(new Set((parentRows || []).map((r: any) => r.family_id).filter(Boolean)));
    if (familyIds.length === 0) {
      setChildTeams([]);
      setLoading(false);
      return;
    }

    const { data: children } = await supabase
      .from('family_members')
      .select('id, name, team_id')
      .in('family_id', familyIds)
      .eq('role', 'child')
      .order('name');

    const teamIds = Array.from(new Set((children || []).map((c: any) => c.team_id).filter(Boolean))) as string[];

    // Slå opp klubb-navn via team_members.club_id → clubs.name.
    // Antar én klubb per team_id-slug (verifisert 2026-06-09 i prod:
    // 0 homonymer). Hvis homonyme team_ids noensinne dukker opp,
    // returnerer LIMIT 1-pattern her vilkårlig en klubb — kjent
    // svakhet, ingen FK fra families/family_members til clubs ennå.
    const clubByTeam = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: clubLinks } = await supabase
        .from('team_members')
        .select('team_id, club:clubs(name)')
        .in('team_id', teamIds);
      for (const row of clubLinks || []) {
        const cn = (row as any).club?.name;
        if (cn && !clubByTeam.has(row.team_id)) clubByTeam.set(row.team_id, cn);
      }
    }

    setChildTeams((children || []).map((c: any) => ({
      childId: c.id,
      childName: c.name || '—',
      teamId: c.team_id || null,
      teamDisplay: displayTeamWithClub(c.team_id ? clubByTeam.get(c.team_id) || null : null, c.team_id),
    })));

    setLoading(false);
  };

  const handleExport = async () => {
    setExportError('');
    if (!fam.familyId) return;

    try {
      const [{ data: family }, { data: members }, { data: assignments }, { data: lottery }, { data: kiosk }, { data: campaign }, { data: consents }] = await Promise.all([
        supabase.from('families').select('*').eq('id', fam.familyId).maybeSingle(),
        supabase.from('family_members').select('*').eq('family_id', fam.familyId),
        supabase.from('assignments').select('*').eq('family_id', fam.familyId),
        supabase.from('lottery_purchases').select('*').eq('family_id', fam.familyId),
        supabase.from('kiosk_orders').select('*').eq('family_id', fam.familyId),
        supabase.from('campaign_purchases').select('*').eq('family_id', fam.familyId),
        supabase.from('user_consents').select('*'),
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        auth: { email: authEmail },
        family,
        family_members: members || [],
        assignments: assignments || [],
        lottery_purchases: lottery || [],
        kiosk_orders: kiosk || [],
        campaign_purchases: campaign || [],
        user_consents: consents || [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dugnad-eksport-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError('Klarte ikke eksportere data: ' + (err.message || 'ukjent feil'));
    }
  };

  const handleDelete = async () => {
    if (confirmInput !== 'SLETT') return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;

      // Logg ut og gå til login med suksessmelding
      await supabase.auth.signOut();
      try { localStorage.removeItem('dugnad_user'); } catch {}
      window.location.href = '/login?deleted=1';
    } catch (err: any) {
      alert('Klarte ikke slette konto: ' + (err.message || 'ukjent feil'));
      setDeleting(false);
    }
  };

  if (fam.loading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontFamily: FONT_SANS }}>
        Laster profil...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: FONT_SANS, color: COLORS.text }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => { window.location.href = '/family-dashboard'; }}
            style={{ background: 'transparent', border: 'none', color: COLORS.muted, fontSize: 14, cursor: 'pointer', padding: 0 }}
          >
            ← Tilbake
          </button>
        </div>

        <h1 style={{ fontFamily: FONT_SERIF, fontSize: 28, fontWeight: 500, margin: '0 0 24px' }}>Min profil</h1>

        {/* Brukerinfo */}
        <section
          style={{
            background: '#fff',
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: '0 0 14px' }}>Kontakt</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <Row label="Navn" value={profile?.name || '—'} />
            <Row label="E-post" value={authEmail || profile?.email || '—'} />
            <Row label="Telefon" value={profile?.phone || '—'} />
          </div>
        </section>

        {/* Mine barn og lag */}
        <section
          style={{
            background: '#fff',
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: '0 0 14px' }}>Mine barn og lag</h2>
          {childTeams.length === 0 ? (
            <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>Ingen barn er registrert på din konto ennå.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {childTeams.map(row => (
                <div
                  key={`${row.childId}-${row.teamId || 'none'}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 14 }}
                >
                  <span style={{ fontWeight: 500 }}>{row.childName}</span>
                  <span style={{ color: COLORS.secondary, textAlign: 'right' }}>{row.teamDisplay}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Eksporter */}
        <section
          style={{
            background: '#fff',
            border: `0.5px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: '0 0 6px' }}>Eksporter mine data</h2>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
            Last ned en JSON-fil med all data om deg og familien din — vakter, betalinger, samtykker.
          </p>
          <button
            onClick={handleExport}
            style={{
              background: COLORS.primary,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_SANS,
            }}
          >
            Last ned JSON
          </button>
          {exportError && (
            <p style={{ color: COLORS.danger, fontSize: 13, marginTop: 10 }}>{exportError}</p>
          )}
        </section>

        {/* Slett konto */}
        <section
          style={{
            background: COLORS.warningBg,
            border: `0.5px solid ${COLORS.warningBorder}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500, margin: '0 0 6px', color: COLORS.danger }}>
            Slett kontoen min
          </h2>
          <p style={{ fontSize: 13, color: COLORS.secondary, margin: '0 0 14px', lineHeight: 1.5 }}>
            Sletter all data om deg og familien permanent. Dette kan ikke angres.
          </p>
          <button
            onClick={() => setConfirmOpen(true)}
            style={{
              background: '#fff',
              color: COLORS.danger,
              border: `1px solid ${COLORS.danger}`,
              borderRadius: 10,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT_SANS,
            }}
          >
            Slett kontoen min
          </button>
        </section>
      </div>

      {/* Bekreftelses-modal */}
      {confirmOpen && (
        <div
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
          onClick={() => !deleting && setConfirmOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 24,
              maxWidth: 440,
              width: '100%',
              fontFamily: FONT_SANS,
              color: COLORS.text,
            }}
          >
            <h3 style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 500, margin: '0 0 12px', color: COLORS.danger }}>
              Er du sikker?
            </h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.secondary, margin: '0 0 16px' }}>
              Dette sletter all din data permanent og kan ikke angres. Skriv <strong>SLETT</strong> nedenfor for å bekrefte.
            </p>
            <input
              autoFocus
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="Skriv SLETT"
              disabled={deleting}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: `0.5px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: 12,
                fontSize: 14,
                fontFamily: FONT_SANS,
                marginBottom: 16,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setConfirmOpen(false); setConfirmInput(''); }}
                disabled={deleting}
                style={{
                  background: 'transparent',
                  color: COLORS.secondary,
                  border: `0.5px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: FONT_SANS,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmInput !== 'SLETT' || deleting}
                style={{
                  background: COLORS.danger,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: (confirmInput !== 'SLETT' || deleting) ? 'not-allowed' : 'pointer',
                  opacity: (confirmInput !== 'SLETT' || deleting) ? 0.5 : 1,
                  fontFamily: FONT_SANS,
                }}
              >
                {deleting ? 'Sletter...' : 'Bekreft sletting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
    <span style={{ color: COLORS.muted, fontSize: 13 }}>{label}</span>
    <span style={{ fontWeight: 500 }}>{value}</span>
  </div>
);
