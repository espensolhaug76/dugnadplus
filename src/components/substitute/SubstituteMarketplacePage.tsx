import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

// Hjelpefunksjoner
const getInitials = (name: string) => {
  return name
    ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '??';
};

const getMonthShort = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('nb-NO', { month: 'short' }).toUpperCase().replace('.', '');
};

const getDay = (dateStr: string) => {
  return new Date(dateStr).getDate();
};

export const SubstituteMarketplacePage: React.FC = () => {
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<any[]>([]);
  const [filterSport, setFilterSport] = useState('all');
  
  const [upcomingDates, setUpcomingDates] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hent brukerinfo
    const userJson = localStorage.getItem('dugnad_user');
    const user = userJson ? JSON.parse(userJson) : null;
    
    if (user) {
        setCurrentUserId(user.id);
        setCurrentUserName(user.fullName || 'Vikar');
        setAvailability(user.availability || []);
    } else {
        // Prøv Supabase auth direkte hvis localstorage mangler
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                setCurrentUserId(data.user.id);
                setCurrentUserName(data.user.user_metadata?.full_name || 'Vikar');
            }
        });
    }

    fetchMarketplaceData();
  }, []);

  // Filtrering
  useEffect(() => {
    if (filterSport === 'all') {
        setFilteredJobs(availableJobs);
    } else {
        setFilteredJobs(availableJobs.filter(job => job.sport === filterSport));
    }
  }, [filterSport, availableJobs]);

  const fetchMarketplaceData = async () => {
    setLoading(true);
    try {
        const today = new Date().toISOString().split('T')[0];

        // Hent events, shifts og requests
        const { data: eventsData, error } = await supabase
            .from('events')
            .select(`
                *,
                shifts (
                    *,
                    requests (
                        id,
                        type,
                        from_family_id,
                        target_family_id,
                        is_active,
                        created_at,
                        families:from_family_id (name)
                    )
                )
            `)
            .gte('date', today)
            .order('date', { ascending: true });

        if (error) throw error;

        const jobs: any[] = [];
        const dates = new Set<string>();

        eventsData.forEach((event: any) => {
            dates.add(event.date);

            event.shifts.forEach((shift: any) => {
                // Finn aktiv substitute request
                const subReq = shift.requests?.find((r: any) => r.type === 'substitute' && r.is_active);

                if (subReq) {
                    // Sjekk om det er et direkte tilbud til meg
                    const isForMe = subReq.target_family_id === currentUserId;
                    const isOpen = !subReq.target_family_id;

                    if (isOpen || isForMe) {
                        // Beregn varighet
                        const [startH, startM] = shift.start_time.slice(0,5).split(':').map(Number);
                        const [endH, endM] = shift.end_time.slice(0,5).split(':').map(Number);
                        const duration = (endH * 60 + endM) - (startH * 60 + startM);
                        const hours = Math.floor(duration / 60);
                        const mins = duration % 60;
                        const durationStr = mins > 0 ? `${hours}t ${mins}m` : `${hours}t`;

                        // Sjekk hastverk (<48t)
                        const startDateTime = new Date(`${event.date}T${shift.start_time}`);
                        const timeDiff = startDateTime.getTime() - new Date().getTime();
                        const hoursUntil = timeDiff / (1000 * 60 * 60);
                        const isUrgent = hoursUntil < 48 && hoursUntil > 0;

                        jobs.push({
                            eventId: event.id,
                            eventName: event.name,
                            eventDate: event.date,
                            location: event.location || 'Sted ikke angitt',
                            sport: event.sport,
                            shiftId: shift.id,
                            shiftName: shift.name,
                            startTime: shift.start_time.slice(0,5),
                            endTime: shift.end_time.slice(0,5),
                            durationStr,
                            requestingFamilyName: subReq.families?.name || 'Ukjent familie',
                            requestId: subReq.id,
                            isDirectOffer: isForMe,
                            isUrgent
                        });
                    }
                }
            });
        });

        setAvailableJobs(jobs);
        setUpcomingDates(Array.from(dates).sort());

    } catch (error) {
        console.error('Feil ved henting av marked:', error);
    } finally {
        setLoading(false);
    }
  };

  const toggleAvailability = (date: string) => {
    const newAvailability = availability.includes(date)
      ? availability.filter(d => d !== date)
      : [...availability, date];
    
    setAvailability(newAvailability);

    const userJson = localStorage.getItem('dugnad_user');
    if (userJson) {
        const user = JSON.parse(userJson);
        user.availability = newAvailability;
        localStorage.setItem('dugnad_user', JSON.stringify(user));
    }
  };

  const acceptJob = async (job: any) => {
    if (!currentUserId) return alert('Du må være logget inn.');
    if (!confirm(`Vil du ta dette oppdraget?\n\nDu overtar ansvaret for vakten "${job.shiftName}".\nFamilien vil få beskjed.`)) return;

    try {
        // 1. Sjekk/Opprett profil
        const { data: existingProfile } = await supabase
            .from('families')
            .select('id')
            .eq('id', currentUserId)
            .single();

        if (!existingProfile) {
            const { error: createError } = await supabase
                .from('families')
                .insert({
                    id: currentUserId,
                    name: currentUserName || 'Vikar',
                    contact_email: '', 
                    is_substitute: true 
                });
            
            if (createError) throw new Error('Kunne ikke opprette vikar-profil.');
        }

        // 2. Opprett assignment
        const { error: assignError } = await supabase
            .from('assignments')
            .insert({
                shift_id: job.shiftId,
                family_id: currentUserId,
                status: 'assigned'
            });

        if (assignError) throw assignError;

        // 3. Oppdater request
        const { error: reqError } = await supabase
            .from('requests')
            .update({ is_active: false })
            .eq('id', job.requestId);

        if (reqError) throw reqError;

        alert('✅ Oppdrag akseptert! Vakten ligger nå under "Mine jobber".');
        fetchMarketplaceData();

    } catch (error: any) {
        console.error('Feil ved aksept:', error);
        alert('Noe gikk galt: ' + error.message);
    }
  };

  if (loading) return <div style={{padding: '40px', textAlign:'center'}}>Laster markedet... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f2f4f8', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'white', padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <div>
                <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#1f2937' }}>Vikar-børsen</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>Finn vakter som passer deg</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setFilterSport('all')} style={filterStyle(filterSport === 'all')}>Alle</button>
                <button onClick={() => setFilterSport('football')} style={filterStyle(filterSport === 'football')}>⚽ Fotball</button>
                <button onClick={() => setFilterSport('handball')} style={filterStyle(filterSport === 'handball')}>🤾 Håndball</button>
            </div>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* Tilgjengelighet */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1f2937' }}>📅 Når er du ledig?</h3>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {upcomingDates.length === 0 ? (
                    <span style={{fontSize: '13px', color: '#9ca3af'}}>Ingen kommende arrangementer.</span>
                ) : (
                    upcomingDates.map(date => {
                        const isSelected = availability.includes(date);
                        return (
                            <button 
                                key={date}
                                onClick={() => toggleAvailability(date)}
                                style={{
                                    padding: '8px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                                    border: isSelected ? '1px solid #16a8b8' : '1px solid #e5e7eb',
                                    background: isSelected ? '#e0f7fa' : 'white',
                                    color: isSelected ? '#0e7490' : '#4b5563',
                                    fontWeight: isSelected ? '600' : '500',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {isSelected ? '✓ ' : ''}
                                {new Date(date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                            </button>
                        )
                    })
                )}
            </div>
        </div>

        {/* Oppdragsliste */}
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Ledige oppdrag ({filteredJobs.length})
        </h2>
        
        {filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                <p>Ingen oppdrag funnet akkurat nå.</p>
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredJobs.map((job, idx) => (
                    <div key={idx} style={{ 
                        background: 'white', borderRadius: '16px', padding: '16px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: job.isDirectOffer ? '2px solid #f6ad55' : '1px solid transparent',
                        display: 'flex', flexDirection: 'column', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                background: '#f3f4f6', borderRadius: '12px', width: '60px', height: '60px', flexShrink: 0
                            }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444', textTransform: 'uppercase' }}>{getMonthShort(job.eventDate)}</span>
                                <span style={{ fontSize: '22px', fontWeight: '700', color: '#1f2937', lineHeight: 1 }}>{getDay(job.eventDate)}</span>
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: '#111827' }}>{job.shiftName}</h3>
                                        <div style={{ fontSize: '13px', color: '#6b7280' }}>{job.eventName}</div>
                                    </div>
                                    {job.isUrgent && (
                                        <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                                            HASTER!
                                        </span>
                                    )}
                                </div>
                                
                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '13px', color: '#4b5563' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>⏰</span> {job.startTime}-{job.endTime} ({job.durationStr})
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>📍</span> {job.location}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ 
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                            paddingTop: '16px', borderTop: '1px solid #f3f4f6' 
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '50%', background: '#3b82f6', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700'
                                }}>
                                    {getInitials(job.requestingFamilyName)}
                                </div>
                                <div>
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Forespurt av</div>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>{job.requestingFamilyName}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#059669', marginRight: '8px' }}>
                                    💰 Betalt
                                </div>
                                <button 
                                    onClick={() => acceptJob(job)}
                                    style={{
                                        background: '#16a8b8', color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '8px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                                        boxShadow: '0 2px 4px rgba(22, 168, 184, 0.3)'
                                    }}
                                >
                                    Ta oppdrag
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">💼</div>Marked</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-substitute-jobs'}><div className="bottom-nav-icon">✅</div>Jobber</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-profile'}><div className="bottom-nav-icon">👤</div>Profil</button>
      </div>
    </div>
  );
};

const filterStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? '#1f2937' : 'white',
    color: isActive ? 'white' : '#4b5563',
    border: isActive ? '1px solid #1f2937' : '1px solid #e5e7eb',
    borderRadius: '20px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer'
});