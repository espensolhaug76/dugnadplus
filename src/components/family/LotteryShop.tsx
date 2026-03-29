import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Lottery {
  id: string;
  name: string;
  description: string;
  ticketPrice: number;
  vippsNumber: string;
  prizes: any[];
}

const TICKET_PACKAGES = [
    { count: 5, label: 'Småpotten' },
    { count: 10, label: 'Favoritten', popular: true },
    { count: 20, label: 'Storspiller' },
    { count: 50, label: 'Ivrig supporter' },
    { count: 100, label: 'Gullsjansen' }
];

export const LotteryShop: React.FC = () => {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [sellerName, setSellerName] = useState('en dugnadsfamilie');
  const [sellerId, setSellerId] = useState('');
  const [ticketCount, setTicketCount] = useState(10); // Standardvalg: 10 lodd
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
        try {
            // 1. Hent aktivt lotteri
            const { data: lotteryData } = await supabase
                .from('lotteries')
                .select('*, prizes(*)')
                .eq('is_active', true)
                .single();

            if (lotteryData) {
                setLottery({
                    id: lotteryData.id,
                    name: lotteryData.name,
                    description: lotteryData.description,
                    ticketPrice: lotteryData.ticket_price,
                    vippsNumber: lotteryData.vipps_number,
                    prizes: lotteryData.prizes || []
                });
            }

            // 2. Finn selger fra URL
            const params = new URLSearchParams(window.location.search);
            const sid = params.get('seller');
            
            if (sid) {
                setSellerId(sid);
                const { data: family } = await supabase
                    .from('families')
                    .select('*, family_members(*)')
                    .eq('id', sid)
                    .single();

                if (family) {
                    const child = family.family_members?.find((m: any) => m.role === 'child');
                    if (child) {
                        setSellerName(child.name);
                    } else if (family.family_members?.length > 0) {
                        setSellerName(family.family_members[0].name);
                    } else {
                        setSellerName(family.name);
                    }
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, []);

  const handlePurchase = async () => {
    if (!lottery) return;
    if (!buyerName || !buyerPhone) {
        alert('Vennligst fyll inn navn og telefonnummer.');
        return;
    }

    const totalAmount = ticketCount * lottery.ticketPrice;

    // Vipps-simulering (Her ville vi kalt et API for ekte "Krav" hvis vi hadde Vipps Bedrift)
    // Nå bruker vi Deep Link for å åpne Vipps
    const message = `Lodd ${sellerName}`;
    
    if (confirm(`Åpne Vipps og betal ${totalAmount} kr til ${lottery.vippsNumber}?\n\nMerk betalingen: "${message}"`)) {
        setPurchasing(true);
        try {
            const { error } = await supabase
                .from('lottery_sales')
                .insert({
                    lottery_id: lottery.id,
                    seller_family_id: sellerId || null,
                    buyer_name: buyerName,
                    buyer_phone: buyerPhone,
                    tickets: ticketCount,
                    amount: totalAmount,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
            
            // Prøv å åpne Vipps (fungerer best på mobil)
            window.location.href = `vipps://?amt=${totalAmount}&msg=${encodeURIComponent(message)}`;
            
            alert('🎉 Takk for støtten! Loddene er registrert i systemet.');
            setBuyerName('');
            setBuyerPhone('');
            setTicketCount(10);
            
        } catch (error: any) {
            console.error('Kjøp feilet:', error);
            alert('Beklager, noe gikk galt med registreringen: ' + error.message);
        } finally {
            setPurchasing(false);
        }
    }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster lotteri...</div>;
  
  if (!lottery) return (
      <div style={{padding:'40px', textAlign:'center'}}>
          <h2>Ingen aktive lotterier</h2>
          <p>Det er ingen pågående lotterier for øyeblikket.</p>
      </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f2f4f8', display: 'flex', justifyContent: 'center', padding: '20px 10px' }}>
        <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '0', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #ff5b24 0%, #e0400b 100%)', padding: '32px 20px', color: 'white', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎟️</div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800' }}>{lottery.name}</h1>
                <p style={{ opacity: 0.9, marginTop: '8px', fontSize: '16px' }}>Støtt {sellerName} og laget!</p>
            </div>
            
            <div style={{ padding: '24px' }}>
                <p style={{ color: '#6b7280', marginBottom: '24px', textAlign: 'center', fontSize: '14px' }}>{lottery.description}</p>

                {/* PAKKEVELGER */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                    {TICKET_PACKAGES.map((pkg) => (
                        <button
                            key={pkg.count}
                            onClick={() => setTicketCount(pkg.count)}
                            style={{
                                padding: '16px',
                                border: ticketCount === pkg.count ? '2px solid #ff5b24' : '1px solid #e5e7eb',
                                background: ticketCount === pkg.count ? '#fff5f0' : 'white',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                transition: 'all 0.2s'
                            }}
                        >
                            {pkg.popular && (
                                <span style={{ position: 'absolute', top: '-10px', background: '#16a8b8', color: 'white', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                    MEST POPULÆR
                                </span>
                            )}
                            <span style={{ fontSize: '20px', fontWeight: '800', color: '#1f2937' }}>{pkg.count} lodd</span>
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>{pkg.count * lottery.ticketPrice} kr</span>
                        </button>
                    ))}
                    {/* Egendefinert */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                            <button onClick={() => setTicketCount(Math.max(1, ticketCount-1))} className="btn" style={{padding:'4px 10px', borderRadius:'8px'}}>-</button>
                            <span style={{fontWeight:'700'}}>{ticketCount}</span>
                            <button onClick={() => setTicketCount(ticketCount+1)} className="btn" style={{padding:'4px 10px', borderRadius:'8px'}}>+</button>
                        </div>
                    </div>
                </div>

                {/* TOTALSUM */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>Du betaler</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#16a8b8' }}>
                        {ticketCount * lottery.ticketPrice} kr
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>for {ticketCount} lodd à {lottery.ticketPrice} kr</div>
                </div>

                {/* KJØPERS INFO */}
                <div style={{ marginBottom: '24px' }}>
                    <label className="input-label">Ditt navn</label>
                    <input className="input" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Ola Nordmann" />
                    <label className="input-label" style={{marginTop:'12px'}}>Mobilnummer (Vipps)</label>
                    <input className="input" type="tel" value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="99 88 77 66" />
                </div>

                {/* BETALINGSKNAPP */}
                <button 
                    onClick={handlePurchase}
                    className="btn"
                    style={{ 
                        width: '100%', 
                        background: '#ff5b24', 
                        color: 'white', 
                        border: 'none', 
                        fontSize: '18px', 
                        padding: '16px', 
                        borderRadius: '30px', 
                        opacity: purchasing ? 0.7 : 1,
                        boxShadow: '0 4px 12px rgba(255, 91, 36, 0.3)'
                    }}
                    disabled={purchasing}
                >
                    {purchasing ? 'Åpner Vipps...' : `Betal ${ticketCount * lottery.ticketPrice} kr med Vipps`}
                </button>
            </div>

            {/* PREMIER */}
            <div style={{ background: '#f8fafc', padding: '24px', borderTop: '1px solid #e5e7eb' }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#1f2937', textAlign: 'center' }}>🏆 Premieoversikt</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#4b5563', lineHeight: '1.6' }}>
                    {lottery.prizes.map((p:any) => (
                        <li key={p.id}>
                            <strong>{p.name}</strong> {p.donor && <span style={{color: '#16a8b8', fontSize: '12px'}}> (Sponset av {p.donor})</span>}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    </div>
  );
};