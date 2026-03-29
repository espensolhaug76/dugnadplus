import React, { useState, useEffect } from 'react';

interface Family {
  id: string;
  parents: any[];
  players: any[];
  totalPoints: number;
  verv: any[];
  pointsHistory: any[];
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  peopleNeeded: number;
  assignedPeople: number;
  assignedFamilies?: string[]; // Family IDs
  status: string;
}

interface Event {
  id: string;
  eventName: string;
  date: string;
  startTime: string;
  endTime: string;
  shifts: Shift[];
}

export const ShiftAssignment: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'manual'>('auto');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const storedEvents = JSON.parse(localStorage.getItem('dugnad_events') || '[]');
    const storedFamilies = JSON.parse(localStorage.getItem('dugnad_families') || '[]');
    
    setEvents(storedEvents);
    setFamilies(storedFamilies);
    
    if (storedEvents.length > 0) {
      setSelectedEvent(storedEvents[0].id);
    }
  }, []);

  const calculateFamilyPoints = (family: Family): number => {
    const vervPoints = family.verv?.reduce((sum: number, v: any) => sum + v.points, 0) || 0;
    const historyPoints = family.pointsHistory?.reduce((sum: number, h: any) => sum + h.points, 0) || 0;
    return vervPoints + historyPoints;
  };

  const calculateShiftHours = (startTime: string, endTime: string): number => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return totalMinutes / 60;
  };

  const isTimeOverlap = (shift1: Shift, shift2: Shift): boolean => {
    const s1Start = shift1.startTime;
    const s1End = shift1.endTime;
    const s2Start = shift2.startTime;
    const s2End = shift2.endTime;
    
    return (s1Start < s2End && s1End > s2Start);
  };

  const autoAssignShifts = () => {
    setAssigning(true);
    
    const event = events.find(e => e.id === selectedEvent);
    if (!event) {
      alert('⚠️ Velg et arrangement først!');
      setAssigning(false);
      return;
    }

    // Sort families by points (lowest first) and consider multiple kids
    const familiesWithNeeds = families.map(f => ({
      ...f,
      currentPoints: calculateFamilyPoints(f),
      shiftsNeeded: f.players?.length || 1, // One shift per child
      shiftsAssigned: 0
    })).sort((a, b) => a.currentPoints - b.currentPoints);

    // Track assignments
    const updatedShifts = event.shifts.map(shift => ({ ...shift, assignedFamilies: [] as string[] }));
    const familyAssignments: { [familyId: string]: Shift[] } = {};

    // Assign shifts
    for (const shift of updatedShifts) {
      let assigned = 0;
      
      while (assigned < shift.peopleNeeded) {
        // Find family with:
        // 1. Lowest points
        // 2. Still needs shifts
        // 3. Not already assigned to overlapping shift
        const availableFamily = familiesWithNeeds.find(f => {
          if (f.shiftsAssigned >= f.shiftsNeeded) return false; // Already has enough shifts
          
          const alreadyAssignedShifts = familyAssignments[f.id] || [];
          const hasOverlap = alreadyAssignedShifts.some(s => isTimeOverlap(s, shift));
          
          return !hasOverlap;
        });

        if (!availableFamily) break; // No more available families

        // Assign this family
        shift.assignedFamilies!.push(availableFamily.id);
        if (!familyAssignments[availableFamily.id]) {
          familyAssignments[availableFamily.id] = [];
        }
        familyAssignments[availableFamily.id].push(shift);
        availableFamily.shiftsAssigned++;
        assigned++;

        // Calculate and award points
        const hours = calculateShiftHours(shift.startTime, shift.endTime);
        const pointsEarned = Math.round(hours * 10);
        availableFamily.currentPoints += pointsEarned;
        
        // Re-sort after point change
        familiesWithNeeds.sort((a, b) => a.currentPoints - b.currentPoints);
      }

      shift.assignedPeople = assigned;
      shift.status = assigned >= shift.peopleNeeded ? 'filled' : 'open';
    }

    // Update families with new points and history
    const updatedFamilies = families.map(family => {
      const assignments = familyAssignments[family.id];
      if (!assignments || assignments.length === 0) return family;

      const newHistory = assignments.map(shift => {
        const hours = calculateShiftHours(shift.startTime, shift.endTime);
        const points = Math.round(hours * 10);
        
        return {
          date: event.date,
          type: 'shift',
          description: `${event.eventName} - ${shift.name}`,
          points: points
        };
      });

      return {
        ...family,
        pointsHistory: [...(family.pointsHistory || []), ...newHistory]
      };
    });

    // Save everything
    const updatedEvents = events.map(e => 
      e.id === selectedEvent ? { ...e, shifts: updatedShifts } : e
    );

    localStorage.setItem('dugnad_events', JSON.stringify(updatedEvents));
    localStorage.setItem('dugnad_families', JSON.stringify(updatedFamilies));

    setEvents(updatedEvents);
    setFamilies(updatedFamilies);
    setAssigning(false);

    const totalAssigned = updatedShifts.reduce((sum, s) => sum + (s.assignedPeople || 0), 0);
    const totalNeeded = updatedShifts.reduce((sum, s) => sum + s.peopleNeeded, 0);
    
    alert(`✅ Automatisk tildeling fullført!\n\n${totalAssigned} av ${totalNeeded} vakter tildelt.\n\nFamilier med lavest poeng ble prioritert.`);
  };

  const selectedEventData = events.find(e => e.id === selectedEvent);

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <button 
        onClick={() => window.location.href = '/events-list'}
        className="btn btn-secondary"
        style={{ marginBottom: '16px' }}
      >
        ← Tilbake til arrangementer
      </button>

      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
        Tildel vakter
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        Tildel familier til dugnadsvakter basert på poengsystem
      </p>

      {/* Event Selection */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          Velg arrangement
        </h3>
        <select
          className="input"
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          style={{ marginBottom: '16px' }}
        >
          {events.map(e => (
            <option key={e.id} value={e.id}>
              {e.eventName} - {e.date}
            </option>
          ))}
        </select>

        {selectedEventData && (
          <div style={{ padding: '16px', background: 'var(--background)', borderRadius: 'var(--radius-md)' }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>Dato:</strong> {selectedEventData.date}
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong>Tid:</strong> {selectedEventData.startTime} - {selectedEventData.endTime}
            </p>
            <p>
              <strong>Vakter:</strong> {selectedEventData.shifts.length} ({selectedEventData.shifts.reduce((sum, s) => sum + s.peopleNeeded, 0)} personer trengs)
            </p>
          </div>
        )}
      </div>

      {/* Assignment Mode */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          Tildelingsmodus
        </h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setAssignmentMode('auto')}
            className={`btn ${assignmentMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
          >
            🤖 Automatisk tildeling
          </button>
          <button
            onClick={() => setAssignmentMode('manual')}
            className={`btn ${assignmentMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
          >
            ✋ Manuell tildeling
          </button>
        </div>
      </div>

      {assignmentMode === 'auto' && (
        <div className="card" style={{ padding: '32px', background: '#f0f9ff' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            🤖 Automatisk tildeling
          </h3>
          <div style={{ marginBottom: '24px' }}>
            <p style={{ marginBottom: '12px' }}>Systemet vil automatisk:</p>
            <ul style={{ marginLeft: '20px', color: 'var(--text-secondary)' }}>
              <li>Prioritere familier med lavest poeng</li>
              <li>Tildele 1 vakt per barn i familien</li>
              <li>Unngå overlappende vakter for samme familie</li>
              <li>Tildele 10 poeng per time arbeidet</li>
              <li>Oppdatere familiers poengsum automatisk</li>
            </ul>
          </div>
          <button
            onClick={autoAssignShifts}
            className="btn btn-primary"
            style={{ width: '100%', padding: '16px', fontSize: '16px' }}
            disabled={!selectedEvent || assigning}
          >
            {assigning ? '⏳ Tildeler...' : '✨ Start automatisk tildeling'}
          </button>
        </div>
      )}

      {assignmentMode === 'manual' && (
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚧</div>
          <h3 style={{ marginBottom: '8px' }}>Manuell tildeling</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manuell tildeling med drag-and-drop kommer snart!
          </p>
        </div>
      )}
    </div>
  );
};
