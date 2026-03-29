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
                        status
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
                shifts: e.shifts.map((s: any) => {
                    const assignedIds = s.assignments?.map((a: any) => a.family_id) || [];
                    const myAssignment = s.assignments?.find((a: any) => a.family_id === myFamilyId);
                    const activeRequests = s.requests?.filter((r: any) => r.is_active) || [];
                    const swapReq = activeRequests.find((r: any) => r.type === 'swap');
                    const subReq = activeRequests.find((r: any) => r.type === 'substitute');
                    
                    return {
                        id: s.id,
                        name: s.name,
                        startTime: s.start_time?.slice(0,5),
                        endTime: s.end_time?.slice(0,5),
                        peopleNeeded: s.people_needed,
                        assignedFamilies: assignedIds,
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
    const event = events.find(e => e.shifts.some(s => s.id === shiftId));
    if (event) {
        const hasShift = event.shifts.some(s => s.assignedFamilies.includes(currentFamilyId));
        if (hasShift) { alert('Du har allerede en vakt på dette arrangementet.'); return; }
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

  const getFilteredEvents = () => {
    const eventsCopy = JSON.parse(JSON.stringify(events));
    return eventsCopy.reduce((acc: any, event: Event) => {
      const relevantShifts = event.shifts.filter(shift => {
        const isTakenByMe = shift.assignedFamilies?.includes(currentFamilyId);
        const spotsLeft = shift.peopleNeeded - (shift.assignedFamilies?.length || 0);
        const swapReq = shift.swapRequest;
        const isMySwap = swapReq?.familyId === currentFamilyId;
        const isDirectToMe = swapReq?.type === 'direct' && swapReq?.targetFamilyId === currentFamilyId;

        if (activeTab === 'mine') return isTakenByMe;
        if (activeTab === 'swap') return (swapReq && !isMySwap) || isDirectToMe;
        return event.assignmentMode === 'self-service' && spotsLeft > 0 && !isTakenByMe;
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
        const spotsLeft = s.peopleNeeded - (s.assignedFamilies?.length || 0);
        const swapReq = s.swapRequest;
        const isDirectToMe = swapReq?.type === 'direct' && swapReq?.targetFamilyId === currentFamilyId;
        
        if (type === 'mine' && isTakenByMe) count++;
        if (type === 'available' && e.assignmentMode === 'self-service' && spotsLeft > 0 && !isTakenByMe) count++;
        if (type === 'swap' && swapReq && (swapReq.familyId !== currentFamilyId || isDirectToMe)) count++;
    }));
    return count;
  };

  if (loading) return <div style={{padding: '40px', textAlign:'center'}}>Laster vaktliste... ☁️</div>;

  if (!currentFamilyId) {
      return (
          <div style={{padding: '40px', textAlign: 'center'}}>
              <h2>Ingen familie valgt</h2>
              <p>Du må være registrert i en familie for å velge vakter.</p>
          </div>
      );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', maxWidth: '1200px', margin: '0 auto' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700' }}>Velg vakter</h1>
            <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>Logget inn som: {currentUserEmail}</p>
          </div>
          {/* Slettet dropdown herfra. Bruk DevTools for å bytte. */}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'white', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: '1200px' }}>
            {['available', 'mine', 'swap'].map(t => (
                <button key={t} onClick={() => setActiveTab(t as any)} style={{
                    flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', cursor: 'pointer',
                    fontWeight: activeTab === t ? '600' : '400',
                    color: activeTab === t ? 'var(--primary-color)' : 'var(--text-secondary)',
                    borderBottom: activeTab === t ? '2px solid var(--primary-color)' : '2px solid transparent'
                }}>
                    {t === 'available' ? '📋 Ledige' : t === 'mine' ? '✅ Mine vakter' : '🔄 Byttebørs'} ({getCount(t)})
                </button>
            ))}
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '32px' }}>
        
        {/* Sidebar */}
        <div style={{ display: sortedKeys.length === 0 ? 'none' : 'block' }}>
          <div style={{ position: 'sticky', top: '20px', background: 'white', borderRadius: 'var(--radius-lg)', padding: '16px', border: '1px solid var(--border-color)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-secondary)' }}>
              {activeTab === 'swap' ? 'BYTTEFORESPØRSLER' : 'ARRANGEMENTER'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sortedKeys.map(name => {
                const day = groupedEvents[name][0];
                const date = new Date(day.date);
                return (
                  <button key={name} onClick={() => scrollToEvent(name)} style={{ textAlign: 'left', padding: '10px', background: 'var(--background)', border: '1px solid transparent', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <div style={{ fontWeight: '600' }}>{date.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' })} - {name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>⚽ {activeTeamName}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main List */}
        <div>
          {sortedKeys.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
              <p style={{ color: 'var(--text-secondary)' }}>
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
                <div key={name} id={name} className="card" style={{ padding: '24px', marginBottom: '32px', scrollMarginTop: '20px' }}>
                  <div style={{ marginBottom: '24px', borderBottom: '2px solid var(--primary-color)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>{name}</h2>
                        {hasShiftInGroup && activeTab === 'available' && <span className="badge" style={{background:'#dcfce7', color:'#166534'}}>✓ Vakt valgt</span>}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>📍 {location}</div>
                  </div>

                  {group.map((event: Event) => (
                    <div key={event.id} style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', background: '#f0f9ff', padding: '8px 12px', borderRadius: '4px', display: 'inline-block' }}>
                        📅 {new Date(event.date).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </h3>
                      
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
                                display: 'grid', gridTemplateColumns: '2fr 140px 100px 140px', alignItems: 'center',
                                padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                                background: isDirectToMe ? '#ebf8ff' : isTakenByMe ? '#fff' : '#fff',
                                borderColor: isDirectToMe ? '#3182ce' : 'var(--border-color)'
                            }}>
                              <div>
                                <div style={{ fontWeight: '600' }}>{shift.name}</div>
                                
                                {isTakenByMe && swapReq && (
                                    <div style={{ marginTop: '6px', fontSize: '12px' }}>
                                        <span style={{color: '#d97706', fontWeight:'600', background:'#fef3c7', padding:'2px 6px', borderRadius:'4px'}}>🔄 Ligger ute på byttebørsen</span>
                                    </div>
                                )}
                                
                                {isDirectToMe && <div style={{fontSize: '12px', color: '#2b6cb0', fontWeight: '600'}}>📨 Tilbud fra {swapperName}</div>}
                                {swapReq?.type === 'market' && activeTab === 'swap' && <div style={{fontSize: '12px', color: '#d97706'}}>Fra {swapperName}: <em>"{swapReq.comment}"</em></div>}
                              </div>

                              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                {activeTab === 'swap' ? 'Ønsker bytte' : isFull ? 'Fulltegnet' : `${spotsLeft} ledig`}
                              </div>

                              <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>{shift.startTime}-{shift.endTime}</div>

                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                {activeTab === 'mine' ? (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    {!swapReq ? (
                                        <button onClick={() => openSwapModal(event.id, shift.id)} className="btn" style={{ fontSize: '12px', padding: '6px 12px', background: 'white', border: '1px solid var(--border-color)' }} disabled={!!subReq}>
                                            ↔️ Bytt
                                        </button>
                                    ) : (
                                        <>
                                            <button onClick={() => openSwapModal(event.id, shift.id, swapReq)} className="btn" style={{ fontSize: '12px', padding: '6px 12px', background: '#fefce8', border: '1px solid #eab308', color: '#854d0e' }}>
                                                ✏️ Endre
                                            </button>
                                            <button onClick={() => cancelSwapRequest(swapReq.id)} className="btn" style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', border: '1px solid #e53e3e', color: '#e53e3e' }}>
                                                ❌ Trekk
                                            </button>
                                        </>
                                    )}
                                    
                                    {!subReq ? (
                                        <button onClick={() => handleSubstituteToggle(shift.id, undefined, false)} className="btn" style={{ fontSize: '12px', padding: '6px 12px', background: 'white', border: '1px solid var(--border-color)' }} disabled={!!swapReq}>
                                            💰 Vikar
                                        </button>
                                    ) : (
                                        <button onClick={() => handleSubstituteToggle(shift.id, subReq.id, true)} className="btn" style={{ fontSize: '12px', padding: '6px 12px', background: '#fff5f5', border: '1px solid #f43f5e', color: '#be123c' }}>
                                            ❌ Trekk vikar
                                        </button>
                                    )}
                                  </div>
                                ) : activeTab === 'swap' ? (
                                  <button onClick={() => initiateSwapOrTake(shift, swapReq!.familyId)} className="btn btn-primary" style={{ fontSize: '13px', padding: '6px 16px' }}>Ta / Bytt</button>
                                ) : (
                                  <button onClick={() => claimShift(shift.id)} className="btn btn-primary" style={{ fontSize: '13px', padding: '6px 16px', opacity: (isFull || hasShiftInGroup) ? 0.5 : 1, cursor: (isFull || hasShiftInGroup) ? 'not-allowed' : 'pointer' }} disabled={isFull || hasShiftInGroup}>
                                    {hasShiftInGroup ? 'Har vakt' : 'Velg'}
                                  </button>
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
            <div className="card" style={{ width: '400px', padding: '24px' }}>
                <h3 style={{ marginTop: 0 }}>Bytt vakt</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: swapType === 'market' ? '#ebf8ff' : 'white' }}>
                        <input type="radio" name="swapType" checked={swapType === 'market'} onChange={() => setSwapType('market')} />
                        <div><div style={{ fontWeight: '600' }}>📢 Legg ut på Byttebørs</div></div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: swapType === 'direct' ? '#ebf8ff' : 'white' }}>
                        <input type="radio" name="swapType" checked={swapType === 'direct'} onChange={() => setSwapType('direct')} />
                        <div><div style={{ fontWeight: '600' }}>✅ Jeg har avtalt bytte</div></div>
                    </label>
                </div>
                {swapType === 'market' && <div style={{ marginBottom: '16px' }}><label className="input-label">Melding</label><input type="text" className="input" value={swapComment} onChange={(e) => setSwapComment(e.target.value)} placeholder="F.eks. 'Bytter mot søndag'..." /></div>}
                {swapType === 'direct' && <div style={{ marginBottom: '16px' }}><label className="input-label">Hvem har du avtalt med?</label><select className="input" value={swapTargetFamily} onChange={(e) => setSwapTargetFamily(e.target.value)}><option value="">-- Velg familie --</option>{otherFamilies.filter(f => f.id !== currentFamilyId).map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}</select></div>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}><button onClick={() => setSwapModal(null)} className="btn">Avbryt</button><button onClick={confirmSwapRequest} className="btn btn-primary">Bekreft</button></div>
            </div>
        </div>
      )}

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">📅</div>Vakter</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-members'}><div className="bottom-nav-icon">👨‍👩‍👧</div>Familie</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/points-tier'}><div className="bottom-nav-icon">⭐</div>Poeng</button>
      </div>
    </div>
  );
};