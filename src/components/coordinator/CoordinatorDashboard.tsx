import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import './CoordinatorLayout.css';

// --- HJELPEKOMPONENTER ---

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
  const [userName, setUserName] = useState('Koordinator');
  const [, setUserRole] = useState('');

  // Familie-administrasjon state
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [addingFamily, setAddingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [familySearch, setFamilySearch] = useState('');
  useState<'name' | 'points'>('name');
  const [familyView, setFamilyView] = useState<'cards' | 'ranking'>('cards');
  const [openVaktEvent, setOpenVaktEvent] = useState<string | null>(null);

  useEffect(() => {
    loadUserInfo();
    fetchSupabaseData();
  }, []);

  const loadUserInfo = () => {
    try {
      const userJson = localStorage.getItem('dugnad_user');
      if (userJson) {
        const user = JSON.parse(userJson);
        const fullName = user.fullName || user.name || user.email || 'Koordinator';
        const firstName = fullName.split(' ')[0];
        setUserName(firstName);
      }
      // Hent lag og klubb for rolle-tekst
      const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}');
      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
      const activeTeam = activeTeamId ? teams.find((t: any) => t.id === activeTeamId) : teams[0];

      if (club.name && activeTeam) {
        setUserRole(`Dugnadsansvarlig · ${club.name} ${activeTeam.name}`);
      } else if (club.name) {
        setUserRole(`Dugnadsansvarlig · ${club.name}`);
      }
    } catch {}
  };

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
                        families (name, family_members(name, role))
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

        // Lagre familier uansett (selv om events er tomme)
        setFamilies(familiesData || []);

        // 3. Behandle data
        const processedEvents = (eventsData || []).map((e: any) => ({
            ...e,
            eventName: e.name, // Mapper database felt til UI felt
            startTime: e.start_time?.slice(0,5),
            endTime: e.end_time?.slice(0,5),
            shifts: e.shifts.map((s: any) => ({
                ...s,
                startTime: s.start_time?.slice(0,5),
                endTime: s.end_time?.slice(0,5),
                peopleNeeded: s.people_needed,
                assignedFamilies: s.assignments?.map((a: any) => {
                    const children = a.families?.family_members?.filter((m: any) => m.role === 'child') || [];
                    if (children.length > 0) return children.map((c: any) => c.name).join(' & ');
                    return a.families?.name || 'Ukjent';
                }) || []
            }))
        }));

        // Filtrer på valgt lag (match på både subgroup-navn OG sport)
        const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
        let activeTeam: any = null;
        if (activeTeamId) {
            try {
                const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
                activeTeam = teams.find((t: any) => t.id === activeTeamId) || null;
            } catch {}
        }

        const filteredEvents = activeTeam
            ? processedEvents.filter((e: any) => {
                if (!e.subgroup) return false; // Arrangementer uten lag vises ikke når et lag er valgt
                return e.subgroup === activeTeam.name && e.sport === activeTeam.sport;
              })
            : processedEvents;

        // Filtrer familier — vis kun de som er tildelt vakter i filtrerte events,
        // eller har barn i matchende subgroup
        const assignedFamilyIds = new Set<string>();
        filteredEvents.forEach((e: any) => {
            e.shifts?.forEach((s: any) => {
                s.assignments?.forEach((a: any) => {
                    if (a.family_id) assignedFamilyIds.add(a.family_id);
                });
            });
        });

        // Filtrer familier på aktivt lag via team_id
        const activeTeamIdForFamilies = activeTeam?.id || null;
        const filteredFamiliesData = activeTeamIdForFamilies
            ? (familiesData || []).filter((f: any) => f.team_id === activeTeamIdForFamilies || !f.team_id)
            : (familiesData || []);

        setAllEvents(filteredEvents);
        setFamilies(filteredFamiliesData);
        setDbEmpty(filteredEvents.length === 0 && filteredFamiliesData.length === 0);

        // Statistikk (basert på filtrerte events)
        let total = 0;
        let assigned = 0;
        filteredEvents.forEach((e: any) => {
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

        // Kommende events (filtrert)
        const now = new Date();
        const upcoming = filteredEvents.filter((e: any) => new Date(e.date) >= new Date(now.setHours(0,0,0,0)));
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

  // --- FAMILIE CRUD ---
  const refetchFamilies = async () => {
    const { data } = await supabase.from('families').select('*, family_members(*)').order('name');
    if (data) setFamilies(data);
  };

  const handleAddFamily = async () => {
    if (!newFamilyName.trim()) return;
    const { error } = await supabase.from('families').insert({ name: newFamilyName, total_points: 0 });
    if (error) alert(error.message);
    else { setNewFamilyName(''); setAddingFamily(false); refetchFamilies(); }
  };

  const handleDeleteFamily = async (id: string) => {
    if (!confirm('Slette familien og alle medlemmer permanent?')) return;
    await supabase.from('family_members').delete().eq('family_id', id);
    await supabase.from('families').delete().eq('id', id);
    setExpandedFamily(null);
    refetchFamilies();
  };

  const handleSaveMember = async (member: any) => {
    if (!member.name) return;
    const payload = { name: member.name, role: member.role, email: member.email || null, phone: member.phone || null, birth_year: member.birth_year || null, subgroup: member.subgroup || null };
    if (member.id) {
      await supabase.from('family_members').update(payload).eq('id', member.id);
    } else {
      await supabase.from('family_members').insert({ ...payload, family_id: member.family_id });
    }
    setEditingMember(null);
    refetchFamilies();
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm('Slette denne personen?')) return;
    await supabase.from('family_members').delete().eq('id', memberId);
    refetchFamilies();
  };

  const filteredFamilies = families.filter((fam: any) => {
    if (!familySearch.trim()) return true;
    const q = familySearch.toLowerCase();
    const members = fam.family_members || [];
    return fam.name.toLowerCase().includes(q) || members.some((m: any) => m.name.toLowerCase().includes(q));
  });

  if (loading) return <div style={{padding: '40px'}}>Laster data fra skyen... ☁️</div>;

  return (
    <div style={{ width: '100%', height: '100%', background: 'var(--bg-secondary)' }}>
      
      {/* Header */}
      <div style={{ background: '#1a7a4a', padding: '20px 40px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <h1 style={{ fontSize: '24px', fontWeight: '700', color: 'white', margin: '0 0 4px' }}>Hei, {userName}! 👋</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>
                  {(() => {
                    try {
                      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
                      const activeId = localStorage.getItem('dugnad_active_team_filter');
                      const team = activeId ? teams.find((t: any) => t.id === activeId) : teams[0];
                      if (!team) return 'Dugnadsansvarlig';
                      const sportIcons: Record<string, string> = { football: '⚽', handball: '🤾', dance: '💃', ishockey: '🏒', volleyball: '🏐', basketball: '🏀', tabletennis: '🏓' };
                      const sportLabels: Record<string, string> = { football: 'Fotball', handball: 'Håndball', dance: 'Dans', ishockey: 'Ishockey', volleyball: 'Volleyball', basketball: 'Basketball', tabletennis: 'Bordtennis' };
                      return (
                        <>
                          <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{sportIcons[team.sport] || '🏅'} {sportLabels[team.sport] || team.sport}</span>
                          <span>·</span>
                          <span>{team.name}</span>
                          <span>·</span>
                          <span>Dugnadsansvarlig</span>
                        </>
                      );
                    } catch { return 'Dugnadsansvarlig'; }
                  })()}
                </div>
            </div>
            <button onClick={() => window.location.href = '/create-event'} style={{ background: 'white', color: '#1a7a4a', border: 'none', borderRadius: '8px', padding: '10px 24px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>+ Nytt arrangement</button>
        </div>
      </div>

      {/* Varselbanner for uløste saker */}
      {stats.pendingShifts > 0 && !dbEmpty && (
        <div style={{ background: '#fff8e6', borderBottom: '1px solid #fac775', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: '#633806', flex: 1 }}>
            ⚠️ <strong>{stats.pendingShifts} uløste saker</strong> — {stats.pendingShifts} vakter mangler bemanning{attentionItems.length > 0 ? `, ${attentionItems[0]?.task}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setActiveTab('uloste')} style={{ fontSize: '12px', color: '#633806', background: 'none', border: '1px solid #fac775', borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>Se alle</button>
            <button onClick={(e) => (e.currentTarget.parentElement!.parentElement as HTMLElement).style.display = 'none'} style={{ background: 'none', border: 'none', color: '#633806', cursor: 'pointer', fontSize: '16px', padding: '0 4px', opacity: 0.6 }}>×</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ padding: '0 40px', background: 'var(--card-bg)', borderBottom: '0.5px solid #e8e0d0' }}>
        <div style={{ display: 'flex', gap: '0' }}>
            {[
              { id: 'oversikt', label: 'Oversikt' },
              { id: 'arrangementer', label: 'Arrangementer' },
              { id: 'vakter', label: 'Vaktliste' },
              { id: 'familier', label: 'Spillere & familier' },
              { id: 'logg', label: 'Historikk' },
            ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                    padding: '10px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #2d6a4f' : '2px solid transparent',
                    color: activeTab === tab.id ? '#2d6a4f' : 'var(--text-secondary)',
                    fontWeight: activeTab === tab.id ? '600' : '400',
                    cursor: 'pointer',
                    fontSize: '14px',
                    borderRadius: 0,
                    boxShadow: 'none',
                    transition: 'color 0.15s'
                }}
                onMouseEnter={e => { if (activeTab !== tab.id) (e.target as HTMLElement).style.background = 'rgba(0,0,0,0.03)'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = 'none'; }}
            >
                {tab.label}
            </button>
            ))}
        </div>
      </div>

      <div className="dashboard-content" style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* --- FAN 1: OVERSIKT --- */}
        {activeTab === 'oversikt' && (() => {
          const onboardingSteps = [
            { title: 'Importer spillere fra Spond', desc: families.length > 0 ? `${families.length} spillere importert` : '', pendingDesc: 'Last opp spillerlisten fra Spond', btn: 'Importer', href: '/import-families', done: families.length > 0 },
            { title: 'Opprett første arrangement', desc: allEvents.length > 0 ? `${allEvents.length} arrangement lagt til` : '', pendingDesc: 'Legg til kamp eller turnering', btn: 'Nytt arrangement', href: '/create-event', done: allEvents.length > 0 },
            { title: 'Tildel vakter', desc: stats.assignedShifts > 0 ? 'Automatisk tildeling kjørt' : '', pendingDesc: 'Fordel vakter rettferdig', btn: 'Mine arrangementer', href: '/events-list', done: stats.assignedShifts > 0 },
            { title: 'Inviter foreldre', desc: '', pendingDesc: 'Generer invitasjonstekst og del via Spond', btn: 'Administrer familier', href: '/manage-families', done: false },
          ];
          const completedCount = onboardingSteps.filter(s => s.done).length;
          const showOnboarding = completedCount < 4;

          const nextEvent = upcomingEvents[0];

          return (
          <div>
            {/* Onboarding progress */}
            {showOnboarding && (
              <div style={{ padding: '16px 20px', marginBottom: '20px', background: 'var(--card-bg)', borderRadius: '10px', border: '0.5px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>Kom i gang</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{completedCount} av 4 steg fullført</span>
                </div>
                <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden', marginBottom: '12px' }}>
                  <div style={{ height: '100%', width: `${(completedCount / 4) * 100}%`, background: '#1a7a4a', borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {onboardingSteps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: idx > 0 ? '0.5px solid #f0ece4' : 'none' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: step.done ? '#1a7a4a' : 'transparent', color: step.done ? 'white' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0, border: step.done ? 'none' : '1.5px solid #d1d5db' }}>
                        {step.done ? '✓' : idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: step.done ? 'var(--text-primary)' : idx === completedCount ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{step.title}</div>
                        {(step.done && step.desc) && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{step.desc}</div>}
                        {(!step.done && step.pendingDesc) && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>{step.pendingDesc}</div>}
                      </div>
                      {step.done ? (
                        <span style={{ fontSize: '11px', color: '#0f6e56', fontWeight: '600', whiteSpace: 'nowrap' }}>Fullført</span>
                      ) : idx === completedCount ? (
                        <button onClick={() => window.location.href = step.href} style={{ padding: '4px 12px', fontSize: '11px', background: 'var(--card-bg)', border: '1px solid #d1d5db', borderRadius: '5px', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap', color: 'var(--text-primary)', boxShadow: 'none' }}>{step.btn}</button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Statistikkort */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--card-bg)', borderRadius: '10px', border: '0.5px solid #e2e8f0' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>{families.length}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Familier registrert</div>
              </div>
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--card-bg)', borderRadius: '10px', border: '0.5px solid #e2e8f0' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#1a7a4a' }}>{stats.assignedShifts}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>av {stats.totalShifts} tildelt</div>
              </div>
              <div style={{ padding: '16px', textAlign: 'center', borderRadius: '10px', border: stats.pendingShifts > 0 ? '1px solid #fac775' : '0.5px solid #e2e8f0', background: stats.pendingShifts > 0 ? '#fff8e6' : 'var(--card-bg)' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: stats.pendingShifts > 0 ? '#854f0b' : 'var(--text-primary)' }}>{stats.pendingShifts}</div>
                <div style={{ fontSize: '12px', color: stats.pendingShifts > 0 ? '#854f0b' : 'var(--text-secondary)', marginTop: '2px' }}>{stats.pendingShifts > 0 ? 'Krever oppfølging' : 'Alt OK'}</div>
              </div>
              <div style={{ padding: '16px', textAlign: 'center', background: 'var(--card-bg)', borderRadius: '10px', border: '0.5px solid #e2e8f0' }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>{nextEvent ? nextEvent.eventName : '—'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{nextEvent ? `${new Date(nextEvent.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} · ${(() => { const d = Math.ceil((new Date(nextEvent.date).getTime() - Date.now()) / 86400000); return d === 0 ? 'I dag' : d === 1 ? 'I morgen' : `${d} dager`; })()}` : 'Ingen kommende'}</div>
              </div>
            </div>

            {/* Kommende arrangementer */}
            {upcomingEvents.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>Kommende arrangementer</h3>
                  <button onClick={() => setActiveTab('arrangementer')} style={{ fontSize: '12px', color: '#1a7a4a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Se alle →</button>
                </div>
                {upcomingEvents.slice(0, 3).map((event: any, idx: number) => {
                  const total = event.shifts?.reduce((sum: number, s: any) => sum + s.peopleNeeded, 0) || 0;
                  const assigned = event.shifts?.reduce((sum: number, s: any) => sum + (s.assignedFamilies?.length || 0), 0) || 0;
                  const missing = total - assigned;
                  return (
                    <div key={idx} className="card" style={{ padding: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'center', width: '44px', flexShrink: 0 }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#ef4444', textTransform: 'uppercase' }}>{new Date(event.date).toLocaleDateString('nb-NO', { month: 'short' })}</div>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>{new Date(event.date).getDate()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{event.eventName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{event.shifts?.length || 0} vakter · {assigned} bekreftet</div>
                      </div>
                      {missing > 0 ? (
                        <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: '#fff8e6', color: '#854f0b', fontWeight: '600' }}>{missing} mangler vikar</span>
                      ) : (
                        <span style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px', background: '#e8f5ef', color: '#0f6e56', fontWeight: '600' }}>OK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Vaktbehov (kun når det finnes) */}
            {stats.totalShifts > 0 && attentionItems.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>⚠️ Status</h3>
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  {attentionItems.map((item: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: idx < attentionItems.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <div>
                        <div style={{ fontWeight: '500', fontSize: '13px' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.task} · {new Date(item.date).toLocaleDateString('nb-NO')} {item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Gammel oversikt-kode fjernet */}

        {/* --- FAN: ARRANGEMENTER --- */}
        {activeTab === 'arrangementer' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Alle arrangementer ({allEvents.length})</h2>
              <button onClick={() => window.location.href = '/create-event'} className="btn btn-primary" style={{ borderRadius: '24px', padding: '10px 24px' }}>+ Nytt arrangement</button>
            </div>
            {allEvents.length === 0 ? (
              <div className="card" style={{ padding: '40px' }}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px' }}>Ingen arrangementer for dette laget</h3>
                </div>

                {families.length === 0 ? (
                  <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                    <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '10px', border: '1px solid #fde68a', marginBottom: '16px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#92400e', marginBottom: '4px' }}>⚠️ Importer spillere først</div>
                      <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>Du trenger spillere og foresatte for å kunne opprette arrangementer og fordele vakter. Importer fra Spond på under ett minutt.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => window.location.href = '/import-families'} className="btn btn-primary">📁 Importer spillere</button>
                      <button onClick={() => window.location.href = '/create-event'} className="btn btn-secondary">Opprett uten spillere</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', marginBottom: '16px' }}>
                      Du har {families.length} familier registrert. Opprett et arrangement og fordel vakter automatisk.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button onClick={() => window.location.href = '/create-event'} className="btn btn-primary">+ Nytt arrangement</button>
                    </div>

                    {/* Info om deling med foreldre */}
                    <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdfa', borderRadius: '10px', border: '1px solid #99f6e4' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: '#0f766e', marginBottom: '6px' }}>💡 Tips: Del med foreldrene</div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                        Når du har opprettet et arrangement og tildelt vakter, gå til <strong>Administrer familier → 📋 Invitasjonstekst</strong> for å generere en ferdig tekst med barnekoder som du kan lime inn i Spond eller sende på SMS.
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                        Foreldre registrerer seg på <strong>{window.location.origin}/join</strong> med barnekoden og får tilgang etter din godkjenning.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {allEvents.map((event: any) => {
                  const totalNeeded = event.shifts?.reduce((sum: number, s: any) => sum + (s.peopleNeeded || 0), 0) || 0;
                  const totalAssigned = event.shifts?.reduce((sum: number, s: any) => sum + (s.assignedFamilies?.length || 0), 0) || 0;
                  const percentage = totalNeeded > 0 ? Math.round((totalAssigned / totalNeeded) * 100) : 0;
                  const isPast = new Date(event.date) < new Date(new Date().setHours(0,0,0,0));
                  const statusColor = isPast ? '#6b7280' : percentage >= 100 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';
                  const statusLabel = isPast ? 'Avsluttet' : percentage >= 100 ? 'Fullt bemannet' : `${totalAssigned}/${totalNeeded} tildelt`;

                  return (
                    <div key={event.id} className="card" style={{ padding: '24px', borderLeft: `4px solid ${statusColor}`, opacity: isPast ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{event.eventName}</h3>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <span>📅 {new Date(event.date).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                            <span>⏰ {event.startTime} – {event.endTime}</span>
                            {event.location && <span>📍 {event.location}</span>}
                            <span>🎯 {event.shifts?.length || 0} vakter</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', background: isPast ? '#f3f4f6' : percentage >= 100 ? '#dcfce7' : percentage >= 50 ? '#fef3c7' : '#fee2e2', color: statusColor, padding: '4px 12px', borderRadius: '12px' }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      {!isPast && totalNeeded > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ height: '6px', width: '100%', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(percentage, 100)}%`, background: statusColor, transition: 'width 0.5s ease' }} />
                          </div>
                          <p style={{ fontSize: '12px', color: statusColor, marginTop: '4px', textAlign: 'right', fontWeight: '600' }}>{percentage}%</p>
                        </div>
                      )}
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        <button onClick={() => window.location.href = '/events-list'} className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }}>Se detaljer</button>
                        {!isPast && <button onClick={() => window.location.href = `/manual-shift-assignment?event=${event.id}`} className="btn btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }}>Tildel vakter</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- FAN 2: VAKTER (FULLT IMPLEMENTERT MED SUPABASE) --- */}
        {activeTab === 'vakter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             {allEvents.length === 0 && (
                <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>Ingen arrangementer med vakter.</div>
             )}
             {allEvents.map((event: any, eventIdx: number) => {
                const totalNeeded = event.shifts?.reduce((s: number, sh: any) => s + (sh.peopleNeeded || 0), 0) || 0;
                const totalAssigned = event.shifts?.reduce((s: number, sh: any) => s + (sh.assignedFamilies?.length || 0), 0) || 0;
                const allFilled = totalNeeded > 0 && totalAssigned >= totalNeeded;
                const isOpen = openVaktEvent === event.id || (openVaktEvent === null && eventIdx === 0);

                return (
                <div key={event.id} className="card" style={{ padding: 0, overflow: 'hidden', border: isOpen ? '2px solid #16a8b8' : '1px solid #e2e8f0' }}>
                    <div
                        onClick={() => setOpenVaktEvent(isOpen ? '__none__' : event.id)}
                        style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isOpen ? '#f0fdfa' : 'white', transition: 'background 0.15s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '16px', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{event.eventName}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(event.date).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} · {event.shifts?.length || 0} vakter</div>
                            </div>
                        </div>
                        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '10px', fontWeight: '600', background: allFilled ? '#dcfce7' : '#fee2e2', color: allFilled ? '#166534' : '#991b1b' }}>
                            {totalAssigned}/{totalNeeded}
                        </span>
                    </div>

                    {isOpen && (
                    <div style={{ padding: '0 20px 16px', borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '12px' }}>
                            {event.shifts.map((shift: any) => (
                                <div key={shift.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{shift.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{shift.startTime} - {shift.endTime}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: shift.assignedFamilies.length >= shift.peopleNeeded ? '#10b981' : '#f59e0b' }}>
                                            {shift.assignedFamilies.length}/{shift.peopleNeeded}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                            {shift.assignedFamilies.length > 0 ? shift.assignedFamilies.join(', ') : 'Ingen tildelt'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    )}
                </div>
                );
             })}
          </div>
        )}

        {/* --- FAN 3: FAMILIER (ADMINISTRASJON) --- */}
        {activeTab === 'familier' && (
          <div>
            {/* Header med søk og handlinger */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                  Spillere & Familier ({families.length})
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  {families.reduce((sum: number, f: any) => sum + (f.family_members?.filter((m: any) => m.role === 'child').length || 0), 0)} spillere
                  {' · '}
                  {families.reduce((sum: number, f: any) => sum + (f.family_members?.filter((m: any) => m.role === 'parent').length || 0), 0)} foresatte
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setAddingFamily(true)} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>+ Ny familie</button>
                <button onClick={() => window.location.href = '/import-families'} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>📁 Importer</button>
              </div>
            </div>

            {/* Søk og visningsvalg */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <input type="text" className="input" placeholder="Søk etter familie eller navn..." value={familySearch} onChange={(e) => setFamilySearch(e.target.value)} style={{ maxWidth: '300px', flex: 1 }} />
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <button onClick={() => setFamilyView('cards')} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: familyView === 'cards' ? '700' : '400', background: familyView === 'cards' ? 'var(--color-primary)' : 'transparent', color: familyView === 'cards' ? 'white' : 'var(--text-secondary)' }}>Kort</button>
                <button onClick={() => setFamilyView('ranking')} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: familyView === 'ranking' ? '700' : '400', background: familyView === 'ranking' ? 'var(--color-primary)' : 'transparent', color: familyView === 'ranking' ? 'white' : 'var(--text-secondary)' }}>🏆 Poeng</button>
              </div>
            </div>

            {/* Ny familie */}
            {addingFamily && (
              <div className="card" style={{ padding: '20px', marginBottom: '16px', background: '#f0f9ff', border: '2px solid #bae6fd' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">Familienavn</label>
                    <input className="input" placeholder="F.eks. Fam. Hansen eller Hansen/Berg" value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddFamily(); }} autoFocus />
                  </div>
                  <button onClick={handleAddFamily} className="btn btn-primary">Opprett</button>
                  <button onClick={() => { setAddingFamily(false); setNewFamilyName(''); }} className="btn">Avbryt</button>
                </div>
              </div>
            )}

            {/* Poengtabell */}
            {familyView === 'ranking' && (() => {
              const ranked = [...filteredFamilies]
                .map((fam: any) => {
                  const children = fam.family_members?.filter((m: any) => m.role === 'child') || [];
                  const parents = fam.family_members?.filter((m: any) => m.role === 'parent') || [];
                  return { id: fam.id, name: children.length > 0 ? children.map((c: any) => c.name).join(' & ') : fam.name, familyName: fam.name, parents: parents.map((p: any) => p.name).join(', '), points: fam.total_points || 0, shieldLevel: fam.shield_level || 'none' };
                })
                .sort((a, b) => b.points - a.points);

              return (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)', width: '40px' }}>#</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)' }}>Spiller</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: 'var(--text-secondary)' }}>Foresatte</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>Poeng</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: 'var(--text-secondary)', width: '80px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, idx) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', background: idx < 3 ? 'var(--color-primary-bg, #f0fdfa)' : 'var(--card-bg)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '700', color: idx === 0 ? '#f59e0b' : idx === 1 ? '#6b7280' : idx === 2 ? '#b45309' : 'var(--text-secondary)' }}>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-primary)' }}>{r.name}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>{r.parents || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: 'var(--color-primary)', fontSize: '16px' }}>{r.points}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {r.shieldLevel === 'full' ? <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '8px' }}>Skjermet</span> : r.shieldLevel === 'reduced' ? <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '8px' }}>Redusert</span> : <span style={{ fontSize: '11px', color: '#10b981' }}>●</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Familieliste */}
            {familyView === 'ranking' ? null : filteredFamilies.length === 0 ? (
              <div className="card" style={{ padding: '40px' }}>
                {familySearch ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Ingen familier matcher søket.</p>
                ) : (
                  <div>
                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                      <div style={{ fontSize: '40px', marginBottom: '8px' }}>📋</div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 8px' }}>Importer spillere fra Spond</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>Få inn alle spillere og foresatte på under ett minutt.</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px', margin: '0 auto' }}>
                      {[
                        { step: '1', text: 'Åpne Spond → Grupper → Velg laget', detail: 'Gå til gruppesiden for laget i Spond-appen' },
                        { step: '2', text: 'Trykk ⋯ → Eksporter medlemmer', detail: 'Velg CSV eller Excel-format' },
                        { step: '3', text: 'Last opp filen her i Dugnad+', detail: 'Trykk "Importer" og velg filen du lastet ned' },
                      ].map(s => (
                        <div key={s.step} style={{ display: 'flex', gap: '14px', alignItems: 'start', padding: '14px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0d9488', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 }}>{s.step}</div>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{s.text}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '24px' }}>
                      <button onClick={() => window.location.href = '/import-families'} className="btn btn-primary" style={{ padding: '12px 32px', fontSize: '15px' }}>
                        📁 Importer fra Spond
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredFamilies.map((fam: any) => {
                  const parents = fam.family_members?.filter((m: any) => m.role === 'parent') || [];
                  const children = fam.family_members?.filter((m: any) => m.role === 'child') || [];
                  const isExpanded = expandedFamily === fam.id;
                  const displayTitle = children.length > 0 ? children.map((c: any) => c.name).join(' & ') : fam.name;

                  return (
                    <div key={fam.id} className="card" style={{ padding: 0, overflow: 'hidden', border: isExpanded ? '2px solid #16a8b8' : '1px solid #e2e8f0' }}>
                      {/* Kompakt rad — klikk for å utvide */}
                      <div
                        onClick={() => setExpandedFamily(isExpanded ? null : fam.id)}
                        style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isExpanded ? '#f0fdfa' : 'white', transition: 'background 0.15s' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <span style={{ fontSize: '20px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>{displayTitle}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {fam.name} · {parents.map((p: any) => p.name).join(', ') || 'Ingen foresatte'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '12px', background: '#ebf8ff', color: '#2b6cb0', padding: '3px 8px', borderRadius: '10px', fontWeight: '600' }}>
                            🏆 {fam.total_points || 0}
                          </span>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{(fam.family_members || []).length} pers.</span>
                        </div>
                      </div>

                      {/* Utvidet panel */}
                      {isExpanded && (
                        <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', paddingTop: '16px' }}>
                            {/* Foresatte */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Foresatte ({parents.length})</span>
                                <button onClick={() => setEditingMember({ family_id: fam.id, role: 'parent', name: '', email: '', phone: '' })} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>+ Legg til</button>
                              </div>
                              {parents.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ingen foresatte registrert.</p>}
                              {parents.map((p: any) => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '6px' }}>
                                  <div onClick={() => setEditingMember(p)} style={{ cursor: 'pointer', flex: 1 }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>👤 {p.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{p.email || 'Ingen e-post'} · {p.phone || 'Ingen tlf'}</div>
                                  </div>
                                  <button onClick={() => handleDeleteMember(p.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>×</button>
                                </div>
                              ))}
                            </div>

                            {/* Spillere/barn */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Spillere ({children.length})</span>
                                <button onClick={() => setEditingMember({ family_id: fam.id, role: 'child', name: '', birth_year: 2016, subgroup: '' })} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>+ Legg til</button>
                              </div>
                              {children.length === 0 && <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Ingen spillere registrert.</p>}
                              {children.map((c: any) => (
                                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--card-bg, white)', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '6px' }}>
                                  <div onClick={() => setEditingMember(c)} style={{ cursor: 'pointer', flex: 1 }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>🏃 {c.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                      {c.birth_year ? `Født ${c.birth_year}` : ''}
                                      {c.subgroup && <span style={{ marginLeft: '6px', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '4px' }}>{c.subgroup}</span>}
                                    </div>
                                  </div>
                                  <button onClick={() => handleDeleteMember(c.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Familie-handlinger */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                            {fam.import_code && (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: 'auto', alignSelf: 'center' }}>
                                Kode: <span style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{fam.import_code}</span>
                              </span>
                            )}
                            <button onClick={() => handleDeleteFamily(fam.id)} className="btn" style={{ fontSize: '12px', color: '#ef4444', border: '1px solid #fee2e2', background: '#fff5f5', padding: '6px 14px' }}>
                              Slett familie
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rediger/legg til medlem — modal */}
            {editingMember && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div className="card" style={{ width: '420px', padding: '28px' }}>
                  <h3 style={{ marginTop: 0, fontSize: '18px' }}>{editingMember.id ? 'Rediger' : 'Ny'} {editingMember.role === 'parent' ? 'foresatt' : 'spiller'}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                    <div>
                      <label className="input-label">Navn *</label>
                      <input className="input" value={editingMember.name} onChange={e => setEditingMember({ ...editingMember, name: e.target.value })} autoFocus />
                    </div>
                    {editingMember.role === 'parent' && (
                      <>
                        <div><label className="input-label">E-post</label><input className="input" value={editingMember.email || ''} onChange={e => setEditingMember({ ...editingMember, email: e.target.value })} /></div>
                        <div><label className="input-label">Telefon</label><input className="input" value={editingMember.phone || ''} onChange={e => setEditingMember({ ...editingMember, phone: e.target.value })} /></div>
                      </>
                    )}
                    {editingMember.role === 'child' && (
                      <>
                        <div><label className="input-label">Fødselsår</label><input type="number" className="input" value={editingMember.birth_year || ''} onChange={e => setEditingMember({ ...editingMember, birth_year: parseInt(e.target.value) || null })} /></div>
                        <div><label className="input-label">Gruppe / Lag</label><input className="input" placeholder="F.eks. KIL RØD" value={editingMember.subgroup || ''} onChange={e => setEditingMember({ ...editingMember, subgroup: e.target.value })} /></div>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingMember(null)} className="btn">Avbryt</button>
                    <button onClick={() => handleSaveMember(editingMember)} className="btn btn-primary">Lagre</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- FAN 4: LOGG --- */}
        {/* --- ULØSTE VAKTER --- */}
        {activeTab === 'uloste' && (() => {
          const unfilledShifts: any[] = [];
          allEvents.forEach((event: any) => {
            event.shifts?.forEach((shift: any) => {
              const assigned = shift.assignedFamilies?.length || 0;
              const needed = shift.peopleNeeded || 0;
              if (assigned < needed) {
                unfilledShifts.push({
                  eventName: event.eventName,
                  eventId: event.id,
                  date: event.date,
                  shiftName: shift.name,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  missing: needed - assigned,
                  total: needed,
                  assigned
                });
              }
            });
          });
          unfilledShifts.sort((a, b) => a.date.localeCompare(b.date));

          return (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '16px' }}>⚠️ Vakter som mangler bemanning ({unfilledShifts.length})</h2>
              {unfilledShifts.length === 0 ? (
                <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                  <p style={{ color: 'var(--text-secondary)' }}>Alle vakter er bemannet!</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {unfilledShifts.map((s, idx) => {
                    const isUrgent = new Date(s.date).getTime() - Date.now() < 48 * 60 * 60 * 1000;
                    return (
                      <div key={idx} className="card" style={{ padding: '16px', borderLeft: `4px solid ${isUrgent ? '#ef4444' : '#f59e0b'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>{s.shiftName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {s.eventName} · {new Date(s.date).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })} · {s.startTime}-{s.endTime}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isUrgent && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontWeight: '700' }}>HASTER!</span>}
                            <span style={{ fontSize: '13px', fontWeight: '700', color: '#ef4444' }}>{s.assigned}/{s.total}</span>
                            <button onClick={() => window.location.href = `/manual-shift-assignment?event=${s.eventId}`} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>Tildel</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {activeTab === 'logg' && (
             <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>Loggføring via Supabase kommer snart.</p>
            </div>
        )}

      </div>
    </div>
  );
};