import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { CloudSetup } from '../common/CloudSetup';
import './CoordinatorLayout.css';

// --- HJELPEKOMPONENTER ---

const StatCard = ({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) => (
  <div className="stat-card" style={{ borderLeft: '4px solid ' + color }}>
    <div style={{ fontSize: '32px', marginBottom: '8px', color: color }}>{icon}</div>
    <div className="stat-card-value">{value}</div>
    <div className="stat-card-label">{label}</div>
  </div>
);

const ProgressCard = ({ title, date, assigned, total, type }: any) => {
  const percentage = total > 0 ? Math.round((assigned / total) * 100) : 0;
  const isCrisis = percentage < 50;
  const isWarning = percentage < 80;
  const color = isCrisis ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981';

  return (
    <div className="card" style={{ padding: '20px', borderLeft: `4px solid ${color}`, marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1f2937' }}>{title}</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>📅 {new Date(date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })} • {type}</p>
        </div>
        <span style={{ fontSize: '12px', fontWeight: '600', background: isCrisis ? '#fee2e2' : '#dcfce7', color: isCrisis ? '#991b1b' : '#166534', padding: '4px 10px', borderRadius: '12px' }}>
          {assigned}/{total} fylt
        </span>
      </div>
      <div style={{ height: '8px', width: '100%', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percentage}%`, background: color, transition: 'width 0.5s ease' }}></div>
      </div>
      <p style={{ fontSize: '12px', color: color, marginTop: '8px', fontWeight: '600', textAlign: 'right' }}>
        {percentage}% ferdigstilt
      </p>
    </div>
  );
};

// OPPDATERT: Fjernet 'status' fra props her siden den ikke brukes
const ActionItem = ({ name, task, time }: any) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid #f3f4f6' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
        {name.charAt(0)}
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>{name}</div>
        <div style={{ fontSize: '12px', color: '#6b7280' }}>{task} • {time}</div>
      </div>
    </div>
    <button className="btn" style={{ padding: '4px 10px', fontSize: '11px', background: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5' }}>
        Send påminnelse
    </button>
  </div>
);

// --- HOVEDKOMPONENT ---

export const CoordinatorDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('oversikt');
  const [stats, setStats] = useState({ totalShifts: 0, assignedShifts: 0, pendingShifts: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [attentionItems, setAttentionItems] = useState<any[]>([]);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbEmpty, setDbEmpty] = useState(false);

  useEffect(() => {
    fetchSupabaseData();
  }, []);

  const fetchSupabaseData = async () => {
    try {
        setLoading(true);
        
        // 1. Hent events med shifts og assignments
        const { data: eventsData, error: eventError } = await supabase
            .from('events')
            .select(`
                *,
                shifts (
                    *,
                    assignments (
                        *,
                        families (name)
                    )
                )
            `)
            .order('date', { ascending: true });

        if (eventError) throw eventError;

        // 2. Hent familier med medlemmer
        const { data: familiesData, error: famError } = await supabase
            .from('families')
            .select(`
                *,
                family_members (*)
            `);
            
        if (famError) throw famError;

        if (!eventsData || eventsData.length === 0) {
            setDbEmpty(true);
            setLoading(false);
            return;
        }

        // 3. Behandle data
        const processedEvents = eventsData.map((e: any) => ({
            ...e,
            eventName: e.name, // Mapper database felt til UI felt
            startTime: e.start_time?.slice(0,5),
            endTime: e.end_time?.slice(0,5),
            shifts: e.shifts.map((s: any) => ({
                ...s,
                startTime: s.start_time?.slice(0,5),
                endTime: s.end_time?.slice(0,5),
                peopleNeeded: s.people_needed,
                assignedFamilies: s.assignments?.map((a: any) => a.families?.name || 'Ukjent') || []
            }))
        }));

        setAllEvents(processedEvents);
        setFamilies(familiesData || []);

        // Statistikk
        let total = 0;
        let assigned = 0;
        processedEvents.forEach((e: any) => {
            e.shifts.forEach((s: any) => {
                total += s.people_needed || 0;
                assigned += s.assignedFamilies.length;
            });
        });

        setStats({
            totalShifts: total,
            assignedShifts: assigned,
            pendingShifts: total - assigned
        });

        // Kommende events
        const now = new Date();
        const upcoming = processedEvents.filter((e: any) => new Date(e.date) >= new Date(now.setHours(0,0,0,0)));
        setUpcomingEvents(upcoming);

        // Attention Items (Logikk: Vakter med færre tildelinger enn behov)
        const attention: any[] = [];
        upcoming.forEach((event: any) => {
            event.shifts.forEach((shift: any) => {
                const missing = shift.peopleNeeded - shift.assignedFamilies.length;
                if (missing > 0) {
                     attention.push({
                        name: 'Mangler personell',
                        task: `${shift.name} (${missing} ledig)`,
                        date: event.date,
                        time: shift.startTime,
                        eventName: event.eventName
                    });
                }
            });
        });
        setAttentionItems(attention.slice(0, 5));
        setDbEmpty(false);

    } catch (error) {
        console.error('Feil ved henting av data:', error);
    } finally {
        setLoading(false);
    }
  };

  if (loading) return <div style={{padding: '40px'}}>Laster data fra skyen... ☁️</div>;

  return (
    <div style={{ width: '100%', height: '100%', background: '#f8fafc' }}>
      
      {/* Header */}
      <div className="dashboard-banner" style={{ padding: '32px 40px', background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', margin: 0 }}>Hei, Koordinator! 👋</h1>
                <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '4px' }}>Status fra <strong>Supabase (Cloud)</strong></p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => window.location.href = '/create-event'} className="btn btn-primary" style={{ borderRadius: '24px', padding: '10px 24px' }}>+ Nytt arrangement</button>
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 40px', background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', gap: '24px' }}>
            {[{ id: 'oversikt', label: 'Oversikt' }, { id: 'vakter', label: 'Vaktliste' }, { id: 'familier', label: 'Spillere & Familier' }, { id: 'logg', label: 'Historikk' }].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                    padding: '16px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #16a8b8' : '2px solid transparent',
                    color: activeTab === tab.id ? '#16a8b8' : '#6b7280',
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    cursor: 'pointer',
                    fontSize: '14px'
                }}
            >
                {tab.label}
            </button>
            ))}
        </div>
      </div>

      <div className="dashboard-content" style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {dbEmpty && (
             <div style={{ marginBottom: '32px' }}>
                <CloudSetup />
            </div>
        )}

        {/* --- FAN 1: OVERSIKT --- */}
        {!dbEmpty && activeTab === 'oversikt' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
            
            {/* VENSTRE KOLONNE */}
            <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#374151', marginBottom: '16px' }}>Neste arrangementer</h2>
                {upcomingEvents.length === 0 ? (
                    <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>
                        <p>Ingen kommende arrangementer.</p>
                    </div>
                ) : (
                    upcomingEvents.slice(0, 3).map((event, idx) => {
                        const total = event.shifts?.reduce((sum: number, s: any) => sum + s.peopleNeeded, 0) || 0;
                        const assigned = event.shifts?.reduce((sum: number, s: any) => sum + (s.assignedFamilies?.length || 0), 0) || 0;
                        return (
                            <ProgressCard 
                                key={idx} 
                                title={event.eventName} 
                                date={event.date} 
                                type={event.sport === 'football' ? 'Fotball' : 'Arrangement'}
                                assigned={assigned}
                                total={total}
                            />
                        );
                    })
                )}

                <div style={{ marginTop: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#374151', margin: 0 }}>⚠️ Status</h2>
                    </div>
                    
                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                        {attentionItems.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#10b981', fontSize: '14px' }}>
                                Alt ser bra ut! ✅
                            </div>
                        ) : (
                            <div>
                                {attentionItems.map((item, idx) => (
                                    <ActionItem 
                                        key={idx} 
                                        name={item.name} 
                                        task={item.task} 
                                        time={`${new Date(item.date).toLocaleDateString()} ${item.time}`}
                                        // status="unconfirmed" // Fjernet denne propen
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* HØYRE KOLONNE */}
            <div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
                  <StatCard icon="📊" label="Totalt behov" value={stats.totalShifts} color="#2196F3" />
                  <StatCard icon="✅" label="Tildelt" value={stats.assignedShifts} color="#4CAF50" />
                  <StatCard icon="⚠️" label="Mangler" value={stats.pendingShifts} color="#F44336" />
                </div>
            </div>
          </div>
        )}

        {/* --- FAN 2: VAKTER (FULLT IMPLEMENTERT MED SUPABASE) --- */}
        {!dbEmpty && activeTab === 'vakter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             {allEvents.map((event: any) => (
                <div key={event.id} className="card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <h3 style={{ margin: 0, color: '#2c5282' }}>{event.eventName}</h3>
                        <span style={{ color: '#718096' }}>{new Date(event.date).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'grid', gap: '12px' }}>
                        {event.shifts.map((shift: any) => (
                            <div key={shift.id} style={{ padding: '12px', background: '#f7fafc', borderRadius: '8px', border: '1px solid #edf2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: '600' }}>{shift.name}</div>
                                    <div style={{ fontSize: '12px', color: '#718096' }}>{shift.startTime} - {shift.endTime}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: shift.assignedFamilies.length >= shift.peopleNeeded ? 'green' : 'orange' }}>
                                        {shift.assignedFamilies.length} / {shift.peopleNeeded}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#718096' }}>
                                        {shift.assignedFamilies.length > 0 ? shift.assignedFamilies.join(', ') : 'Ingen tildelt'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             ))}
          </div>
        )}

        {/* --- FAN 3: FAMILIER (FULLT IMPLEMENTERT MED SUPABASE) --- */}
        {!dbEmpty && activeTab === 'familier' && (
          <div className="card" style={{ padding: '24px' }}>
             <h3 style={{ marginTop: 0 }}>Registrerte Familier ({families.length})</h3>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {families.map((fam: any) => {
                    const parents = fam.family_members?.filter((m:any) => m.role === 'parent') || [];
                    const children = fam.family_members?.filter((m:any) => m.role === 'child') || [];
                    
                    return (
                        <div key={fam.id} style={{ padding: '16px', background: '#f7fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: '700', color: '#2d3748', marginBottom: '4px' }}>{fam.name}</div>
                            <div style={{ fontSize: '12px', color: '#4a5568' }}>
                                <strong>Foreldre:</strong> {parents.map((p:any) => p.name).join(', ')}
                            </div>
                            <div style={{ fontSize: '12px', color: '#4a5568' }}>
                                <strong>Barn:</strong> {children.map((c:any) => c.name).join(', ')}
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '12px', background: '#ebf8ff', color: '#2b6cb0', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                🏆 {fam.total_points || 0} poeng
                            </div>
                        </div>
                    );
                })}
             </div>
          </div>
        )}

        {/* --- FAN 4: LOGG --- */}
        {activeTab === 'logg' && (
             <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>
                <p>Loggføring via Supabase kommer snart.</p>
            </div>
        )}

      </div>
    </div>
  );
};