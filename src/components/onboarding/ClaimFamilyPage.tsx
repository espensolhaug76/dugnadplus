import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

export const ClaimFamilyPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const handleClaim = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setMessage(null);

    try {
      // 1. Identifiser brukeren som er logget inn (Deg)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Du må være logget inn.');

      // 2. Finn familien som hører til koden ("Spøkelses-familien")
      const { data: importedFamily, error: findError } = await supabase
        .from('families')
        .select('id, name')
        .eq('import_code', code.trim())
        .single();

      if (findError || !importedFamily) {
        throw new Error('Ugyldig kode. Sjekk at du har skrevet den riktig.');
      }

      // Sjekk at vi ikke prøver å merge med oss selv (hvis man taster sin egen kode?)
      if (importedFamily.id === user.id) {
          throw new Error('Du er allerede koblet til denne familien.');
      }

      // 3. START SAMMENSLÅING (MERGE)
      // Vi flytter alt fra importedFamily -> user.id

      // A. Flytt medlemmene (Barna og evt placeholder-foreldre)
      const { error: memberError } = await supabase
        .from('family_members')
        .update({ family_id: user.id })
        .eq('family_id', importedFamily.id);
      
      if (memberError) throw memberError;

      // B. Flytt vakter (Assignments)
      const { error: assignError } = await supabase
        .from('assignments')
        .update({ family_id: user.id })
        .eq('family_id', importedFamily.id);

      if (assignError) throw assignError;

      // C. Flytt bytte-forespørsler (Requests - fra og til)
      await supabase.from('requests').update({ from_family_id: user.id }).eq('from_family_id', importedFamily.id);
      await supabase.from('requests').update({ to_family_id: user.id }).eq('to_family_id', importedFamily.id);
      await supabase.from('requests').update({ target_family_id: user.id }).eq('target_family_id', importedFamily.id);

      // D. Flytt lotteri-salg
      await supabase.from('lottery_sales').update({ seller_family_id: user.id }).eq('seller_family_id', importedFamily.id);

      // 4. Opprydding: Slett den nå tomme "spøkelses-familien"
      await supabase.from('families').delete().eq('id', importedFamily.id);

      setMessage({
          type: 'success',
          text: `Suksess! Du er nå koblet til ${importedFamily.name}. Barna og vaktene er lagt til i din profil.`
      });
      setCode('');

      // Send brukeren til dashboard etter kort tid
      setTimeout(() => {
          window.location.href = '/family-dashboard';
      }, 2000);

    } catch (error: any) {
      console.error('Feil ved claiming:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', paddingTop: '60px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Koble til barn/lag
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            Har du fått en kode fra lagleder eller koordinator? Tast den inn her for å hente dine data.
          </p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label className="input-label">Dugnads-kode</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input"
              placeholder="F.eks. X7Y2P"
              style={{ 
                  textAlign: 'center', 
                  fontSize: '24px', 
                  letterSpacing: '4px', 
                  textTransform: 'uppercase',
                  fontWeight: '700' 
              }}
            />
          </div>

          {message && (
              <div style={{ 
                  padding: '12px', 
                  borderRadius: '8px', 
                  marginBottom: '16px',
                  background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                  color: message.type === 'success' ? '#166534' : '#991b1b',
                  textAlign: 'center'
              }}>
                  {message.text}
              </div>
          )}

          <button
            onClick={handleClaim}
            className="btn btn-primary btn-large"
            style={{ width: '100%' }}
            disabled={!code || loading}
          >
            {loading ? 'Kobler til...' : '🔗 Koble til'}
          </button>
          
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <button onClick={() => window.location.href = '/family-dashboard'} className="btn" style={{color: 'var(--text-secondary)'}}>
                  Hopp over / Gå til Dashboard
              </button>
          </div>
        </div>

        {/* Info boks */}
        <div style={{ marginTop: '32px', padding: '20px', background: '#eff6ff', borderRadius: '12px', color: '#1e40af', fontSize: '14px' }}>
            <strong>ℹ️ Har du flere barn?</strong><br/>
            Du kan bruke denne siden flere ganger. Hvis du har fått flere koder (f.eks. en for fotball og en for håndball), bare tast inn den neste koden etter at den første er registrert. Alt samles på din profil.
        </div>

      </div>
    </div>
  );
};