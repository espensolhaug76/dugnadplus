import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { sendPushNotification } from '../../hooks/usePushNotifications';

// --- TYPEDEFINISJONER ---

interface Assignment {
  id: string;
  family_id: string;
  status: string;
  families?: { name: string };
}

interface DugnadShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  assignedFamilies: string[]; // Liste av ID-er
  assignedFamiliesCount: number;
  assignmentsFull: Assignment[]; // Hele objektet
  description?: string; // Valgfritt felt
}

interface DugnadEvent {
  id: string;
  eventName: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  sport?: string;
  assignment_mode?: string;
  slotDuration?: number;
  subgroup?: string;
  team_id?: string | null;
  shifts: DugnadShift[];
}

export const EventsList: React.FC = () => {
  const [events, setEvents] = useState<DugnadEvent[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // 1. Hent arrangementer med vakter og tildelinger
    const { data: eventsData, error: eventError } = await supabase
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
          )
        )
      `)
      .order('date', { ascending: true });

    if (eventError) console.error('Feil ved henting av events:', eventError);

    // 2. Hent familier
    const { data: familiesData, error: famError } = await supabase
      .from('families')
      .select('*, family_members(*)')
      .order('name');
      
    if (famError) console.error('Feil ved henting av familier:', famError);

    if (eventsData) {
        const processedEvents: DugnadEvent[] = eventsData.map((e: any) => ({
            id: e.id,
            eventName: e.name, 
            date: e.date,
            startTime: e.start_time?.slice(0,5),
            endTime: e.end_time?.slice(0,5),
            location: e.location,
            sport: e.sport,
            subgroup: e.subgroup,
            team_id: e.team_id ?? null,
            assignment_mode: e.assignment_mode,
            slotDuration: 2,
            shifts: e.shifts.map((s: any) => ({
                id: s.id,
                name: s.name,
                startTime: s.start_time?.slice(0,5),
                endTime: s.end_time?.slice(0,5),
                peopleNeeded: s.people_needed,
                assignedFamilies: s.assignments?.map((a: any) => a.family_id) || [],
                assignedFamiliesCount: s.assignments?.length || 0,
                assignmentsFull: s.assignments || [],
                description: s.description || ''
            })).sort((a: DugnadShift, b: DugnadShift) => a.name.localeCompare(b.name))
        }));
        setEvents(processedEvents);

        // Auto-expand nærmeste kommende arrangement
        const today = new Date().toISOString().split('T')[0];
        const upcoming = processedEvents.filter((e: any) => e.date >= today);
        if (upcoming.length > 0 && !expandedEventId) {
            setExpandedEventId(upcoming[0].id);
        } else if (processedEvents.length > 0 && !expandedEventId) {
            setExpandedEventId(processedEvents[processedEvents.length - 1].id);
        }
    }

    if (familiesData) {
        setFamilies(familiesData);
    }
    setLoading(false);
  };

  // --- HANDLINGER (CRUD) ---

  const handleDelete = async (eventId: string) => {
    if (!confirm('Er du sikker på at du vil slette dette arrangementet? Alt innhold forsvinner.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) alert('Feil: ' + error.message);
    else fetchData();
  };

  const handleEdit = (event: any) => {
    setEditingEventId(event.id);
    setEditForm({ ...event });
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    const { error } = await supabase
        .from('events')
        .update({
            name: editForm.eventName,
            date: editForm.date,
            start_time: editForm.startTime,
            end_time: editForm.endTime,
            sport: editForm.sport,
            assignment_mode: editForm.assignment_mode || 'auto'
        })
        .eq('id', editForm.id);

    if (error) alert('Feil: ' + error.message);
    else {
        setEditingEventId(null);
        fetchData();
    }
  };

  const handleFormChange = (field: string, value: any) => {
    setEditForm({ ...editForm, [field]: value });
  };

  // --- SHIFT MANAGEMENT (CRUD) ---

  const handleAddShift = async (eventId: string) => {
    const { error } = await supabase.from('shifts').insert({
        event_id: eventId,
        name: 'Ny vakt',
        start_time: '09:00',
        end_time: '11:00',
        people_needed: 1
    });
    if (error) alert(error.message); else fetchData();
  };

  const handleUpdateShift = async (shiftId: string, field: string, value: any) => {
    const dbField = field === 'peopleNeeded' ? 'people_needed' 
                  : field === 'startTime' ? 'start_time' 
                  : field === 'endTime' ? 'end_time' 
                  : field;
                  
    const { error } = await supabase.from('shifts').update({ [dbField]: value }).eq('id', shiftId);
    
    if (!error) {
        setEvents(prev => prev.map(e => {
            if (e.shifts.some((s: any) => s.id === shiftId)) {
                return { ...e, shifts: e.shifts.map((s: any) => s.id === shiftId ? { ...s, [field]: value } : s) };
            }
            return e;
        }));
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
      const { error } = await supabase.from('shifts').delete().eq('id', shiftId);
      if (error) alert(error.message); else fetchData();
  };

  // --- AUTOMATISK TILDELING (Smart) ---
  
  const handleAutoAssign = async (eventId: string) => {
    if (!confirm('🤖 Vil du kjøre SMART tildeling?\n\nSystemet vil:\n• Sjekke poeng (lavest først)\n• Unngå kollisjoner\n• Respektere vaktpreferanser\n• Hoppe over fritatte familier (verv)')) return;

    const event = events.find(e => e.id === eventId);
    if (!event) return;

    // Hjelpefunksjon for å parse preferanser
    const parsePrefs = (json?: string) => {
      if (!json) return { preferred: [] as string[], avoided: [] as string[] };
      try { return JSON.parse(json); } catch { return { preferred: [] as string[], avoided: [] as string[] }; }
    };

    // Filtrer bort skjermede familier og bygg kandidatliste
    const shieldedFull = families.filter(f => (f.shield_level || 'none') === 'full' || f.exempt_from_shifts);
    const familiesWithNeeds = families
      .filter(f => (f.shield_level || 'none') !== 'full' && !f.exempt_from_shifts)
      .map(f => {
        const childCount = f.family_members?.filter((m: any) => m.role === 'child').length || 1;
        const isReduced = (f.shield_level || 'none') === 'reduced';
        const isSingleParent = f.pref_single_parent;
        // Redusert skjerming eller eneforsørger → halvparten av normal tildeling
        let shiftsNeeded = childCount;
        if (isReduced || isSingleParent) shiftsNeeded = Math.max(1, Math.ceil(childCount / 2));
        return {
          ...f,
          currentPoints: f.total_points || 0,
          shiftsNeeded,
          shiftsAssigned: 0,
          prefs: parsePrefs(f.shift_preferences)
        };
      })
      .sort((a, b) => a.currentPoints - b.currentPoints);
    const exemptCount = shieldedFull.length;

    const newAssignments: any[] = [];
    const sessionAssignments: Record<string, {start: string, end: string}[]> = {};

    const isOverlap = (start1: string, end1: string, start2: string, end2: string) => {
        return (start1 < end2 && end1 > start2);
    };

    // Pre-populer sessionAssignments og shiftsAssigned med EKSISTERENDE tildelinger fra databasen
    for (const shift of event.shifts) {
      for (const assignment of shift.assignmentsFull) {
        const fam = familiesWithNeeds.find(f => f.id === assignment.family_id);
        if (fam) {
          fam.shiftsAssigned++;
          if (!sessionAssignments[fam.id]) sessionAssignments[fam.id] = [];
          sessionAssignments[fam.id].push({ start: shift.startTime, end: shift.endTime });
        }
      }
    }

    // STEG 1: Sorter vakter — de med flest 👍-kandidater behandles FØRST
    const shiftsWithPrefCount = event.shifts.map(shift => {
      const thumbsUpFamilies = familiesWithNeeds.filter(f =>
        f.prefs.preferred.some((p: string) => shift.name.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(shift.name.toLowerCase()))
      );
      return { shift, thumbsUpCount: thumbsUpFamilies.length };
    });
    shiftsWithPrefCount.sort((a, b) => b.thumbsUpCount - a.thumbsUpCount);

    // Debug: vis matching
    const debugLines = shiftsWithPrefCount.map(s => `${s.shift.name}: ${s.thumbsUpCount} 👍`);
    const prefDebug = familiesWithNeeds.filter(f => f.prefs.preferred.length > 0).map(f => {
      const children = f.family_members?.filter((m: any) => m.role === 'child') || [];
      return `${children[0]?.name || f.name}: 👍 [${f.prefs.preferred.join(', ')}]`;
    });
    console.log('Auto-assign debug:\nVakter:', debugLines.join('\n'), '\nPreferanser:', prefDebug.join('\n'));

    // STEG 2: Tildel i prioritert rekkefølge
    for (const { shift } of shiftsWithPrefCount) {
      let assignedCount = shift.assignmentsFull.length;
      let spotsToFill = shift.peopleNeeded - assignedCount;

      while (spotsToFill > 0) {
        // Sorter kandidater: 👍 først (randomisert innbyrdes), nøytrale etter poeng, 👎 sist
        const scoredCandidates = familiesWithNeeds
          .map((f, idx) => {
            if (f.shiftsAssigned >= f.shiftsNeeded) return null;

            const mySlots = sessionAssignments[f.id] || [];
            const hasOverlap = mySlots.some(slot => isOverlap(slot.start, slot.end, shift.startTime, shift.endTime));
            if (hasOverlap) return null;

            let prefScore = 0;
            const shiftLower = shift.name.toLowerCase();
            const hasPreferred = f.prefs.preferred.some((p: string) => {
              const pLower = p.toLowerCase();
              return shiftLower === pLower || shiftLower.includes(pLower) || pLower.includes(shiftLower);
            });
            const hasAvoided = f.prefs.avoided.some((p: string) => {
              const pLower = p.toLowerCase();
              return shiftLower === pLower || shiftLower.includes(pLower) || pLower.includes(shiftLower);
            });
            if (hasPreferred) prefScore = 10;
            else if (hasAvoided) prefScore = -10;

            return { idx, prefScore, points: f.currentPoints, rand: Math.random() };
          })
          .filter(c => c !== null)
          .sort((a, b) => {
            // 1. 👍 først, 👎 sist
            if (b!.prefScore !== a!.prefScore) return b!.prefScore - a!.prefScore;
            // 2. 👍 randomiseres innbyrdes, resten etter lavest poeng
            if (a!.prefScore > 0) return a!.rand - b!.rand;
            return a!.points - b!.points;
          });

        const best = scoredCandidates[0];
        if (best) {
          const family = familiesWithNeeds[best.idx];

          newAssignments.push({
            shift_id: shift.id,
            family_id: family.id,
            status: 'assigned'
          });

          if (!sessionAssignments[family.id]) sessionAssignments[family.id] = [];
          sessionAssignments[family.id].push({ start: shift.startTime, end: shift.endTime });

          family.shiftsAssigned++;
          spotsToFill--;
          // Poeng gis IKKE her — kun ved gjennomført vakt (Godkjenning)
        } else {
          break;
        }
      }
    }

    // STEG 3: Andre runde — fyll gjenværende plasser med familier som allerede har nådd kvoten
    // Runde 3a: uten overlapp først, 3b: med overlapp (dobbelvakter) som siste utvei
    const doubleShiftFamilies: { name: string; shifts: string[] }[] = [];

    for (const allowOverlap of [false, true]) {
      for (const { shift } of shiftsWithPrefCount) {
        let assignedCount = shift.assignmentsFull.length + newAssignments.filter(a => a.shift_id === shift.id).length;
        let spotsToFill = shift.peopleNeeded - assignedCount;

        if (spotsToFill <= 0) continue;

        const extraCandidates = familiesWithNeeds
          .map((f, idx) => {
            const alreadyOnThisShift = newAssignments.some(a => a.shift_id === shift.id && a.family_id === f.id)
              || shift.assignmentsFull.some((a: any) => a.family_id === f.id);
            if (alreadyOnThisShift) return null;

            const mySlots = sessionAssignments[f.id] || [];
            const hasOverlap = mySlots.some(slot => isOverlap(slot.start, slot.end, shift.startTime, shift.endTime));
            if (!allowOverlap && hasOverlap) return null;

            return { idx, points: f.currentPoints + f.shiftsAssigned * 100, hasOverlap };
          })
          .filter(c => c !== null)
          .sort((a, b) => a!.points - b!.points);

        for (const cand of extraCandidates) {
          if (spotsToFill <= 0) break;
          const family = familiesWithNeeds[cand!.idx];

          newAssignments.push({
            shift_id: shift.id,
            family_id: family.id,
            status: 'assigned'
          });

          if (!sessionAssignments[family.id]) sessionAssignments[family.id] = [];

          // Registrer dobbelvakt
          if (cand!.hasOverlap) {
            const children = family.family_members?.filter((m: any) => m.role === 'child') || [];
            const familyName = children.length > 0 ? children[0].name : family.name;
            const existing = doubleShiftFamilies.find(d => d.name === familyName);
            if (existing) {
              existing.shifts.push(`${shift.name} (${shift.startTime}–${shift.endTime})`);
            } else {
              // Finn den overlappende vakten
              const overlappingSlot = sessionAssignments[family.id].find(slot => isOverlap(slot.start, slot.end, shift.startTime, shift.endTime));
              const overlappingShiftName = overlappingSlot
                ? shiftsWithPrefCount.find(s => s.shift.startTime === overlappingSlot.start && s.shift.endTime === overlappingSlot.end)?.shift.name || 'annen vakt'
                : 'annen vakt';
              const overlappingTimeStr = overlappingSlot
                ? `${overlappingShiftName} (${overlappingSlot.start}–${overlappingSlot.end})`
                : overlappingShiftName;
              doubleShiftFamilies.push({
                name: familyName,
                shifts: [overlappingTimeStr, `${shift.name} (${shift.startTime}–${shift.endTime})`]
              });
            }
          }

          sessionAssignments[family.id].push({ start: shift.startTime, end: shift.endTime });
          family.shiftsAssigned++;
          spotsToFill--;
        }
      }
    }

    if (newAssignments.length > 0) {
        const { error: assignError } = await supabase.from('assignments').insert(newAssignments);
        if (assignError) {
            alert('Feil under lagring av vakter: ' + assignError.message);
            return;
        }

        const overQuota = familiesWithNeeds.filter(f => f.shiftsAssigned > f.shiftsNeeded).length;
        let msg = `✅ Suksess! ${newAssignments.length} vakter tildelt.\n\n` +
              `• Lavest poeng prioritert\n` +
              `• Preferanser respektert\n` +
              (overQuota > 0 ? `• ${overQuota} familier fikk ekstra vakt fordi det var flere plasser enn familier\n` : '') +
              (exemptCount > 0 ? `• ${exemptCount} familier fritatt (verv)\n` : '');

        if (doubleShiftFamilies.length > 0) {
          msg += `\n⚠️ DOBBELVAKTER — følgende familier har overlappende vakter:\n\n`;
          doubleShiftFamilies.forEach(d => {
            msg += `• ${d.name}: ${d.shifts.join(' + ')}\n`;
          });
          msg += `\nDu kan justere dette manuelt i drag & drop-visningen.`;
        }

        alert(msg);

        // Send push-varsler til tildelte familier
        const assignedFamilyIds = [...new Set(newAssignments.map(a => a.family_id))];
        assignedFamilyIds.forEach(famId => {
          const famShifts = newAssignments.filter(a => a.family_id === famId);
          const shiftNames = famShifts.map(a => {
            const s = shiftsWithPrefCount.find(sw => sw.shift.id === a.shift_id);
            return s ? s.shift.name : 'Vakt';
          }).join(', ');
          sendPushNotification(
            famId,
            'Ny vakt tildelt',
            `Du har fått ${shiftNames} på ${event.eventName} ${new Date(event.date).toLocaleDateString('nb-NO')}`,
            '/parent-dashboard'
          );
        });

        fetchData();
    } else {
        alert('Fant ingen ledige vakter å fylle, eller ingen ledige familier.' +
              (exemptCount > 0 ? `\n\n${exemptCount} familier er fritatt pga verv.` : ''));
    }
  };

  const sendReminders = async () => {
    alert(`📢 Simulering: Sender e-post til alle som ikke har bekreftet.`);
  };

  const isEventFullyAssigned = (event: DugnadEvent): boolean => {
    if (!event.shifts || event.shifts.length === 0) return false;
    return event.shifts.every((shift) => 
      shift.assignedFamiliesCount >= shift.peopleNeeded
    );
  };

  if (loading) return <div style={{padding: '40px'}}>Laster arrangementer fra skyen... ☁️</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
          Mine arrangementer ({events.length})
        </h1>
        <button onClick={sendReminders} className="btn btn-primary" style={{ background: '#ed8936', border: 'none' }}>
            📢 Send påminnelser
        </button>
      </div>

      {events.length === 0 && (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Ingen arrangementer i databasen.</p>
          <button onClick={() => window.location.href = '/create-event'} className="btn btn-primary">Opprett arrangement</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {events.map((event: any) => {
            const isEditing = editingEventId === event.id;
            const isExpanded = expandedEventId === event.id;
            const allShiftsFilled = isEventFullyAssigned(event);
            const isSelfService = event.assignment_mode === 'self-service';
            const totalNeeded = event.shifts?.reduce((s: number, sh: any) => s + sh.peopleNeeded, 0) || 0;
            const totalAssigned = event.shifts?.reduce((s: number, sh: any) => s + sh.assignedFamiliesCount, 0) || 0;
            const isPast = event.date < new Date().toISOString().split('T')[0];

            return (
              <div key={event.id}>
                <div className="card" style={{ padding: 0, overflow: 'hidden', border: isExpanded ? '2px solid #16a8b8' : '1px solid var(--border-color)', opacity: isPast ? 0.7 : 1 }}>
                  {/* Header — alltid synlig, klikk for å utvide */}
                  <div
                    onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                    style={{ padding: '16px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isExpanded ? '#f0fdfa' : 'white', transition: 'background 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      <span style={{ fontSize: '18px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)' }}>{event.eventName}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          📅 {new Date(event.date).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} • ⏰ {event.startTime}-{event.endTime}
                          {event.subgroup && <span style={{ marginLeft: '8px', fontSize: '11px', background: '#eff6ff', padding: '1px 6px', borderRadius: '4px', color: '#2563eb' }}>{event.subgroup}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '10px', fontWeight: '600', background: allShiftsFilled ? '#dcfce7' : totalAssigned > 0 ? '#fef3c7' : '#fee2e2', color: allShiftsFilled ? '#166534' : totalAssigned > 0 ? '#92400e' : '#991b1b' }}>
                        {totalAssigned}/{totalNeeded}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{event.shifts?.length || 0} vakter</span>
                    </div>
                  </div>

                  {/* Utvidet innhold */}
                  {isExpanded && (
                    <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--border-color)' }}>
                      {/* Handlingsknapper */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {!isEditing && (
                            <>
                              {isSelfService ? (
                                <span style={{ fontSize: '13px', padding: '8px 16px', background: '#eff6ff', color: '#1e40af', borderRadius: '8px', fontWeight: '600' }}>
                                  👥 Selvvalg — familier velger selv
                                </span>
                              ) : (
                                <>
                                  <button onClick={() => handleAutoAssign(event.id)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                                    🤖 Auto-tildel
                                  </button>
                                  <button onClick={() => window.location.href = `/manual-shift-assignment?event=${event.id}`} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                                    {allShiftsFilled ? '✏️ Rediger' : '✋ Manuell'}
                                  </button>
                                  <button onClick={async () => { await supabase.from('events').update({ assignment_mode: 'self-service' }).eq('id', event.id); fetchData(); }} className="btn" style={{ padding: '8px 16px', fontSize: '13px', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                                    👥 Selvvalg
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleEdit(event)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>✏️ Rediger</button>
                          <button onClick={async () => {
                            if (!confirm(`Kopiere "${event.eventName}" med alle vakter?`)) return;
                            const tomorrow = new Date(event.date);
                            tomorrow.setDate(tomorrow.getDate() + 7);
                            const newDate = tomorrow.toISOString().split('T')[0];
                            const { data: newEvent } = await supabase.from('events').insert({
                              name: event.eventName + ' (kopi)',
                              date: newDate,
                              start_time: event.startTime,
                              end_time: event.endTime,
                              sport: event.sport,
                              subgroup: event.subgroup,
                              team_id: event.team_id ?? null,
                              assignment_mode: event.assignment_mode || 'auto'
                            }).select().single();
                            if (newEvent && event.shifts) {
                              const shiftInserts = event.shifts.map((s: any) => ({
                                event_id: newEvent.id, name: s.name,
                                start_time: s.startTime, end_time: s.endTime,
                                people_needed: s.peopleNeeded, description: s.description
                              }));
                              await supabase.from('shifts').insert(shiftInserts);
                            }
                            fetchData();
                            alert('✅ Arrangement kopiert!');
                          }} className="btn" style={{ padding: '6px 12px', fontSize: '12px' }}>📋 Kopier</button>
                          <button onClick={() => handleDelete(event.id)} className="btn" style={{ padding: '6px 12px', fontSize: '12px', color: '#ef4444', border: '1px solid #fecaca' }}>🗑️</button>
                        </div>
                      </div>

                      {/* Vaktliste */}
                      {!isEditing && event.shifts && event.shifts.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {event.shifts.map((shift: any) => {
                            const assignedCount = shift.assignedFamiliesCount;
                            const isFull = assignedCount >= shift.peopleNeeded;

                            return (
                              <div key={shift.id} style={{ padding: '12px', background: 'var(--background)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <strong style={{ fontSize: '14px' }}>{shift.name} ({shift.startTime} - {shift.endTime})</strong>
                                  <span style={{ fontSize: '13px', padding: '2px 8px', borderRadius: '4px', background: isFull ? '#dcfce7' : '#fee2e2', color: isFull ? '#166534' : '#991b1b', fontWeight: '600' }}>
                                      {assignedCount}/{shift.peopleNeeded}
                                  </span>
                                </div>
                                {shift.description && (
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '8px' }}>ℹ️ {shift.description}</div>
                                )}
                                {shift.assignmentsFull && shift.assignmentsFull.length > 0 && (
                                    <div style={{ fontSize: '12px', color: '#4a5568' }}>
                                        Tildelt: {shift.assignmentsFull.map((a: any) => {
                                            const children = a.families?.family_members?.filter((m: any) => m.role === 'child') || [];
                                            if (children.length > 0) return children.map((c: any) => c.name).join(' & ');
                                            return a.families?.name || 'Ukjent';
                                        }).join(', ')}
                                    </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="card" style={{ padding: '32px', marginTop: '8px', background: '#f0f9ff', border: '2px solid var(--primary-color)' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px', color: 'var(--primary-color)' }}>✏️ Rediger: {event.eventName}</h3>
                    
                    <div style={{ marginBottom: '16px' }}>
                        <label className="input-label">Navn</label>
                        <input className="input" value={editForm.eventName} onChange={e => handleFormChange('eventName', e.target.value)} />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div><label className="input-label">Dato</label><input type="date" className="input" value={editForm.date} onChange={e => handleFormChange('date', e.target.value)} /></div>
                        <div><label className="input-label">Start</label><input type="time" className="input" value={editForm.startTime} onChange={e => handleFormChange('startTime', e.target.value)} /></div>
                        <div><label className="input-label">Slutt</label><input type="time" className="input" value={editForm.endTime} onChange={e => handleFormChange('endTime', e.target.value)} /></div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label className="input-label">Tildeling</label>
                        <select className="input" value={editForm.assignment_mode || 'auto'} onChange={e => handleFormChange('assignment_mode', e.target.value)} style={{ maxWidth: '300px' }}>
                            <option value="auto">🤖 Automatisk</option>
                            <option value="manual">✋ Manuell</option>
                            <option value="self-service">👥 Selvvalg</option>
                        </select>
                    </div>

                    <div style={{marginBottom: '24px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
                            <h4>Vakter</h4>
                            <button onClick={() => handleAddShift(event.id)} className="btn btn-secondary" style={{padding:'4px 12px', fontSize:'12px'}}>+ Legg til</button>
                        </div>
                        {event.shifts?.map((shift: any) => (
                            <div key={shift.id} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 2fr 60px auto', gap:'8px', marginBottom:'8px'}}>
                                <input className="input" style={{padding:'8px', fontSize:'13px'}} value={shift.name} onChange={e => handleUpdateShift(shift.id, 'name', e.target.value)} />
                                <input type="time" className="input" style={{padding:'8px', fontSize:'13px'}} value={shift.startTime} onChange={e => handleUpdateShift(shift.id, 'startTime', e.target.value)} />
                                <input type="time" className="input" style={{padding:'8px', fontSize:'13px'}} value={shift.endTime} onChange={e => handleUpdateShift(shift.id, 'endTime', e.target.value)} />
                                {/* REDIGER BESKRIVELSE */}
                                <input className="input" style={{padding:'8px', fontSize:'13px'}} placeholder="Beskrivelse" value={shift.description || ''} onChange={e => handleUpdateShift(shift.id, 'description', e.target.value)} />
                                <input type="number" className="input" style={{padding:'8px', fontSize:'13px'}} value={shift.peopleNeeded} onChange={e => handleUpdateShift(shift.id, 'peopleNeeded', parseInt(e.target.value))} />
                                <button onClick={() => handleDeleteShift(shift.id)} className="btn" style={{color:'red', padding:0}}>🗑️</button>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                      <button onClick={handleCancelEdit} className="btn btn-secondary">Avbryt</button>
                      <button onClick={handleSaveEdit} className="btn btn-primary">💾 Lagre endringer</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};