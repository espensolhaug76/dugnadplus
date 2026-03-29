import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Prize {
  id: string;
  name: string;
  value: string;
  donor: string;
  winner_name?: string;  // Nytt: Vinnerinfo
  winner_phone?: string; // Nytt: Vinnerinfo
}

interface Lottery {
  id: string;
  name: string;
  description: string;
  ticketPrice: number;
  prizes: Prize[];
  goal: number;
  isActive: boolean;
  vippsNumber: string;
}

export const LotteryAdmin: React.FC = () => {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [stats, setStats] = useState({ totalRevenue: 0, totalSold: 0 });
  
  // Form states for new lottery
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ticketPrice, setTicketPrice] = useState(50);
  const [goal, setGoal] = useState(10000);
  const [vippsNumber, setVippsNumber] = useState('');
  const [prizes, setPrizes] = useState<Partial<Prize>[]>([]);
  
  // Prize input
  const [prizeName, setPrizeName] = useState('');
  const [prizeValue, setPrizeValue] = useState('');
  const [prizeDonor, setPrizeDonor] = useState('');

  useEffect(() => {
    fetchActiveLottery();
  }, []);

  const fetchActiveLottery = async () => {
    setLoading(true);
    try {
        // 1. Hent aktivt lotteri og premier
        const { data: lotteryData, error } = await supabase
            .from('lotteries')
            .select(`
                *,
                prizes (*)
            `)
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Feil ved henting av lotteri:', error);
        }

        if (lotteryData) {
            const mappedLottery: Lottery = {
                id: lotteryData.id,
                name: lotteryData.name,
                description: lotteryData.description,
                ticketPrice: lotteryData.ticket_price,
                goal: lotteryData.goal,
                vippsNumber: lotteryData.vipps_number,
                isActive: lotteryData.is_active,
                prizes: lotteryData.prizes || []
            };
            setLottery(mappedLottery);

            // 2. Hent salgsstatistikk
            const { data: salesData } = await supabase
                .from('lottery_sales')
                .select('tickets, amount')
                .eq('lottery_id', lotteryData.id);

            if (salesData) {
                const totalSold = salesData.reduce((sum: number, row: any) => sum + (row.tickets || 0), 0);
                const totalRevenue = salesData.reduce((sum: number, row: any) => sum + (row.amount || 0), 0);
                setStats({ totalSold, totalRevenue });
            }
        }
    } catch (e) {
        console.error('Kritisk feil:', e);
    } finally {
        setLoading(false);
    }
  };

  // --- NY FUNKSJON: TREKKING AV VINNERE ---
  const handleDraw = async () => {
    if (!lottery) return;
    
    // Finn premier som mangler vinner
    const availablePrizes = lottery.prizes.filter(p => !p.winner_name);
    if (availablePrizes.length === 0) {
        alert('Alle premier er allerede trukket!');
        return;
    }

    if (!confirm(`Er du klar til å trekke vinnere for ${availablePrizes.length} premier?\n\nSystemet velger tilfeldige lodd fra alle salg.`)) return;

    setDrawing(true);

    try {
        // 1. Hent ALLE salg (lodd)
        const { data: sales, error } = await supabase
            .from('lottery_sales')
            .select('buyer_name, buyer_phone, tickets')
            .eq('lottery_id', lottery.id);

        if (error) throw error;
        if (!sales || sales.length === 0) {
            alert('Ingen lodd er solgt ennå!');
            setDrawing(false);
            return;
        }

        // 2. Generer "loddbunke"
        let ticketPool: { name: string, phone: string }[] = [];
        sales.forEach(sale => {
            for (let i = 0; i < sale.tickets; i++) {
                ticketPool.push({ name: sale.buyer_name, phone: sale.buyer_phone });
            }
        });

        // 3. Trekk vinnere
        const updates = [];
        
        // Vi stokker bunken (Fisher-Yates shuffle) for ekstra tilfeldighet
        for (let i = ticketPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ticketPool[i], ticketPool[j]] = [ticketPool[j], ticketPool[i]];
        }

        for (const prize of availablePrizes) {
            if (ticketPool.length === 0) break; // Tomt for lodd

            // Trekk et tilfeldig lodd
            const winningIndex = Math.floor(Math.random() * ticketPool.length);
            const winner = ticketPool[winningIndex];

            // Fjern vinnerloddet fra bunken (så samme lodd-ID ikke vinner to ganger)
            ticketPool.splice(winningIndex, 1);

            // Oppdater premien i DB
            updates.push(
                supabase
                    .from('prizes')
                    .update({ winner_name: winner.name, winner_phone: winner.phone })
                    .eq('id', prize.id)
            );
        }

        await Promise.all(updates);

        alert(`🎉 Trekning fullført! ${updates.length} vinnere er trukket.`);
        fetchActiveLottery(); // Oppdater visningen

    } catch (e: any) {
        console.error(e);
        alert('Feil under trekning: ' + e.message);
    } finally {
        setDrawing(false);
    }
  };

  const resetWinner = async (prizeId: string) => {
      if(!confirm('Vil du fjerne vinneren og trekke denne premien på nytt senere?')) return;
      await supabase.from('prizes').update({ winner_name: null, winner_phone: null }).eq('id', prizeId);
      fetchActiveLottery();
  };

  // --- VANLIGE ADMIN FUNKSJONER ---

  const addPrize = () => {
    if (!prizeName) return;
    const newPrize = { name: prizeName, value: prizeValue, donor: prizeDonor };
    setPrizes([...prizes, newPrize]);
    setPrizeName(''); setPrizeValue(''); setPrizeDonor('');
  };

  const removePrize = (index: number) => {
    const newPrizes = [...prizes];
    newPrizes.splice(index, 1);
    setPrizes(newPrizes);
  };

  const saveLottery = async () => {
    if (!vippsNumber) return alert('Mangler Vipps-nummer');
    setLoading(true);
    try {
        const { data: newLottery, error } = await supabase
            .from('lotteries')
            .insert({ name, description, ticket_price: ticketPrice, goal, vipps_number: vippsNumber, is_active: true })
            .select().single();
        
        if (error) throw error;

        if (prizes.length > 0) {
            const prizesToInsert = prizes.map(p => ({ lottery_id: newLottery.id, name: p.name, value: p.value, donor: p.donor }));
            await supabase.from('prizes').insert(prizesToInsert);
        }
        window.location.reload();
    } catch (e:any) {
        alert(e.message);
        setLoading(false);
    }
  };

  const deleteLottery = async () => {
    if (!lottery) return;
    if(!confirm('ER DU SIKKER? Sletter lotteriet og alle data.')) return;
    setLoading(true);
    await supabase.from('lotteries').delete().eq('id', lottery.id);
    setLottery(null);
    setLoading(false);
    setName(''); setDescription(''); setVippsNumber(''); setPrizes([]);
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster... ☁️</div>;

  if (lottery) {
    const prizesLeft = lottery.prizes.filter(p => !p.winner_name).length;

    return (
        <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary">← Tilbake</button>
                <button onClick={deleteLottery} className="btn" style={{color: 'red', border: '1px solid red'}}>🗑️ Slett lotteri</button>
            </div>
            
            <div className="card" style={{ padding: '32px', marginBottom: '24px', borderTop: '4px solid #16a8b8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                        <h1 style={{ marginTop: 0 }}>{lottery.name} (Aktivt)</h1>
                        <p style={{ color: '#6b7280' }}>{lottery.description}</p>
                    </div>
                    
                    {/* TREKNINGSKNAPP */}
                    {prizesLeft > 0 && stats.totalSold > 0 && (
                        <button 
                            onClick={handleDraw} 
                            disabled={drawing}
                            className="btn btn-primary"
                            style={{ fontSize: '16px', padding: '12px 24px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                        >
                            {drawing ? 'Trekker...' : '🎰 Trekk vinnere nå'}
                        </button>
                    )}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginTop: '24px' }}>
                    <div style={{ textAlign: 'center', padding: '16px', background: '#f0fdf4', borderRadius: '8px' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#166534' }}>{stats.totalRevenue} kr</div>
                        <div style={{ fontSize: '14px', color: '#15803d' }}>Innsamlet (Vipps #{lottery.vippsNumber})</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '16px', background: '#eff6ff', borderRadius: '8px' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af' }}>{stats.totalSold}</div>
                        <div style={{ fontSize: '14px', color: '#1d4ed8' }}>Lodd i bunken</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '16px', background: '#fff7ed', borderRadius: '8px' }}>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#9a3412' }}>{lottery.prizes.length - prizesLeft}/{lottery.prizes.length}</div>
                        <div style={{ fontSize: '14px', color: '#c2410c' }}>Premier trukket</div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
                <h3>🏆 Premieoversikt & Vinnere</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {lottery.prizes.map((p) => {
                        const isWon = !!p.winner_name;
                        return (
                            <div key={p.id} style={{ 
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '12px', borderRadius: '8px',
                                background: isWon ? '#ecfdf5' : '#f9fafb',
                                border: isWon ? '1px solid #10b981' : '1px solid #e5e7eb'
                            }}>
                                <div>
                                    <div style={{ fontWeight: '600', color: '#374151' }}>{p.name}</div>
                                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                        Verdi: {p.value} kr • Giver: {p.donor}
                                    </div>
                                </div>
                                
                                {isWon ? (
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#047857' }}>
                                            🏆 {p.winner_name}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#065f46' }}>
                                            Tlf: {p.winner_phone}
                                            <button 
                                                onClick={() => resetWinner(p.id)}
                                                style={{ marginLeft: '8px', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '10px', textDecoration: 'underline' }}
                                            >
                                                Angre
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <span style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>Ikke trukket</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
  }

  // --- VISNING: OPPRETT NYTT ---
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>
        <h1>Opprett Digitalt Lotteri 🎟️</h1>
        
        <div className="card" style={{ padding: '32px' }}>
            <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Navn på lotteriet</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="F.eks. Julelotteri" />
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label className="input-label">Beskrivelse</label>
                <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                    <label className="input-label">Pris per lodd (kr)</label>
                    <input type="number" className="input" value={ticketPrice} onChange={e => setTicketPrice(parseInt(e.target.value))} />
                </div>
                <div>
                    <label className="input-label">Mål (kr)</label>
                    <input type="number" className="input" value={goal} onChange={e => setGoal(parseInt(e.target.value))} />
                </div>
                <div>
                    <label className="input-label">Vipps-nummer</label>
                    <input type="text" className="input" value={vippsNumber} onChange={e => setVippsNumber(e.target.value)} />
                </div>
            </div>

            <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                <h4 style={{ marginTop: 0 }}>🎁 Legg til premier</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                    <input className="input" placeholder="Premie" value={prizeName} onChange={e => setPrizeName(e.target.value)} />
                    <input className="input" placeholder="Verdi" value={prizeValue} onChange={e => setPrizeValue(e.target.value)} />
                    <input className="input" placeholder="Giver" value={prizeDonor} onChange={e => setPrizeDonor(e.target.value)} />
                    <button onClick={addPrize} className="btn btn-secondary">Legg til</button>
                </div>
                {prizes.length > 0 && (
                    <ul style={{ paddingLeft: '20px', color: '#4b5563' }}>
                        {prizes.map((p, idx) => <li key={idx}>{p.name} ({p.value} kr) <button onClick={() => removePrize(idx)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>×</button></li>)}
                    </ul>
                )}
            </div>

            <button onClick={saveLottery} className="btn btn-primary" style={{ width: '100%' }} disabled={!name || prizes.length === 0}>
                {loading ? 'Lagrer...' : '🚀 Start lotteriet'}
            </button>
        </div>
    </div>
  );
};