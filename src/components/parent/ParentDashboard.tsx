import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { InstallPrompt } from '../common/InstallPrompt';
import { Toast } from '../common/Toast';

const MONTHS_NB = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function getLevel(points: number): string {
  if (points >= 500) return 'VIP';
  if (points >= 300) return 'Premium';
  if (points >= 100) return 'Aktiv';
  return 'Basis';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
}

export const ParentDashboard: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [, setFamily] = useState<any>(null);
  const [childName, setChildName] = useState('');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const hideToast = useCallback(() => setToastVisible(false), []);
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [prefs, setPrefs] = useState({
    pref_kiosk: false, pref_practical: false, pref_transport: false,
    pref_arrangement: false, pref_security: false, pref_other: false,
    pref_weekdays: true, pref_weekends: true, pref_mornings: true, pref_evenings: true,
    wants_extra_shifts: false, notes: ''
  });

  const loadData = async (currentUser: any) => {
    try {
      // Fetch family with members
      const { data: familyData } = await supabase
        .from('families')
        .select('*, family_members(*)')
        .eq('id', currentUser.family_id)
        .single();

      if (familyData) {
        setFamily(familyData);
        const members = familyData.family_members ?? [];
        const child = members.find((m: any) => m.role === 'child');
        if (child) setChildName(child.name || '');
        setPoints(familyData.total_points ?? 0);

        // Load family preferences
        const { data: prefsData } = await supabase
          .from('family_preferences')
          .select('*')
          .eq('family_id', currentUser.family_id)
          .single();
        if (prefsData) {
          setPrefs({
            pref_kiosk: prefsData.pref_kiosk ?? false,
            pref_practical: prefsData.pref_practical ?? false,
            pref_transport: prefsData.pref_transport ?? false,
            pref_arrangement: prefsData.pref_arrangement ?? false,
            pref_security: prefsData.pref_security ?? false,
            pref_other: prefsData.pref_other ?? false,
            pref_weekdays: prefsData.pref_weekdays ?? true,
            pref_weekends: prefsData.pref_weekends ?? true,
            pref_mornings: prefsData.pref_mornings ?? true,
            pref_evenings: prefsData.pref_evenings ?? true,
            wants_extra_shifts: prefsData.wants_extra_shifts ?? false,
            notes: prefsData.notes ?? ''
          });
        }
      }

      // Fetch assignments with shifts and events
      const { data: assignmentData } = await supabase
        .from('assignments')
        .select('*, shifts(*, events(*))')
        .eq('family_id', currentUser.family_id);

      if (assignmentData) {
        const sorted = assignmentData.sort((a: any, b: any) => {
          const dateA = a.shifts?.events?.date || '';
          const dateB = b.shifts?.events?.date || '';
          return dateA.localeCompare(dateB);
        });
        setAssignments(sorted);
      }

      // Fetch upcoming events filtered by date only
      // The user's family assignments above already show which events they have shifts for
      const today = new Date().toISOString().split('T')[0];

      // Determine subgroup from family_members or localStorage team info
      const familyMembers = familyData?.family_members ?? [];
      const childMember = familyMembers.find((m: any) => m.role === 'child');
      const subgroup = childMember?.subgroup
        || localStorage.getItem('dugnad_active_team_filter')
        || null;

      let eventsQuery = supabase
        .from('events')
        .select('*')
        .gte('date', today)
        .order('date', { ascending: true });

      if (subgroup) {
        eventsQuery = eventsQuery.eq('subgroup', subgroup);
      }

      const { data: eventsData } = await eventsQuery;

      if (eventsData) {
        setUpcomingEvents(eventsData);
      }
    } catch (err) {
      console.error('Error loading parent dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('dugnad_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      loadData(parsed);
    } else {
      setLoading(false);
    }
  }, []);

  const handleConfirm = async (assignmentId: string, shiftInfo?: { date: string; time: string; location: string }) => {
    await supabase
      .from('assignments')
      .update({ status: 'confirmed' })
      .eq('id', assignmentId);
    if (shiftInfo) {
      const d = new Date(shiftInfo.date);
      const dayName = d.toLocaleDateString('nb-NO', { weekday: 'long' });
      const dateStr = d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });
      setToastMsg(`✓ Takk! Vi ses ${dayName} ${dateStr} kl ${shiftInfo.time} på ${shiftInfo.location || 'kampen'}`);
      setToastVisible(true);
    }
    if (user) await loadData(user);
  };

  const handleNavigate = (path: string) => {
    window.location.href = path;
  };

  // --- Not logged in ---
  if (!loading && !user) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#faf8f4',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: 20,
      }}>
        <p style={{ fontSize: 15, color: '#1a2e1f', marginBottom: 16 }}>Du må logge inn først</p>
        <button
          onClick={() => handleNavigate('/join')}
          style={{
            background: '#2d6a4f',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 28px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Logg inn
        </button>
      </div>
    );
  }

  // --- Loading ---
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#faf8f4',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        <p style={{ fontSize: 14, color: '#6b7f70' }}>Laster...</p>
      </div>
    );
  }

  // --- Derived data ---
  const firstName = user?.name?.split(' ')[0] || 'Forelder';

  // Team/club info from localStorage since families table doesn't store it
  const storedTeams = (() => {
    try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; }
  })();
  const activeTeamFilter = localStorage.getItem('dugnad_active_team_filter') || '';
  const activeTeam = storedTeams.find((t: any) => t.subgroup === activeTeamFilter || t.id === activeTeamFilter) || storedTeams[0];
  const clubName = activeTeam?.club_name || activeTeam?.clubName || '';
  const teamName = activeTeam?.name || activeTeamFilter || '';
  const level = getLevel(points);

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const nextAssignment = assignments.find((a: any) => {
    const eventDate = a.shifts?.events?.date;
    return eventDate && eventDate >= today && a.status !== 'cancelled';
  });

  // Check which events the user has assignments for
  const assignedEventIds = new Set(
    (assignments || [])
      .filter((a: any) => a?.shifts?.events?.id)
      .map((a: any) => a.shifts.events.id)
  );

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#faf8f4',
      minHeight: '100vh',
      paddingBottom: 56,
    }}>
      {/* === HEADER === */}
      <div style={{
        background: '#1e3a2f',
        padding: '16px 20px',
        borderRadius: '0 0 14px 14px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>
          Hei, {firstName}! 👋
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {clubName} · {childName} {teamName}
        </div>

        {/* Points box */}
        <div style={{
          background: 'rgba(126,200,160,0.15)',
          border: '1px solid rgba(126,200,160,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>Dine poeng</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: '#7ec8a0' }}>{points}</div>
          </div>
          <div style={{
            background: 'rgba(126,200,160,0.2)',
            color: '#7ec8a0',
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 6,
          }}>
            {level}
          </div>
        </div>
        {/* Install prompt */}
        <InstallPrompt />
      </div>

      <Toast message={toastMsg} visible={toastVisible} onHide={hideToast} />

      {/* === BODY === */}
      <div style={{
        background: '#f5f5f5',
        padding: 14,
        minHeight: 'calc(100vh - 130px)',
      }}>

        {/* --- Din neste vakt --- */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: '#6b7f70',
            marginBottom: 8,
          }}>
            Din neste vakt
          </div>

          {nextAssignment ? (() => {
            const event = nextAssignment.shifts?.events;
            const shift = nextAssignment.shifts;
            const eventDate = event?.date ? new Date(event.date) : null;
            const dayNum = eventDate ? eventDate.getDate() : '';
            const monthStr = eventDate ? MONTHS_NB[eventDate.getMonth()] : '';
            const isConfirmed = nextAssignment.status === 'confirmed';

            return (
              <div style={{
                background: '#fff',
                border: '0.5px solid #e8e0d0',
                borderRadius: 10,
                padding: 12,
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {/* Date block */}
                  <div style={{ width: 44, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: '#1a2e1f' }}>{dayNum}</div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#6b7f70' }}>{monthStr}</div>
                  </div>

                  {/* Divider */}
                  <div style={{
                    width: 1,
                    height: 36,
                    background: '#e8e0d0',
                    margin: '0 12px',
                  }} />

                  {/* Center info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a2e1f' }}>
                      {shift?.name || event?.name || event?.title || 'Vakt'}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7f70' }}>
                      {event?.location || ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#4a5e50' }}>
                      {formatTime(shift?.start_time)}{shift?.end_time ? ` – ${formatTime(shift.end_time)}` : ''}
                    </div>
                  </div>

                  {/* Status pill */}
                  <div style={{
                    background: isConfirmed ? '#e6f0e8' : '#fff8e6',
                    color: isConfirmed ? '#2d6a4f' : '#854f0b',
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 8,
                    whiteSpace: 'nowrap',
                  }}>
                    {isConfirmed ? 'Bekreftet' : 'Ubekreftet'}
                  </div>
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {!isConfirmed && (
                    <button
                      onClick={() => handleConfirm(nextAssignment.id, { date: nextAssignment.eventDate, time: formatTime(nextAssignment.startTime), location: nextAssignment.location })}
                      style={{
                        background: '#2d6a4f',
                        color: '#fff',
                        flex: 1,
                        borderRadius: 7,
                        padding: 10,
                        fontSize: 13,
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Bekreft
                    </button>
                  )}
                  <button
                    onClick={() => handleNavigate(`/parent-swap?assignment_id=${nextAssignment.id}`)}
                    style={{
                      background: '#fff',
                      border: '0.5px solid #2d6a4f',
                      color: '#2d6a4f',
                      flex: 1,
                      borderRadius: 7,
                      padding: 10,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Bytt vakt
                  </button>
                </div>
              </div>
            );
          })() : (
            <div style={{
              background: '#fff',
              border: '0.5px dashed #e8e0d0',
              borderRadius: 10,
              padding: 20,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 13, color: '#6b7f70' }}>
                Ingen tildelte vakter for øyeblikket
              </span>
            </div>
          )}
        </div>

        {/* --- Kommende arrangementer --- */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: '#6b7f70',
            marginBottom: 8,
          }}>
            Kommende arrangementer
          </div>

          {upcomingEvents.length === 0 && (
            <div style={{
              background: '#fff',
              border: '0.5px dashed #e8e0d0',
              borderRadius: 10,
              padding: 20,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 13, color: '#6b7f70' }}>
                Ingen kommende arrangementer
              </span>
            </div>
          )}

          {upcomingEvents.map((event: any) => {
            const hasAssignment = assignedEventIds.has(event.id);
            return (
              <div
                key={event.id}
                style={{
                  background: '#fff',
                  border: '0.5px solid #e8e0d0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 500, color: '#1a2e1f', width: 50 }}>
                  {formatDate(event.date)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#1a2e1f' }}>{event.name || event.title || ''}</div>
                  <div style={{ fontSize: 11, color: '#6b7f70' }}>
                    {hasAssignment ? 'Du har vakt' : 'Ingen vakt'}
                  </div>
                </div>
                <div style={{
                  background: hasAssignment ? '#e6f1fb' : '#f1efe8',
                  color: hasAssignment ? '#185fa5' : '#6b7f70',
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 8,
                  whiteSpace: 'nowrap',
                }}>
                  {hasAssignment ? 'Din vakt' : 'Fri'}
                </div>
              </div>
            );
          })}
        </div>

        {/* --- Min dugnadsprofil --- */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: '#6b7f70',
            marginBottom: 8,
          }}>
            Min dugnadsprofil
          </div>

          <div style={{
            background: '#fff',
            border: '0.5px solid #e8e0d0',
            borderRadius: 10,
            padding: 14,
          }}>
            {(() => {
              const activeIcons: string[] = [];
              if (prefs.pref_kiosk) activeIcons.push('\u{1F6D2}');
              if (prefs.pref_practical) activeIcons.push('\u{1F527}');
              if (prefs.pref_transport) activeIcons.push('\u{1F697}');
              if (prefs.pref_arrangement) activeIcons.push('\u{1F4CB}');
              if (prefs.pref_security) activeIcons.push('\u{1F512}');
              return activeIcons.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, fontSize: 18, marginBottom: 10 }}>
                  {activeIcons.map((icon, i) => <span key={i}>{icon}</span>)}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6b7f70', marginBottom: 10 }}>
                  Fortell koordinatoren hva du kan bidra med
                </div>
              );
            })()}
            <button
              onClick={() => setShowPrefsModal(true)}
              style={{
                background: '#2d6a4f',
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                padding: '8px 16px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Rediger
            </button>
          </div>
        </div>
      </div>

      {/* === PREFERENCES MODAL === */}
      {showPrefsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}>
          <div style={{
            background: '#faf8f4',
            borderRadius: 14,
            width: 420,
            maxWidth: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 20,
            position: 'relative',
          }}>
            {/* Close button */}
            <button
              onClick={() => setShowPrefsModal(false)}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none', fontSize: 20,
                cursor: 'pointer', color: '#4a5e50',
              }}
            >
              \u00D7
            </button>

            <div style={{ fontSize: 16, fontWeight: 500, color: '#1a2e1f', marginBottom: 18 }}>
              Hva passer for deg?
            </div>

            {/* Seksjon 1 */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7f70', marginBottom: 8 }}>
              Hva kan jeg bidra med
            </div>
            {([
              { key: 'pref_kiosk', icon: '\u{1F6D2}', label: 'Kiosk og salg' },
              { key: 'pref_practical', icon: '\u{1F527}', label: 'Praktisk arbeid' },
              { key: 'pref_transport', icon: '\u{1F697}', label: 'Transport og kj\u00F8ring' },
              { key: 'pref_arrangement', icon: '\u{1F4CB}', label: 'Arrangement og organisering' },
              { key: 'pref_security', icon: '\u{1F512}', label: 'Sikkerhet og vakthold' },
              { key: 'pref_other', icon: '\u2733\uFE0F', label: 'Andre oppgaver' },
            ] as { key: string; icon: string; label: string }[]).map(item => (
              <div key={item.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '0.5px solid #e8e0d0',
              }}>
                <span style={{ fontSize: 13, color: '#1a2e1f' }}>{item.icon} {item.label}</span>
                <div
                  onClick={() => setPrefs(p => ({ ...p, [item.key]: !(p as any)[item.key] }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: (prefs as any)[item.key] ? '#2d6a4f' : '#e8e0d0',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: (prefs as any)[item.key] ? 23 : 3,
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            ))}

            {/* Seksjon 2 */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7f70', marginTop: 18, marginBottom: 8 }}>
              N\u00E5r passer det best
            </div>
            {([
              { key: 'pref_weekdays', icon: '\u{1F4C5}', label: 'Hverdager' },
              { key: 'pref_weekends', icon: '\u{1F4C5}', label: 'Helger' },
              { key: 'pref_mornings', icon: '\u{1F305}', label: 'Formiddag' },
              { key: 'pref_evenings', icon: '\u{1F306}', label: 'Ettermiddag/kveld' },
            ] as { key: string; icon: string; label: string }[]).map(item => (
              <div key={item.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '0.5px solid #e8e0d0',
              }}>
                <span style={{ fontSize: 13, color: '#1a2e1f' }}>{item.icon} {item.label}</span>
                <div
                  onClick={() => setPrefs(p => ({ ...p, [item.key]: !(p as any)[item.key] }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                    background: (prefs as any)[item.key] ? '#2d6a4f' : '#e8e0d0',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3,
                    left: (prefs as any)[item.key] ? 23 : 3,
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            ))}

            {/* Seksjon 3 */}
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7f70', marginTop: 18, marginBottom: 8 }}>
              Ekstra vakter
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '0.5px solid #e8e0d0',
            }}>
              <span style={{ fontSize: 13, color: '#1a2e1f' }}>Ja, jeg vil gjerne ta ekstra vakter</span>
              <div
                onClick={() => setPrefs(p => ({ ...p, wants_extra_shifts: !p.wants_extra_shifts }))}
                style={{
                  width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                  background: prefs.wants_extra_shifts ? '#2d6a4f' : '#e8e0d0',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: prefs.wants_extra_shifts ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#6b7f70', marginTop: 4, marginBottom: 14 }}>
              Da kan koordinatoren tildele deg vakter utover minimum
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#4a5e50', display: 'block', marginBottom: 4 }}>
                Noe koordinatoren b\u00F8r vite?
              </label>
              <textarea
                value={prefs.notes}
                onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
                maxLength={200}
                style={{
                  width: '100%', minHeight: 60, borderRadius: 8,
                  border: '0.5px solid #e8e0d0', padding: 10, fontSize: 13,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  background: '#fff', color: '#1a2e1f', resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10, color: '#6b7f70', textAlign: 'right', marginTop: 2 }}>
                {prefs.notes.length}/200
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={async () => {
                if (!user?.family_id) return;
                const activeTeamId = localStorage.getItem('dugnad_active_team_filter') || null;
                const payload = {
                  family_id: user.family_id,
                  team_id: activeTeamId,
                  ...prefs,
                };
                await supabase.from('family_preferences').upsert(payload, { onConflict: 'family_id' });
                setShowPrefsModal(false);
                setToastMsg('\u2713 Profil lagret!');
                setToastVisible(true);
              }}
              style={{
                background: '#2d6a4f',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '12px 0',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Lagre profil
            </button>
          </div>
        </div>
      )}

      {/* === BOTTOM NAV === */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '0.5px solid #e8e0d0',
        display: 'flex',
        height: 56,
      }}>
        {[
          { icon: '🏠', label: 'Hjem', path: '', active: true },
          { icon: '📅', label: 'Vakter', path: '/my-shifts', active: false },
          { icon: '🎟️', label: 'Lodd', path: '/my-lottery', active: false },
          { icon: '👤', label: 'Profil', path: '', active: false },
        ].map((item, i) => (
          <button
            key={i}
            onClick={() => item.path && handleNavigate(item.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontSize: 10,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: item.active ? '#2d6a4f' : '#6b7f70',
              fontWeight: item.active ? 500 : 400,
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
