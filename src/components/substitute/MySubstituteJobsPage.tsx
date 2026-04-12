import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface MyJob {
  assignmentId: string;
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  eventId: string;
  eventName: string;
  date: string;
  location: string;
  status: string;
}

export const MySubstituteJobsPage: React.FC = () => {
  const [myJobs, setMyJobs] = useState<MyJob[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyJobs();
  }, []);

  const fetchMyJobs = async () => {
    setLoading(true);
    try {
        const userJson = localStorage.getItem('dugnad_user');
        let userId = '';
        let email = '';

        if (userJson) {
            const user = JSON.parse(userJson);
            userId = user.id;
            email = user.email;
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                userId = user.id;
                email = user.email || '';
            }
        }

        if (!userId) {
            setLoading(false);
            return;
        }

        setCurrentUserEmail(email);

        const { data: assignments, error } = await supabase
            .from('assignments')
            .select(`
                id,
                status,
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
            .eq('family_id', userId)
            .order('id', { ascending: false });

        if (error) throw error;

        if (assignments) {
            const formattedJobs: MyJob[] = assignments.map((a: any) => ({
                assignmentId: a.id,
                status: a.status,
                shiftId: a.shift.id,
                shiftName: a.shift.name,
                startTime: a.shift.start_time?.slice(0, 5),
                endTime: a.shift.end_time?.slice(0, 5),
                eventId: a.shift.event.id,
                eventName: a.shift.event.name,
                date: a.shift.event.date,
                location: a.shift.event.location || 'Sted ikke angitt'
            }));

            formattedJobs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            setMyJobs(formattedJobs);
        }

    } catch (error: any) {
        console.error('Feil ved henting av jobber:', error);
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster mine oppdrag... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)', padding: '24px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Mine oppdrag</h1>
                <p style={{ fontSize: '14px', opacity: 0.9, marginTop: '4px' }}>{currentUserEmail}</p>
            </div>
            <div style={{ fontSize: '32px' }}>✅</div>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        {myJobs.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📭</div>
                <p style={{ color: 'var(--text-secondary)' }}>Du har ingen aktive oppdrag.</p>
                <button onClick={() => window.location.href = '/substitute-marketplace'} className="btn btn-primary" style={{ marginTop: '16px' }}>Gå til markedet</button>
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {myJobs.map(job => (
                    <div key={job.assignmentId} className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <div style={{ background: '#f0fdf4', padding: '12px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: '600', color: '#166534' }}>
                                {new Date(job.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })} • {job.eventName}
                            </div>
                            <span style={{ fontSize: '12px', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', color: '#166534' }}>
                                {job.status === 'completed' ? 'Fullført' : 'Akseptert'}
                            </span>
                        </div>
                        <div style={{ padding: '16px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>{job.shiftName}</div>
                            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>📍 {job.location}</div>
                            <div style={{ fontSize: '14px', fontFamily: 'monospace', background: '#edf2f7', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                ⏰ {job.startTime} - {job.endTime}
                            </div>
                            <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                Husk å avtale betaling direkte med familien som la ut vakten.
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>Hjem
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-marketplace'}>
          <div className="bottom-nav-icon">💼</div>Marked
        </button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">✅</div>Jobber
        </button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/substitute-profile'}>
          <div className="bottom-nav-icon">👤</div>Profil
        </button>
      </div>
    </div>
  );
};