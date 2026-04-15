import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';

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

  const fam = useCurrentFamily();

  useEffect(() => {
    if (fam.loading) return;
    if (fam.unauthenticated) { window.location.href = '/login'; return; }
    if (fam.noFamily) { window.location.href = '/claim-family'; return; }
    if (fam.familyId) setCurrentFamilyId(fam.familyId);
  }, [fam.loading, fam.unauthenticated, fam.noFamily, fam.familyId]);

  useEffect(() => {
    if (!currentFamilyId) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFamilyId]);

  const fetchData = async () => {
    setLoading(true);
    try {
        const familyId = currentFamilyId;
        if (!familyId) { setLoading(false); return; }

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

  if (loading) return <div style={{padding:'40px', textAlign:'center', background: '#faf8f4', color: '#1a2e1f'}}>Laster... ☁️</div>;

  if (!lottery) {
    return (
        <div style={{ padding: '40px', textAlign: 'center', background: '#faf8f4', minHeight: '100vh', color: '#1a2e1f' }}>
            <h1 style={{ color: '#1a2e1f' }}>🎟️ Loddbok</h1>
            <p style={{ color: '#4a5e50' }}>Ingen aktive lotterier akkurat nå.</p>
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', background: '#ffffff', borderTop: '0.5px solid #dedddd', zIndex: 100 }}>
                <button onClick={() => window.location.href = '/family-dashboard'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
                <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#2d6a4f', fontWeight: 600, cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🎟️</div>Lodd</button>
            </div>
        </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Min Loddbok</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>{lottery.name}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid #dedddd', background: '#ffffff', justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: '600px' }}>
            <button onClick={() => setActiveTab('sell')} style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', fontWeight: activeTab === 'sell' ? '600' : '400', color: activeTab === 'sell' ? '#1a2e1f' : '#6b7f70', borderBottom: activeTab === 'sell' ? '2px solid #2d6a4f' : '2px solid transparent', cursor: 'pointer' }}>
                🎟️ Selg lodd
            </button>
            <button onClick={() => setActiveTab('donate')} style={{ flex: 1, padding: '16px', border: 'none', background: 'none', fontSize: '14px', fontWeight: activeTab === 'donate' ? '600' : '400', color: activeTab === 'donate' ? '#1a2e1f' : '#6b7f70', borderBottom: activeTab === 'donate' ? '2px solid #2d6a4f' : '2px solid transparent', cursor: 'pointer' }}>
                🎁 Doner premie
            </button>
        </div>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>

        {activeTab === 'sell' && (
            <>
                {/* Statuskort */}
                <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#4a5e50', marginBottom: '8px' }}>DITT SALG</div>
                    <div style={{ fontSize: '48px', fontWeight: '800', color: '#2d6a4f' }}>{mySales * lottery.ticketPrice} kr</div>
                    <div style={{ fontSize: '16px', color: '#1a2e1f', fontWeight: '600' }}>{mySales} lodd solgt</div>
                </div>

                {/* Delingsseksjon */}
                <div style={{ background: '#e8f5ef', border: '2px solid #2d6a4f', borderRadius: '8px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ marginTop: 0, color: '#2d6a4f' }}>📢 Selg lodd</h3>
                    <p style={{ fontSize: '14px', marginBottom: '16px', color: '#4a5e50' }}>
                        Send denne lenken til bestemor, onkel og naboen. De betaler enkelt med Vipps.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            readOnly
                            value={`${window.location.origin}/lottery-shop?seller=${currentFamilyId}`}
                            style={{ flex: 1, fontSize: '12px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px 12px', color: '#1a2e1f' }}
                        />
                        <button onClick={copyLink} style={{ whiteSpace: 'nowrap', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontWeight: '600', cursor: 'pointer' }}>Kopier</button>
                    </div>
                    <button onClick={openShop} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#2d6a4f', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px' }}>
                        Vis min salgsside (Slik den ser ut for kjøper)
                    </button>
                </div>

                {/* Premier */}
                <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px' }}>
                    <h3 style={{ marginTop: 0, color: '#1a2e1f' }}>🏆 Premier</h3>
                    <ul style={{ paddingLeft: '20px', color: '#4a5e50', fontSize: '14px' }}>
                        {prizes.map((p: any) => (
                            <li key={p.id} style={{ marginBottom: '4px' }}>
                                <strong>{p.name}</strong> {p.value && `(${p.value} kr)`} <br/>
                                <span style={{fontSize:'12px', color: '#2d6a4f'}}>Sponset av: {p.donor}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </>
        )}

        {activeTab === 'donate' && (
            <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px' }}>
                <h3 style={{ marginTop: 0, color: '#2d6a4f' }}>🎁 Har du en premie å bidra med?</h3>
                <p style={{ fontSize: '14px', color: '#4a5e50', marginBottom: '24px' }}>
                    Alt fra sjokolade og hjemmestrikk til gavekort fra jobben er supert!
                    Vi trenger navn på premien og ca. verdi.
                </p>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Hva er premien?</label>
                    <input
                        placeholder="F.eks. Gavekort på Kino"
                        value={donationName}
                        onChange={e => setDonationName(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                    />
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Hvem er giver? (Bedrift/Person)</label>
                    <input
                        placeholder="F.eks. Kiwi Kongsvinger eller et familienavn"
                        value={donationDonor}
                        onChange={e => setDonationDonor(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                    />
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '6px' }}>Anslått verdi (kr)</label>
                    <input
                        type="number"
                        placeholder="F.eks. 200"
                        value={donationValue}
                        onChange={e => setDonationValue(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                    />
                </div>

                <button onClick={handleDonate} style={{ width: '100%', background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '8px', padding: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}>
                    ✅ Registrer premie
                </button>
            </div>
        )}

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', background: '#ffffff', borderTop: '0.5px solid #dedddd', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
        <button style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#2d6a4f', fontWeight: 600, cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>🎟️</div>Lodd</button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ flex: 1, padding: '10px 0', border: 'none', background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '11px', color: '#6b7f70', cursor: 'pointer' }}><div style={{ fontSize: '20px' }}>📅</div>Vakter</button>
      </div>
    </div>
  );
};
