import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Prize {
  id: string;
  name: string;
  value: string;
  donor: string;
  status?: 'approved' | 'pending'; // Valgfritt felt avhengig av DB-skjema
}

export const MyLottery: React.FC = () => {
  const [lottery, setLottery] = useState<any>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [mySales, setMySales] = useState(0);
  const [currentFamilyId, setCurrentFamilyId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'sell' | 'donate'>('sell');
  const [loading, setLoading] = useState(true);

  // State for premiedonasjon
  const [donationName, setDonationName] = useState('');
  const [donationValue, setDonationValue] = useState('');
  const [donationDonor, setDonationDonor] = useState(''); 

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
        // 1. Identifiser bruker og familie
        const userJson = localStorage.getItem('dugnad_user');
        const user = userJson ? JSON.parse(userJson) : null;
        
        let familyId = '';

        if (user) {
            // Prøv å finne familie via ID først (hvis Auth ID = Family ID)
            const { data: familyById } = await supabase
                .from('families')
                .select('id, name')
                .eq('id', user.id)
                .single();
            
            if (familyById) {
                familyId = familyById.id;
            } else {
                // Fallback: Søk på e-post
                const { data: familyByEmail } = await supabase
                    .from('families')
                    .select('id, name')
                    .eq('contact_email', user.email)
                    .single();
                
                if (familyByEmail) familyId = familyByEmail.id;
            }
        }

        if (familyId) setCurrentFamilyId(familyId);

        // 2. Hent aktivt lotteri
        const { data: lotteryData } = await supabase
            .from('lotteries')
            .select('*')
            .eq('is_active', true)
            .single();

        if (lotteryData) {
            // Map snake_case til camelCase for UI
            setLottery({
                id: lotteryData.id,
                name: lotteryData.name,
                description: lotteryData.description,
                ticketPrice: lotteryData.ticket_price,
                vippsNumber: lotteryData.vipps_number,
                goal: lotteryData.goal
            });

            // 3. Hent premier
            const { data: prizeData } = await supabase
                .from('prizes')
                .select('*')
                .eq('lottery_id', lotteryData.id);
            
            if (prizeData) setPrizes(prizeData);

            // 4. Hent salgstall for denne familien
            if (familyId) {
                const { data: salesData } = await supabase
                    .from('lottery_sales')
                    .select('tickets')
                    .eq('lottery_id', lotteryData.id)
                    .eq('seller_family_id', familyId);
                
                if (salesData) {
                    const total = salesData.reduce((sum, sale) => sum + (sale.tickets || 0), 0);
                    setMySales(total);
                }
            }
        }

    } catch (error) {
        console.error('Feil ved henting av data:', error);
    } finally {
        setLoading(false);
    }
  };

  const copyLink = () => {
    if (!currentFamilyId) return alert('Mangler familie-ID.');
    const url = `${window.location.origin}/lottery-shop?seller=${currentFamilyId}`;
    navigator.clipboard.writeText(url);
    alert('Lenke kopiert! Del den på Facebook, Spond eller SMS.');
  };

  const openShop = () => {
    if (!currentFamilyId) return alert('Mangler familie-ID.');
    window.location.href = `/lottery-shop?seller=${currentFamilyId}`;
  };

  const handleDonate = async () => {
    if (!donationName || !lottery) {
        alert('Du må skrive hva premien er.');
        return;
    }

    try {
        const { error } = await supabase
            .from('prizes')
            .insert({
                lottery_id: lottery.id,
                name: donationName,
                value: donationValue,
                donor: donationDonor || 'Anonym',
                // Hvis databasen har et 'status'-felt for godkjenning, kan vi sette det her.
                // Ellers ignoreres det hvis kolonnen ikke finnes (Supabase er streng på skjema, så pass på at kolonnen finnes eller fjern dette feltet).
                // status: 'pending' 
            });

        if (error) throw error;

        setDonationName('');
        setDonationValue('');
        setDonationDonor('');
        alert('🎁 Tusen takk! Premien er registrert.');
        fetchData(); // Oppdater listen

    } catch (error: any) {
        console.error('Feil ved donasjon:', error);
        alert('Noe gikk galt: ' + error.message);
    }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster... ☁️</div>;

  if (!lottery) {
    return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
            <h1>🎟️ Loddbok</h1>
            <p>Ingen aktive lotterier akkurat nå.</p>
            <div className="bottom-nav">
                <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
                <button className="bottom-nav-item active"><div className="bottom-nav-icon">🎟️</div>Lodd</button>
            </div>
        </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Min Loddbok</h1>
        <p style={{ opacity: 0.9 }}>{lottery.name}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'white', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: '600px' }}>
            <button onClick={() => setActiveTab('sell')} style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', fontWeight: activeTab === 'sell' ? '600' : '400', color: activeTab === 'sell' ? 'var(--primary-color)' : 'var(--text-secondary)', borderBottom: activeTab === 'sell' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>
                🎟️ Selg lodd
            </button>
            <button onClick={() => setActiveTab('donate')} style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', fontWeight: activeTab === 'donate' ? '600' : '400', color: activeTab === 'donate' ? 'var(--primary-color)' : 'var(--text-secondary)', borderBottom: activeTab === 'donate' ? '2px solid var(--primary-color)' : '2px solid transparent', cursor: 'pointer' }}>
                🎁 Doner premie
            </button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        
        {activeTab === 'sell' && (
            <>
                {/* Statuskort */}
                <div className="card" style={{ padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>DITT SALG</div>
                    <div style={{ fontSize: '48px', fontWeight: '800', color: 'var(--primary-color)' }}>{mySales * lottery.ticketPrice} kr</div>
                    <div style={{ fontSize: '16px', color: 'var(--text-primary)', fontWeight: '600' }}>{mySales} lodd solgt</div>
                </div>

                {/* Delingsseksjon */}
                <div className="card" style={{ padding: '24px', marginBottom: '24px', border: '2px solid #16a8b8', background: '#f0fdf4' }}>
                    <h3 style={{ marginTop: 0, color: '#16a8b8' }}>📢 Selg lodd</h3>
                    <p style={{ fontSize: '14px', marginBottom: '16px' }}>
                        Send denne lenken til bestemor, onkel og naboen. De betaler enkelt med Vipps.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                            readOnly 
                            value={`${window.location.origin}/lottery-shop?seller=${currentFamilyId}`} 
                            className="input" 
                            style={{ fontSize: '12px', background: 'white' }}
                        />
                        <button onClick={copyLink} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>Kopier</button>
                    </div>
                    <button onClick={openShop} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#16a8b8', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}>
                        Vis min salgsside (Slik den ser ut for kjøper)
                    </button>
                </div>

                {/* Premier */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ marginTop: 0 }}>🏆 Premier</h3>
                    <ul style={{ paddingLeft: '20px', color: '#4b5563', fontSize: '14px' }}>
                        {prizes.map((p: any) => (
                            <li key={p.id} style={{ marginBottom: '4px' }}>
                                <strong>{p.name}</strong> {p.value && `(${p.value} kr)`} <br/>
                                <span style={{fontSize:'12px', color: '#16a8b8'}}>Sponset av: {p.donor}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </>
        )}

        {activeTab === 'donate' && (
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ marginTop: 0, color: '#16a8b8' }}>🎁 Har du en premie å bidra med?</h3>
                <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '24px' }}>
                    Alt fra sjokolade og hjemmestrikk til gavekort fra jobben er supert! 
                    Vi trenger navn på premien og ca. verdi.
                </p>

                <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Hva er premien?</label>
                    <input 
                        className="input" 
                        placeholder="F.eks. Gavekort på Kino" 
                        value={donationName}
                        onChange={e => setDonationName(e.target.value)}
                    />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label className="input-label">Hvem er giver? (Bedrift/Person)</label>
                    <input 
                        className="input" 
                        placeholder="F.eks. Kiwi Kongsvinger eller Familien Hansen" 
                        value={donationDonor}
                        onChange={e => setDonationDonor(e.target.value)}
                    />
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                    <label className="input-label">Anslått verdi (kr)</label>
                    <input 
                        type="number" 
                        className="input" 
                        placeholder="F.eks. 200" 
                        value={donationValue}
                        onChange={e => setDonationValue(e.target.value)}
                    />
                </div>

                <button onClick={handleDonate} className="btn btn-primary" style={{ width: '100%' }}>
                    ✅ Registrer premie
                </button>
            </div>
        )}

      </div>

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}><div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item active"><div className="bottom-nav-icon">🎟️</div>Lodd</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}><div className="bottom-nav-icon">📅</div>Vakter</button>
      </div>
    </div>
  );
};