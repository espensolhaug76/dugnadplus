import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { VikarChat } from '../substitute/VikarChat';

interface SwapProposal {
  id: string;
  fromFamilyName: string;
  shiftName: string;
  date: string;
  type: 'swap' | 'offer';
  shiftId: string;
  fromFamilyId: string;
}

interface Shift {
  id: string;
  assignmentId: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  eventName: string;
  eventId: string;
  date: string;
  location: string;
  isConfirmed: boolean;
  swapRequestId?: string;
  substituteRequestId?: string;
  bidAmount?: number;
  bidMessage?: string;
  bidFamilyId?: string;
  bidStatus?: string;
  description?: string;
}

interface PendingEvent {
    id: string;
    name: string;
    date: string;
}

export const FamilyDashboard: React.FC = () => {
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [incomingProposals, setIncomingProposals] = useState<SwapProposal[]>([]);
  const [points, setPoints] = useState(0);
  const [nextTierPoints, setNextTierPoints] = useState(100);
  const [activeLottery, setActiveLottery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentFamily, setCurrentFamily] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [sponsorsVisible, setSponsorsVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState<{ requestId: string; otherName: string } | null>(null);

  useEffect(() => {
    fetchCloudData();
  }, []);

  const fetchCloudData = async () => {
    setLoading(true);
    try {
      // Autoritativ auth-sjekk mot Supabase, ikke bare localStorage.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userJson = localStorage.getItem('dugnad_user');
      const localUser = userJson ? JSON.parse(userJson) : null;
      const userId = authUser?.id || localUser?.id;

      if (!userId) {
          setLoading(false);
          return;
      }

      // Kanonisk oppslag: bruk family_members.auth_user_id for å
      // finne hvilken familie den innloggede brukeren er parent i.
      // Dette er den nye flowen etter /claim-family-redesignet —
      // foreldre har auth_user_id satt på sin parent-rad i en
      // eksisterende familie, og families.id er IKKE lenger det
      // samme som auth.uid().
      let familyId: string | null = null;
      const { data: memberRow } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('auth_user_id', userId)
        .eq('role', 'parent')
        .maybeSingle();
      if (memberRow?.family_id) {
        familyId = memberRow.family_id;
      } else {
        // Legacy fallback: families.id = auth.uid() (gammelt mønster
        // fra før /claim-family-redesignet). Beholdes så eksisterende
        // brukere fra før runden ikke låses ute.
        const { data: legacy } = await supabase
          .from('families')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (legacy?.id) familyId = legacy.id;
      }

      if (!familyId) {
          setLoading(false);
          return;
      }

      // Hent hele familien med alle medlemmer. Multi-child-familier
      // (etter /claim-family?mode=add) får alle barn uavhengig av
      // team_id — parent-perspektivet viser alle barn samlet.
      const { data: family } = await supabase
        .from('families')
        .select('*, family_members(*)')
        .eq('id', familyId)
        .single();

      if (!family) {
          setLoading(false);
          return;
      }

      setCurrentFamily(family);
      setPoints(family.total_points || 0);

      const children = family.family_members?.filter((m: any) => m.role === 'child');
      if (children && children.length > 0) {
          setDisplayName(children.map((c: any) => c.name).join(' & '));
      } else {
          setDisplayName(family.name);
      }

      // Poeng nivåer
      const p = family.total_points || 0;
      if (p < 100) setNextTierPoints(100);
      else if (p < 300) setNextTierPoints(300);
      else setNextTierPoints(500);

      // Hent vakter
      const { data: assignments } = await supabase
        .from('assignments')
        .select(`
            id,
            status,
            shift:shifts (
                id,
                name,
                start_time,
                end_time,
                people_needed,
                description,
                event:events (
                    id,
                    name,
                    date,
                    location,
                    assignment_mode
                )
            )
        `)
        .eq('family_id', family.id);

      // Hent pending events
      const today = new Date().toISOString().split('T')[0];
      const { data: allFutureEvents } = await supabase
        .from('events')
        .select('*')
        .gte('date', today)
        .eq('assignment_mode', 'self-service');

      const myEventIds = new Set(assignments?.map((a: any) => a.shift.event.id));
      const missingEvents = allFutureEvents?.filter((e: any) => !myEventIds.has(e.id)) || [];

      setPendingEvents(missingEvents.map((e:any) => ({
          id: e.id,
          name: e.name,
          date: e.date
      })));

      // Hent requests (for swap status)
      const { data: myRequests } = await supabase
        .from('requests')
        .select('*')
        .eq('from_family_id', family.id)
        .eq('is_active', true);

      // Hent innkommende forslag
      const { data: incomingReqs } = await supabase
        .from('requests')
        .select(`
            id,
            type,
            from_family_id,
            shift:shifts (
                id,
                name,
                event:events (date)
            ),
            from_family:families (name)
        `)
        .eq('to_family_id', family.id)
        .eq('is_active', true);

      if (incomingReqs) {
          const proposals: SwapProposal[] = incomingReqs.map((r: any) => ({
              id: r.id,
              fromFamilyId: r.from_family_id,
              fromFamilyName: r.from_family?.name || 'Ukjent',
              shiftId: r.shift?.id,
              shiftName: r.shift?.name || 'Vakt',
              date: r.shift?.event?.date || '',
              type: r.type === 'swap' ? 'swap' : 'offer'
          }));
          setIncomingProposals(proposals);
      }

      // Behandle mine vakter
      const formattedShifts = assignments?.map((a: any) => {
        const activeReq = myRequests?.find((r: any) => r.shift_id === a.shift.id);
        return {
            id: a.shift.id,
            assignmentId: a.id,
            name: a.shift.name,
            startTime: a.shift.start_time?.slice(0,5),
            endTime: a.shift.end_time?.slice(0,5),
            peopleNeeded: a.shift.people_needed,
            eventName: a.shift.event.name,
            eventId: a.shift.event.id,
            date: a.shift.event.date,
            location: a.shift.event.location,
            description: a.shift.description,
            isConfirmed: a.status === 'confirmed',
            swapRequestId: activeReq?.type === 'swap' ? activeReq.id : undefined,
            substituteRequestId: activeReq?.type === 'substitute' ? activeReq.id : undefined,
            bidAmount: activeReq?.bid_amount,
            bidMessage: activeReq?.bid_message,
            bidFamilyId: activeReq?.bid_family_id,
            bidStatus: activeReq?.bid_status
        };
      }) || [];

      formattedShifts.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setMyShifts(formattedShifts);

      // Hent lotteri
      const { data: lotteries } = await supabase
        .from('lotteries')
        .select('*')
        .eq('is_active', true)
        .limit(1);

      if (lotteries && lotteries.length > 0) setActiveLottery(lotteries[0]);

      // Sjekk om sponsorer er synlige
      const { data: sponsorSetting } = await supabase.from('settings').select('value').eq('key', 'sponsors_visible').maybeSingle();
      if (sponsorSetting?.value === 'true') {
        const { data: activeSponsors } = await supabase.from('sponsors').select('id').eq('is_active', true).limit(1);
        setSponsorsVisible(!!(activeSponsors && activeSponsors.length > 0));
      }

    } catch (error) {
      console.error('Feil ved henting av data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('dugnad_user');
      window.location.href = '/';
  };

  // ... (Resten av funksjonene: handleConfirmShift, handleSwapToggle osv er uendret) ...
  const handleConfirmShift = async (assignmentId: string) => {
    if (!assignmentId) return;
    const { error } = await supabase.from('assignments').update({ status: 'confirmed' }).eq('id', assignmentId);
    if (error) alert('Feil: ' + error.message); else { alert('✅ Vakt bekreftet!'); fetchCloudData(); }
  };
  const handleSwapToggle = async (shiftId: string, currentRequestId?: string) => {
    if (currentRequestId) { if (!confirm('Trekke fra byttebørsen?')) return; await supabase.from('requests').update({ is_active: false }).eq('id', currentRequestId); }
    else { if (!confirm('Legge ut på byttebørsen?')) return; await supabase.from('requests').insert({ shift_id: shiftId, from_family_id: currentFamily.id, type: 'swap', is_active: true }); }
    fetchCloudData();
  };
  const handleSubstituteToggle = async (shiftId: string, currentRequestId?: string) => {
    if (currentRequestId) { if (!confirm('Avbryte vikar-søk?')) return; await supabase.from('requests').update({ is_active: false }).eq('id', currentRequestId); }
    else { if (!confirm('Søke etter vikar?')) return; await supabase.from('requests').insert({ shift_id: shiftId, from_family_id: currentFamily.id, type: 'substitute', is_active: true }); }
    fetchCloudData();
  };
  const handleAcceptBid = async (requestId: string, bidFamilyId: string, shiftId: string, amount: number) => {
    if (!confirm(`Akseptere budet på ${amount} kr?`)) return;
    // Aksepter bud
    await supabase.from('requests').update({ bid_status: 'accepted', is_active: false }).eq('id', requestId);
    // Opprett assignment for vikar
    await supabase.from('assignments').insert({ shift_id: shiftId, family_id: bidFamilyId, status: 'assigned' });
    alert(`✅ Bud akseptert! Betal ${amount} kr via Vipps.`);
    fetchCloudData();
  };

  const handleProposalResponse = async (proposal: SwapProposal, accept: boolean) => {
      if (!currentFamily) return;
      if (!accept) { if (confirm('Avslå tilbudet?')) { await supabase.from('requests').update({ is_active: false }).eq('id', proposal.id); fetchCloudData(); } return; }
      if (!confirm('Godta tilbudet?')) return;
      const { data: existingAssignment } = await supabase.from('assignments').select('id').eq('shift_id', proposal.shiftId).eq('family_id', proposal.fromFamilyId).single();
      if (!existingAssignment) return alert('Fant ikke vakten.');
      const { error } = await supabase.from('assignments').update({ family_id: currentFamily.id, status: 'assigned' }).eq('id', existingAssignment.id);
      if (error) return alert('Feil: ' + error.message);
      await supabase.from('requests').update({ is_active: false }).eq('id', proposal.id);
      alert('✅ Vakt overført!'); fetchCloudData();
  };
  const addToCalendar = (shift: Shift) => {
    const sTime = shift.startTime.replace(':', ''); const eTime = shift.endTime.replace(':', ''); const dateStr = shift.date.replace(/-/g, '');
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(shift.name)}&dates=${dateStr}T${sTime}00/${dateStr}T${eTime}00&details=${encodeURIComponent(shift.eventName)}&location=${encodeURIComponent(shift.location)}`;
    window.open(url, '_blank');
  };

  const progressPercentage = Math.min(100, (points / nextTierPoints) * 100);

  if (loading) return <div style={{padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#1a2e1f'}}>Laster...</div>;
  if (!currentFamily) return <div style={{padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh'}}><h2 style={{color: '#1a2e1f'}}>Ingen familie valgt</h2><p style={{color: '#4a5e50'}}>Logg inn på nytt.</p><button onClick={handleLogout} style={{background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '8px 16px', color: '#1a2e1f', cursor: 'pointer'}}>Logg ut</button></div>;

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>

      {/* Header */}
      <div style={{ background: '#1e3a2f', padding: '24px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#fff' }}>Hei, {displayName || 'Familie'}!</h1>
                <div style={{ background: 'rgba(255,255,255,0.15)', color: '#7ec8a0', border: '1px solid rgba(255,255,255,0.3)', padding: '4px 12px', borderRadius: '12px', marginTop:'4px', fontSize: '12px', fontWeight: '600', display: 'inline-block' }}>
                    {points < 100 ? 'Basis' : points < 300 ? 'Aktiv' : 'Premium'} Nivå
                </div>
            </div>
            <button onClick={handleLogout} style={{background:'none', border:'1px solid rgba(255,255,255,0.4)', color:'#fff', borderRadius:'8px', padding:'6px 12px', cursor:'pointer', fontSize:'12px'}}>
                Logg ut
            </button>
        </div>

        <div style={{ background: '#fff', borderRadius: '8px', padding: '20px', color: '#1a2e1f', border: '0.5px solid #dedddd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: '#4a5e50', fontWeight: '600' }}>DINE POENG</span>
                <span style={{ fontSize: '32px', fontWeight: '700', color: '#2d6a4f' }}>{points}</span>
            </div>
            <div style={{ height: '8px', background: '#e8e0d0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#2d6a4f', width: `${progressPercentage}%`, borderRadius: '4px', transition: 'width 0.3s ease' }} />
            </div>
            <p style={{ fontSize: '13px', color: '#4a5e50', marginTop: '8px', textAlign: 'right' }}>
                {nextTierPoints - points} poeng til neste nivå
            </p>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Legg til flere barn — multi-child-støtte.
            Navigerer til /claim-family?mode=add hvor bruker kan
            taste inn koden for et annet barn (f.eks. søsken på
            et annet lag). ClaimFamilyPage flytter barnet fra
            ghost-familien til denne familien og bevarer team_id. */}
        <button
          onClick={() => window.location.href = '/claim-family?mode=add'}
          style={{
            width: '100%',
            marginBottom: '16px',
            padding: '14px 18px',
            background: '#fff',
            border: '1px dashed #2d6a4f',
            borderRadius: '10px',
            color: '#2d6a4f',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '18px' }}>+</span> Legg til barn med kode
        </button>

        {activeLottery && (
            <div style={{ padding: '24px', marginBottom: '24px', border: '2px solid #2d6a4f', background: '#e8f5ef', borderRadius: '8px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#2d6a4f', marginBottom: '8px', margin: 0 }}>🎟️ {activeLottery.name}</h2>
                <p style={{ color: '#2d6a4f', marginBottom: '16px' }}>Bli med å støtte laget! Selg lodd digitalt.</p>
                <button onClick={() => window.location.href = '/my-lottery'} style={{ width: '100%', background: '#2d6a4f', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Gå til min loddbok →</button>
            </div>
        )}

        {incomingProposals.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#2d6a4f' }}>🔔 Du har mottatt tilbud!</h2>
                {incomingProposals.map((prop, idx) => (
                    <div key={idx} style={{ padding: '20px', border: '2px solid #2d6a4f', background: '#e8f5ef', marginBottom: '12px', borderRadius: '8px' }}>
                        <p style={{ marginBottom: '12px', fontSize: '14px', color: '#1a2e1f' }}><strong>{prop.fromFamilyName}</strong> vil {prop.type === 'swap' ? 'bytte' : 'gi deg'} vakt: <br/> {prop.shiftName}</p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => handleProposalResponse(prop, true)} style={{ flex: 1, background: '#2d6a4f', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Godta</button>
                            <button onClick={() => handleProposalResponse(prop, false)} style={{ flex: 1, background: '#fff', border: '1px solid #dc2626', color: '#dc2626', padding: '10px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Avslå</button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {pendingEvents.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#854f0b' }}>⚠️ Handlinger kreves</h2>
                <div style={{ padding: '20px', border: '2px solid #fac775', background: '#fff8e6', borderRadius: '8px' }}>
                    <p style={{ marginBottom: '16px', fontWeight: '600', color: '#854f0b' }}>Du har {pendingEvents.length} arrangementer hvor du må velge vakt:</p>
                    <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: '#854f0b' }}>
                        {pendingEvents.map(e => <li key={e.id}>{e.name} ({new Date(e.date).toLocaleDateString()})</li>)}
                    </ul>
                    <button onClick={() => window.location.href = '/my-shifts'} style={{ width: '100%', background: '#854f0b', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Gå til vaktvalg →</button>
                </div>
            </div>
        )}

        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: '#1a2e1f' }}>Dine kommende vakter</h2>

        {myShifts.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
                <p style={{ color: '#4a5e50' }}>Du har ingen kommende vakter.</p>
                {pendingEvents.length === 0 && (
                    <button onClick={() => window.location.href = '/my-shifts'} style={{ marginTop: '16px', background: '#2d6a4f', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Se etter ledige vakter</button>
                )}
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myShifts.map(shift => {
                    const isSwapRequested = !!shift.swapRequestId;
                    const isSubstituteRequested = !!shift.substituteRequestId;
                    const startDateTime = new Date(`${shift.date}T${shift.startTime}`);
                    const isCritical = (startDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60) < 48;

                    return (
                        <div key={shift.id} style={{ padding: '0', overflow: 'hidden', border: isCritical ? '2px solid #dc2626' : '0.5px solid #dedddd', borderRadius: '8px', background: '#fff' }}>
                            {isCritical && <div style={{ background: '#dc2626', color: '#fff', padding: '8px 16px', fontSize: '13px', fontWeight: '700' }}>⚠️ Under 48 timer til start!</div>}
                            {(isSwapRequested || isSubstituteRequested) && !isCritical && (
                                <div style={{ background: isSubstituteRequested ? '#fff5f5' : '#fff8e6', color: isSubstituteRequested ? '#dc2626' : '#854f0b', padding: '8px 16px', fontSize: '12px', fontWeight: '600', borderBottom: isSubstituteRequested ? '1px solid #fecaca' : '1px solid #fac775' }}>
                                    {isSubstituteRequested ? '📢 Søker vikar' : '🔄 På byttebørsen'}
                                </div>
                            )}
                            {shift.bidStatus === 'pending' && shift.bidAmount && (
                                <div style={{ padding: '10px 16px', background: '#fff8e6', borderBottom: '1px solid #fac775', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#854f0b' }}>💰 Bud mottatt: {shift.bidAmount} kr</div>
                                        {shift.bidMessage && <div style={{ fontSize: '11px', color: '#854f0b' }}>"{shift.bidMessage}"</div>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => setChatOpen({ requestId: shift.substituteRequestId!, otherName: 'Vikar' })} style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', color: '#1a2e1f' }}>💬</button>
                                        <button onClick={() => handleAcceptBid(shift.substituteRequestId!, shift.bidFamilyId!, shift.id, shift.bidAmount!)} style={{ fontSize: '12px', padding: '6px 14px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Aksepter</button>
                                    </div>
                                </div>
                            )}
                            {shift.bidStatus === 'accepted' && shift.substituteRequestId && (
                                <div style={{ padding: '10px 16px', background: '#e8f5ef', borderBottom: '1px solid #b8dfc9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#2d6a4f' }}>Vikar bekreftet</div>
                                    <button onClick={() => setChatOpen({ requestId: shift.substituteRequestId!, otherName: 'Vikar' })} style={{ fontSize: '12px', padding: '6px 14px', background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', color: '#1a2e1f' }}>💬 Chat med vikar</button>
                                </div>
                            )}
                            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '700', color: '#1a2e1f' }}>{new Date(shift.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}</span>
                                    <span style={{ color: '#6b7f70' }}>•</span>
                                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a2e1f' }}>{shift.eventName}</span>
                                </div>
                                {shift.isConfirmed ? <span style={{ background: '#e8f5ef', color: '#2d6a4f', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Bekreftet</span> : <span style={{ background: '#fff8e6', color: '#854f0b', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Må bekreftes</span>}
                            </div>
                            <div style={{ padding: '16px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a2e1f' }}>{shift.name}</div>
                                    <div style={{ fontSize: '14px', color: '#4a5e50' }}>
                                        ⏰ {shift.startTime} - {shift.endTime} <br/>
                                        📍 {shift.location || 'Sted ikke angitt'}
                                    </div>
                                    {shift.description && <div style={{marginTop:'8px', fontSize:'13px', background:'#faf8f4', padding:'8px', borderRadius:'4px', color:'#4a5e50', fontStyle:'italic'}}>ℹ️ {shift.description}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {!shift.isConfirmed && !isCritical && (
                                      <button onClick={() => handleConfirmShift(shift.assignmentId)} style={{ flex: 1, background: '#2d6a4f', minWidth: '120px', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer' }}>
                                        <div style={{ fontSize: '16px' }}>👍</div>
                                        <div style={{ fontSize: '12px', fontWeight: '600' }}>Jeg kommer</div>
                                      </button>
                                    )}
                                    {!isCritical && (
                                      <button onClick={() => handleSwapToggle(shift.id, shift.swapRequestId)} style={{ flex: 1, border: '0.5px solid #dedddd', minWidth: '100px', background: '#fff', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer' }}>
                                        <div style={{ fontSize: '16px' }}>{isSwapRequested ? '↩️' : '↔️'}</div>
                                        <div style={{ fontSize: '11px', color: '#4a5e50' }}>{isSwapRequested ? 'Avbryt bytte' : 'Bytt med noen'}</div>
                                      </button>
                                    )}
                                    <button onClick={() => handleSubstituteToggle(shift.id, shift.substituteRequestId)} style={{ flex: 1, border: '0.5px solid #dedddd', minWidth: '100px', background: '#fff', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer' }}>
                                      <div style={{ fontSize: '16px' }}>{isSubstituteRequested ? '↩️' : '🙋'}</div>
                                      <div style={{ fontSize: '11px', color: '#4a5e50' }}>{isSubstituteRequested ? 'Avbryt vikar-søk' : 'Finn vikar'}</div>
                                    </button>
                                    <button onClick={() => addToCalendar(shift)} style={{ flex: 1, background: '#fff', border: '0.5px solid #dedddd', minWidth: '100px', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer' }}>
                                      <div style={{ fontSize: '16px' }}>📅</div>
                                      <div style={{ fontSize: '11px', color: '#4a5e50' }}>Legg i kalender</div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        <div style={{ padding: '20px', marginTop: '20px', background: '#e8f5ef', border: '1px solid #b8dfc9', borderRadius: '8px' }}>
            {sponsorsVisible && (
              <>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#2d6a4f', marginBottom: '8px' }}>🏪 Sponsorrabatter</h3>
                <p style={{ fontSize: '13px', color: '#4a5e50', marginBottom: '12px' }}>Se dine rabatter basert på ditt poengnivå.</p>
                <button onClick={() => window.location.href = '/sponsors'} style={{ width: '100%', marginBottom: '16px', background: '#2d6a4f', color: '#fff', border: 'none', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Se mine rabatter →</button>
              </>
            )}
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#2d6a4f', marginBottom: '8px' }}>🙋 Jeg vil ha vakter</h3>
            <p style={{ fontSize: '12px', color: '#4a5e50', marginBottom: '8px' }}>Meld din interesse — du prioriteres ved tildeling.</p>
            <button onClick={async () => {
              if (!currentFamily) return;
              const types = ['Kioskvakt', 'Billettsalg', 'Fair play', 'Rydding', 'Rigging', 'Baking', 'Alle typer'];
              const current = (() => { try { return JSON.parse(currentFamily.willing_shift_types || '[]'); } catch { return []; } })();
              const chosen = prompt('Hvilke vakttyper ønsker du?\n\n' + types.map((t) => `${current.includes(t) ? '✅' : '☐'} ${t}`).join('\n') + '\n\nSkriv inn nummer (kommaseparert) eller "alle":', current.length > 0 ? current.join(', ') : '');
              if (chosen === null) return;
              const selected = chosen.toLowerCase() === 'alle' ? ['Alle typer'] : chosen.split(',').map(s => s.trim()).filter(Boolean);
              await supabase.from('families').update({ willing_shift_types: JSON.stringify(selected) }).eq('id', currentFamily.id);
              alert('✅ Registrert! Koordinator ser din interesse.');
            }} style={{ width: '100%', marginBottom: '16px', fontSize: '13px', background: '#fff', color: '#2d6a4f', border: '0.5px solid #dedddd', padding: '10px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
              Meld interesse for vakter
            </button>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#2d6a4f', marginBottom: '8px' }}>💰 Vil du tjene ekstra?</h3>
            <button onClick={() => window.location.href = '/substitute-marketplace'} style={{ width: '100%', background: '#2d6a4f', border: 'none', color: '#fff', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Gå til Vikar-børsen →</button>
        </div>

      </div>
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid #dedddd', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 100 }}>
        <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#2d6a4f', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '4px 8px' }}><div style={{ fontSize: '20px', marginBottom: '2px' }}>🏠</div>Hjem</button>
        <button onClick={() => window.location.href = '/my-lottery'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}><div style={{ fontSize: '20px', marginBottom: '2px' }}>🎟️</div>Lodd</button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}><div style={{ fontSize: '20px', marginBottom: '2px' }}>📅</div>Vakter</button>
        <button onClick={() => window.location.href = '/family-members'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}><div style={{ fontSize: '20px', marginBottom: '2px' }}>👨‍👩‍👧</div>Familie</button>
      </div>
      {chatOpen && currentFamily && (
        <VikarChat
          requestId={chatOpen.requestId}
          currentUserId={currentFamily.id}
          currentUserName={displayName}
          otherName={chatOpen.otherName}
          onClose={() => setChatOpen(null)}
        />
      )}
    </div>
  );
};
