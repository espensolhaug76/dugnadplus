import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

export const SubstituteDashboard: React.FC = () => {
  const [stats, setStats] = useState({ completed: 0, upcoming: 0, potentialEarnings: 0 });
  const [directOffers, setDirectOffers] = useState<any[]>([]);
  const [nextJob, setNextJob] = useState<any>(null);
  const [myJobs, setMyJobs] = useState<any[]>([]); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        let userId = authUser?.id;
        
        if (!userId) {
            const localUser = JSON.parse(localStorage.getItem('dugnad_user') || 'null');
            if (localUser) userId = localUser.id;
        }

        if (!userId) {
            setLoading(false);
            return;
        }

        const { data: familyData } = await supabase
            .from('families')
            .select('name')
            .eq('id', userId)
            .single();
        
        setCurrentUser({ 
            id: userId, 
            fullName: familyData?.name || authUser?.user_metadata?.full_name || 'Vikar' 
        });

        // Hent mine tildelte jobber
        const { data: assignments } = await supabase
            .from('assignments')
            .select(`
                id,
                shift:shifts (
                    id,
                    name,
                    start_time,
                    end_time,
                    event:events (
                        id,
                        name,
                        date,
                        location
                    )
                )
            `)
            .eq('family_id', userId);

        // Hent direkte forespørsler
        const { data: requests } = await supabase
            .from('requests')
            .select(`
                id,
                created_at,
                from_family_id,
                shift:shifts (
                    id,
                    name,
                    start_time,
                    end_time,
                    event:events (
                        id,
                        name,
                        date,
                        location
                    )
                ),
                family:from_family_id (name)
            `)
            .eq('target_family_id', userId)
            .eq('is_active', true);

        let completedCount = 0;
        let upcomingCount = 0;
        let earnings = 0;
        const jobsList: any[] = [];
        const offersList: any[] = [];
        const now = new Date();

        if (assignments) {
            assignments.forEach((a: any) => {
                const shift = a.shift;
                if (!shift || !shift.event) return;

                const eventDate = new Date(shift.event.date);
                const [startH, startM] = shift.start_time.slice(0,5).split(':').map(Number);
                const [endH, endM] = shift.end_time.slice(0,5).split(':').map(Number);
                const duration = (endH * 60 + endM) - (startH * 60 + startM);

                if (eventDate < new Date(now.setHours(0,0,0,0))) {
                    completedCount++;
                    earnings += (duration / 60) * 200; 
                } else {
                    upcomingCount++;
                    jobsList.push({
                        shiftId: shift.id,
                        eventName: shift.event.name,
                        name: shift.name,
                        date: shift.event.date,
                        startTime: shift.start_time.slice(0,5),
                        endTime: shift.end_time.slice(0,5),
                        location: shift.event.location,
                        startDateTime: new Date(`${shift.event.date}T${shift.start_time}`),
                        endDateTime: new Date(`${shift.event.date}T${shift.end_time}`)
                    });
                }
            });
        }

        if (requests) {
            requests.forEach((r: any) => {
                if (!r.shift || !r.shift.event) return;
                
                offersList.push({
                    requestId: r.id,
                    eventId: r.shift.event.id,
                    shiftId: r.shift.id,
                    eventName: r.shift.event.name,
                    date: r.shift.event.date,
                    shiftName: r.shift.name,
                    startTime: r.shift.start_time.slice(0,5),
                    endTime: r.shift.end_time.slice(0,5),
                    location: r.shift.event.location,
                    requesterName: r.family?.name || 'En familie',
                    originalFamilyId: r.from_family_id,
                    startDateTime: new Date(`${r.shift.event.date}T${r.shift.start_time}`),
                    endDateTime: new Date(`${r.shift.event.date}T${r.shift.end_time}`)
                });
            });
        }

        jobsList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        setStats({ 
            completed: completedCount, 
            upcoming: upcomingCount, 
            potentialEarnings: Math.round(earnings)
        });
        
        setDirectOffers(offersList);
        setMyJobs(jobsList);
        setNextJob(jobsList.length > 0 ? jobsList[0] : null);

    } catch (error) {
        console.error('Feil ved datahenting:', error);
    } finally {
        setLoading(false);
    }
  };

  const handleResponse = async (offer: any, accept: boolean) => {
    if (!currentUser?.id) return;

    if (accept) {
        // KOLLISJONSSJEKK
        const hasConflict = myJobs.some(job => {
            if (job.date !== offer.date) return false;
            return (offer.startTime < job.endTime && offer.endTime > job.startTime);
        });

        if (hasConflict) {
            alert('⚠️ Du kan ikke ta denne jobben fordi du allerede har en vakt på dette tidspunktet!');
            return;
        }

        if (!confirm('Vil du ta dette oppdraget?')) return;
        
        try {
            const { error: assignError } = await supabase
                .from('assignments')
                .insert({
                    shift_id: offer.shiftId,
                    family_id: currentUser.id,
                    status: 'assigned'
                });

            if (assignError) throw assignError;

            const { error: reqError } = await supabase
                .from('requests')
                .update({ is_active: false })
                .eq('id', offer.requestId);

            if (reqError) throw reqError;

            alert('✅ Jobb akseptert!');
            loadData(); 

        } catch (e: any) {
            console.error(e);
            alert('Noe gikk galt: ' + e.message);
        }

    } else {
        if (!confirm('Vil du avslå tilbudet? Jobben vil da gå tilbake til det åpne markedet.')) return;
        
        try {
            const { error } = await supabase
                .from('requests')
                .update({ target_family_id: null }) 
                .eq('id', offer.requestId);

            if (error) throw error;
            
            loadData();

        } catch (e: any) {
            console.error(e);
            alert('Feil: ' + e.message);
        }
    }
  };

  const handleLogout = async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('dugnad_user');
      window.location.href = '/';
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster oversikt... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)', padding: '24px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Hei, {currentUser?.fullName?.split(' ')[0] || 'Vikar'}! 👋</h1>
                <div style={{ fontSize: '24px' }}>💼</div>
            </div>
            <button onClick={handleLogout} style={{background:'none', border:'1px solid white', color:'white', borderRadius:'8px', padding:'6px 12px', cursor:'pointer', fontSize:'12px'}}>
                Logg ut
            </button>
        </div>
        
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', color: 'var(--text-primary)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid #edf2f7' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#2d3748' }}>{stats.upcoming}</div>
                <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>Kommende</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1, borderRight: '1px solid #edf2f7' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#38a169' }}>{stats.completed}</div>
                <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>Fullført</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#d69e2e' }}>{stats.potentialEarnings},-</div>
                <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>Inntjent*</div>
            </div>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* 1. VARSLER OM DIREKTE TILBUD */}
        {directOffers.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#c05621', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🔔 Forespørsler til deg ({directOffers.length})
                </h2>
                {directOffers.map((offer, idx) => (
                    <div key={idx} className="card" style={{ padding: '20px', border: '2px solid #ed8936', background: '#fffaf0', marginBottom: '12px' }}>
                        <p style={{ marginBottom: '12px', fontSize: '14px' }}>
                            <strong>{offer.requesterName}</strong> lurer på om du kan ta en vakt:
                        </p>
                        
                        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fed7aa', marginBottom: '16px' }}>
                            <div style={{ fontWeight: '700', fontSize: '16px', color: '#2d3748' }}>{offer.shiftName}</div>
                            <div style={{ fontSize: '14px', color: '#4a5568', marginTop: '4px' }}>{offer.eventName}</div>
                            <div style={{ fontSize: '13px', color: '#718096', marginTop: '8px', display: 'flex', gap: '12px' }}>
                                <span>📅 {new Date(offer.date).toLocaleDateString()}</span>
                                <span>⏰ {offer.startTime}-{offer.endTime}</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => handleResponse(offer, true)} className="btn btn-primary" style={{ flex: 1, background: '#ed8936', border: 'none' }}>✅ Ja, jeg tar den</button>
                            <button onClick={() => handleResponse(offer, false)} className="btn" style={{ flex: 1, background: 'white', border: '1px solid #e53e3e', color: '#e53e3e' }}>❌ Nei, passer ikke</button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {/* 2. NESTE JOBB */}
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Din neste jobb
        </h2>
        
        {nextJob ? (
            <div className="card" style={{ padding: '20px', borderLeft: '4px solid #38a169' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: '700' }}>{nextJob.eventName}</div>
                        <div style={{ fontSize: '16px', color: '#2d3748', marginTop: '4px' }}>{nextJob.name}</div>
                    </div>
                    <div style={{ background: '#f0fff4', color: '#166534', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                        {Math.ceil((new Date(nextJob.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} dager til
                    </div>
                </div>
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #edf2f7', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
                    <div>📅 {new Date(nextJob.date).toLocaleDateString()}</div>
                    <div>⏰ {nextJob.startTime} - {nextJob.endTime}</div>
                    <div style={{gridColumn: 'span 2'}}>📍 {nextJob.location || 'Sted ikke angitt'}</div>
                </div>
            </div>
        ) : (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#718096' }}>
                <p>Du har ingen kommende jobber.</p>
                <button onClick={() => window.location.href = '/substitute-marketplace'} className="btn btn-primary" style={{ marginTop: '12px' }}>Finn oppdrag i markedet</button>
            </div>
        )}

      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-marketplace'}><div className="bottom-nav-icon">💼</div>Marked</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-substitute-jobs'}><div className="bottom-nav-icon">✅</div>Jobber</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-profile'}><div className="bottom-nav-icon">👤</div>Profil</button>
      </div>
    </div>
  );
};