import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export const CloudSetup: React.FC = () => {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const seedDatabase = async () => {
    if (!confirm('Dette vil legge inn testdata i Supabase-databasen. Er du sikker?')) return;
    setLoading(true);
    setStatus('Starter oppsett...');

    try {
      // 1. Opprett Familier
      const families = [
        { name: 'Familien Hansen', contact_email: 'hansen@demo.no' },
        { name: 'Familien Olsen', contact_email: 'olsen@demo.no' },
        { name: 'Familien Berg', contact_email: 'berg@demo.no' },
        { name: 'Familien Li', contact_email: 'li@demo.no' }
      ];

      const { data: famData, error: famError } = await supabase
        .from('families')
        .insert(families)
        .select();

      if (famError) throw famError;
      setStatus(`✅ Opprettet ${famData.length} familier...`);

      // 2. Legg til medlemmer (forenklet)
      const members = famData.flatMap((fam: any) => [
        { family_id: fam.id, name: `Forelder ${fam.name.split(' ')[1]}`, role: 'parent' },
        { family_id: fam.id, name: `Barn ${fam.name.split(' ')[1]}`, role: 'child', birth_year: 2016 }
      ]);

      await supabase.from('family_members').insert(members);

      // 3. Opprett et Arrangement
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert([{
          name: 'Julecup 2025',
          date: '2025-11-29',
          start_time: '09:00',
          end_time: '15:00',
          location: 'Storhallen',
          sport: 'football',
          assignment_mode: 'auto'
        }])
        .select();

      if (eventError) throw eventError;
      const eventId = eventData[0].id;
      setStatus('✅ Opprettet arrangement...');

      // 4. Opprett Vakter
      const shifts = [
        { event_id: eventId, name: 'Kioskvakt', start_time: '09:00', end_time: '12:00', people_needed: 2 },
        { event_id: eventId, name: 'Kioskvakt', start_time: '12:00', end_time: '15:00', people_needed: 2 },
        { event_id: eventId, name: 'Sekretæriat', start_time: '09:00', end_time: '15:00', people_needed: 1 }
      ];

      await supabase.from('shifts').insert(shifts);
      
      setStatus('🎉 Ferdig! Databasen er klar.');
      alert('Suksess! Databasen er fylt med testdata.');
      window.location.reload();

    } catch (error: any) {
      console.error(error);
      setStatus(`❌ Feil: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: '24px', border: '2px dashed #3182ce', background: '#ebf8ff', marginBottom: '24px' }}>
      <h3 style={{ marginTop: 0, color: '#2c5282' }}>☁️ Cloud Setup</h3>
      <p style={{ fontSize: '14px', color: '#4a5568' }}>
        Koble appen til Supabase og last inn testdata for å verifisere at alt fungerer.
      </p>
      
      {status && <div style={{ marginBottom: '12px', fontWeight: '600', color: status.includes('Feil') ? 'red' : 'green' }}>{status}</div>}

      <button 
        onClick={seedDatabase} 
        className="btn btn-primary" 
        disabled={loading}
        style={{ width: '100%' }}
      >
        {loading ? 'Jobber...' : '🚀 Last opp testdata til Supabase'}
      </button>
    </div>
  );
};