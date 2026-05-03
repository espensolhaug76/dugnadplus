import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { normalizeJoinCode } from '../../utils/joinCode';
import { displayTeamName, formatChildDisplayName } from '../../utils/teamSlug';

// ClaimFamilyPage — koble innlogget forelder til eksisterende
// koordinator-importert familie via en join_code.
//
// To modi:
//   - 'initial' (default): Brukeren har akkurat registrert seg og
//     har ingen family_members-rad ennå. Vi oppretter en parent-
//     rad i familien som koden tilhører.
//   - 'add' (?mode=add): Brukeren er allerede koblet til en familie
//     og vil legge til et ekstra barn (f.eks. en søsken på et
//     annet lag). Vi flytter barnet fra sin ghost-familie til
//     brukerens eksisterende familie, bevarer barnets team-
//     tilhørighet via family_members.team_id, og sletter ghost-
//     familien hvis den blir foreldreløs.
//
// UI-faser:
//   - 'code': input-felt + "Koble til"-knapp
//   - 'confirm': "Du kobler til {barn}, {lag}. Stemmer dette?"
//   - 'submitting': spinner
//   - 'success': grønn bekreftelse, redirect til /family-dashboard

interface MatchedChild {
  id: string;
  name: string;
  family_id: string;
  ghost_family_name: string;
  ghost_family_team_id: string | null;
}

type Phase = 'code' | 'confirm' | 'submitting' | 'success';
type Mode = 'initial' | 'add';
type AuthState = 'checking' | 'unauth' | 'ok';

export const ClaimFamilyPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('code');
  const [matchedChild, setMatchedChild] = useState<MatchedChild | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [mode, setMode] = useState<Mode>('initial');
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'add') setMode('add');

    // Autoritativ auth-sjekk FØR vi rendrer skjemaet. Uten denne
    // kan uinnloggede brukere taste inn vilkårlige koder og
    // utføre queryer direkte mot Supabase (anonym nøkkel), og
    // /claim-family blir en åpen kode-probing-endpoint. Samme
    // mønster som ParentSwapPage-fiksen i commit 50b568a.
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthState('unauth');
        // Liten forsinkelse så brukeren ser "du må være innlogget"-
        // skjermen før redirect — ellers er det bare en flash.
        setTimeout(() => { window.location.href = '/login'; }, 1500);
        return;
      }
      setAuthState('ok');
    })();
  }, []);

  const handleLookup = async () => {
    const normalized = normalizeJoinCode(code);
    if (!normalized) return;

    setMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage({ type: 'error', text: 'Du må være logget inn.' });
      return;
    }

    // Slå opp barn via join_code. Vi henter også ghost-familiens
    // team_id og navn for bruk i bekreftelse-skjermen og
    // (i add-mode) for å bevare team-tilhørigheten ved flytting.
    const { data: childRow, error: findError } = await supabase
      .from('family_members')
      .select('id, name, family_id, families(name, team_id)')
      .eq('join_code', normalized)
      .eq('role', 'child')
      .maybeSingle();

    if (findError || !childRow || !childRow.family_id) {
      setMessage({ type: 'error', text: 'Ugyldig kode. Sjekk at du har skrevet den riktig.' });
      return;
    }

    const familiesRel: any = (childRow as any).families;
    setMatchedChild({
      id: childRow.id,
      name: childRow.name,
      family_id: childRow.family_id,
      ghost_family_name: familiesRel?.name || 'familien',
      ghost_family_team_id: familiesRel?.team_id || null,
    });
    setPhase('confirm');
  };

  const handleConfirm = async () => {
    if (!matchedChild) return;
    setPhase('submitting');
    setMessage(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Du må være logget inn.');

      if (mode === 'initial') {
        // Hent navn/telefon fra auth-metadata som fallback til
        // e-postens lokale del, så parent-raden får et meningsfylt
        // navn uansett hvordan bruker registrerte seg.
        const metaFullName = (user.user_metadata as any)?.full_name;
        const metaPhone = (user.user_metadata as any)?.phone;
        const proposedName = metaFullName
          || (user.email ? user.email.split('@')[0] : null)
          || 'Forelder';

        // SECURITY DEFINER-RPC. Direkte INSERT mot family_members
        // feiler på family_members_insert_parent-policyen
        // (auth_user_family_id() returnerer NULL før første parent-
        // rad finnes — chicken-and-egg). RPC-en oppretter
        // team_members + family_members i én transaksjon og
        // returnerer family_id/team_id slik at vi kan oppdatere
        // localStorage. Idempotent: already_claimed=true om brukeren
        // allerede er parent i samme familie.
        const { data: rpcData, error: rpcError } = await supabase.rpc('claim_family_via_code', {
          p_code: code,
          p_parent_name: proposedName,
          p_parent_email: user.email || '',
          p_parent_phone: metaPhone || '',
        });

        if (rpcError) {
          // Server-side normalisering av kjente feilmeldinger.
          const msg = (rpcError.message || '').toLowerCase();
          if (msg.includes('ugyldig kode')) {
            throw new Error('Koden er ikke gyldig. Sjekk at du har skrevet riktig.');
          }
          if (msg.includes('innlogget') || msg.includes('authenticated')) {
            throw new Error('Du må være innlogget for å koble til familie.');
          }
          throw rpcError;
        }

        if (!rpcData || !rpcData.success) {
          throw new Error('Kunne ikke koble til familie. Prøv igjen.');
        }

        // Lagre fersk team_id i localStorage så ParentDashboard og
        // andre komponenter som leser fra cache får riktige data
        // umiddelbart etter redirect.
        try {
          if (rpcData.team_id) {
            localStorage.setItem('dugnad_active_team_filter', rpcData.team_id);
          }
        } catch {}

        const successText = rpcData.already_claimed
          ? `Du er allerede koblet til ${matchedChild.ghost_family_name}. Sender deg til dashbordet...`
          : `Suksess! Du er nå koblet til ${matchedChild.ghost_family_name}.`;
        setMessage({ type: 'success', text: successText });
        setPhase('success');
        setTimeout(() => { window.location.href = '/family-dashboard'; }, 1800);
      } else {
        // mode === 'add' — flytt barnet til brukerens eksisterende
        // familie og slett ghost-familien hvis den blir tom.

        // 1. Finn brukerens eksisterende family_id via parent-raden
        const { data: myParentRow, error: myErr } = await supabase
          .from('family_members')
          .select('family_id')
          .eq('auth_user_id', user.id)
          .eq('role', 'parent')
          .maybeSingle();

        if (myErr || !myParentRow?.family_id) {
          throw new Error('Kunne ikke finne din eksisterende familie. Registrer deg først med en kode.');
        }

        const myFamilyId = myParentRow.family_id;

        // 2. Ikke flytt hvis barnet allerede er i min familie
        if (matchedChild.family_id === myFamilyId) {
          setMessage({ type: 'success', text: `${formatChildDisplayName(matchedChild.name)} er allerede i familien din.` });
          setPhase('success');
          setTimeout(() => { window.location.href = '/family-dashboard'; }, 1500);
          return;
        }

        const ghostFamilyIdBeforeMove = matchedChild.family_id;

        // 3. Flytt barnet — oppdater family_id + bevar team_id
        const { error: updateErr } = await supabase
          .from('family_members')
          .update({
            family_id: myFamilyId,
            team_id: matchedChild.ghost_family_team_id,
          })
          .eq('id', matchedChild.id);

        if (updateErr) throw updateErr;

        // 4. Slett ghost-familien hvis den nå er foreldreløs
        const { count, error: countErr } = await supabase
          .from('family_members')
          .select('*', { count: 'exact', head: true })
          .eq('family_id', ghostFamilyIdBeforeMove);

        if (!countErr && count === 0) {
          await supabase.from('families').delete().eq('id', ghostFamilyIdBeforeMove);
        }

        setMessage({ type: 'success', text: `${formatChildDisplayName(matchedChild.name)} er lagt til i familien din.` });
        setPhase('success');
        setTimeout(() => { window.location.href = '/family-dashboard'; }, 1800);
      }
    } catch (error: any) {
      console.error('Feil ved kobling:', error);
      setMessage({ type: 'error', text: error.message || 'Noe gikk galt. Prøv igjen.' });
      setPhase('confirm');
    }
  };

  const handleCancelConfirm = () => {
    setMatchedChild(null);
    setCode('');
    setMessage(null);
    setPhase('code');
  };

  const teamDisplay = matchedChild
    ? displayTeamName(matchedChild.ghost_family_team_id)
    : '';
  const childDisplay = matchedChild
    ? formatChildDisplayName(matchedChild.name)
    : '';

  // ===== AUTH GATE =====
  // Ikke render skjemaet før vi har bekreftet at brukeren er
  // innlogget. Uten dette blir /claim-family en åpen endpoint
  // for kode-probing mot Supabase-anon-nøkkelen.
  if (authState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Laster...</div>
      </div>
    );
  }

  if (authState === 'unauth') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Du må være logget inn
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Send deg videre til innloggingen...
          </p>
          <button
            onClick={() => window.location.href = '/login'}
            className="btn btn-primary"
          >
            Gå til innlogging nå
          </button>
        </div>
      </div>
    );
  }

  // ===== PHASE: SUCCESS =====
  if (phase === 'success') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', paddingTop: '80px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
            {mode === 'add' ? 'Barnet er lagt til!' : 'Koblet til!'}
          </h1>
          {message && (
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>{message.text}</p>
          )}
        </div>
      </div>
    );
  }

  // ===== PHASE: CONFIRM =====
  if (phase === 'confirm' || phase === 'submitting') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', paddingTop: '80px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Stemmer dette?
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              {mode === 'add' ? 'Du legger til' : 'Du kobler til'}
            </p>
          </div>

          <div className="card" style={{ padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {childDisplay}
            </div>
            <div style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              {teamDisplay}
            </div>
          </div>

          {message && message.type === 'error' && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: '#fee2e2', color: '#991b1b', textAlign: 'center' }}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleConfirm}
            className="btn btn-primary btn-large"
            style={{ width: '100%', marginBottom: '12px' }}
            disabled={phase === 'submitting'}
          >
            {phase === 'submitting' ? 'Kobler til...' : 'Ja, det stemmer'}
          </button>
          <button
            onClick={handleCancelConfirm}
            className="btn btn-secondary"
            style={{ width: '100%' }}
            disabled={phase === 'submitting'}
          >
            Nei, det er feil
          </button>
        </div>
      </div>
    );
  }

  // ===== PHASE: CODE INPUT =====
  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingTop: '60px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            {mode === 'add' ? 'Legg til barn med kode' : 'Koble til barn/lag'}
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            {mode === 'add'
              ? 'Har du flere barn i klubben? Tast inn koden for neste barn her.'
              : 'Tast inn koden du har fått fra koordinator for å koble deg til barnet ditt.'}
          </p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Dugnads-kode</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
              className="input"
              placeholder="F.eks. KIL8583"
              style={{
                textAlign: 'center',
                fontSize: '24px',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                fontWeight: '700'
              }}
            />
          </div>

          {message && message.type === 'error' && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: '#fee2e2', color: '#991b1b', textAlign: 'center' }}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleLookup}
            className="btn btn-primary btn-large"
            style={{ width: '100%' }}
            disabled={!code}
          >
            🔗 Koble til
          </button>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              onClick={() => window.location.href = mode === 'add' ? '/family-dashboard' : '/role-selection'}
              className="btn"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Tilbake
            </button>
          </div>
        </div>

        <div style={{ marginTop: '32px', padding: '20px', background: '#eff6ff', borderRadius: '12px', color: '#1e40af', fontSize: '14px' }}>
          <strong>ℹ️ Ikke fått en kode?</strong><br/>
          Spør koordinator i klubben din. Hver unge har sin egen kode som brukes for å koble forelderen til familien.
        </div>

      </div>
    </div>
  );
};
