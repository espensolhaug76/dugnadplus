import React, { useState, useEffect } from 'react';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

interface Event {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  sport: string;
  slotDuration: number;
  shifts: Shift[];
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  assignedPeople: number;
  status: string;
}

const SPORT_SHIFTS = {
  football: [
    { name: 'Kioskvakt', people: 2 },
    { name: 'Billettsalg', people: 1 },
    { name: 'Fair play/kampvert', people: 1 }
  ],
  handball: [
    { name: 'Kioskvakt', people: 2 },
    { name: 'Billettsalg', people: 1 },
    { name: 'Fair play/kampvert', people: 1 },
    { name: 'Sekretæriat', people: 2 }
  ],
  ishockey: [
    { name: 'Kioskvakt', people: 2 },
    { name: 'Billettsalg', people: 1 },
    { name: 'Fair play/kampvert', people: 1 },
    { name: 'Sekretæriat', people: 2 },
    { name: 'Ismaskin/Bane', people: 1 }
  ],
  other: [
    { name: 'Dugnadsvakt', people: 2 },
    { name: 'Arrangementansvarlig', people: 1 }
  ]
};

const DURATION_OPTIONS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

const generateShifts = (startTime: string, endTime: string, slotDuration: number, sport: string): Shift[] => {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  
  if (!slotDuration || slotDuration <= 0) return [];

  const slotMinutes = slotDuration * 60;
  const numSlots = Math.floor(totalMinutes / slotMinutes);
  const shifts: Shift[] = [];
  // @ts-ignore
  const sportShifts = SPORT_SHIFTS[sport] || SPORT_SHIFTS.football;

  for (let i = 0; i < numSlots; i++) {
    const slotStart = startH * 60 + startM + i * slotMinutes;
    const slotEnd = slotStart + slotMinutes;
    const slotStartTime = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`;
    const slotEndTime = `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`;

    sportShifts.forEach((shift: any) => {
      shifts.push({
        id: `${Date.now()}-${Math.random()}-${i}-${shift.name}`,
        name: shift.name,
        startTime: slotStartTime,
        endTime: slotEndTime,
        peopleNeeded: shift.people,
        assignedPeople: 0,
        status: 'open'
      });
    });
  }
  return shifts;
};

export const MultiDayBulkCreator: React.FC = () => {
  const [eventName, setEventName] = useState('');
  const [sport, setSport] = useState('football');
  const [defaultDuration, setDefaultDuration] = useState(2);
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'manual' | 'self-service'>('auto');
  const [selfServiceOpenDate, setSelfServiceOpenDate] = useState('');
  const [selfServiceOpenTime, setSelfServiceOpenTime] = useState('12:00');
  
  const [events, setEvents] = useState<Event[]>([
    {
      id: 'day1',
      date: '',
      startTime: '09:00',
      endTime: '15:00',
      location: 'Stadion',
      sport: 'football',
      slotDuration: 2,
      shifts: []
    }
  ]);

  const handleSportChange = (newSport: string) => {
    setSport(newSport);
    setEvents(events.map(e => ({ ...e, sport: newSport })));
  };

  const handleDurationChange = (newDuration: number) => {
    setDefaultDuration(newDuration);
    setEvents(events.map(e => ({ ...e, slotDuration: newDuration })));
  };

  const addDay = () => {
    const newEvent: Event = {
      id: `day${Date.now()}`,
      date: '',
      startTime: '09:00',
      endTime: '15:00',
      location: 'Stadion',
      sport,
      slotDuration: defaultDuration,
      shifts: []
    };
    setEvents([...events, newEvent]);
  };

  const removeDay = (eventId: string) => {
    setEvents(events.filter(e => e.id !== eventId));
  };

  const copyDay = (eventId: string) => {
    const eventToCopy = events.find(e => e.id === eventId);
    if (eventToCopy) {
      const copiedShifts = eventToCopy.shifts.map(shift => ({
        ...shift,
        id: `${Date.now()}-${Math.random()}-copy`
      }));
      
      const newEvent = {
        ...eventToCopy,
        id: `day${Date.now()}`,
        date: '',
        shifts: copiedShifts
      };
      setEvents([...events, newEvent]);
    }
  };

  const updateEvent = (eventId: string, field: string, value: any) => {
    setEvents(events.map(e => e.id === eventId ? { ...e, [field]: value } : e));
  };

  const regenerateShifts = (eventId: string) => {
    setEvents(prevEvents => prevEvents.map(e => {
      if (e.id === eventId && e.slotDuration > 0) {
        return {
          ...e,
          shifts: generateShifts(e.startTime, e.endTime, e.slotDuration, e.sport)
        };
      }
      return e;
    }));
  };

  const updateShift = (eventId: string, shiftId: string, field: string, value: any) => {
    setEvents(events.map(e => {
      if (e.id === eventId) {
        return {
          ...e,
          shifts: e.shifts.map(s => s.id === shiftId ? { ...s, [field]: value } : s)
        };
      }
      return e;
    }));
  };

  const addShift = (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    const newShift: Shift = {
      id: `${Date.now()}-${Math.random()}-new`,
      name: 'Ny vakt',
      startTime: event.startTime,
      endTime: event.endTime,
      peopleNeeded: 1,
      assignedPeople: 0,
      status: 'open'
    };
    setEvents(events.map(e => e.id === eventId ? { ...e, shifts: [...e.shifts, newShift] } : e));
  };

  const deleteShift = (eventId: string, shiftId: string) => {
    setEvents(events.map(e => e.id === eventId ? { ...e, shifts: e.shifts.filter(s => s.id !== shiftId) } : e));
  };

  const saveAllEvents = () => {
    const validEvents = events.filter(e => e.date && e.shifts.length > 0);
    if (validEvents.length === 0) {
      alert('⚠️ Legg til minst én dag med dato og vakter!');
      return;
    }
    if (assignmentMode === 'self-service' && !selfServiceOpenDate) {
      alert('⚠️ Sett når vaktene åpnes for selvvalg!');
      return;
    }

    try {
      const stored = localStorage.getItem('dugnad_events');
      const existingEvents = stored ? JSON.parse(stored) : [];
      const eventsToSave = validEvents.map(e => ({
        id: `${Date.now()}-${Math.random()}`,
        eventName: `${eventName} - Dag ${events.indexOf(e) + 1}`,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        sport: e.sport,
        slotDuration: e.slotDuration,
        shifts: e.shifts.map(s => ({ ...s, assignedPeople: 0, status: 'open' })),
        assignmentMode,
        selfServiceOpenDate: assignmentMode === 'self-service' ? `${selfServiceOpenDate}T${selfServiceOpenTime}` : null,
        selfServiceStatus: assignmentMode === 'self-service' ? 'pending' : null,
        status: 'draft',
        createdAt: new Date().toISOString(),
        type: 'multiday'
      }));
      localStorage.setItem('dugnad_events', JSON.stringify([...existingEvents, ...eventsToSave]));
      alert(`✅ ${eventsToSave.length} arrangementer lagret!`);
      window.location.href = '/events-list';
    } catch (error) {
      console.error(error);
      alert('Feil ved lagring');
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>
        ← Tilbake
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>Flerdag / Turnerings-skaper</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Generer vakter automatisk for flere dager.</p>
        </div>
      </div>

      <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', alignItems: 'end' }}>
          <div>
            <label className="input-label">Arrangementsnavn *</label>
            <input type="text" className="input" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="F.eks. KIL Cup" />
          </div>
          <div>
            <label className="input-label">Idrett (Setter vakttyper)</label>
            <select className="input" value={sport} onChange={(e) => handleSportChange(e.target.value)}>
              <option value="football">⚽ Fotball</option>
              <option value="handball">🤾 Håndball</option>
              <option value="ishockey">🏒 Ishockey</option>
              <option value="other">Annet</option>
            </select>
          </div>
          <div>
            <label className="input-label">Standard vaktlengde</label>
            <select className="input" value={defaultDuration} onChange={(e) => handleDurationChange(parseFloat(e.target.value))}>
              {DURATION_OPTIONS.map(dur => <option key={dur} value={dur}>{dur} timer</option>)}
            </select>
          </div>
           <div>
            <label className="input-label">Tildelingstype</label>
            <select className="input" value={assignmentMode} onChange={(e) => setAssignmentMode(e.target.value as any)}>
              <option value="auto">🤖 Automatisk</option>
              <option value="manual">✋ Manuell</option>
              <option value="self-service">👥 Selvvalg</option>
            </select>
          </div>
        </div>

        {assignmentMode === 'self-service' && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '16px' }}>
            <div>
              <label className="input-label">Åpner dato</label>
              <input type="date" className="input" value={selfServiceOpenDate} onChange={(e) => setSelfServiceOpenDate(e.target.value)} />
            </div>
            <div>
              <label className="input-label">Åpner tid</label>
              <input type="time" className="input" value={selfServiceOpenTime} onChange={(e) => setSelfServiceOpenTime(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {events.map((event, index) => (
        <EventDayCard
          key={event.id}
          event={event}
          index={index}
          onUpdate={updateEvent}
          onRemove={removeDay}
          onCopy={copyDay}
          onRegenerate={regenerateShifts}
          onUpdateShift={updateShift}
          onAddShift={addShift}
          onDeleteShift={deleteShift}
          canRemove={events.length > 1}
        />
      ))}

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button onClick={addDay} className="btn btn-secondary" style={{ flex: 1 }}>➕ Legg til ny dag</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn">Avbryt</button>
        <button onClick={saveAllEvents} className="btn btn-primary" style={{ flex: 1 }}>💾 Lagre alle</button>
      </div>
    </div>
  );
};

const EventDayCard: React.FC<{
  event: Event;
  index: number;
  onUpdate: (id: string, field: string, value: any) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onRegenerate: (id: string) => void;
  onUpdateShift: (eventId: string, shiftId: string, field: string, value: any) => void;
  onAddShift: (eventId: string) => void;
  onDeleteShift: (eventId: string, shiftId: string) => void;
  canRemove: boolean;
}> = ({ event, index, onUpdate, onRemove, onCopy, onRegenerate, onUpdateShift, onAddShift, onDeleteShift, canRemove }) => {
  const [localStartTime, setLocalStartTime] = useState(event.startTime);
  const [localEndTime, setLocalEndTime] = useState(event.endTime);
  const debouncedStartTime = useDebounce(localStartTime, 500);
  const debouncedEndTime = useDebounce(localEndTime, 500);

  useEffect(() => { if (debouncedStartTime !== event.startTime) onUpdate(event.id, 'startTime', debouncedStartTime); }, [debouncedStartTime]);
  useEffect(() => { if (debouncedEndTime !== event.endTime) onUpdate(event.id, 'endTime', debouncedEndTime); }, [debouncedEndTime]);
  useEffect(() => { if (event.slotDuration > 0) onRegenerate(event.id); }, [event.startTime, event.endTime, event.slotDuration, event.sport]);

  const groupedShifts = [...event.shifts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Dag {index + 1}</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onCopy(event.id)} className="btn btn-secondary">📋 Kopier</button>
          {canRemove && <button onClick={() => onRemove(event.id)} className="btn" style={{ color: 'var(--danger-color)' }}>🗑️ Slett</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div><label className="input-label">Dato</label><input type="date" className="input" value={event.date} onChange={(e) => onUpdate(event.id, 'date', e.target.value)} /></div>
        <div><label className="input-label">Start</label><input type="time" className="input" value={localStartTime} onChange={(e) => setLocalStartTime(e.target.value)} /></div>
        <div><label className="input-label">Slutt</label><input type="time" className="input" value={localEndTime} onChange={(e) => setLocalEndTime(e.target.value)} /></div>
        <div>
          <label className="input-label">⏱️ Vaktlengde</label>
          <select className="input" value={event.slotDuration} onChange={(e) => onUpdate(event.id, 'slotDuration', parseFloat(e.target.value))}>
            {DURATION_OPTIONS.map(dur => <option key={dur} value={dur}>{dur} timer</option>)}
          </select>
        </div>
        <div>
            <label className="input-label">Sted</label>
            <input 
                type="text" 
                className="input" 
                value={event.location} 
                onChange={(e) => onUpdate(event.id, 'location', e.target.value)} 
            />
        </div>
      </div>

      {event.shifts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {groupedShifts.map(shift => (
            <div key={shift.id} style={{ 
                display: 'grid', 
                gridTemplateColumns: '3fr 140px 160px 40px', 
                gap: '12px', 
                alignItems: 'center', 
                padding: '12px', 
                background: 'var(--background)', 
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)'
            }}>
              <input 
                type="text" 
                value={shift.name} 
                onChange={(e) => onUpdateShift(event.id, shift.id, 'name', e.target.value)} 
                className="input" 
                style={{ padding: '8px', fontWeight: '600' }} 
                placeholder="Vaktnavn"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '16px', marginRight: '4px', cursor: 'help' }} title="Antall personer">👤</span>
                <button onClick={() => onUpdateShift(event.id, shift.id, 'peopleNeeded', Math.max(1, shift.peopleNeeded - 1))} className="btn" style={{ padding: '4px 8px' }}>-</button>
                <span style={{ minWidth: '24px', textAlign: 'center', fontWeight: '600' }}>{shift.peopleNeeded}</span>
                <button onClick={() => onUpdateShift(event.id, shift.id, 'peopleNeeded', shift.peopleNeeded + 1)} className="btn" style={{ padding: '4px 8px' }}>+</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="time" value={shift.startTime} onChange={(e) => onUpdateShift(event.id, shift.id, 'startTime', e.target.value)} className="input" style={{ padding: '6px', fontSize: '13px' }} />
                <span>-</span>
                <input type="time" value={shift.endTime} onChange={(e) => onUpdateShift(event.id, shift.id, 'endTime', e.target.value)} className="input" style={{ padding: '6px', fontSize: '13px' }} />
              </div>
              <button onClick={() => onDeleteShift(event.id, shift.id)} className="btn" style={{ color: 'red', padding: '4px 8px' }}>×</button>
            </div>
          ))}
          {/* HER ER KNAPPEN SOM MANGLER */}
          <button onClick={() => onAddShift(event.id)} className="btn btn-secondary" style={{ marginTop: '8px', width: '100%', borderStyle: 'dashed' }}>
            ➕ Legg til vakt manuelt
          </button>
        </div>
      ) : (
        <div>
            <p style={{ color: 'var(--text-secondary)' }}>Ingen vakter generert (sjekk tid/varighet).</p>
            <button onClick={() => onAddShift(event.id)} className="btn btn-secondary" style={{ marginTop: '8px' }}>
                ➕ Legg til vakt manuelt
            </button>
        </div>
      )}
    </div>
  );
};