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

  // currentSubstituteId = substitutes.id. Skrives nå til de dedikerte
  // substitute-kolonnene (Fase 5): bid_substitute_id i requests og
  // substitute_id i assignments. CHECK-constraints i DB garanterer at
  // family- og substitute-kolonnene er gjensidig utelukkende per rolle.
  const [currentSubstituteId, setCurrentSubstituteId] = useState('');
  const [currentMunicipality, setCurrentMunicipality] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            // Get-or-create substitutes-rad. Idempotent via UNIQUE
            // auth_user_id-constraint.
            let { data: sub } = await supabase
                .from('substitutes')
                .select('id, name, municipality')
                .eq('auth_user_id', user.id)
                .maybeSingle();

            if (!sub) {
                const { data: created, error } = await supabase
                    .from('substitutes')
                    .insert({
                        auth_user_id: user.id,
                        name: user.user_metadata?.full_name || 'Vikar'
                    })
                    .select('id, name, municipality')
                    .single();
                if (error) {
                    console.error('Kunne ikke opprette vikar-profil:', error);
                    setLoading(false);
                    return;
                }
                sub = created;
            }

            setCurrentSubstituteId(sub!.id);
            setCurrentMunicipality(sub!.municipality);

            await fetchMarketplaceData(sub!.id, sub!.municipality);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    })();
  }, []);

  // Filtrering
  useEffect(() => {
    if (filterSport === 'all') {
        setFilteredJobs(availableJobs);
    } else {
        setFilteredJobs(availableJobs.filter(job => job.sport === filterSport));
    }
  }, [filterSport, availableJobs]);

  const fetchMarketplaceData = async (substituteId: string, municipality: string | null) => {
    setLoading(true);
    try {
        // Kall list_open_substitute_jobs-RPC (Fase 4D-C). RPC tar
        // p_municipality som null → returnerer alle åpne vakter
        // hvis vikar ikke har satt hjemkommune. Else: 2-hop-join
        // events → team_members → clubs.municipality skjer server-side.
        const { data, error } = await supabase.rpc('list_open_substitute_jobs', {
            p_municipality: municipality || null
        });
        if (error) throw error;

        // RPC returnerer alle aktive substitute-requests i (evt.) kommunen,
        // også de med target_family_id satt til andre vikarer. Vi
        // filtrerer client-side til åpne + de rettet mot oss.
        const jobs = (data || [])
            .map((row: any) => {
                const [startH, startM] = row.start_time.slice(0,5).split(':').map(Number);
                const [endH, endM] = row.end_time.slice(0,5).split(':').map(Number);
                const duration = (endH * 60 + endM) - (startH * 60 + startM);
                const hours = Math.floor(duration / 60);
                const mins = duration % 60;
                const durationStr = mins > 0 ? `${hours}t ${mins}m` : `${hours}t`;

                const startDateTime = new Date(`${row.event_date}T${row.start_time}`);
                const timeDiff = startDateTime.getTime() - new Date().getTime();
                const hoursUntil = timeDiff / (1000 * 60 * 60);
                const isUrgent = hoursUntil < 48 && hoursUntil > 0;

                // Vikar-rettet direkte tilbud bruker target_substitute_id
                // (Fase 5). En request er "åpen" hvis verken family- eller
                // substitute-target er satt — da kan vikar by/ta direkte.
                const isForMe = row.target_substitute_id === substituteId;
                const isOpen = !row.target_family_id && !row.target_substitute_id;

                if (!isOpen && !isForMe) return null;

                return {
                    eventId: row.event_id,
                    eventName: row.event_name,
                    eventDate: row.event_date,
                    location: row.event_location || 'Sted ikke angitt',
                    sport: row.event_sport,
                    shiftId: row.shift_id,
                    shiftName: row.shift_name,
                    startTime: row.start_time.slice(0,5),
                    endTime: row.end_time.slice(0,5),
                    durationStr,
                    requestingFamilyName: row.from_family_name || 'Ukjent familie',
                    requestId: row.request_id,
                    isDirectOffer: isForMe,
                    isUrgent,
                    duration,
                    bidAmount: row.bid_amount,
                    bidMessage: row.bid_message,
                    bidSubstituteId: row.bid_substitute_id,
                    bidStatus: row.bid_status || 'none'
                };
            })
            .filter(Boolean);

        setAvailableJobs(jobs as any[]);
    } catch (error) {
        console.error('Feil ved henting av marked:', error);
    } finally {
        setLoading(false);
    }
  };

  // Bud-system
  const [bidModal, setBidModal] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState('200');
  const [bidMessage, setBidMessage] = useState('');

  const sendBid = async () => {
    if (!bidModal || !currentSubstituteId) return;
    const amount = parseInt(bidAmount) || 0;
    if (amount <= 0) { alert('Sett en pris.'); return; }
    if (amount > 500) { alert('Makspris er 500 kr per vakt.'); return; }

    // Atomisk RPC (migration 20260609_place_and_accept_substitute_bid):
    // bypasser RLS via SECURITY DEFINER siden vikar ikke har direkte
    // SELECT-tilgang til open requests (kun via list_open_substitute_jobs).
    // RPC validerer caller er vikar, request er aktiv, og skriver budet
    // atomisk innenfor FOR UPDATE-lås.
    const { data: result, error } = await supabase.rpc('place_substitute_bid', {
      p_request_id: bidModal.requestId,
      p_amount: amount,
      p_message: bidMessage || null
    });

    if (error) {
      alert('Kunne ikke sende bud: ' + error.message);
      return;
    }

    if (result === 'ok') {
      setBidModal(null);
      setBidAmount('200');
      setBidMessage('');
      alert('✅ Bud sendt! Familien kan nå se ditt tilbud.');
    } else if (result === 'already_taken') {
      alert('Vakta er allerede tatt.');
    } else if (result === 'not_substitute') {
      alert('Du må være registrert som vikar.');
    } else if (result === 'not_found') {
      alert('Fant ikke vakten lenger.');
    } else if (result === 'invalid_amount') {
      alert('Ugyldig beløp.');
    } else {
      alert('Kunne ikke sende bud: ' + result);
    }

    fetchMarketplaceData(currentSubstituteId, currentMunicipality);
  };

  const acceptJob = async (job: any) => {
    if (!currentSubstituteId) return alert('Du må være logget inn.');
    if (!confirm(`Vil du ta dette oppdraget?\n\nDu overtar ansvaret for vakten "${job.shiftName}".\nFamilien vil få beskjed.`)) return;

    // Atomisk RPC (migration 20260609): låser request FOR UPDATE,
    // sjekker is_active, INSERTer assignment + setter is_active=false
    // i samme transaksjon. Forhindrer at to vikarer rekker å ta samme
    // vakt mellom de gamle INSERT- og UPDATE-stegene.
    const { data: result, error } = await supabase.rpc('take_substitute_request', {
      p_request_id: job.requestId
    });

    if (error) {
      console.error('Feil ved aksept:', error);
      alert('Noe gikk galt: ' + error.message);
      fetchMarketplaceData(currentSubstituteId, currentMunicipality);
      return;
    }

    if (result === 'ok') {
      alert('✅ Oppdrag akseptert! Vakten ligger nå under "Mine jobber".');
    } else if (result === 'already_taken') {
      alert('En annen vikar rakk å ta vakta først. Vi henter inn børsen på nytt.');
    } else if (result === 'not_substitute') {
      alert('Du må være registrert som vikar.');
    } else if (result === 'not_found') {
      alert('Fant ikke vakten lenger.');
    } else {
      alert('Kunne ikke ta vakta: ' + result);
    }

    fetchMarketplaceData(currentSubstituteId, currentMunicipality);
  };

  if (loading) return <div style={{padding: '40px', textAlign:'center'}}>Laster markedet... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f2f4f8', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ background: 'var(--card-bg, white)', padding: '20px 24px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <div>
                <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>Vikar-børsen</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {currentMunicipality ? `Åpne vakter i ${currentMunicipality}` : 'Åpne vakter — alle kommuner'}
                </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setFilterSport('all')} style={filterStyle(filterSport === 'all')}>Alle</button>
                <button onClick={() => setFilterSport('football')} style={filterStyle(filterSport === 'football')}>⚽ Fotball</button>
                <button onClick={() => setFilterSport('handball')} style={filterStyle(filterSport === 'handball')}>🤾 Håndball</button>
            </div>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Oppdragsliste */}
        <h2 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Ledige oppdrag ({filteredJobs.length})
        </h2>

        {filteredJobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                <p>Ingen oppdrag funnet akkurat nå.</p>
                {!currentMunicipality && (
                    <p style={{ fontSize: '12px', marginTop: '12px' }}>
                        Tips: sett hjemkommune i profilen for å se vakter nær deg når de dukker opp.
                    </p>
                )}
            </div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredJobs.map((job, idx) => (
                    <div key={idx} style={{
                        background: 'var(--card-bg, white)', borderRadius: '16px', padding: '16px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: job.isDirectOffer ? '2px solid #f6ad55' : '1px solid transparent',
                        display: 'flex', flexDirection: 'column', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--bg-secondary)', borderRadius: '12px', width: '60px', height: '60px', flexShrink: 0
                            }}>
                                <span style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444', textTransform: 'uppercase' }}>{getMonthShort(job.eventDate)}</span>
                                <span style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>{getDay(job.eventDate)}</span>
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>{job.shiftName}</h3>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{job.eventName}</div>
                                    </div>
                                    {job.isUrgent && (
                                        <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                                            HASTER!
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
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
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Forespurt av</div>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>{job.requestingFamilyName}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {job.bidStatus === 'pending' && job.bidSubstituteId === currentSubstituteId ? (
                                    <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '600', padding: '6px 12px', background: '#fef3c7', borderRadius: '8px' }}>⏳ Bud sendt ({job.bidAmount} kr)</span>
                                ) : job.bidStatus === 'accepted' && job.bidSubstituteId === currentSubstituteId ? (
                                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600', padding: '6px 12px', background: '#dcfce7', borderRadius: '8px' }}>✅ Bud akseptert!</span>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => { setBidModal(job); setBidAmount(String(Math.min(500, Math.round((job.duration / 60) * 200)))); }}
                                            style={{ background: 'var(--card-bg, white)', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            💰 Send bud
                                        </button>
                                        <button
                                            onClick={() => acceptJob(job)}
                                            style={{ background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                                        >
                                            Ta direkte
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* BUD-MODAL */}
      {bidModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '400px', padding: '28px' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>💰 Send bud</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>{bidModal.shiftName} · {bidModal.eventName} · {new Date(bidModal.eventDate).toLocaleDateString('nb-NO')}</p>
            <div style={{ marginBottom: '16px' }}>
              <label className="input-label">Din pris (kr)</label>
              <input type="number" className="input" value={bidAmount} onChange={e => setBidAmount(e.target.value)} style={{ fontSize: '20px', fontWeight: '700', textAlign: 'center' }} />
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Foreslått: {Math.min(500, Math.round((bidModal.duration / 60) * 200))} kr ({bidModal.durationStr})</p>
              {parseInt(bidAmount) > 500 && <p style={{ fontSize: '11px', color: '#854f0b', marginTop: '4px' }}>Makspris er 500 kr per vakt</p>}
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="input-label">Melding (valgfritt)</label>
              <textarea className="input" value={bidMessage} onChange={e => setBidMessage(e.target.value)} rows={2} placeholder="F.eks. Har erfaring med denne type vakt..." />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setBidModal(null)} className="btn">Avbryt</button>
              <button onClick={sendBid} className="btn btn-primary">Send bud</button>
            </div>
          </div>
        </div>
      )}

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
