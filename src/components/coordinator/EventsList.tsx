import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

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
  shifts: DugnadShift[];
}

export const EventsList: React.FC = () => {
  const [events, setEvents] = useState<DugnadEvent[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
            families (name)
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
            sport: editForm.sport
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
    if (!confirm('🤖 Vil du kjøre SMART tildeling?\n\nSystemet vil sjekke poeng, unngå kollisjoner og respektere preferanser.')) return;

    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const familiesWithNeeds = families.map(f => ({
      ...f,
      currentPoints: f.total_points || 0,
      shiftsNeeded: f.family_members?.filter((m: any) => m.role === 'child').length || 1,
      shiftsAssigned: 0
    })).sort((a, b) => a.currentPoints - b.currentPoints);

    const newAssignments: any[] = [];
    const updatesToFamilies: any[] = [];
    const sessionAssignments: Record<string, {start: string, end: string}[]> = {};

    const isOverlap = (start1: string, end1: string, start2: string, end2: string) => {
        return (start1 < end2 && end1 > start2);
    };

    for (const shift of event.shifts) {
      let assignedCount = shift.assignmentsFull.length;
      let spotsToFill = shift.peopleNeeded - assignedCount;

      while (spotsToFill > 0) {
        const candidateIndex = familiesWithNeeds.findIndex(f => {
          if (f.shiftsAssigned >= f.shiftsNeeded) return false;
          
          const mySlots = sessionAssignments[f.id] || [];
          const hasOverlap = mySlots.some(slot => isOverlap(slot.start, slot.end, shift.startTime, shift.endTime));
          if (hasOverlap) return false;

          return true;
        });

        if (candidateIndex !== -1) {
          const family = familiesWithNeeds[candidateIndex];

          newAssignments.push({
            shift_id: shift.id,
            family_id: family.id,
            status: 'assigned'
          });

          if (!sessionAssignments[family.id]) sessionAssignments[family.id] = [];
          sessionAssignments[family.id].push({ start: shift.startTime, end: shift.endTime });

          family.shiftsAssigned++;

          const [startH, startM] = shift.startTime.split(':').map(Number);
          const [endH, endM] = shift.endTime.split(':').map(Number);
          const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
          const pointsEarned = Math.round(hours * 10);
          
          family.currentPoints += pointsEarned;
          
          const existingUpdate = updatesToFamilies.find(u => u.id === family.id);
          if (existingUpdate) {
              existingUpdate.total_points = family.currentPoints;
          } else {
              updatesToFamilies.push({ id: family.id, total_points: family.currentPoints });
          }

          spotsToFill--;
          familiesWithNeeds.sort((a, b) => a.currentPoints - b.currentPoints);

        } else {
          break; 
        }
      }
    }

    if (newAssignments.length > 0) {
        const { error: assignError } = await supabase.from('assignments').insert(newAssignments);
        if (assignError) {
            alert('Feil under lagring av vakter: ' + assignError.message);
            return;
        }

        for (const update of updatesToFamilies) {
            await supabase.from('families').update({ total_points: update.total_points }).eq('id', update.id);
        }

        alert(`✅ Suksess! ${newAssignments.length} vakter ble tildelt smart og rettferdig.`);
        fetchData();
    } else {
        alert('Fant ingen ledige vakter å fylle, eller ingen ledige familier.');
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {events.map((event: any) => {
            const isEditing = editingEventId === event.id;
            const allShiftsFilled = isEventFullyAssigned(event);
            const isSelfService = event.assignment_mode === 'self-service';

            return (
              <div key={event.id}>
                <div className="card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                        {event.eventName}
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        📅 {new Date(event.date).toLocaleDateString('nb-NO')} • ⏰ {event.startTime} - {event.endTime}
                      </p>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        👥 {event.shifts?.length || 0} vakter
                        {isSelfService && <span className="badge badge-aktiv" style={{marginLeft: '8px'}}>Selvvalg</span>}
                        {event.subgroup && <span style={{marginLeft: '8px', fontSize: '12px', background: '#eff6ff', padding: '2px 6px', borderRadius: '4px', color: '#2563eb'}}>{event.subgroup}</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleEdit(event)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>✏️ Rediger</button>
                      <button onClick={() => handleDelete(event.id)} className="btn" style={{ padding: '8px 16px', background: 'white', border: '1px solid var(--danger-color)', color: 'var(--danger-color)' }}>🗑️ Slett</button>
                    </div>
                  </div>

                  {!isEditing && event.shifts && event.shifts.length > 0 && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <button onClick={() => handleAutoAssign(event.id)} className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '14px', flex: 1 }} disabled={isSelfService}>
                          🤖 Automatisk (Smart)
                        </button>
                        <button onClick={() => window.location.href = `/manual-shift-assignment?event=${event.id}`} className="btn btn-secondary" style={{ padding: '12px 24px', fontSize: '14px', flex: 1 }}>
                          {allShiftsFilled ? '✏️ Rediger tildeling' : '✋ Manuell tildeling'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                              {/* VIS BESKRIVELSE */}
                              {shift.description && (
                                  <div style={{fontSize:'12px', color:'#6b7280', fontStyle:'italic', marginBottom:'8px'}}>
                                      ℹ️ {shift.description}
                                  </div>
                              )}
                              
                              {shift.assignmentsFull && shift.assignmentsFull.length > 0 && (
                                  <div style={{fontSize:'12px', color:'#4a5568'}}>
                                      Tildelt: {shift.assignmentsFull.map((a:any) => a.families?.name || 'Ukjent').join(', ')}
                                  </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
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