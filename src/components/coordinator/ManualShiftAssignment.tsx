import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface ManualParent {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface ManualPlayer {
  id: string;
  name: string;
  subgroup?: string; // Valgfritt
}

interface ManualFamily {
  id: string;
  parents: ManualParent[];
  players: ManualPlayer[];
  verv: any[];
  pointsHistory: any[];
  totalPoints: number;
}

interface ManualShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  assignedFamilies: string[]; // Liste av familie-IDer
  description?: string;       // Valgfritt
}

interface ManualEvent {
  id: string;
  eventName: string;
  date: string;
  startTime: string;
  endTime: string;
  shifts: ManualShift[];
  subgroup?: string;          // Valgfritt
}

export const ManualShiftAssignment: React.FC = () => {
  const [events, setEvents] = useState<ManualEvent[]>([]);
  const [families, setFamilies] = useState<ManualFamily[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [draggedFamilyId, setDraggedFamilyId] = useState<string | null>(null);
  const [dragSourceShiftId, setDragSourceShiftId] = useState<string | null>(null);
  const [workingShifts, setWorkingShifts] = useState<ManualShift[]>([]);
  const [loading, setLoading] = useState(true);

  // --- HENT DATA FRA SUPABASE ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Hent Events
        const { data: eventsData, error: eventError } = await supabase
            .from('events')
            .select(`
                *,
                shifts (
                    *,
                    assignments (family_id)
                )
            `)
            .order('date', { ascending: true });
        
        if (eventError) throw eventError;

        // 2. Hent Familier
        const { data: familiesData, error: famError } = await supabase
            .from('families')
            .select('*, family_members(*)');

        if (famError) throw famError;

        // 3. Map Events
        const mappedEvents: ManualEvent[] = eventsData.map((e: any) => ({
            id: e.id,
            eventName: e.name,
            date: e.date,
            startTime: e.start_time?.slice(0,5),
            endTime: e.end_time?.slice(0,5),
            subgroup: e.subgroup,
            shifts: e.shifts.map((s: any) => ({
                id: s.id,
                name: s.name,
                startTime: s.start_time?.slice(0,5),
                endTime: s.end_time?.slice(0,5),
                peopleNeeded: s.people_needed,
                description: s.description,
                assignedFamilies: s.assignments?.map((a: any) => a.family_id) || []
            })).sort((a: any, b: any) => a.name.localeCompare(b.name))
        }));

        setEvents(mappedEvents);

        // 4. Map Familier — filtrer bort skjermede (full) og fritatte
        const mappedFamilies: ManualFamily[] = familiesData
            .filter((f: any) => !f.exempt_from_shifts && (f.shield_level || 'none') !== 'full')
            .map((f: any) => ({
                id: f.id,
                parents: f.family_members.filter((m: any) => m.role === 'parent'),
                players: f.family_members.filter((m: any) => m.role === 'child'),
                verv: f.verv ? JSON.parse(f.verv) : [],
                pointsHistory: [],
                totalPoints: f.total_points || 0,
                shieldLevel: f.shield_level || 'none'
            }));

        setFamilies(mappedFamilies);

        // Sett standardvalg — les ?event= fra URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlEventId = urlParams.get('event');
        const matchEvent = urlEventId ? mappedEvents.find(e => e.id === urlEventId) : null;
        const defaultEvent = matchEvent || mappedEvents[0];
        if (defaultEvent) {
            setSelectedEventId(defaultEvent.id);
            setWorkingShifts(defaultEvent.shifts || []);
        }

    } catch (error) {
        console.error('Feil ved henting:', error);
    } finally {
        setLoading(false);
    }
  };

  // Oppdater workingShifts når event endres
  useEffect(() => {
    const event = events.find(e => e.id === selectedEventId);
    if (event) {
      setWorkingShifts(JSON.parse(JSON.stringify(event.shifts || [])));
    }
  }, [selectedEventId, events]);

  // --- HJELPEFUNKSJONER ---

  const calculateFamilyPoints = (family: ManualFamily): number => {
    return family.totalPoints;
  };

  const getFamilyAssignmentCount = (familyId: string): number => {
    return workingShifts.reduce((count, shift) => {
      return count + (shift.assignedFamilies?.filter(fid => fid === familyId).length || 0);
    }, 0);
  };

  const isShiftOverlap = (shift1: ManualShift, shift2: ManualShift): boolean => {
    return shift1.startTime < shift2.endTime && shift1.endTime > shift2.startTime;
  };

  const getFamilyAssignedShifts = (familyId: string): ManualShift[] => {
    return workingShifts.filter(shift => 
      shift.assignedFamilies?.includes(familyId)
    );
  };

  const sortedFamilies = [...families]
    .map(f => {
      const childCount = f.players?.length || 1;
      const isReduced = (f as any).shieldLevel === 'reduced';
      return {
        ...f,
        currentPoints: calculateFamilyPoints(f),
        shiftsNeeded: isReduced ? Math.max(1, Math.ceil(childCount / 2)) : childCount,
        shiftsAssigned: getFamilyAssignmentCount(f.id)
      };
    })
    .sort((a, b) => {
      if (a.currentPoints !== b.currentPoints) {
        return a.currentPoints - b.currentPoints;
      }
      return a.shiftsAssigned - b.shiftsAssigned;
    });

  // --- DRAG HANDLERS ---

  const handleDragStart = (familyId: string, sourceShiftId?: string) => {
    setDraggedFamilyId(familyId);
    setDragSourceShiftId(sourceShiftId || null);
  };

  const handleDragEnd = () => {
    setDraggedFamilyId(null);
    setDragSourceShiftId(null);
  };

  const handleDrop = (targetShiftId: string) => {
    if (!draggedFamilyId) return;

    if (dragSourceShiftId && dragSourceShiftId !== targetShiftId) {
      const updatedShifts = workingShifts.map(shift => {
        if (shift.id === dragSourceShiftId) {
          return {
            ...shift,
            assignedFamilies: shift.assignedFamilies?.filter(fid => fid !== draggedFamilyId) || []
          };
        }
        if (shift.id === targetShiftId) {
          return {
            ...shift,
            assignedFamilies: [...(shift.assignedFamilies || []), draggedFamilyId]
          };
        }
        return shift;
      });
      setWorkingShifts(updatedShifts);
      return;
    }

    if (!dragSourceShiftId) {
      const targetShift = workingShifts.find(s => s.id === targetShiftId);
      if (targetShift?.assignedFamilies?.includes(draggedFamilyId)) return;

      // Sjekk overlap og antall vakter
      const existingShifts = getFamilyAssignedShifts(draggedFamilyId);
      const hasOverlap = targetShift && existingShifts.some(s => isShiftOverlap(s, targetShift));
      const familyName = families.find(f => f.id === draggedFamilyId)?.players?.[0]?.name || 'Denne familien';

      if (existingShifts.length > 0 || hasOverlap) {
        const warnings: string[] = [];
        if (hasOverlap) warnings.push('har en vakt som overlapper i tid');
        if (existingShifts.length >= 1) warnings.push(`har allerede ${existingShifts.length} vakt${existingShifts.length > 1 ? 'er' : ''}`);
        if (!confirm(`${familyName} ${warnings.join(' og ')}.\n\nVil du fortsatt tildele denne vakten?`)) return;
      }

      const updatedShifts = workingShifts.map(shift => {
        if (shift.id === targetShiftId) {
          return {
            ...shift,
            assignedFamilies: [...(shift.assignedFamilies || []), draggedFamilyId]
          };
        }
        return shift;
      });
      setWorkingShifts(updatedShifts);
    }
  };

  const handleRemoveFamily = (shiftId: string, familyId: string) => {
    const updatedShifts = workingShifts.map(shift => {
      if (shift.id === shiftId) {
        return {
          ...shift,
          assignedFamilies: shift.assignedFamilies?.filter(fid => fid !== familyId) || []
        };
      }
      return shift;
    });
    setWorkingShifts(updatedShifts);
  };

  const handleAutoAssign = () => {
    if (!confirm('Kjøre automatisk tildeling? (Prioriterer lavest poeng)')) return;

    const familiesWithNeeds = sortedFamilies.map(f => ({
      ...f,
      tempPoints: f.currentPoints,
      shiftsAssigned: getFamilyAssignmentCount(f.id)
    }));

    const updatedShifts = JSON.parse(JSON.stringify(workingShifts));
    const familyAssignments: { [key: string]: ManualShift[] } = {};

    updatedShifts.forEach((shift: ManualShift) => {
        shift.assignedFamilies?.forEach(fid => {
            if (!familyAssignments[fid]) familyAssignments[fid] = [];
            familyAssignments[fid].push(shift);
        });
    });

    for (const shift of updatedShifts) {
      let assigned = shift.assignedFamilies.length;
      
      while (assigned < shift.peopleNeeded) {
        const availableFamily = familiesWithNeeds.find(f => {
          if (f.shiftsAssigned >= f.shiftsNeeded) return false;
          const alreadyAssigned = familyAssignments[f.id] || [];
          return !alreadyAssigned.some(s => isShiftOverlap(s, shift));
        });

        if (!availableFamily) break;

        shift.assignedFamilies.push(availableFamily.id);
        if (!familyAssignments[availableFamily.id]) familyAssignments[availableFamily.id] = [];
        familyAssignments[availableFamily.id].push(shift);
        
        availableFamily.shiftsAssigned++;
        assigned++;
        availableFamily.tempPoints += 20; 
        
        familiesWithNeeds.sort((a, b) => a.tempPoints - b.tempPoints);
      }
    }

    setWorkingShifts(updatedShifts);
    alert(`✅ Automatisk tildeling fullført.`);
  };

  const handleSave = async () => {
    const selectedEvent = events.find(e => e.id === selectedEventId);
    if (!selectedEvent) return;
    setLoading(true);

    try {
        const newAssignments: any[] = [];
        // Her fjernet jeg den ubrukte variabelen familyPointsUpdate
        
        workingShifts.forEach(shift => {
            shift.assignedFamilies?.forEach(fid => {
                newAssignments.push({
                    shift_id: shift.id,
                    family_id: fid,
                    status: 'assigned'
                });
            });
        });

        const shiftIds = workingShifts.map(s => s.id);
        const { error: deleteError } = await supabase.from('assignments').delete().in('shift_id', shiftIds);
        if (deleteError) throw deleteError;

        if (newAssignments.length > 0) {
            const { error: insertError } = await supabase.from('assignments').insert(newAssignments);
            if (insertError) throw insertError;
        }
        
        alert('✅ Vaktlisten er lagret i skyen!');
        window.location.href = '/events-list';

    } catch (error: any) {
        alert('Feil ved lagring: ' + error.message);
    } finally {
        setLoading(false);
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster... ☁️</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1600px', margin: '0 auto' }}>
      <button 
        onClick={() => window.location.href = '/events-list'}
        className="btn btn-secondary"
        style={{ marginBottom: '16px' }}
      >
        ← Tilbake
      </button>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
          Tildel vakter manuelt
        </h1>
      </div>

      <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
          <div>
            <label className="input-label">Velg arrangement</label>
            <select
              className="input"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {events.map(e => (
                <option key={e.id} value={e.id}>
                  {e.eventName} - {e.date}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleAutoAssign} className="btn btn-primary">🤖 Auto-forslag</button>
        </div>

        {selectedEvent && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--background)', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
            <strong>Valgt:</strong> {selectedEvent.eventName} • {selectedEvent.date}
            {selectedEvent.subgroup && <span style={{marginLeft:'8px', background:'#e0f2fe', color:'#0369a1', padding:'2px 6px', borderRadius:'4px'}}>{selectedEvent.subgroup}</span>}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* LEFT: Shifts — scrollbar vaktliste */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Vakter</h2>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', paddingRight: '8px' }}
            onDragOver={(e) => {
              // Auto-scroll når man drar nær topp/bunn
              const el = e.currentTarget;
              const rect = el.getBoundingClientRect();
              const y = e.clientY - rect.top;
              if (y < 60) el.scrollTop -= 8;
              else if (y > rect.height - 60) el.scrollTop += 8;
            }}
          >
            {workingShifts.map(shift => {
              const assignedFamiliesObjs = (shift.assignedFamilies || []).map(fid =>
                families.find(f => f.id === fid)
              ).filter(Boolean) as ManualFamily[];

              const isFull = assignedFamiliesObjs.length >= shift.peopleNeeded;
              const isOver = assignedFamiliesObjs.length > shift.peopleNeeded;
              const alreadyHere = draggedFamilyId ? shift.assignedFamilies?.includes(draggedFamilyId) : false;
              const canDrop = draggedFamilyId && !alreadyHere;

              return (
                <div
                  key={shift.id}
                  onDragOver={(e) => { if (canDrop) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(shift.id); }}
                  style={{
                    padding: '16px',
                    background: canDrop ? (isFull ? '#fef3c7' : '#dcfce7') : 'white',
                    borderRadius: 'var(--radius-md)',
                    border: canDrop ? `2px dashed ${isFull ? '#f59e0b' : 'var(--primary-color)'}` : '2px solid var(--border-color)',
                    transition: 'background 0.15s, border 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '600' }}>{shift.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{shift.startTime} - {shift.endTime}</div>
                      {shift.description && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{shift.description}</div>}
                    </div>
                    <div style={{ padding: '4px 12px', borderRadius: 'var(--radius-md)', background: isOver ? '#fef3c7' : isFull ? '#dcfce7' : '#fee2e2', color: isOver ? '#92400e' : isFull ? '#166534' : '#991b1b', fontSize: '12px', fontWeight: '600', height: 'fit-content' }}>
                      {assignedFamiliesObjs.length}/{shift.peopleNeeded}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '32px' }}>
                      {assignedFamiliesObjs.map((family) => (
                        <div
                          key={family.id}
                          draggable
                          onDragStart={() => handleDragStart(family.id, shift.id)}
                          onDragEnd={handleDragEnd}
                          style={{ padding: '8px 12px', background: 'var(--card-bg, white)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', cursor: 'grab' }}
                        >
                          <span>{family.players[0]?.name || family.id}</span>
                          <button onClick={() => handleRemoveFamily(shift.id, family.id)} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: '16px' }}>×</button>
                        </div>
                      ))}
                      {assignedFamiliesObjs.length === 0 && (
                        <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', border: '1px dashed #e5e7eb', borderRadius: 'var(--radius-md)' }}>
                          Dra en familie hit
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Families — sticky */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Familier</h2>
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {sortedFamilies.map((family) => {
                const isDragging = draggedFamilyId === family.id && !dragSourceShiftId;
                const needsMore = family.shiftsAssigned < family.shiftsNeeded;
                return (
                  <div
                    key={family.id}
                    draggable
                    onDragStart={() => handleDragStart(family.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      padding: '12px',
                      background: isDragging ? '#e0f2fe' : needsMore ? 'white' : '#f3f4f6',
                      borderRadius: 'var(--radius-md)',
                      border: needsMore ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      cursor: 'grab', opacity: isDragging ? 0.5 : 1,
                      transition: 'opacity 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{family.players[0]?.name || family.id}</div>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--primary-color)' }}>{family.currentPoints}p</div>
                    </div>
                    <div style={{ fontSize: '11px', color: family.shiftsAssigned > family.shiftsNeeded ? '#c0392b' : 'var(--text-secondary)' }}>
                        {family.shiftsAssigned}/{family.shiftsNeeded} vakter
                        {family.shiftsAssigned > family.shiftsNeeded && ' ⚠️'}
                        {family.players[0]?.subgroup && ` • ${family.players[0].subgroup}`}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '32px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button onClick={() => window.location.href = '/events-list'} className="btn btn-secondary">Avbryt</button>
        <button onClick={handleSave} className="btn btn-primary" style={{ padding: '12px 32px' }}>{loading ? 'Lagrer...' : '💾 Lagre tildelinger'}</button>
      </div>
    </div>
  );
};