import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

const SPORT_SHIFTS = {
  football: [
    { name: 'Kioskvakt', people: 2, desc: 'Selge pølser og brus.' },
    { name: 'Billettsalg', people: 1, desc: 'Ta imot betaling i porten.' },
    { name: 'Fair play/kampvert', people: 1, desc: 'Ta imot dommer og bortelag.' }
  ],
  handball: [
    { name: 'Kioskvakt', people: 2, desc: '' },
    { name: 'Sekretæriat', people: 2, desc: 'Styre klokke og føre kampskjema.' }
  ],
  dance: [
    { name: 'Opprigg', people: 14, desc: 'Oppmøte fredag kl 18. Opplæring gis på stedet.', once: 'start' },
    { name: 'Inngang', people: 4, desc: 'Sjekke billetter og vise vei.' },
    { name: 'Kiosk', people: 8, desc: 'Salg i kiosk under showet.' },
    { name: 'Nedrigg', people: 10, desc: 'Oppmøte ca kl 18. Begynner etter showet er ferdig.', once: 'end' }
  ],
  ishockey: [
    { name: 'Kioskvakt', people: 2, desc: '' },
    { name: 'Billettsalg', people: 1, desc: '' },
    { name: 'Fair play', people: 1, desc: '' },
    { name: 'Sekretæriat', people: 2, desc: '' }
  ]
};

const DURATION_OPTIONS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

export const CreateEvent: React.FC = () => {
  // Event State
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('15:00');
  const [location, setLocation] = useState('Stadion');
  const [sport, setSport] = useState('football');
  const [slotDuration, setSlotDuration] = useState(2);
  const [shifts, setShifts] = useState<any[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'manual' | 'self-service'>('auto');
  const [selfServiceOpenDate, setSelfServiceOpenDate] = useState('');
  const [selfServiceOpenTime, setSelfServiceOpenTime] = useState('12:00');
  
  // Team State
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTeamsAndSetDefault();
  }, []);

  const fetchTeamsAndSetDefault = async () => {
    const uniqueTeams = new Set<string>();

    // 1. Hent lag fra DB
    const { data } = await supabase
        .from('family_members')
        .select('subgroup')
        .not('subgroup', 'is', null);
    
    if (data) {
        data.forEach((d: any) => {
            if (d.subgroup && d.subgroup.trim() !== '') uniqueTeams.add(d.subgroup);
        });
    }

    // 2. Hent lag fra LocalStorage
    try {
        const localTeams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
        localTeams.forEach((t: any) => {
            if (t.name) uniqueTeams.add(t.name);
        });

        const currentTeamJson = localStorage.getItem('dugnad_current_team');
        if (currentTeamJson) {
            const current = JSON.parse(currentTeamJson);
            if (current.name) uniqueTeams.add(current.name);
        }
    } catch (e) {
        console.error("Feil ved lesing av lokale lag", e);
    }

    const sortedTeams = Array.from(uniqueTeams).sort();
    setTeams(sortedTeams);

    // 4. Sett default valg
    let defaultTeam = localStorage.getItem('dugnad_active_team_filter');
    
    if (!defaultTeam && localStorage.getItem('dugnad_current_team')) {
        try {
            const current = JSON.parse(localStorage.getItem('dugnad_current_team') || '{}');
            defaultTeam = current.name;
        } catch (e) {}
    }

    if (defaultTeam && uniqueTeams.has(defaultTeam)) {
        handleTeamChange(defaultTeam);
    }
  };

  const handleTeamChange = (team: string) => {
      setSelectedTeam(team);
      const lower = team.toLowerCase();
      
      if (lower.includes('håndball') || lower.includes('handball')) {
          setSport('handball');
      } else if (lower.includes('dans') || lower.includes('dance')) {
          setSport('dance');
          setAssignmentMode('self-service'); 
      } else if (lower.includes('hockey') || lower.includes('ishockey')) {
          setSport('ishockey');
      } else if (lower.includes('fotball') || lower.includes('football')) {
          setSport('football');
      }
  };

  const generateShifts = () => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60; 

    const slotMinutes = slotDuration * 60;
    const numSlots = Math.floor(totalMinutes / slotMinutes);

    const newShifts: any[] = [];
    // @ts-ignore
    const sportShifts = SPORT_SHIFTS[sport] || SPORT_SHIFTS.football;

    for (let i = 0; i < numSlots; i++) {
      const slotStart = startH * 60 + startM + i * slotMinutes;
      const slotEnd = slotStart + slotMinutes;
      
      const formatTime = (minutes: number) => {
          const h = Math.floor(minutes / 60) % 24;
          const m = minutes % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      const slotStartTime = formatTime(slotStart);
      const slotEndTime = formatTime(slotEnd);

      sportShifts.forEach((shift: any) => {
        if (shift.once === 'start' && i !== 0) return;
        if (shift.once === 'end' && i !== numSlots - 1) return;

        newShifts.push({
          id: `${Date.now()}-${Math.random()}`,
          name: shift.name,
          startTime: slotStartTime,
          endTime: slotEndTime,
          peopleNeeded: shift.people,
          description: shift.desc || ''
        });
      });
    }

    setShifts(newShifts);
  };

  const updateShiftDescription = (id: string, text: string) => {
      setShifts(prev => prev.map(s => s.id === id ? { ...s, description: text } : s));
  };

  const handleSave = async () => {
    if (!eventName || !date || shifts.length === 0) {
      alert('⚠️ Fyll inn detaljer og generer vakter!');
      return;
    }
    if (!selectedTeam) {
        if (!confirm('Du har ikke valgt et lag. Arrangementet blir synlig for alle. Vil du fortsette?')) return;
    }

    setSaving(true);

    try {
        const { data: eventData, error: eventError } = await supabase
            .from('events')
            .insert([{
                name: eventName,
                date: date,
                start_time: startTime,
                end_time: endTime,
                location: location,
                sport: sport,
                subgroup: selectedTeam,
                assignment_mode: assignmentMode,
                self_service_open_date: assignmentMode === 'self-service' ? `${selfServiceOpenDate}T${selfServiceOpenTime}` : null,
                self_service_status: assignmentMode === 'self-service' ? 'pending' : null
            }])
            .select()
            .single();

        if (eventError) throw eventError;

        const shiftsToInsert = shifts.map(s => ({
            event_id: eventData.id,
            name: s.name,
            start_time: s.startTime,
            end_time: s.endTime,
            people_needed: s.peopleNeeded,
            description: s.description
        }));

        const { error: shiftError } = await supabase.from('shifts').insert(shiftsToInsert);
        if (shiftError) throw shiftError;

        alert('✅ Arrangement lagret!');
        window.location.href = '/events-list';

    } catch (error: any) {
        alert('Feil: ' + error.message);
    } finally {
        setSaving(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>

      <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>Opprett arrangement</h1>
      
      <div className="card" style={{ padding: '32px', marginBottom: '24px' }}>
        
        {/* LAG VELGER */}
        <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Hvilket lag gjelder dugnaden for?</label>
            <select 
                className="input" 
                value={selectedTeam} 
                onChange={(e) => handleTeamChange(e.target.value)}
                style={{fontWeight: 'bold', border: '2px solid var(--primary-color)'}}
            >
                <option value="">-- Velg lag (valgfritt) --</option>
                {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <p style={{fontSize:'12px', color:'#6b7280', marginTop:'4px'}}>Sporten og vaktmalen oppdateres automatisk.</p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label className="input-label">Navn på arrangement</label>
          <input className="input" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="F.eks. Danseshow Vår 2025" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div><label className="input-label">Dato</label><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className="input-label">Start</label><input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
          <div><label className="input-label">Slutt</label><input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="input-label">Type / Sport</label>
            <select className="input" value={sport} onChange={(e) => setSport(e.target.value)}>
              <option value="football">⚽ Fotball</option>
              <option value="handball">🤾 Håndball</option>
              <option value="dance">💃 Dans</option>
              <option value="ishockey">🏒 Ishockey</option>
            </select>
          </div>
          <div>
            <label className="input-label">Lengde per vakt</label>
            <select className="input" value={slotDuration} onChange={e => setSlotDuration(parseFloat(e.target.value))}>
              {DURATION_OPTIONS.map(dur => <option key={dur} value={dur}>{dur} timer</option>)}
            </select>
          </div>
          <div><label className="input-label">Sted</label><input className="input" value={location} onChange={e => setLocation(e.target.value)} /></div>
        </div>

        <button onClick={generateShifts} className="btn btn-primary" style={{ width: '100%', marginBottom: '24px' }}>✨ Generer vakter</button>

        {shifts.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3>Genererte vakter ({shifts.length})</h3>
            
            <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                {/* Endret her: Fjernet idx fra parameterlisten */}
                {shifts.map((shift) => (
                    <div key={shift.id} style={{padding:'16px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                        <div style={{display:'flex', justifyContent:'space-between', fontWeight:'600', marginBottom:'8px'}}>
                            <span>{shift.name} ({shift.peopleNeeded} pers)</span>
                            <span>{shift.startTime} - {shift.endTime}</span>
                        </div>
                        <div style={{display:'flex', gap:'12px'}}>
                            <div style={{flex:1}}>
                                <label style={{fontSize:'11px', color:'#6b7280'}}>Beskrivelse</label>
                                <input 
                                    className="input" 
                                    value={shift.description}
                                    onChange={(e) => updateShiftDescription(shift.id, e.target.value)}
                                    style={{fontSize:'13px'}}
                                />
                            </div>
                            <div style={{width:'80px'}}>
                                <label style={{fontSize:'11px', color:'#6b7280'}}>Antall</label>
                                <input 
                                    type="number" 
                                    className="input"
                                    value={shift.peopleNeeded}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, peopleNeeded: val } : s));
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* Assignment Mode */}
        <div style={{ marginTop: '24px', padding: '16px', background: '#f0f9ff', borderRadius: '8px' }}>
            <label className="input-label">Tildeling</label>
            <select className="input" value={assignmentMode} onChange={(e) => setAssignmentMode(e.target.value as any)}>
                <option value="auto">🤖 Automatisk</option>
                <option value="manual">✋ Manuell</option>
                <option value="self-service">👥 Selvvalg</option>
            </select>
            
            {assignmentMode === 'self-service' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <div>
                        <label className="input-label" style={{ fontSize: '12px' }}>Åpner dato</label>
                        <input type="date" className="input" value={selfServiceOpenDate} onChange={(e) => setSelfServiceOpenDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="input-label" style={{ fontSize: '12px' }}>Åpner tid</label>
                        <input type="time" className="input" value={selfServiceOpenTime} onChange={(e) => setSelfServiceOpenTime(e.target.value)} />
                    </div>
                </div>
            )}
        </div>

        <button onClick={handleSave} className="btn btn-primary" style={{ width: '100%', marginTop: '24px' }} disabled={saving}>
            {saving ? 'Lagrer...' : '💾 Lagre arrangement'}
        </button>
      </div>
    </div>
  );
};