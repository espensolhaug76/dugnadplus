import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface SwapRequest {
  id?: string;
  familyId: string;
  date: string;
  type: 'market' | 'direct';
  targetFamilyId?: string;
  comment?: string;
}

interface SwapProposal {
  id?: string;
  proposerFamilyId: string;
  proposerEventId: string;
  proposerShiftId: string;
  proposerShiftName: string;
  proposerShiftDate: string;
  proposerShiftTime: string;
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  assignedFamilies: string[];
  assignedNames?: string[];
  assignedPeople?: number;
  swapRequest?: SwapRequest;
  swapProposal?: SwapProposal;
  substituteRequest?: { id: string; familyId: string; date: string };
  assignmentId?: string;
}

interface Event {
  id: string;
  eventName: string;
  date: string;
  location?: string;
  sport?: string;
  shifts: Shift[];
  assignmentMode?: string;
  selfServiceOpenDate?: string;
}

export const MyShiftsPage: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [currentFamilyId, setCurrentFamilyId] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [activeTeamName, setActiveTeamName] = useState('Gutter 2016');
  const [activeTab, setActiveTab] = useState<'available' | 'mine' | 'swap'>('available');
  const [loading, setLoading] = useState(true);

  // Vi trenger en liste over andre familier KUN for bytte-modalen (hvem skal vi bytte med?)
  // Men vi trenger ikke vise den i headeren.
  const [otherFamilies, setOtherFamilies] = useState<any[]>([]);

  // State for Swap Modal
  const [swapModal, setSwapModal] = useState<{isOpen: boolean, eventId: string, shiftId: string} | null>(null);
  const [swapType, setSwapType] = useState<'market' | 'direct'>('market');
  const [swapComment, setSwapComment] = useState('');
  const [swapTargetFamily, setSwapTargetFamily] = useState('');

  useEffect(() => {
      fetchSupabaseData();
  }, []);

  const fetchSupabaseData = async () => {
    setLoading(true);
    try {
        // 1. Hent bruker og team info
        const userJson = localStorage.getItem('dugnad_user');
        const user = userJson ? JSON.parse(userJson) : null;
        if (user) setCurrentUserEmail(user.email);

        const storedTeam = localStorage.getItem('dugnad_current_team');
        if (storedTeam) {
            try { const team = JSON.parse(storedTeam); if (team.name) setActiveTeamName(team.name); } catch (e) { console.error(e); }
        }

        // 2. Finn MIN familie (via Auth eller LocalStorage)
        let myFamilyId = user?.id;

        // Hvis vi mangler ID, prøv å finne via e-post i databasen
        if (!myFamilyId && user?.email) {
             const { data: familyByEmail } = await supabase
                .from('families')
                .select('id')
                .eq('contact_email', user.email)
                .single();
             if (familyByEmail) myFamilyId = familyByEmail.id;
        }

        if (myFamilyId) {
            setCurrentFamilyId(myFamilyId);
        } else {
            console.warn("Ingen familie funnet for innlogget bruker.");
        }

        // 3. Hent liste over ALLE familier (kun navn og ID) for bytte-funksjonalitet
        const { data: familiesData } = await supabase.from('families').select('id, name, family_members(name, role)');
        if (familiesData) {
             const formatted = familiesData.map((f: any) => ({
                id: f.id,
                name: f.name,
                parents: f.family_members?.filter((m: any) => m.role === 'parent')
            }));
            setOtherFamilies(formatted);
        }

        // 4. Hent Events
        const { data: eventsData } = await supabase
            .from('events')
            .select(`
                *,
                shifts (
                    *,
                    assignments (
                        id,
                        family_id,
                        status,
                        families (name, family_members(name, role))
                    ),
                    requests (
                        id,
                        type,
                        family_id:from_family_id,
                        to_family_id,
                        target_family_id,
                        comment,
                        is_active,
                        created_at
                    )
                )
            `)
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true });

        if (eventsData) {
            const mappedEvents: Event[] = eventsData.map((e: any) => ({
                id: e.id,
                eventName: e.name,
                date: e.date,
                location: e.location,
                sport: e.sport,
                assignmentMode: e.assignment_mode,
                selfServiceOpenDate: e.self_service_open_date,
                shifts: e.shifts.map((s: any) => {
                    const assignedIds = s.assignments?.map((a: any) => a.family_id) || [];
                    const myAssignment = s.assignments?.find((a: any) => a.family_id === myFamilyId);
                    const activeRequests = s.requests?.filter((r: any) => r.is_active) || [];
                    const swapReq = activeRequests.find((r: any) => r.type === 'swap');
                    const subReq = activeRequests.find((r: any) => r.type === 'substitute');

                    // Finn hvem som søker vikar (de skal ikke vises som tildelt)
                    const subRequesterIds = new Set(
                        activeRequests.filter((r: any) => r.type === 'substitute').map((r: any) => r.family_id)
                    );

                    const assignedNames = s.assignments
                        ?.filter((a: any) => !subRequesterIds.has(a.family_id))
                        .map((a: any) => {
                            const children = a.families?.family_members?.filter((m: any) => m.role === 'child') || [];
                            return children.length > 0 ? children[0].name : a.families?.name || 'Ukjent';
                        }) || [];

                    return {
                        id: s.id,
                        name: s.name,
                        startTime: s.start_time?.slice(0,5),
                        endTime: s.end_time?.slice(0,5),
                        peopleNeeded: s.people_needed,
                        assignedFamilies: assignedIds,
                        assignedNames,
                        assignedPeople: assignedIds.length,
                        assignmentId: myAssignment?.id,
                        swapRequest: swapReq ? {
                            id: swapReq.id,
                            familyId: swapReq.family_id,
                            date: swapReq.created_at,
                            type: swapReq.target_family_id ? 'direct' : 'market',
                            targetFamilyId: swapReq.target_family_id,
                            comment: swapReq.comment
                        } : undefined,
                        substituteRequest: subReq ? {
                            id: subReq.id,
                            familyId: subReq.family_id,
                            date: subReq.created_at
                        } : undefined
                    };
                }).sort((a: any, b: any) => a.startTime.localeCompare(b.startTime))
            }));
            setEvents(mappedEvents);
        }

    } catch (error) {
        console.error("Feil ved henting av data:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- ACTIONS ---

  const openSwapModal = (eventId: string, shiftId: string, existingRequest?: SwapRequest) => {
    setSwapModal({ isOpen: true, eventId, shiftId });
    if (existingRequest) {
        setSwapType(existingRequest.type);
        setSwapComment(existingRequest.comment || '');
        setSwapTargetFamily(existingRequest.targetFamilyId || '');
    } else {
        setSwapType('market');
        setSwapComment('');
        setSwapTargetFamily('');
    }
  };

  const confirmSwapRequest = async () => {
    if (!swapModal) return;
    if (swapType === 'direct' && !swapTargetFamily) { alert('Velg hvem du har avtalt bytte med.'); return; }

    try {
        await supabase.from('requests').insert({
            shift_id: swapModal.shiftId,
            from_family_id: currentFamilyId,
            type: 'swap',
            target_family_id: swapType === 'direct' ? swapTargetFamily : null,
            comment: swapComment,
            is_active: true
        });

        alert('✅ Bytteforespørsel opprettet!');
        setSwapModal(null);
        fetchSupabaseData();
    } catch (e: any) {
        alert('Feil: ' + e.message);
    }
  };

  const cancelSwapRequest = async (requestId?: string) => {
    if (!requestId) return;
    if (!confirm('Vil du trekke tilbake bytteforespørselen?')) return;

    await supabase.from('requests').update({ is_active: false }).eq('id', requestId);
    fetchSupabaseData();
  };

  const handleSubstituteToggle = async (shiftId: string, requestId?: string, isActive?: boolean) => {
    if (isActive) {
        if (!confirm('Trekke vikar-søket?')) return;
        if (requestId) await supabase.from('requests').update({ is_active: false }).eq('id', requestId);
    } else {
        if (!confirm('Legge ut til vikar?')) return;
        await supabase.from('requests').insert({
            shift_id: shiftId,
            from_family_id: currentFamilyId,
            type: 'substitute',
            is_active: true
        });
    }
    fetchSupabaseData();
  };

  const claimShift = async (shiftId: string) => {
    if (!currentFamilyId) return alert('Ingen familie valgt');

    // Sjekk i DB om allerede tildelt denne vakten
    const { data: existing } = await supabase
      .from('assignments')
      .select('id')
      .eq('shift_id', shiftId)
      .eq('family_id', currentFamilyId)
      .maybeSingle();
    if (existing) { alert('Du er allerede registrert på denne vakten.'); return; }

    // Sjekk om familien har vakt på dette arrangementet allerede
    const event = events.find(e => e.shifts.some(s => s.id === shiftId));
    if (event) {
        const hasShift = event.shifts.some(s => s.assignedFamilies.includes(currentFamilyId));
        if (hasShift) { alert('Du har allerede valgt en vakt på dette arrangementet.'); return; }
    }

    const { error } = await supabase.from('assignments').insert({
        shift_id: shiftId,
        family_id: currentFamilyId,
        status: 'assigned'
    });

    if (error) alert('Feil: ' + error.message);
    else { alert('✅ Vakt valgt!'); fetchSupabaseData(); }
  };

  const initiateSwapOrTake = async (targetShift: Shift, originalFamilyId: string) => {
    if (!currentFamilyId) return;
    if (!confirm(`Vil du overta vakten "${targetShift.name}"?`)) return;
    if (!targetShift.swapRequest?.id) return;

    // Finn gammel assignment ID
    const { data: oldAssignment } = await supabase
        .from('assignments')
        .select('id')
        .eq('shift_id', targetShift.id)
        .eq('family_id', originalFamilyId)
        .single();

    if (!oldAssignment) {
        alert('Kunne ikke finne den opprinnelige tildelingen.');
        return;
    }

    const { error: updateError } = await supabase
        .from('assignments')
        .update({ family_id: currentFamilyId, status: 'assigned' })
        .eq('id', oldAssignment.id);

    if (updateError) { alert('Feil: ' + updateError.message); return; }

    await supabase.from('requests').update({ is_active: false }).eq('id', targetShift.swapRequest.id);
    alert('✅ Vakt overtatt!');
    fetchSupabaseData();
  };

  const scrollToEvent = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isSelfServiceOpen = (event: Event): boolean => {
    if (event.assignmentMode !== 'self-service') return true;
    if (!event.selfServiceOpenDate) return true; // Ingen dato satt = alltid åpen
    return new Date() >= new Date(event.selfServiceOpenDate);
  };

  const formatOpenDate = (isoDate: string): string => {
    const d = new Date(isoDate);
    return `${d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })} kl ${d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const getFilteredEvents = () => {
    const eventsCopy = JSON.parse(JSON.stringify(events));
    return eventsCopy.reduce((acc: any, event: Event) => {
      const relevantShifts = event.shifts.filter(shift => {
        const isTakenByMe = shift.assignedFamilies?.includes(currentFamilyId);
        const swapReq = shift.swapRequest;
        const isMySwap = swapReq?.familyId === currentFamilyId;
        const isDirectToMe = swapReq?.type === 'direct' && swapReq?.targetFamilyId === currentFamilyId;

        if (activeTab === 'mine') return isTakenByMe;
        if (activeTab === 'swap') return (swapReq && !isMySwap) || isDirectToMe;
        // Vis alle vakter i selvvalg (inkl. din egen og fulle)
        return event.assignmentMode === 'self-service';
      });

      if (relevantShifts.length > 0) {
        event.shifts = relevantShifts;
        const baseName = event.eventName.split(' - Dag')[0];
        if (!acc[baseName]) acc[baseName] = [];
        acc[baseName].push(event);
      }
      return acc;
    }, {});
  };

  const groupedEvents = getFilteredEvents();
  const sortedKeys = Object.keys(groupedEvents).sort((a, b) => new Date(groupedEvents[a][0].date).getTime() - new Date(groupedEvents[b][0].date).getTime());

  const getCount = (type: string) => {
    let count = 0;
    events.forEach(e => e.shifts.forEach(s => {
        const isTakenByMe = s.assignedFamilies?.includes(currentFamilyId);
        const swapReq = s.swapRequest;
        const isDirectToMe = swapReq?.type === 'direct' && swapReq?.targetFamilyId === currentFamilyId;

        if (type === 'mine' && isTakenByMe) count++;
        if (type === 'available' && e.assignmentMode === 'self-service') count++;
        if (type === 'swap' && swapReq && (swapReq.familyId !== currentFamilyId || isDirectToMe)) count++;
    }));
    return count;
  };

  if (loading) return <div style={{padding: '40px', textAlign:'center', color: '#1a2e1f'}}>Laster vaktliste... ☁️</div>;

  if (!currentFamilyId) {
      return (
          <div style={{padding: '40px', textAlign: 'center', color: '#1a2e1f'}}>
              <h2>Ingen familie valgt</h2>
              <p style={{ color: '#4a5e50' }}>Du må være registrert i en familie for å velge vakter.</p>
          </div>
      );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', maxWidth: '1200px', margin: '0 auto' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'white' }}>Velg vakter</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', marginTop: '4px' }}>
              {(() => { try { const u = JSON.parse(localStorage.getItem('dugnad_user') || '{}'); return u.name || u.fullName || currentUserEmail; } catch { return currentUserEmail; } })()}
            </p>
          </div>
          {/* Slettet dropdown herfra. Bruk DevTools for å bytte. */}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #dedddd', background: '#fff', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: '1200px' }}>
            {['available', 'mine', 'swap'].map(t => (
                <button key={t} onClick={() => setActiveTab(t as any)} style={{
                    flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', cursor: 'pointer',
                    fontWeight: activeTab === t ? '600' : '400',
                    color: activeTab === t ? '#1a2e1f' : '#6b7f70',
                    borderBottom: activeTab === t ? '2px solid #2d6a4f' : '2px solid transparent'
                }}>
                    {t === 'available' ? '📋 Ledige' : t === 'mine' ? '✅ Mine vakter' : '🔄 Byttebørs'} ({getCount(t)})
                </button>
            ))}
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px' }}>

        {/* Sidebar */}
        <div style={{ display: sortedKeys.length === 0 ? 'none' : 'block' }}>
          <div style={{ position: 'sticky', top: '20px', background: '#fff', borderRadius: '8px', padding: '16px', border: '0.5px solid #dedddd', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#4a5e50' }}>
              {activeTab === 'swap' ? 'BYTTEFORESPØRSLER' : 'ARRANGEMENTER'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedKeys.map(name => {
                const day = groupedEvents[name][0];
                const date = new Date(day.date);
                return (
                  <button key={name} onClick={() => scrollToEvent(name)} style={{ textAlign: 'left', padding: '10px', background: '#faf8f4', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#1a2e1f' }}>
                    <div style={{ fontWeight: '600' }}>{date.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' })} - {name}</div>
                    <div style={{ fontSize: '12px', color: '#4a5e50' }}>⚽ {activeTeamName}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main List */}
        <div>
          {sortedKeys.length === 0 ? (
            <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
              <p style={{ color: '#4a5e50' }}>
                {activeTab === 'swap' ? 'Ingen bytteforespørsler akkurat nå.' : activeTab === 'mine' ? 'Ingen vakter.' : 'Ingen ledige vakter.'}
              </p>
            </div>
          ) : (
            sortedKeys.map(name => {
              const group = groupedEvents[name];
              group.sort((a: Event, b: Event) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const location = group[0].location || 'Sted ukjent';
              const hasShiftInGroup = events.some(e => e.eventName.startsWith(name) && e.shifts.some(s => s.assignedFamilies?.includes(currentFamilyId)));

              return (
                <div key={name} id={name} style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px', marginBottom: '32px', scrollMarginTop: '20px' }}>
                  <div style={{ marginBottom: '24px', borderBottom: '2px solid #2d6a4f', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: '#1a2e1f' }}>{name}</h2>
                        {hasShiftInGroup && activeTab === 'available' && <span style={{background:'#e8f5ef', color:'#2d6a4f', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600'}}>✓ Vakt valgt</span>}
                    </div>
                    <div style={{ fontSize: '14px', color: '#4a5e50', marginTop: '4px' }}>📍 {location}</div>
                  </div>

                  {group.map((event: Event) => (
                    <div key={event.id} style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', background: '#e8f5ef', color: '#1a2e1f', padding: '8px 12px', borderRadius: '4px', display: 'inline-block' }}>
                        📅 {new Date(event.date).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h3>
                      {activeTab === 'available' && !isSelfServiceOpen(event) && event.selfServiceOpenDate && (
                        <div style={{ padding: '10px 14px', background: '#fff8e6', borderRadius: '8px', border: '1px solid #fac775', marginBottom: '12px', fontSize: '13px', color: '#854f0b' }}>
                          🕐 Selvvalg av vakter åpner <strong>{formatOpenDate(event.selfServiceOpenDate)}</strong>. Du kan se vaktene, men ikke velge ennå.
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {event.shifts.map((shift) => {
                          const isTakenByMe = shift.assignedFamilies?.includes(currentFamilyId);
                          const spotsLeft = shift.peopleNeeded - (shift.assignedFamilies?.length || 0);
                          const isFull = spotsLeft <= 0;

                          const swapReq = shift.swapRequest;
                          const subReq = shift.substituteRequest;

                          const isDirectToMe = swapReq?.type === 'direct' && swapReq?.targetFamilyId === currentFamilyId;
                          const swapperName = swapReq ? otherFamilies.find(f => f.id === swapReq.familyId)?.name || 'Ukjent' : 'Ukjent';

                          return (
                            <div key={shift.id} style={{
                                display: 'grid', gridTemplateColumns: '2fr 140px 100px 160px', alignItems: 'center',
                                padding: '16px', borderRadius: '8px', border: isTakenByMe ? '2px solid #2d6a4f' : isDirectToMe ? '1px solid #2d6a4f' : '0.5px solid #dedddd',
                                background: isTakenByMe ? '#e8f5ef' : isDirectToMe ? '#e8f5ef' : '#ffffff',
                                fontStyle: isTakenByMe && activeTab === 'available' ? 'italic' : 'normal'
                            }}>
                              <div>
                                <div style={{ fontWeight: '600', color: '#1a2e1f' }}>{shift.name}</div>

                                {isTakenByMe && swapReq && (
                                    <div style={{ marginTop: '6px', fontSize: '12px' }}>
                                        <span style={{color: '#854f0b', fontWeight:'600', background:'#fff8e6', padding:'2px 6px', borderRadius:'4px', border: '1px solid #fac775'}}>🔄 Ligger ute på byttebørsen</span>
                                    </div>
                                )}

                                {isDirectToMe && <div style={{fontSize: '12px', color: '#2d6a4f', fontWeight: '600'}}>📨 Tilbud fra {swapperName}</div>}
                                {swapReq?.type === 'market' && activeTab === 'swap' && <div style={{fontSize: '12px', color: '#854f0b'}}>Fra {swapperName}: <em>"{swapReq.comment}"</em></div>}
                              </div>

                              <div style={{ fontSize: '13px', color: '#4a5e50' }}>
                                {activeTab === 'swap' ? 'Ønsker bytte' : isFull ? 'Fulltegnet' : `${spotsLeft} ledig`}
                                {activeTab === 'available' && shift.assignedNames && shift.assignedNames.length > 0 && !isFull && (
                                  <div style={{ fontSize: '11px', color: '#6b7f70', marginTop: '2px' }}>{shift.assignedNames.join(', ')}</div>
                                )}
                              </div>

                              <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#1a2e1f' }}>{shift.startTime}-{shift.endTime}</div>

                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                {activeTab === 'mine' ? (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    {!swapReq ? (
                                        <button onClick={() => openSwapModal(event.id, shift.id)} style={{ fontSize: '12px', padding: '6px 12px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', color: '#1a2e1f' }} disabled={!!subReq}>
                                            ↔️ Bytt
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => openSwapModal(event.id, shift.id, swapReq)} style={{ fontSize: '12px', padding: '6px 12px', background: '#fff8e6', border: '1px solid #fac775', color: '#854f0b', borderRadius: '8px', cursor: 'pointer' }}>
                                                ✏️ Endre
                                            </button>
                                            <button onClick={() => cancelSwapRequest(swapReq.id)} style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', border: '1px solid #dc2626', color: '#dc2626', borderRadius: '8px', cursor: 'pointer' }}>
                                                ❌ Trekk
                                            </button>
                                        </>
                                    )}

                                    {!subReq ? (
                                        <button onClick={() => handleSubstituteToggle(shift.id, undefined, false)} style={{ fontSize: '12px', padding: '6px 12px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', color: '#1a2e1f' }} disabled={!!swapReq}>
                                            💰 Vikar
                                        </button>
                                    ) : (
                                        <button onClick={() => handleSubstituteToggle(shift.id, subReq.id, true)} style={{ fontSize: '12px', padding: '6px 12px', background: '#fef2f2', border: '1px solid #dc2626', color: '#dc2626', borderRadius: '8px', cursor: 'pointer' }}>
                                            ❌ Trekk vikar
                                        </button>
                                    )}
                                  </div>
                                ) : activeTab === 'swap' ? (
                                  <button onClick={() => initiateSwapOrTake(shift, swapReq!.familyId)} style={{ fontSize: '13px', padding: '6px 16px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Ta / Bytt</button>
                                ) : isSelfServiceOpen(event) ? (
                                  isTakenByMe ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#2d6a4f', background: '#e8f5ef', padding: '4px 10px', borderRadius: '8px' }}>✅ Din</span>
                                      <button onClick={() => { if (confirm('Vil du trekke deg fra denne vakten?')) { supabase.from('assignments').delete().eq('shift_id', shift.id).eq('family_id', currentFamilyId).then(() => fetchSupabaseData()); } }} style={{ fontSize: '11px', padding: '4px 10px', color: '#6b7f70', border: '0.5px solid #dedddd', background: '#ffffff', borderRadius: '8px', cursor: 'pointer' }}>
                                        Bytt
                                      </button>
                                    </div>
                                  ) : isFull ? (
                                    <span style={{ fontSize: '12px', color: '#6b7f70' }}>
                                      {shift.assignedNames && shift.assignedNames.length > 0 ? shift.assignedNames.join(', ') : 'Fulltegnet'}
                                    </span>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {shift.assignedNames && shift.assignedNames.length > 0 && (
                                        <span style={{ fontSize: '11px', color: '#6b7f70' }}>{shift.assignedNames.join(', ')}</span>
                                      )}
                                      <button onClick={() => claimShift(shift.id)} style={{ fontSize: '13px', padding: '6px 16px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                                        Velg
                                      </button>
                                    </div>
                                  )
                                ) : (
                                  <span style={{ fontSize: '12px', color: '#854f0b', background: '#fff8e6', padding: '6px 12px', borderRadius: '8px', textAlign: 'center', lineHeight: '1.3', border: '1px solid #fac775' }}>
                                    🕐 Åpner {formatOpenDate(event.selfServiceOpenDate!)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>

      {swapModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ width: '400px', padding: '24px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px' }}>
                <h3 style={{ marginTop: 0, color: '#1a2e1f' }}>Bytt vakt</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', background: swapType === 'market' ? '#e8f5ef' : '#ffffff' }}>
                        <input type="radio" name="swapType" checked={swapType === 'market'} onChange={() => setSwapType('market')} />
                        <div><div style={{ fontWeight: '600', color: '#1a2e1f' }}>📢 Legg ut på Byttebørs</div></div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', background: swapType === 'direct' ? '#e8f5ef' : '#ffffff' }}>
                        <input type="radio" name="swapType" checked={swapType === 'direct'} onChange={() => setSwapType('direct')} />
                        <div><div style={{ fontWeight: '600', color: '#1a2e1f' }}>✅ Jeg har avtalt bytte</div></div>
                    </label>
                </div>
                {swapType === 'market' && <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '13px', fontWeight: '600', color: '#4a5e50', display: 'block', marginBottom: '4px' }}>Melding</label><input type="text" value={swapComment} onChange={(e) => setSwapComment(e.target.value)} placeholder="F.eks. 'Bytter mot søndag'..." style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', boxSizing: 'border-box' }} /></div>}
                {swapType === 'direct' && <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '13px', fontWeight: '600', color: '#4a5e50', display: 'block', marginBottom: '4px' }}>Hvem har du avtalt med?</label><select value={swapTargetFamily} onChange={(e) => setSwapTargetFamily(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', boxSizing: 'border-box', background: '#ffffff' }}><option value="">-- Velg familie --</option>{otherFamilies.filter(f => f.id !== currentFamilyId).map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}</select></div>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setSwapModal(null)} style={{ padding: '8px 16px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer', color: '#1a2e1f', fontSize: '14px' }}>Avbryt</button>
                    <button onClick={confirmSwapRequest} style={{ padding: '8px 16px', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Bekreft</button>
                </div>
            </div>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', background: '#ffffff', borderTop: '1px solid #dedddd', padding: '8px 0', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', padding: '4px 12px' }}><div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
        <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#2d6a4f', fontSize: '11px', fontWeight: '600', padding: '4px 12px' }}><div style={{ fontSize: '20px' }}>📅</div>Vakter</button>
        <button onClick={() => window.location.href = '/family-members'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', padding: '4px 12px' }}><div style={{ fontSize: '20px' }}>👨‍👩‍👧</div>Familie</button>
        <button onClick={() => window.location.href = '/points-tier'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', padding: '4px 12px' }}><div style={{ fontSize: '20px' }}>⭐</div>Poeng</button>
      </div>
    </div>
  );
};
