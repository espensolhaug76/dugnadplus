import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface AssignmentDetails {
  id: string;
  shift_id: string;
  family_id: string;
  is_confirmed: boolean;
  shift: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    event: {
      id: string;
      name: string;
      date: string;
      location: string;
    };
  };
}

interface SwapRequest {
  id: string;
  from_family_id: string;
  shift_id: string;
  family_name: string;
  shift_date: string;
}

type AuthState = 'checking' | 'unauthenticated' | 'not_found' | 'ready';

export const ParentSwapPage: React.FC = () => {
  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFamily, setCurrentFamily] = useState<any>(null);
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Autoritativ auth-sjekk mot Supabase. Stoler IKKE på localStorage alene —
      //    et ugyldig/utløpt token må gi unauthenticated her, ikke slippe gjennom.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setAuthState('unauthenticated');
        setLoading(false);
        return;
      }
      const userId = authUser.id;

      // 2. Finn familien brukeren tilhører. Støtter både det kanoniske
      //    (family_members.auth_user_id) og det gamle (families.id = auth.uid())
      //    mønsteret — dette er overgangsperioden før RLS-migreringen.
      let familyId: string | null = null;

      const { data: memberRow } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (memberRow?.family_id) {
        familyId = memberRow.family_id;
      } else {
        const { data: legacyFamily } = await supabase
          .from('families')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        if (legacyFamily?.id) familyId = legacyFamily.id;
      }

      if (!familyId) {
        setAuthState('not_found');
        setLoading(false);
        return;
      }

      const { data: familyRow } = await supabase
        .from('families')
        .select('*')
        .eq('id', familyId)
        .maybeSingle();
      if (familyRow) setCurrentFamily(familyRow);

      // 3. Hent assignment_id fra URL
      const params = new URLSearchParams(window.location.search);
      const assignmentId = params.get('assignment');
      if (!assignmentId) {
        setAuthState('not_found');
        setLoading(false);
        return;
      }

      // 4. Hent assignment — FILTRER PÅ family_id SAMTIDIG. Hvis assignmenten
      //    ikke finnes ELLER ikke tilhører denne familien, får vi null.
      //    Vi viser "ikke funnet" i begge tilfeller (404-semantikk) slik at
      //    vi ikke avslører at UUID-en eksisterer.
      const { data: assignmentData } = await supabase
        .from('assignments')
        .select('*, shifts(*, events(*))')
        .eq('id', assignmentId)
        .eq('family_id', familyId)
        .maybeSingle();

      if (!assignmentData) {
        setAuthState('not_found');
        setLoading(false);
        return;
      }

      setAuthState('ready');
      const family = familyRow;
      {
        // Map joined table names to match interface
        const mapped = {
          ...assignmentData,
          shift: assignmentData.shifts ? {
            ...assignmentData.shifts,
            event: assignmentData.shifts.events || null,
          } : null,
        };
        setAssignment(mapped as AssignmentDetails);

        // Hent bytteforesporsler fra andre familier for samme event
        const eventId = assignmentData.shifts?.events?.id;
        if (eventId && family) {
          // First get all shifts in this event
          const { data: eventShifts } = await supabase
            .from('shifts')
            .select('id')
            .eq('event_id', eventId);

          const eventShiftIds = (eventShifts || []).map((s: any) => s.id);

          const { data: requests } = await supabase
            .from('requests')
            .select('*, from_family:families!from_family_id(name)')
            .eq('type', 'swap')
            .eq('is_active', true)
            .neq('from_family_id', family.id)
            .in('shift_id', eventShiftIds);

          if (requests) {
            const mapped: SwapRequest[] = requests.map((r: any) => ({
              id: r.id,
              from_family_id: r.from_family_id,
              shift_id: r.shift_id,
              family_name: r.from_family?.name || 'Ukjent familie',
              shift_date: r.created_at,
            }));
            setSwapRequests(mapped);
          }
        }
      }
    } catch (err) {
      console.error('Feil ved lasting av data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAskSwap = async (request: SwapRequest) => {
    if (!currentFamily || !assignment) return;
    try {
      await supabase.from('requests').insert({
        type: 'swap',
        from_family_id: currentFamily.id,
        to_family_id: request.from_family_id,
        shift_id: assignment.shift_id,
        is_active: true,
      });
      alert('Bytteforesporsel sendt!');
    } catch (err) {
      console.error('Feil ved sending av bytteforesporsel:', err);
    }
  };

  const handleNotifyCoordinator = () => {
    alert('Koordinator har blitt varslet.');
  };

  const shiftName = assignment?.shift?.name || '';
  const eventDate = assignment?.shift?.event?.date
    ? new Date(assignment.shift.event.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })
    : '';
  const shiftTime = assignment
    ? `${assignment.shift?.start_time || ''} – ${assignment.shift?.end_time || ''}`
    : '';

  if (loading || authState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#6b7f70' }}>Laster...</div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a2e1f', marginBottom: '8px' }}>Logg inn for å fortsette</div>
          <div style={{ fontSize: '13px', color: '#6b7f70', marginBottom: '16px' }}>
            Du må være innlogget for å bytte vakt.
          </div>
          <button
            onClick={() => window.location.href = '/login'}
            style={{ background: '#2d6a4f', color: '#fff', fontSize: '13px', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
          >
            Gå til innlogging
          </button>
        </div>
      </div>
    );
  }

  // not_found: vist både når assignmentId mangler, og når assignmentet
  // ikke tilhører den innloggede familien. Ingen informasjonslekkasje
  // mellom "finnes ikke" og "ikke din" — brukeren ser samme side.
  if (authState === 'not_found') {
    return (
      <div style={{ minHeight: '100vh', background: '#faf8f4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '18px', fontWeight: '500', color: '#1a2e1f', marginBottom: '8px' }}>Vakt ikke funnet</div>
          <div style={{ fontSize: '13px', color: '#6b7f70', marginBottom: '16px' }}>
            Vi fant ingen vakt å bytte her. Kanskje lenken er feil eller utdatert.
          </div>
          <button
            onClick={() => window.location.href = '/family-dashboard'}
            style={{ background: '#2d6a4f', color: '#fff', fontSize: '13px', padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
          >
            Tilbake til dashbord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '70px' }}>
      {/* Header */}
      <div style={{ background: '#1e3a2f', padding: '16px 20px' }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
        >
          ← Tilbake
        </button>
        <div style={{ fontSize: '18px', fontWeight: '500', color: '#fff' }}>Bytt vakt</div>
        {assignment && (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            {shiftName} · {eventDate} · {shiftTime}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ background: '#f5f5f5', padding: '14px' }}>
        {/* Seksjon 1: Bytt med annen familie */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e0d0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a2e1f', marginBottom: '4px' }}>
            🔄 Bytt med en annen familie
          </div>
          <div style={{ fontSize: '12px', color: '#6b7f70', marginBottom: '10px' }}>
            Finn en familie som kan ta din vakt
          </div>

          {swapRequests.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#6b7f70', padding: '16px', textAlign: 'center' }}>
              Ingen bytteforesporsler akkurat nå
            </div>
          ) : (
            swapRequests.map((req) => (
              <div
                key={req.id}
                style={{
                  background: '#f5f5f5',
                  borderRadius: '6px',
                  padding: '10px',
                  marginTop: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: '#1a2e1f' }}>{req.family_name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7f70' }}>
                    {new Date(req.shift_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <button
                  onClick={() => handleAskSwap(req)}
                  style={{
                    background: '#2d6a4f',
                    color: '#fff',
                    fontSize: '10px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Spør
                </button>
              </div>
            ))
          )}
        </div>

        {/* Seksjon 2: Lei vikar */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e0d0', borderRadius: '10px', padding: '14px', marginTop: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a2e1f', marginBottom: '4px' }}>
            💰 Lei en vikar
          </div>
          <div style={{ fontSize: '12px', color: '#6b7f70', marginBottom: '10px' }}>
            Ungdom fra vikarbørsen tar vakten mot betaling
          </div>
          <div style={{ fontSize: '12px', color: '#6b7f70', padding: '16px', textAlign: 'center', fontStyle: 'italic' }}>
            Vikar-markedsplassen kommer snart
          </div>
        </div>

        {/* Seksjon 3: Meld til koordinator */}
        <button
          onClick={handleNotifyCoordinator}
          style={{
            width: '100%',
            marginTop: '16px',
            background: '#fff8e6',
            border: '1px solid #fac775',
            borderRadius: '10px',
            padding: '14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#854f0b' }}>
            Kan ikke finne noen — meld til koordinator
          </div>
        </button>
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid #dedddd', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}>
          <div style={{ fontSize: '20px', marginBottom: '2px' }}>🏠</div>Hjem
        </button>
        <button onClick={() => window.location.href = '/my-lottery'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}>
          <div style={{ fontSize: '20px', marginBottom: '2px' }}>🎟️</div>Lodd
        </button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}>
          <div style={{ fontSize: '20px', marginBottom: '2px' }}>📅</div>Vakter
        </button>
        <button onClick={() => window.location.href = '/family-members'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', color: '#6b7f70', fontSize: '11px', cursor: 'pointer', padding: '4px 8px' }}>
          <div style={{ fontSize: '20px', marginBottom: '2px' }}>👨‍👩‍👧</div>Familie
        </button>
      </div>
    </div>
  );
};
