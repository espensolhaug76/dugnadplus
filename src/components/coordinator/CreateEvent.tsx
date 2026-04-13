import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface ShiftTemplate {
  name: string;
  people: number;
  desc: string;
  once?: 'start' | 'end';
}

const SPORT_SHIFTS: Record<string, ShiftTemplate[]> = {
  football: [
    { name: 'Kioskvakt', people: 2, desc: 'Selge pølser og brus.' },
    { name: 'Billettsalg', people: 1, desc: 'Ta imot betaling i porten.' },
    { name: 'Fair play/kampvert', people: 1, desc: 'Ta imot dommer og bortelag.' },
    { name: 'Garderobe', people: 1, desc: 'Tilsyn av garderober.' },
    { name: 'Ryddevakt', people: 2, desc: 'Rydde bane og tribune etter kamp.' },
    { name: 'Parkering', people: 1, desc: 'Vise parkering og dirigere trafikk.' },
  ],
  handball: [
    { name: 'Kioskvakt', people: 2, desc: 'Selge mat og drikke.' },
    { name: 'Sekretæriat', people: 2, desc: 'Styre klokke og føre kampskjema.' },
    { name: 'Billettsalg', people: 1, desc: 'Ta imot betaling i døren.' },
    { name: 'Fair play/kampvert', people: 1, desc: 'Ta imot dommer og bortelag.' },
    { name: 'Garderobe', people: 1, desc: 'Tilsyn av garderober.' },
    { name: 'Ryddevakt', people: 2, desc: 'Rydde hall etter kamp.' },
  ],
  dance: [
    { name: 'Opprigg', people: 14, desc: 'Oppmøte fredag kl 18. Opplæring gis på stedet.', once: 'start' },
    { name: 'Inngang', people: 4, desc: 'Sjekke billetter og vise vei.' },
    { name: 'Kiosk', people: 8, desc: 'Salg i kiosk under showet.' },
    { name: 'Nedrigg', people: 10, desc: 'Oppmøte ca kl 18. Begynner etter showet er ferdig.', once: 'end' },
    { name: 'Garderobe', people: 2, desc: 'Tilsyn backstage.' },
  ],
  ishockey: [
    { name: 'Kioskvakt', people: 2, desc: 'Selge mat og drikke.' },
    { name: 'Billettsalg', people: 1, desc: 'Ta imot betaling.' },
    { name: 'Fair play', people: 1, desc: 'Kampvert.' },
    { name: 'Sekretæriat', people: 2, desc: 'Styre klokke og protokoll.' },
    { name: 'Garderobe', people: 1, desc: 'Tilsyn av garderober.' },
    { name: 'Ryddevakt', people: 2, desc: 'Rydde tribune etter kamp.' },
  ]
};

// Standard forhåndsvalgte vakter per sport (de vanligste)
const DEFAULT_SELECTED: Record<string, string[]> = {
  football: ['Kioskvakt', 'Billettsalg', 'Fair play/kampvert'],
  handball: ['Kioskvakt', 'Sekretæriat'],
  dance: ['Opprigg', 'Inngang', 'Kiosk', 'Nedrigg'],
  ishockey: ['Kioskvakt', 'Billettsalg', 'Fair play', 'Sekretæriat'],
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

  // Vaktvalg state
  const [selectedShiftNames, setSelectedShiftNames] = useState<Set<string>>(new Set(DEFAULT_SELECTED['football']));
  const [customShiftName, setCustomShiftName] = useState('');
  const [customShifts, setCustomShifts] = useState<ShiftTemplate[]>([]);
  const [shiftSort, setShiftSort] = useState<'time' | 'name'>('time');

  // Team State
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTeamsAndSetDefault();
  }, []);

  // Hent lagdata fra localStorage for sport-oppslag
  const getLocalTeams = (): any[] => {
    try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; }
  };

  const getSportForTeam = (teamName: string): string | null => {
    const localTeams = getLocalTeams();
    const match = localTeams.find((t: any) => t.name === teamName || t.id === teamName);
    if (match?.sport) return match.sport;
    // Fallback: sjekk klubbens sport
    try {
      const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
      if (club.sport) return club.sport;
    } catch {}
    return null;
  };

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

    // 2. Hent lag fra localStorage
    const localTeams = getLocalTeams();
    localTeams.forEach((t: any) => {
        if (t.name) uniqueTeams.add(t.name);
    });

    const sortedTeams = Array.from(uniqueTeams).sort();
    setTeams(sortedTeams);

    // 3. Sett default valg — bruk aktivt lag fra sidebar
    const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
    let activeTeam = activeTeamId ? localTeams.find((t: any) => t.id === activeTeamId) : null;

    if (!activeTeam && localTeams.length > 0) {
        activeTeam = localTeams[0];
    }

    if (activeTeam) {
        // Sett sport direkte fra laget (ikke gjett fra navn)
        setSport(activeTeam.sport || 'football');
        setSelectedShiftNames(new Set(DEFAULT_SELECTED[activeTeam.sport] || DEFAULT_SELECTED['football']));
        if (activeTeam.sport === 'dance') setAssignmentMode('self-service');
        if (uniqueTeams.has(activeTeam.name)) {
            setSelectedTeam(activeTeam.name);
        }
    } else if (sortedTeams.length === 1) {
        handleTeamChange(sortedTeams[0]);
    }
  };

  const updateSport = (newSport: string) => {
      setSport(newSport);
      setSelectedShiftNames(new Set(DEFAULT_SELECTED[newSport] || DEFAULT_SELECTED['football']));
      setCustomShifts([]);
      setShifts([]);
      if (newSport === 'dance') setAssignmentMode('self-service');
  };

  const handleTeamChange = (team: string) => {
      setSelectedTeam(team);

      const sportFromTeam = getSportForTeam(team);
      if (sportFromTeam) {
          updateSport(sportFromTeam);
          return;
      }

      const lower = team.toLowerCase();
      if (lower.includes('håndball') || lower.includes('handball')) updateSport('handball');
      else if (lower.includes('dans') || lower.includes('dance')) updateSport('dance');
      else if (lower.includes('hockey') || lower.includes('ishockey')) updateSport('ishockey');
      else if (lower.includes('fotball') || lower.includes('football')) updateSport('football');
  };

  const toggleShift = (name: string) => {
      setSelectedShiftNames(prev => {
          const next = new Set(prev);
          if (next.has(name)) next.delete(name);
          else next.add(name);
          return next;
      });
  };

  const addCustomShift = () => {
      const name = customShiftName.trim();
      if (!name) return;
      if (selectedShiftNames.has(name) || customShifts.some(s => s.name === name)) return;
      const newShift: ShiftTemplate = { name, people: 1, desc: '' };
      setCustomShifts(prev => [...prev, newShift]);
      setSelectedShiftNames(prev => new Set(prev).add(name));
      setCustomShiftName('');
  };

  const generateShifts = () => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;

    const slotMinutes = slotDuration * 60;
    const numSlots = Math.floor(totalMinutes / slotMinutes);

    // Kombiner sport-vakter og egendefinerte, filtrer på valgte
    const allTemplates = [...(SPORT_SHIFTS[sport] || SPORT_SHIFTS.football), ...customShifts];
    const activeTemplates = allTemplates.filter(t => selectedShiftNames.has(t.name));

    if (activeTemplates.length === 0) {
      alert('Velg minst én vakttype før du genererer.');
      return;
    }

    const newShifts: any[] = [];
    const formatTime = (minutes: number) => {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    for (let i = 0; i < numSlots; i++) {
      const slotStart = startH * 60 + startM + i * slotMinutes;
      const slotEnd = slotStart + slotMinutes;
      const slotStartTime = formatTime(slotStart);
      const slotEndTime = formatTime(slotEnd);

      activeTemplates.forEach((shift) => {
        if (shift.once === 'start' && i !== 0) return;
        if (shift.once === 'end' && i !== numSlots - 1) return;

        newShifts.push({
          id: `${Date.now()}-${Math.random()}`,
          name: shift.name,
          startTime: slotStartTime,
          endTime: slotEndTime,
          peopleNeeded: shift.people,
          description: shift.desc || '',
          duration_hours: slotDuration,
          shift_type: 'standard' as 'standard' | 'weekend' | 'holiday'
        });
      });
    }

    setShifts(newShifts);
  };

  const updateShiftDescription = (id: string, text: string) => {
      setShifts(prev => prev.map(s => s.id === id ? { ...s, description: text } : s));
  };

  const calcDurationFromTimes = (st: string, et: string): number => {
    const [sH, sM] = st.split(':').map(Number);
    const [eH, eM] = et.split(':').map(Number);
    let diffMin = (eH * 60 + eM) - (sH * 60 + sM);
    if (diffMin < 0) diffMin += 24 * 60;
    return Math.round((diffMin / 60) * 2) / 2 || 2;
  };

  const SHIFT_TYPE_RATE: Record<string, number> = { standard: 100, weekend: 150, holiday: 200 };

  const handleSave = async () => {
    const missing: string[] = [];
    if (!eventName.trim()) missing.push('Navn på arrangement');
    if (!date) missing.push('Dato');
    if (shifts.length === 0) missing.push('Vakter (trykk "Generer vakter")');
    if (missing.length > 0) {
      alert(`Mangler:\n\n${missing.map(m => '• ' + m).join('\n')}`);
      return;
    }
    if (!selectedTeam) {
        if (!confirm('Du har ikke valgt et lag. Arrangementet blir synlig for alle. Vil du fortsette?')) return;
    }

    setSaving(true);

    // Slå opp den kanoniske team_id (slug) fra localStorage basert på
    // det valgte team-navnet og sporten. Dette kobler event-raden til
    // samme team_id som families/lotteries/etc bruker, så Steg F-policies
    // kan gjøre rene team_id-sjekker uten (sport, subgroup)-heuristikk.
    let teamIdForInsert: string | null = null;
    try {
      const localTeams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      const matchedTeam = localTeams.find(
        (t: any) => t.name === selectedTeam && t.sport === sport
      );
      if (matchedTeam?.id) teamIdForInsert = matchedTeam.id;
    } catch {}

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
                team_id: teamIdForInsert,
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
            description: s.description,
            duration_hours: s.duration_hours ?? 2,
            shift_type: s.shift_type || 'standard'
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0 }}>Opprett arrangement</h1>
        <button onClick={() => window.location.href = '/multi-day-event'} className="btn btn-secondary" style={{ fontSize: '14px' }}>
          📅 Flerdag / Turnering
        </button>
      </div>

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
          <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Navn på arrangement</label>
          <input className="input" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="F.eks. Hjemmekamp, Turnering, Danseshow Vår 2025" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div><label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Dato</label><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Start</label><input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
          <div><label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Slutt</label><input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div>
            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Type / Sport</label>
            <select className="input" value={sport} onChange={(e) => updateSport(e.target.value)}>
              <option value="football">⚽ Fotball</option>
              <option value="handball">🤾 Håndball</option>
              <option value="dance">💃 Dans</option>
              <option value="ishockey">🏒 Ishockey</option>
            </select>
          </div>
          <div>
            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Lengde per vakt</label>
            <select className="input" value={slotDuration} onChange={e => setSlotDuration(parseFloat(e.target.value))}>
              {DURATION_OPTIONS.map(dur => <option key={dur} value={dur}>{dur} timer</option>)}
            </select>
          </div>
          <div>
            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Sted</label>
            <input className="input" value={location} onChange={e => setLocation(e.target.value)} />
          </div>
        </div>

        {/* Vakttype-velger */}
        <div style={{ marginBottom: '24px', padding: '20px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <label className="input-label" style={{ marginBottom: '12px', display: 'block', fontSize: '14px' }}>Hvilke vakter trenger du?</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            {(SPORT_SHIFTS[sport] || SPORT_SHIFTS.football).map((tmpl) => (
              <label
                key={tmpl.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                  background: selectedShiftNames.has(tmpl.name) ? 'var(--color-primary-bg)' : 'var(--card-bg)',
                  border: selectedShiftNames.has(tmpl.name) ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                  transition: 'all 0.15s', fontSize: '14px'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedShiftNames.has(tmpl.name)}
                  onChange={() => toggleShift(tmpl.name)}
                  style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{tmpl.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{tmpl.people} pers{tmpl.desc ? ` · ${tmpl.desc}` : ''}</div>
                </div>
              </label>
            ))}
            {customShifts.map((tmpl) => (
              <label
                key={tmpl.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                  background: selectedShiftNames.has(tmpl.name) ? '#fef3c7' : 'var(--card-bg)',
                  border: selectedShiftNames.has(tmpl.name) ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                  transition: 'all 0.15s', fontSize: '14px'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedShiftNames.has(tmpl.name)}
                  onChange={() => toggleShift(tmpl.name)}
                  style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{tmpl.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Egendefinert · {tmpl.people} pers</div>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); setCustomShifts(prev => prev.filter(s => s.name !== tmpl.name)); setSelectedShiftNames(prev => { const n = new Set(prev); n.delete(tmpl.name); return n; }); }}
                  style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                >×</button>
              </label>
            ))}
          </div>

          {/* Egendefinert vakt */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              className="input"
              value={customShiftName}
              onChange={(e) => setCustomShiftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomShift(); } }}
              placeholder="Legg til egendefinert vakt..."
              style={{ flex: 1, fontSize: '13px' }}
            />
            <button onClick={addCustomShift} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', whiteSpace: 'nowrap' }}>+ Legg til</button>
          </div>
        </div>

        <button onClick={generateShifts} className="btn btn-primary" style={{ width: '100%', marginBottom: '24px' }}>✨ Generer vakter</button>

        {shifts.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ margin: 0 }}>Vakter ({shifts.length})</h3>
                <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '6px', overflow: 'hidden', fontSize: '12px' }}>
                  <button
                    onClick={() => { setShiftSort('time'); setShifts(prev => [...prev].sort((a, b) => a.startTime.localeCompare(b.startTime))); }}
                    style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', fontWeight: shiftSort === 'time' ? '700' : '400', background: shiftSort === 'time' ? '#16a8b8' : 'transparent', color: shiftSort === 'time' ? 'white' : '#6b7280' }}
                  >Tid</button>
                  <button
                    onClick={() => { setShiftSort('name'); setShifts(prev => [...prev].sort((a, b) => a.name.localeCompare(b.name))); }}
                    style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', fontWeight: shiftSort === 'name' ? '700' : '400', background: shiftSort === 'name' ? '#16a8b8' : 'transparent', color: shiftSort === 'name' ? 'white' : '#6b7280' }}
                  >Vakttype</button>
                </div>
              </div>
              <button
                onClick={() => {
                  const [sH, sM] = startTime.split(':').map(Number);
                  const [eH, eM] = endTime.split(':').map(Number);
                  let diffMin = (eH * 60 + eM) - (sH * 60 + sM);
                  if (diffMin < 0) diffMin += 24 * 60;
                  const dur = Math.round((diffMin / 60) * 2) / 2 || 2;
                  setShifts(prev => [...prev, {
                    id: `${Date.now()}-${Math.random()}`,
                    name: 'Ny vakt',
                    startTime: startTime,
                    endTime: endTime,
                    peopleNeeded: 1,
                    description: '',
                    duration_hours: dur,
                    shift_type: 'standard' as 'standard' | 'weekend' | 'holiday'
                  }]);
                }}
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '13px' }}
              >
                + Legg til vakt
              </button>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                {shifts.map((shift) => (
                    <div key={shift.id} style={{padding:'16px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                        <div style={{display:'flex', gap:'12px', marginBottom:'10px', alignItems:'center'}}>
                            <div style={{flex:1}}>
                                <label style={{fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block'}}>Vaktnavn</label>
                                <input
                                    className="input"
                                    value={shift.name}
                                    onChange={(e) => setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, name: e.target.value } : s))}
                                    style={{fontSize:'14px', fontWeight:'600'}}
                                />
                            </div>
                            <div style={{width:'115px'}}>
                                <label style={{fontSize:'11px', color:'var(--text-secondary)', marginBottom:'4px', display:'block'}}>Start</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={shift.startTime}
                                    onChange={(e) => {
                                        const newStart = e.target.value;
                                        setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, startTime: newStart, duration_hours: calcDurationFromTimes(newStart, s.endTime) } : s));
                                    }}
                                    style={{fontSize:'13px'}}
                                />
                            </div>
                            <div style={{width:'115px'}}>
                                <label style={{fontSize:'11px', color:'var(--text-secondary)', marginBottom:'4px', display:'block'}}>Slutt</label>
                                <input
                                    type="time"
                                    className="input"
                                    value={shift.endTime}
                                    onChange={(e) => {
                                        const newEnd = e.target.value;
                                        setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, endTime: newEnd, duration_hours: calcDurationFromTimes(s.startTime, newEnd) } : s));
                                    }}
                                    style={{fontSize:'13px'}}
                                />
                            </div>
                            <div style={{width:'70px'}}>
                                <label style={{fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block'}}>Antall</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={shift.peopleNeeded}
                                    min={1}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1;
                                        setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, peopleNeeded: val } : s));
                                    }}
                                    style={{fontSize:'13px'}}
                                />
                            </div>
                            <div style={{width:'80px'}}>
                                <label style={{fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block'}}>Varighet (t)</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={shift.duration_hours ?? 2}
                                    min={0.5}
                                    max={12}
                                    step={0.5}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 2;
                                        setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, duration_hours: val } : s));
                                    }}
                                    style={{fontSize:'13px'}}
                                />
                            </div>
                            <div style={{width:'140px'}}>
                                <label style={{fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block'}}>Vakttype</label>
                                <select
                                    className="input"
                                    value={shift.shift_type || 'standard'}
                                    onChange={(e) => setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, shift_type: e.target.value } : s))}
                                    style={{fontSize:'13px'}}
                                >
                                    <option value="standard">Standard (100p/t)</option>
                                    <option value="weekend">Helg/spesial (150p/t)</option>
                                    <option value="holiday">Høytid (200p/t)</option>
                                </select>
                                <div style={{fontSize:'10px', color:'#2d6a4f', fontStyle:'italic', marginTop:'2px'}}>
                                    Gir {(shift.duration_hours ?? 2) * (SHIFT_TYPE_RATE[shift.shift_type || 'standard'] || 100)} poeng
                                </div>
                            </div>
                            <button
                                onClick={() => setShifts(prev => prev.filter(s => s.id !== shift.id))}
                                style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontSize:'20px', padding:'0 4px', marginTop:'16px'}}
                                title="Slett vakt"
                            >
                                ×
                            </button>
                        </div>
                        <div>
                            <label style={{fontSize:'11px', color:'#6b7280', marginBottom:'4px', display:'block'}}>Beskrivelse</label>
                            <input
                                className="input"
                                value={shift.description}
                                onChange={(e) => updateShiftDescription(shift.id, e.target.value)}
                                placeholder="Valgfri beskrivelse av vakten..."
                                style={{fontSize:'13px'}}
                            />
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* Assignment Mode */}
        <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
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