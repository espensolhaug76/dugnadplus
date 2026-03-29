import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

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
  description?: string; // Lagt til for beskrivelse
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

  useEffect(() => {
    fetchCloudData();
  }, []);

  const fetchCloudData = async () => {
    setLoading(true);
    try {
      const userJson = localStorage.getItem('dugnad_user');
      const localUser = userJson ? JSON.parse(userJson) : null;
      
      // Sjekk auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userId = authUser?.id || localUser?.id;

      if (!userId) {
          setLoading(false);
          return;
      }

      // Hent familie
      const { data: family } = await supabase
        .from('families')
        .select('*, family_members(*)')
        .eq('id', userId)
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
            substituteRequestId: activeReq?.type === 'substitute' ? activeReq.id : undefined
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

  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Laster... ☁️</div>;
  if (!currentFamily) return <div style={{padding: '40px', textAlign: 'center'}}><h2>Ingen familie valgt</h2><p>Logg inn på nytt.</p><button onClick={handleLogout} className="btn">Logg ut</button></div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Hei, {displayName || 'Familie'}!</h1>
                <div className="badge badge-basis" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', padding: '4px 12px', borderRadius: '12px', marginTop:'4px' }}>
                    {points < 100 ? 'Basis' : points < 300 ? 'Aktiv' : 'Premium'} Nivå
                </div>
            </div>
            <button onClick={handleLogout} style={{background:'none', border:'1px solid white', color:'white', borderRadius:'8px', padding:'6px 12px', cursor:'pointer', fontSize:'12px'}}>
                Logg ut
            </button>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', color: 'var(--text-primary)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '600' }}>DINE POENG</span>
                <span style={{ fontSize: '32px', fontWeight: '700', color: 'var(--primary-color)' }}>{points}</span>
            </div>
            <div className="progress-bar" style={{ height: '8px', background: '#edf2f7', borderRadius: '4px', overflow: 'hidden' }}>
                <div className="progress-fill" style={{ height: '100%', background: '#16a8b8', width: `${progressPercentage}%` }} />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'right' }}>
                {nextTierPoints - points} poeng til neste nivå
            </p>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

        {activeLottery && (
            <div className="card" style={{ padding: '24px', marginBottom: '24px', border: '2px solid #16a8b8', background: '#f0fdf4' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#166534', marginBottom: '8px', margin: 0 }}>🎟️ {activeLottery.name}</h2>
                <p style={{ color: '#14532d', marginBottom: '16px' }}>Bli med å støtte laget! Selg lodd digitalt.</p>
                <button onClick={() => window.location.href = '/my-lottery'} className="btn btn-primary" style={{ width: '100%', background: '#16a8b8', border: 'none' }}>Gå til min loddbok →</button>
            </div>
        )}

        {incomingProposals.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#2c7a7b' }}>🔔 Du har mottatt tilbud!</h2>
                {incomingProposals.map((prop, idx) => (
                    <div key={idx} className="card" style={{ padding: '20px', border: '2px solid #38b2ac', background: '#e6fffa', marginBottom: '12px' }}>
                        <p style={{ marginBottom: '12px', fontSize: '14px' }}><strong>{prop.fromFamilyName}</strong> vil {prop.type === 'swap' ? 'bytte' : 'gi deg'} vakt: <br/> {prop.shiftName}</p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => handleProposalResponse(prop, true)} className="btn btn-primary" style={{ flex: 1 }}>✅ Godta</button>
                            <button onClick={() => handleProposalResponse(prop, false)} className="btn" style={{ flex: 1, background: 'white', border: '1px solid #e53e3e', color: '#e53e3e' }}>❌ Avslå</button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {pendingEvents.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px', color: '#c05621' }}>⚠️ Handlinger kreves</h2>
                <div className="card" style={{ padding: '20px', border: '2px solid #f6ad55', background: '#fffaf0' }}>
                    <p style={{ marginBottom: '16px', fontWeight: '600' }}>Du har {pendingEvents.length} arrangementer hvor du må velge vakt:</p>
                    <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
                        {pendingEvents.map(e => <li key={e.id}>{e.name} ({new Date(e.date).toLocaleDateString()})</li>)}
                    </ul>
                    <button onClick={() => window.location.href = '/my-shifts'} className="btn btn-primary" style={{ width: '100%', background: '#ed8936', border: 'none' }}>Gå til vaktvalg →</button>
                </div>
            </div>
        )}

        <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)' }}>Dine kommende vakter</h2>

        {myShifts.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
                <p style={{ color: 'var(--text-secondary)' }}>Du har ingen kommende vakter.</p>
                {pendingEvents.length === 0 && (
                    <button onClick={() => window.location.href = '/my-shifts'} className="btn btn-primary" style={{ marginTop: '16px' }}>Se etter ledige vakter</button>
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
                        <div key={shift.id} className="card" style={{ padding: '0', overflow: 'hidden', border: isCritical ? '2px solid #e53e3e' : '1px solid var(--border-color)' }}>
                            {isCritical && <div style={{ background: '#e53e3e', color: 'white', padding: '8px 16px', fontSize: '13px', fontWeight: '700' }}>⚠️ Under 48 timer til start!</div>}
                            {(isSwapRequested || isSubstituteRequested) && !isCritical && (
                                <div style={{ background: isSubstituteRequested ? '#fee2e2' : '#fef9c3', color: isSubstituteRequested ? '#991b1b' : '#854d0e', padding: '8px 16px', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                                    {isSubstituteRequested ? '📢 Søker vikar' : '🔄 På byttebørsen'}
                                </div>
                            )}
                            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{new Date(shift.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>•</span>
                                    <span style={{ fontSize: '14px', fontWeight: '500' }}>{shift.eventName}</span>
                                </div>
                                {shift.isConfirmed ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>✅ Bekreftet</span> : <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>Må bekreftes</span>}
                            </div>
                            <div style={{ padding: '16px' }}>
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '16px', fontWeight: '700' }}>{shift.name}</div>
                                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                        ⏰ {shift.startTime} - {shift.endTime} <br/> 
                                        📍 {shift.location || 'Sted ikke angitt'}
                                    </div>
                                    {shift.description && <div style={{marginTop:'8px', fontSize:'13px', background:'#f8fafc', padding:'8px', borderRadius:'4px', color:'#4b5563', fontStyle:'italic'}}>ℹ️ {shift.description}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    {!shift.isConfirmed && !isCritical && <button onClick={() => handleConfirmShift(shift.assignmentId)} className="btn btn-primary" style={{ flex: 1, background: '#48bb78' }}>👍 Jeg kommer</button>}
                                    {!isCritical && <button onClick={() => handleSwapToggle(shift.id, shift.swapRequestId)} className="btn" style={{ flex: 1, border: '1px solid #ddd' }}>{isSwapRequested ? '↩️ Trekk' : '↔️ Bytt'}</button>}
                                    <button onClick={() => handleSubstituteToggle(shift.id, shift.substituteRequestId)} className="btn" style={{ flex: 1, border: '1px solid #ddd' }}>{isSubstituteRequested ? '↩️ Trekk' : '💰 Vikar'}</button>
                                    <button onClick={() => addToCalendar(shift)} className="btn" style={{ flex: 1, background: 'white', border: '1px solid #d1d5db', color: '#374151' }}>📅 Kalender</button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}

        <div className="card" style={{ padding: '20px', marginTop: '20px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#166534', marginBottom: '8px' }}>💰 Vil du tjene ekstra?</h3>
            <button onClick={() => window.location.href = '/substitute-marketplace'} className="btn btn-primary" style={{ width: '100%', background: '#16a8b8', border: 'none' }}>Gå til Vikar-børsen →</button>
        </div>

      </div>
      <div className="bottom-nav">
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-lottery'}><div className="bottom-nav-icon">🎟️</div>Lodd</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}><div className="bottom-nav-icon">📅</div>Vakter</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}><div className="bottom-nav-icon">👨‍👩‍👧</div>Familie</button>
      </div>
    </div>
  );
};