import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Person {
  assignmentId: string;
  familyId: string;
  name: string;
  status: string; // 'assigned', 'confirmed', 'completed', 'missed'
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number | null;
  shiftType: string | null; // 'standard', 'weekend', 'holiday'
  people: Person[];
}

interface Event {
  id: string;
  eventName: string;
  date: string;
  shifts: Shift[];
}

export const AttendancePage: React.FC = () => {
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPastEvents();
  }, []);

  const fetchPastEvents = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    // Server-side team-filter: begrens til aktivt lag slik at
    // koordinator kun ser oppmøte for egne lag, ikke events fra
    // andre teams. Samme mønster som CoordinatorDashboard.
    const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
    if (!activeTeamId) {
      setPastEvents([]);
      setLoading(false);
      return;
    }

    // 1. Hent ferdige arrangementer for aktivt lag.
    // Vi bruker lte (less than or equal) så man kan godkjenne dagens vakter også.
    const { data: eventsData, error } = await supabase
      .from('events')
      .select(`
        *,
        shifts (
          id,
          name,
          start_time,
          end_time,
          duration_hours,
          shift_type,
          assignments (
            id,
            status,
            family_id,
            families (name)
          )
        )
      `)
      .eq('team_id', activeTeamId)
      .lte('date', today)
      .order('date', { ascending: false });

    if (error) {
      console.error('Feil ved henting av events:', error);
      setLoading(false);
      return;
    }

    // 2. Map data til visningsformat
    const formattedEvents: Event[] = eventsData.map((e: any) => ({
      id: e.id,
      eventName: e.name,
      date: e.date,
      shifts: e.shifts.map((s: any) => ({
        id: s.id,
        name: s.name,
        startTime: s.start_time?.slice(0, 5),
        endTime: s.end_time?.slice(0, 5),
        durationHours: s.duration_hours ?? null,
        shiftType: s.shift_type ?? null,
        people: s.assignments?.map((a: any) => ({
          assignmentId: a.id,
          familyId: a.family_id,
          name: a.families?.name || 'Ukjent familie',
          status: a.status || 'assigned'
        })) || []
      }))
    }));

    setPastEvents(formattedEvents);
    setLoading(false);
  };

  // Referanseoversikt over poeng per aktivitet (for visning) — reserved for future use

  // Poeng per time basert på vakttype
  const RATE_PER_HOUR: Record<string, number> = {
    'standard': 100,
    'weekend': 150,
    'holiday': 200,
  };

  const calculateDurationFromTimes = (start: string, end: string): number => {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    return ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
  };

  const calculatePoints = (shift: Shift): number => {
    const { durationHours, shiftType, startTime, endTime } = shift;

    // Bruk duration_hours og shift_type fra vakten hvis tilgjengelig
    if (durationHours != null && shiftType && RATE_PER_HOUR[shiftType]) {
      return Math.round(durationHours * RATE_PER_HOUR[shiftType]);
    }

    // Fallback: beregn varighet fra start_time/end_time med standard rate
    if (startTime && endTime) {
      const hours = calculateDurationFromTimes(startTime, endTime);
      const rate = (shiftType && RATE_PER_HOUR[shiftType]) ? RATE_PER_HOUR[shiftType] : RATE_PER_HOUR['standard'];
      return Math.round(hours * rate);
    }

    return 0;
  };

  const handleAttendance = async (shift: Shift, person: Person, newStatus: 'completed' | 'missed') => {
    if (person.status === newStatus) return; // Ingen endring
    
    // Forhindre dobbel poengutdeling: 
    // Vi deler kun ut poeng hvis status går fra noe annet TIL 'completed'.
    // Hvis den allerede var 'completed', antar vi at poeng er gitt før.
    const shouldAwardPoints = newStatus === 'completed' && person.status !== 'completed';
    const shouldDeductPoints = person.status === 'completed' && newStatus !== 'completed'; // Hvis man angrer en godkjenning

    const points = calculatePoints(shift);

    try {
        // 1. Oppdater status på assignment
        const { error: assignError } = await supabase
            .from('assignments')
            .update({ status: newStatus })
            .eq('id', person.assignmentId);

        if (assignError) throw assignError;

        // 2. Håndter poeng på familien
        if (shouldAwardPoints || shouldDeductPoints) {
            // Hent nåværende poeng
            const { data: familyData, error: famFetchError } = await supabase
                .from('families')
                .select('total_points')
                .eq('id', person.familyId)
                .single();
            
            if (famFetchError) throw famFetchError;

            const currentPoints = familyData.total_points || 0;
            const newTotal = shouldAwardPoints 
                ? currentPoints + points 
                : currentPoints - points;

            // Oppdater poeng
            const { error: famUpdateError } = await supabase
                .from('families')
                .update({ total_points: newTotal })
                .eq('id', person.familyId);

            if (famUpdateError) throw famUpdateError;
            
            if (shouldAwardPoints) alert(`✅ Godkjent! ${points} poeng tildelt ${person.name}.`);
            if (shouldDeductPoints) alert(`Angret godkjenning. ${points} poeng trukket fra ${person.name}.`);
        }

        // 3. Oppdater lokal state for rask UI-respons
        fetchPastEvents();

    } catch (error: any) {
        console.error('Feil ved oppdatering:', error);
        alert('Feil: ' + error.message);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Laster oppmøtelister... ☁️</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>
        ← Tilbake
      </button>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>Oppmøte & Godkjenning</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
            Gå gjennom arrangementer og bekreft hvem som møtte opp. <br/>
            <strong>NB:</strong> Når du klikker "Godkjenn", tildeles familien automatisk poeng.
        </p>
      </div>

      {pastEvents.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏁</div>
            <p style={{ color: 'var(--text-secondary)' }}>Ingen arrangementer funnet (eller ingen data i skyen).</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {pastEvents.map(event => (
                <div key={event.id} className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', margin: 0 }}>
                            {event.eventName}
                        </h3>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                            {new Date(event.date).toLocaleDateString('nb-NO')}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {event.shifts?.length === 0 && <p style={{fontSize:'13px', fontStyle:'italic'}}>Ingen vakter registrert.</p>}
                        
                        {event.shifts?.map((shift) => {
                            if (shift.people.length === 0) return null; // Skjul vakter uten folk

                            return (
                                <div key={shift.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: '600', marginBottom: '12px', fontSize: '15px' }}>
                                        {shift.name} <span style={{fontWeight:'400', color:'#6b7280'}}>({shift.startTime}-{shift.endTime})</span>
                                        {' '}<span style={{ fontSize: '12px', color: '#2d6a4f', fontWeight: '500' }}>{calculatePoints(shift)} poeng</span>
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {shift.people.map((person) => {
                                            const isCompleted = person.status === 'completed';
                                            const isMissed = person.status === 'missed' || person.status === 'no_show'; // støtte for begge statuser

                                            return (
                                                <div key={person.assignmentId} style={{ 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    background: 'var(--card-bg, white)', padding: '10px 14px', borderRadius: '6px',
                                                    border: isCompleted ? '1px solid #48bb78' : isMissed ? '1px solid #f56565' : '1px solid #e2e8f0',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '18px' }}>
                                                            {isCompleted ? '✅' : isMissed ? '❌' : '👤'}
                                                        </span>
                                                        <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{person.name}</span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button 
                                                            onClick={() => handleAttendance(shift, person, 'completed')}
                                                            disabled={isCompleted}
                                                            style={{
                                                                padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: isCompleted ? 'default' : 'pointer',
                                                                background: isCompleted ? '#48bb78' : '#edf2f7',
                                                                color: isCompleted ? 'white' : '#4a5568',
                                                                fontWeight: '600', fontSize: '12px', opacity: isCompleted ? 1 : 0.8
                                                            }}
                                                        >
                                                            {isCompleted ? 'Godkjent' : 'Godkjenn'}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleAttendance(shift, person, 'missed')}
                                                            disabled={isMissed}
                                                            style={{
                                                                padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: isMissed ? 'default' : 'pointer',
                                                                background: isMissed ? '#f56565' : '#edf2f7',
                                                                color: isMissed ? 'white' : '#4a5568',
                                                                fontWeight: '600', fontSize: '12px', opacity: isMissed ? 1 : 0.8
                                                            }}
                                                        >
                                                            {isMissed ? 'Ikke møtt' : 'Ikke møtt'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
      )}
    </div>
  );
};