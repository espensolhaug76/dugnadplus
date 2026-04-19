import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { csvRow, sanitizeCsvFilename } from '../../utils/csvSafe';
import { PremiumGateModal, hasPremium } from '../common/PremiumGateModal';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Prize {
  id: string;
  name: string;
  value: string;
  donor: string;
  winner_name?: string;
  winner_phone?: string;
  display_order: number;
}

const SortablePrizeItem: React.FC<{ prize: Prize; onDelete: (id: string) => void; onResetWinner: (id: string) => void }> = ({ prize, onDelete, onResetWinner }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: prize.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isWon = !!prize.winner_name;
  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', background: isWon ? '#e8f5ef' : '#faf8f4', border: isWon ? '0.5px solid #b8dfc9' : '0.5px solid #dedddd' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#b0b0b0', fontSize: '14px', lineHeight: 1, userSelect: 'none' }} title="Dra for å sortere">⠿</span>
        <div><div style={{ fontWeight: '500', fontSize: '13px', color: '#1a2e1f' }}>{prize.name}</div><div style={{ fontSize: '11px', color: '#4a5e50' }}>Verdi: {prize.value} kr{prize.donor ? ` · ${prize.donor}` : ''}</div></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isWon ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: '#2d6a4f' }}>🏆 {prize.winner_name}</div>
            <div style={{ fontSize: '10px', color: '#4a5e50' }}>{prize.winner_phone} <button onClick={() => onResetWinner(prize.id)} style={{ marginLeft: '4px', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '10px', textDecoration: 'underline' }}>Angre</button></div>
          </div>
        ) : (
          <><span style={{ fontSize: '11px', color: '#6b7f70', fontStyle: 'italic' }}>Ikke trukket</span><button onClick={() => onDelete(prize.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px' }}>×</button></>
        )}
      </div>
    </div>
  );
};

const SortableCreatePrize: React.FC<{ id: string; prize: any; onRemove: () => void }> = ({ id, prize, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--card-bg, white)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span {...attributes} {...listeners} style={{ cursor: 'grab', color: '#b0b0b0', fontSize: '14px', lineHeight: 1, userSelect: 'none' }} title="Dra for å sortere">⠿</span>
        <span><strong>{prize.name}</strong> {prize.value && `(${prize.value} kr)`}{prize.donor && ` · ${prize.donor}`}</span>
      </div>
      <button onClick={onRemove} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
    </div>
  );
};

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

interface Transaction {
  id: string;
  created_at: string;
  buyer_name: string;
  buyer_phone: string;
  tickets: number;
  amount: number;
  payment_method: string;
  sellerName: string;
}

interface Buyer {
  name: string;
  phone: string;
  totalTickets: number;
  totalAmount: number;
  isWinner: boolean;
  wonPrize?: string;
}

export const LotteryAdmin: React.FC = () => {
  const [lottery, setLottery] = useState<Lottery | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [stats, setStats] = useState({ totalRevenue: 0, totalSold: 0 });
  const [sellerStats, setSellerStats] = useState<{ name: string; tickets: number; amount: number }[]>([]);

  // Faner
  const [activeView, setActiveView] = useState<'oversikt' | 'transaksjoner' | 'kjopere'>('oversikt');

  // Transaksjoner
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txSearch, setTxSearch] = useState('');
  const [txSort, setTxSort] = useState<'dato' | 'belop'>('dato');

  // Kjøpere
  const [buyers, setBuyers] = useState<Buyer[]>([]);

  // Kontantsalg modal
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashBuyerName, setCashBuyerName] = useState('');
  const [cashBuyerPhone, setCashBuyerPhone] = useState('');
  const [cashTickets, setCashTickets] = useState(10);
  const [cashSellerId, setCashSellerId] = useState('');
  const [families, setFamilies] = useState<{ id: string; name: string }[]>([]);

  // Historikk
  const [archivedLotteries, setArchivedLotteries] = useState<any[]>([]);
  useState(false); // showHistory reserved for future use
  const [showPremiumGate, setShowPremiumGate] = useState(false);

  // Opprett-modal og navigasjon
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

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

  const getActiveTeamId = (): string => {
    try {
      return localStorage.getItem('dugnad_active_team_filter') || '';
    } catch { return ''; }
  };

  useEffect(() => {
    fetchActiveLottery();
    fetchArchivedLotteries();
  }, []);

  const fetchActiveLottery = async () => {
    setLoading(true);
    try {
        // 1. Hent aktivt lotteri for dette laget (eller utkast)
        const teamId = getActiveTeamId();
        let query = supabase.from('lotteries').select('*, prizes(*)').eq('is_active', true);
        if (teamId) query = query.eq('team_id', teamId);
        let { data: lotteryData, error } = await query.maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('Feil ved henting av lotteri:', error);
        }

        // Ingen aktivt lotteri — sjekk om det finnes et utkast (opprettet
        // i prøve-modus uten premium)
        if (!lotteryData) {
            let draftQuery = supabase.from('lotteries').select('*, prizes(*)').eq('is_active', false);
            if (teamId) draftQuery = draftQuery.eq('team_id', teamId);
            const { data: draftData } = await draftQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (draftData) lotteryData = draftData;
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
                prizes: (lotteryData.prizes || []).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
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

            // Hent alle salg med detaljer
            const { data: sellerSales } = await supabase
                .from('lottery_sales')
                .select('id, created_at, buyer_name, buyer_phone, tickets, amount, payment_method, seller_family_id, families(name, family_members(name, role))')
                .eq('lottery_id', lotteryData.id)
                .order('created_at', { ascending: false });

            if (sellerSales) {
                const bySellerMap: Record<string, { name: string; tickets: number; amount: number }> = {};
                const txList: Transaction[] = [];

                sellerSales.forEach((s: any) => {
                    const id = s.seller_family_id || '__direct__';
                    let sName = 'Direktesalg';
                    if (s.families) {
                        const children = s.families.family_members?.filter((m: any) => m.role === 'child') || [];
                        sName = children.length > 0 ? children.map((c: any) => c.name).join(' & ') : s.families.name;
                    }
                    if (!bySellerMap[id]) bySellerMap[id] = { name: sName, tickets: 0, amount: 0 };
                    bySellerMap[id].tickets += s.tickets || 0;
                    bySellerMap[id].amount += s.amount || 0;

                    txList.push({
                        id: s.id,
                        created_at: s.created_at,
                        buyer_name: s.buyer_name,
                        buyer_phone: s.buyer_phone,
                        tickets: s.tickets,
                        amount: s.amount,
                        payment_method: s.payment_method || 'vipps',
                        sellerName: sName
                    });
                });
                setSellerStats(Object.values(bySellerMap).sort((a, b) => b.tickets - a.tickets));
                setTransactions(txList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

                // Kjøperliste
                const winnerNames = new Set((lotteryData.prizes || []).filter((p: any) => p.winner_name).map((p: any) => p.winner_name));
                const winnerPrizeMap: Record<string, string> = {};
                (lotteryData.prizes || []).forEach((p: any) => { if (p.winner_name) winnerPrizeMap[p.winner_name] = p.name; });

                const buyerMap: Record<string, Buyer> = {};
                txList.forEach(tx => {
                    const key = `${tx.buyer_name}||${tx.buyer_phone}`;
                    if (!buyerMap[key]) buyerMap[key] = { name: tx.buyer_name, phone: tx.buyer_phone, totalTickets: 0, totalAmount: 0, isWinner: winnerNames.has(tx.buyer_name), wonPrize: winnerPrizeMap[tx.buyer_name] };
                    buyerMap[key].totalTickets += tx.tickets;
                    buyerMap[key].totalAmount += tx.amount;
                });
                setBuyers(Object.values(buyerMap).sort((a, b) => b.totalTickets - a.totalTickets));
            }

            // Hent familier for kontantsalg-dropdown — team-avgrenset
            let famQuery = supabase.from('families').select('id, name, family_members(name, role)');
            if (teamId) famQuery = famQuery.eq('team_id', teamId);
            const { data: famData } = await famQuery;
            if (famData) {
                setFamilies(famData.map((f: any) => {
                    const children = f.family_members?.filter((m: any) => m.role === 'child') || [];
                    return { id: f.id, name: children.length > 0 ? children.map((c: any) => c.name).join(' & ') : f.name };
                }));
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
    const newPrize = { _tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: prizeName, value: prizeValue, donor: prizeDonor };
    setPrizes([...prizes, newPrize]);
    setPrizeName(''); setPrizeValue(''); setPrizeDonor('');
  };

  const removePrize = (index: number) => {
    const newPrizes = [...prizes];
    newPrizes.splice(index, 1);
    setPrizes(newPrizes);
  };

  const handleCreatePrizeDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = prizes.findIndex((p: any) => p._tempId === active.id);
    const newIndex = prizes.findIndex((p: any) => p._tempId === over.id);
    setPrizes(arrayMove(prizes, oldIndex, newIndex));
  };

  const saveLottery = async () => {
    if (!vippsNumber) return alert('Mangler Vipps-nummer');
    setLoading(true);
    try {
        const { data: newLottery, error } = await supabase
            .from('lotteries')
            .insert({ name, description, ticket_price: ticketPrice, goal, vipps_number: vippsNumber, is_active: hasPremium(), team_id: getActiveTeamId() || null })
            .select().single();
        
        if (error) throw error;

        if (prizes.length > 0) {
            const prizesToInsert = prizes.map((p, i) => ({ lottery_id: newLottery.id, name: p.name, value: p.value, donor: p.donor, display_order: i }));
            await supabase.from('prizes').insert(prizesToInsert);
        }
        window.location.reload();
    } catch (e:any) {
        alert(e.message);
        setLoading(false);
    }
  };

  const addPrizeToActive = async () => {
    if (!lottery || !prizeName) return;
    const nextOrder = lottery.prizes.length;
    const { error } = await supabase.from('prizes').insert({ lottery_id: lottery.id, name: prizeName, value: prizeValue, donor: prizeDonor, display_order: nextOrder });
    if (error) alert(error.message);
    else { setPrizeName(''); setPrizeValue(''); setPrizeDonor(''); fetchActiveLottery(); }
  };

  const deletePrizeFromActive = async (prizeId: string) => {
    if (!confirm('Slette denne premien?')) return;
    await supabase.from('prizes').delete().eq('id', prizeId);
    fetchActiveLottery();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handlePrizeDragEnd = async (event: DragEndEvent) => {
    if (!lottery) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = lottery.prizes.findIndex(p => p.id === active.id);
    const newIndex = lottery.prizes.findIndex(p => p.id === over.id);
    const reordered = arrayMove(lottery.prizes, oldIndex, newIndex);
    setLottery({ ...lottery, prizes: reordered });
    // Persist new order to DB
    await Promise.all(reordered.map((p, i) =>
      supabase.from('prizes').update({ display_order: i }).eq('id', p.id)
    ));
  };

  const updateLotteryField = async (field: string, value: any) => {
    if (!lottery) return;
    const { error } = await supabase.from('lotteries').update({ [field]: value }).eq('id', lottery.id);
    if (!error) fetchActiveLottery();
  };

  const handleCashSale = async () => {
    if (!lottery || !cashBuyerName) { alert('Fyll inn kjøpernavn.'); return; }
    const amount = cashTickets * lottery.ticketPrice;
    const { error } = await supabase.from('lottery_sales').insert({
        lottery_id: lottery.id,
        seller_family_id: cashSellerId || null,
        buyer_name: cashBuyerName,
        buyer_phone: cashBuyerPhone,
        tickets: cashTickets,
        amount,
        payment_method: 'cash'
    });
    if (error) { alert('Feil: ' + error.message); return; }
    setShowCashModal(false);
    setCashBuyerName(''); setCashBuyerPhone(''); setCashTickets(10); setCashSellerId('');
    fetchActiveLottery();
    alert(`💵 Kontantsalg registrert: ${cashTickets} lodd (${amount} kr)`);
  };

  const exportBuyersCsv = () => {
    // CSV-injection-beskyttelse: buyers-raden kommer fra lottery_sales, som
    // er skrivbar fra den ANONYME LotteryShop-flyten (Vipps deep link, ingen
    // auth). Uten escape ville en angriper kunne plante =cmd|... i buyer_name
    // og få kodekjøring på koordinatorens maskin når hun åpner eksporten.
    // Se src/utils/csvSafe.ts.
    const header = 'Navn;Telefon;Antall lodd;Beløp;Vinner';
    const rows = buyers.map(b => csvRow([
      b.name,
      b.phone,
      b.totalTickets,
      b.totalAmount,
      b.isWinner ? (b.wonPrize || 'Ja') : 'Nei',
    ])).join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kjopere_${sanitizeCsvFilename(lottery?.name, 'lotteri')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchArchivedLotteries = async () => {
    const teamId = getActiveTeamId();
    let query = supabase.from('lotteries').select('*, prizes(*), lottery_sales(tickets, amount)').eq('is_active', false);
    if (teamId) query = query.eq('team_id', teamId);
    const { data } = await query.order('created_at', { ascending: false });
    if (data) {
      setArchivedLotteries(data.map((l: any) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        ticketPrice: l.ticket_price,
        totalSold: l.lottery_sales?.reduce((s: number, r: any) => s + (r.tickets || 0), 0) || 0,
        totalRevenue: l.lottery_sales?.reduce((s: number, r: any) => s + (r.amount || 0), 0) || 0,
        prizeCount: l.prizes?.length || 0,
        winnersDrawn: l.prizes?.filter((p: any) => p.winner_name).length || 0
      })));
    }
  };

  const archiveLottery = async () => {
    if (!lottery) return;
    if (!confirm(`Avslutte "${lottery.name}"?\n\nLotteriet arkiveres og du kan opprette et nytt. Alle data beholdes.`)) return;
    await supabase.from('lotteries').update({ is_active: false }).eq('id', lottery.id);
    setLottery(null);
    fetchArchivedLotteries();
    alert('Lotteriet er avsluttet og arkivert.');
  };

  const deleteLottery = async () => {
    if (!lottery) return;
    if(!confirm('ER DU SIKKER? Sletter lotteriet og alle data permanent.')) return;
    setLoading(true);
    await supabase.from('lotteries').delete().eq('id', lottery.id);
    setLottery(null);
    setLoading(false);
    setName(''); setDescription(''); setVippsNumber(''); setPrizes([]);
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster... ☁️</div>;

  // Filtrerte transaksjoner
  const filteredTx = transactions
    .filter(tx => {
      if (!txSearch.trim()) return true;
      const q = txSearch.toLowerCase();
      return tx.buyer_name.toLowerCase().includes(q) || tx.buyer_phone?.toLowerCase().includes(q);
    })
    .sort((a, b) => txSort === 'belop' ? b.amount - a.amount : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // --- MELLOMSIDE: Oversikt over alle lotterier ---
  if (lottery && !showDetail) {
    const prizesLeft = lottery.prizes.filter(p => !p.winner_name).length;
    const pct = lottery.goal > 0 ? Math.min(100, Math.round((stats.totalRevenue / lottery.goal) * 100)) : 0;

    return (
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', padding: 0 }}>← Tilbake til dashbordet</button>

        {/* Active Header */}
        <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#fff' }}>🎟️ {lottery.name}</span>
              <span style={{ fontSize: '10px', background: lottery.isActive ? 'rgba(126,200,160,0.2)' : 'rgba(250,199,117,0.2)', color: lottery.isActive ? '#7ec8a0' : '#fac775', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' }}>{lottery.isActive ? 'Aktivt' : 'Utkast'}</span>
            </div>
            {!lottery.isActive && <div style={{ fontSize: '11px', color: '#fac775', marginTop: '2px' }}>Ikke synlig for kjøpere ennå</div>}
            {lottery.description && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{lottery.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {!lottery.isActive && (
              <button onClick={() => { if (hasPremium()) { updateLotteryField('is_active', true); } else { setShowPremiumGate(true); } }} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Publiser →</button>
            )}
            <button onClick={() => setShowDetail(true)} style={{ background: lottery.isActive ? '#7ec8a0' : 'rgba(255,255,255,0.15)', color: lottery.isActive ? '#1e3a2f' : '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Administrer →</button>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
          <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: '500', color: '#1a2e1f' }}>{stats.totalRevenue} kr</div>
            <div style={{ fontSize: '10px', color: '#4a5e50', marginTop: '2px' }}>Innsamlet</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: '500', color: '#1a2e1f' }}>{stats.totalSold}</div>
            <div style={{ fontSize: '10px', color: '#4a5e50', marginTop: '2px' }}>Lodd solgt</div>
          </div>
          <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: '500', color: '#1a2e1f' }}>{buyers.length}</div>
            <div style={{ fontSize: '10px', color: '#4a5e50', marginTop: '2px' }}>Kjøpere</div>
          </div>
          <div style={{ background: prizesLeft > 0 ? '#fff8e6' : '#fff', border: prizesLeft > 0 ? '1px solid #fac775' : '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '17px', fontWeight: '500', color: prizesLeft > 0 ? '#854f0b' : '#1a2e1f' }}>{lottery.prizes.length - prizesLeft}/{lottery.prizes.length}</div>
            <div style={{ fontSize: '10px', color: prizesLeft > 0 ? '#854f0b' : '#4a5e50', marginTop: '2px' }}>Trukket</div>
          </div>
        </div>

        {/* Progress */}
        {lottery.goal > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4a5e50', marginBottom: '3px' }}>
              <span>{pct}%</span><span>{stats.totalRevenue} / {lottery.goal} kr</span>
            </div>
            <div style={{ height: '5px', background: '#e8e0d0', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#2d6a4f', borderRadius: '3px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* Trekningsknapp */}
        {prizesLeft > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <button onClick={handleDraw} disabled={drawing || stats.totalSold === 0} style={{ width: '100%', padding: '10px', fontSize: '13px', background: stats.totalSold > 0 ? '#2d6a4f' : '#e8e0d0', color: stats.totalSold > 0 ? '#fff' : '#6b7f70', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: stats.totalSold > 0 ? 'pointer' : 'not-allowed' }}>
              {drawing ? 'Trekker...' : `🎰 Trekk vinnere (${prizesLeft} premier gjenstår)`}
            </button>
            {stats.totalSold === 0 && (
              <p style={{ fontSize: '11px', color: '#6b7f70', textAlign: 'center', marginTop: '4px' }}>Trekning åpnes når det er solgt minst ett lodd</p>
            )}
          </div>
        )}

        {/* Vinnerliste */}
        {lottery.prizes.some(p => p.winner_name) && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', marginTop: '16px' }}>Vinnere</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {lottery.prizes.filter(p => p.winner_name).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#e8f5ef', borderRadius: '8px', border: '0.5px solid #b8dfc9' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '13px', color: '#1a2e1f' }}>{p.winner_name}</div>
                    <div style={{ fontSize: '11px', color: '#4a5e50' }}>{p.winner_phone}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '500', fontSize: '12px', color: '#1a2e1f' }}>🎁 {p.name}</div>
                    <div style={{ fontSize: '10px', color: '#4a5e50' }}>{p.value && `${p.value} kr`}{p.donor && ` · ${p.donor}`}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Gjenstående premier */}
        {prizesLeft > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', marginTop: '16px' }}>Gjenstående premier ({prizesLeft})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {lottery.prizes.filter(p => !p.winner_name).map(p => (
                <span key={p.id} style={{ padding: '5px 10px', background: '#fff', borderRadius: '6px', border: '0.5px solid #dedddd', fontSize: '11px', color: '#1a2e1f' }}>
                  {p.name}{p.value && ` (${p.value} kr)`}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Arkiverte */}
        {archivedLotteries.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', marginTop: '16px' }}>Tidligere lotterier</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {archivedLotteries.map((l: any) => (
                <div key={l.id} style={{ padding: '10px 14px', background: '#fff', borderRadius: '8px', border: '0.5px solid #dedddd' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '13px', color: '#1a2e1f' }}>{l.name}</div>
                      <div style={{ fontSize: '11px', color: '#4a5e50' }}>{l.totalSold} lodd · {l.totalRevenue} kr · {l.winnersDrawn}/{l.prizeCount} trukket</div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#6b7f70', fontWeight: '500' }}>Avsluttet</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <button onClick={async () => {
                      const warn = l.winnersDrawn > 0
                        ? `\n\n⚠️ ${l.winnersDrawn} vinnere er allerede trukket. Disse nullstilles og må trekkes på nytt.`
                        : '';
                      if (!confirm(`Gjenåpne "${l.name}"?${warn}\n\nLotteriet blir aktivt igjen og synlig for kjøpere.`)) return;
                      // Nullstill vinnere
                      if (l.winnersDrawn > 0) {
                        await supabase.from('prizes').update({ winner_name: null, winner_phone: null }).eq('lottery_id', l.id);
                      }
                      await supabase.from('lotteries').update({ is_active: true }).eq('id', l.id);
                      fetchActiveLottery();
                      fetchArchivedLotteries();
                    }} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #2d6a4f', background: '#fff', color: '#2d6a4f', cursor: 'pointer', fontWeight: '500' }}>
                      Gjenåpne
                    </button>
                    <button onClick={async () => {
                      let msg = `Slette "${l.name}" permanent?`;
                      if (l.totalSold > 0) {
                        msg += `\n\n⚠️ ADVARSEL: ${l.totalSold} lodd solgt for ${l.totalRevenue} kr. Alt slettes permanent og kan ikke gjenopprettes.`;
                      }
                      if (!confirm(msg)) return;
                      if (l.totalSold > 0 && !confirm('Er du HELT sikker? Denne handlingen kan ikke angres.')) return;
                      await supabase.from('lotteries').delete().eq('id', l.id);
                      fetchArchivedLotteries();
                    }} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff5f5', color: '#ef4444', cursor: 'pointer', fontWeight: '500' }}>
                      Slett
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {/* Nytt lotteri */}
        <button onClick={() => { setLottery(null); setShowCreateModal(true); }} style={{ width: '100%', marginTop: '16px', padding: '10px', fontSize: '13px', background: 'none', border: '1px dashed #cbd5e0', borderRadius: '8px', color: '#4a5e50', cursor: 'pointer', fontWeight: '500' }}>+ Opprett nytt lotteri</button>

        {showPremiumGate && <PremiumGateModal featureName="loddsalget" onClose={() => setShowPremiumGate(false)} />}
      </div>
    );
  }

  if (lottery && showDetail) {
    const prizesLeft = lottery.prizes.filter(p => !p.winner_name).length;

    return (
        <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0 }}>← Tilbake til lotterioversikt</button>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setShowCashModal(true)} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', border: '0.5px solid #dedddd', background: '#fff', cursor: 'pointer', color: '#1a2e1f' }}>💵 Kontantsalg</button>
                    <button onClick={archiveLottery} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #fac775', background: '#fff8e6', cursor: 'pointer', color: '#854f0b' }}>📦 Avslutt</button>
                    <button onClick={deleteLottery} style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#ef4444' }}>🗑️</button>
                </div>
            </div>

            {/* Header */}
            <div style={{ background: '#1e3a2f', borderRadius: '10px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#fff' }}>🎟️ {lottery.name}</span>
                        <span style={{ fontSize: '10px', background: 'rgba(126,200,160,0.2)', color: '#7ec8a0', padding: '2px 8px', borderRadius: '6px', fontWeight: '500' }}>Aktivt</span>
                    </div>
                    {lottery.description && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{lottery.description}</div>}
                </div>
                {prizesLeft > 0 && (
                    <button onClick={handleDraw} disabled={drawing || stats.totalSold === 0} style={{ background: stats.totalSold > 0 ? '#7ec8a0' : 'rgba(255,255,255,0.2)', color: stats.totalSold > 0 ? '#1e3a2f' : 'rgba(255,255,255,0.4)', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: '500', cursor: stats.totalSold > 0 ? 'pointer' : 'not-allowed' }}>
                        {drawing ? 'Trekker...' : `🎰 Trekk (${prizesLeft})`}
                    </button>
                )}
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {[
                  { value: `${stats.totalRevenue} kr`, label: 'Innsamlet' },
                  { value: stats.totalSold, label: 'Lodd solgt' },
                  { value: buyers.length, label: 'Kjøpere' },
                  { value: `${lottery.prizes.length - prizesLeft}/${lottery.prizes.length}`, label: 'Trukket', warn: prizesLeft > 0 },
                ].map((item, i) => (
                  <div key={i} style={{ background: item.warn ? '#fff8e6' : '#fff', border: item.warn ? '1px solid #fac775' : '0.5px solid #dedddd', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '17px', fontWeight: '500', color: item.warn ? '#854f0b' : '#1a2e1f' }}>{item.value}</div>
                    <div style={{ fontSize: '10px', color: item.warn ? '#854f0b' : '#4a5e50', marginTop: '2px' }}>{item.label}</div>
                  </div>
                ))}
            </div>

            {/* Faner */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '1px solid #dedddd' }}>
                {([['oversikt', '📊 Oversikt'], ['transaksjoner', '📋 Transaksjoner'], ['kjopere', '👥 Kjøpere']] as [string, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setActiveView(id as any)} style={{
                        padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px',
                        borderBottom: activeView === id ? '2px solid #2d6a4f' : '2px solid transparent',
                        color: activeView === id ? '#1a2e1f' : '#6b7f70',
                        fontWeight: activeView === id ? '600' : '400'
                    }}>{label}</button>
                ))}
            </div>

            {/* === OVERSIKT === */}
            {activeView === 'oversikt' && (
                <>
                    {/* Topp selgere */}
                    {sellerStats.length > 0 && (
                      <>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Topp selgere</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                            {sellerStats.slice(0, 5).map((seller, idx) => {
                                const maxTickets = sellerStats[0]?.tickets || 1;
                                return (
                                    <div key={idx} style={{ padding: '8px 10px', background: '#fff', borderRadius: '6px', border: '0.5px solid #dedddd' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>
                                                {idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : ''}{seller.name}
                                            </span>
                                            <span style={{ fontSize: '12px', fontWeight: '500', color: '#2d6a4f' }}>{seller.tickets} lodd · {seller.amount} kr</span>
                                        </div>
                                        <div style={{ height: '4px', background: '#e8e0d0', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(seller.tickets / maxTickets) * 100}%`, background: idx === 0 ? '#2d6a4f' : '#93c5fd', borderRadius: '2px' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                      </>
                    )}

                    {/* Innstillinger */}
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Innstillinger</div>
                    <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: '500', color: '#4a5e50', marginBottom: '4px', display: 'block' }}>Loddpris</label>
                                <select className="input" value={lottery.ticketPrice} onChange={e => updateLotteryField('ticket_price', parseInt(e.target.value))}>
                                    <option value={20}>20 kr</option><option value={30}>30 kr</option><option value={50}>50 kr</option><option value={100}>100 kr</option>
                                </select>
                            </div>
                            <div><label style={{ fontSize: '11px', fontWeight: '500', color: '#4a5e50', marginBottom: '4px', display: 'block' }}>Mål</label><input type="number" className="input" defaultValue={lottery.goal} onBlur={e => updateLotteryField('goal', parseInt(e.target.value))} /></div>
                            <div><label style={{ fontSize: '11px', fontWeight: '500', color: '#4a5e50', marginBottom: '4px', display: 'block' }}>Vipps-nr</label><input className="input" defaultValue={lottery.vippsNumber} onBlur={e => updateLotteryField('vipps_number', e.target.value)} /></div>
                        </div>
                    </div>

                    {/* Premier */}
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Premier ({lottery.prizes.length})</div>
                    <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '14px' }}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePrizeDragEnd}>
                        <SortableContext items={lottery.prizes.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                            {lottery.prizes.map((p) => (
                                <SortablePrizeItem key={p.id} prize={p} onDelete={deletePrizeFromActive} onResetWinner={resetWinner} />
                            ))}
                        </div>
                        </SortableContext>
                        </DndContext>
                        <div style={{ padding: '10px', background: '#faf8f4', borderRadius: '6px', border: '1px dashed #dedddd' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px' }}>
                                <input className="input" placeholder="Ny premie" value={prizeName} onChange={e => setPrizeName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPrizeToActive(); }} />
                                <input className="input" placeholder="Verdi" value={prizeValue} onChange={e => setPrizeValue(e.target.value)} />
                                <input className="input" placeholder="Giver" value={prizeDonor} onChange={e => setPrizeDonor(e.target.value)} />
                                <button onClick={addPrizeToActive} style={{ background: '#2d6a4f', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>+</button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* === TRANSAKSJONER === */}
            {activeView === 'transaksjoner' && (
                <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>📋 Alle transaksjoner ({transactions.length})</div>
                        <div style={{ display: 'flex', background: '#faf8f4', borderRadius: '6px', overflow: 'hidden', fontSize: '11px' }}>
                            <button onClick={() => setTxSort('dato')} style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', fontWeight: txSort === 'dato' ? '600' : '400', background: txSort === 'dato' ? '#2d6a4f' : 'transparent', color: txSort === 'dato' ? 'white' : '#6b7f70' }}>Dato</button>
                            <button onClick={() => setTxSort('belop')} style={{ padding: '4px 10px', border: 'none', cursor: 'pointer', fontWeight: txSort === 'belop' ? '600' : '400', background: txSort === 'belop' ? '#2d6a4f' : 'transparent', color: txSort === 'belop' ? 'white' : '#6b7f70' }}>Beløp</button>
                        </div>
                    </div>
                    <input className="input" placeholder="Søk på kjøpernavn eller telefon..." value={txSearch} onChange={e => setTxSearch(e.target.value)} style={{ marginBottom: '12px' }} />

                    {filteredTx.length === 0 ? (
                        <p style={{ color: '#6b7f70', textAlign: 'center', padding: '20px 0', fontSize: '13px' }}>Ingen transaksjoner{txSearch ? ' matcher søket' : ' ennå'}.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #dedddd', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Dato</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Kjøper</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Telefon</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px', textAlign: 'right' }}>Lodd</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px', textAlign: 'right' }}>Beløp</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Betaling</th>
                                        <th style={{ padding: '8px 6px', color: '#4a5e50', fontWeight: '600', fontSize: '11px' }}>Selger</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTx.map(tx => (
                                        <tr key={tx.id} style={{ borderBottom: '0.5px solid #eee' }}>
                                            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', color: '#4a5e50' }}>{new Date(tx.created_at).toLocaleDateString('nb-NO')} {new Date(tx.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td style={{ padding: '8px 6px', fontWeight: '500', color: '#1a2e1f' }}>{tx.buyer_name}</td>
                                            <td style={{ padding: '8px 6px', color: '#4a5e50' }}>{tx.buyer_phone}</td>
                                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: '500', color: '#1a2e1f' }}>{tx.tickets}</td>
                                            <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: '500', color: '#2d6a4f' }}>{tx.amount} kr</td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', background: tx.payment_method === 'cash' ? '#fff8e6' : '#e8f5ef', color: tx.payment_method === 'cash' ? '#854f0b' : '#2d6a4f', fontWeight: '500' }}>
                                                    {tx.payment_method === 'cash' ? '💵 Kontant' : '📱 Vipps'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 6px', fontSize: '11px', color: '#6b7f70' }}>{tx.sellerName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* === KJØPERE === */}
            {activeView === 'kjopere' && (
                <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: '#1a2e1f' }}>👥 Kjøpere ({buyers.length})</div>
                        <button onClick={exportBuyersCsv} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '0.5px solid #dedddd', background: '#fff', cursor: 'pointer', color: '#4a5e50' }}>📥 CSV</button>
                    </div>
                    {buyers.length === 0 ? (
                        <p style={{ color: '#6b7f70', textAlign: 'center', padding: '20px 0', fontSize: '13px' }}>Ingen kjøpere ennå.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {buyers.map((b, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: '6px', background: b.isWinner ? '#e8f5ef' : '#faf8f4', border: b.isWinner ? '0.5px solid #b8dfc9' : '0.5px solid #eee' }}>
                                    <div>
                                        <div style={{ fontWeight: '500', fontSize: '13px', color: '#1a2e1f' }}>
                                            {b.isWinner && '🏆 '}{b.name}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#4a5e50' }}>
                                            {b.phone}{b.isWinner && b.wonPrize ? ` · Vant: ${b.wonPrize}` : ''}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '500', fontSize: '13px', color: '#2d6a4f' }}>{b.totalTickets} lodd</div>
                                        <div style={{ fontSize: '11px', color: '#4a5e50' }}>{b.totalAmount} kr</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Kontantsalg modal */}
            {showCashModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ width: '450px', padding: '28px' }}>
                        <h3 style={{ marginTop: 0 }}>💵 Registrer kontantsalg</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div><label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Kjøpers navn *</label><input className="input" value={cashBuyerName} onChange={e => setCashBuyerName(e.target.value)} placeholder="Ola Nordmann" autoFocus /></div>
                            <div><label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Telefon</label><input className="input" value={cashBuyerPhone} onChange={e => setCashBuyerPhone(e.target.value)} placeholder="99 88 77 66" /></div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Antall lodd</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button onClick={() => setCashTickets(Math.max(1, cashTickets - 1))} className="btn" style={{ padding: '6px 12px' }}>-</button>
                                    <span style={{ fontSize: '20px', fontWeight: '700', minWidth: '40px', textAlign: 'center' }}>{cashTickets}</span>
                                    <button onClick={() => setCashTickets(cashTickets + 1)} className="btn" style={{ padding: '6px 12px' }}>+</button>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>= {cashTickets * lottery.ticketPrice} kr</span>
                                </div>
                            </div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Solgt av (valgfritt)</label>
                                <select className="input" value={cashSellerId} onChange={e => setCashSellerId(e.target.value)}>
                                    <option value="">-- Ingen selger --</option>
                                    {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCashModal(false)} className="btn">Avbryt</button>
                            <button onClick={handleCashSale} className="btn btn-primary">Registrer salg</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  }

  // --- VISNING: INGEN AKTIVT LOTTERI ---
  const PRICE_OPTIONS = [20, 30, 50, 100];

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => window.location.href = '/coordinator-dashboard'} style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', marginBottom: '16px', padding: 0 }}>← Tilbake til dashbordet</button>

        {/* HERO */}
        <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🎟️ Digital loddbok</div>
          <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Lag et loddsalg på <span style={{ color: '#7ec8a0' }}>2 minutter</span> — 100% av inntekten til laget</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Du og foreldrene setter opp premier selv. Hver spiller får sin egen salgslenke å dele på sosiale medier eller via QR-kode. Systemet trekker vinnere automatisk. Alt som samles inn går rett til lagets Vipps — ingenting til oss.</p>
          <button onClick={() => setShowCreateModal(true)} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Start nytt loddsalg</button>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Ingen tekniske forkunnskaper nødvendig</div>
        </div>

        {/* Fordel-kort 3x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {[
            { icon: '🔗', title: 'Personlig salgslenke per spiller', desc: 'Hver familie får en unik lenke å dele i WhatsApp, på Facebook eller via QR-kode på treningsfeltet.' },
            { icon: '🏆', title: 'Live toppliste og statistikk', desc: 'Se hvem som selger mest i sanntid. Litt sunn konkurranse motiverer familiene til å selge mer.' },
            { icon: '🎯', title: 'Automatisk trekning', desc: 'Systemet trekker vinnere rettferdig basert på antall lodd kjøpt. Du slipper trommel og lapper.' },
            { icon: '💰', title: '100% til lagets Vipps', desc: 'All betaling går direkte til lagets Vipps-nummer. Ingen mellommann, ingen provisjon, ingen overraskelser.' },
            { icon: '🏅', title: 'Foreldre velger premier', desc: 'Dere setter egne premier — lokale sponsorgaver, utstyr, opplevelser. Ikke bundet til andres produktkatalog.' },
            { icon: '📱', title: 'Ingen app for kjøper', desc: 'Kjøpere trenger ikke laste ned noe. Åpne lenken, velg antall lodd, betal med Vipps. Ferdig.' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>{f.title}</div>
              <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Slik gjør du det */}
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Slik gjør du det</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {[
            { n: '1', title: 'Opprett loddsalg', desc: 'Gi det et navn, sett pris per lodd og legg til premier' },
            { n: '2', title: 'Del salgslenker', desc: 'Send lenker til familiene via Spond, SMS eller e-post' },
            { n: '3', title: 'Følg med live', desc: 'Se hvem som selger mest i sanntid fra dashbordet ditt' },
            { n: '4', title: 'Trekk vinnere', desc: 'Trykk Trekk vinnere — systemet gjør resten' },
          ].map((s, i) => (
            <div key={i} style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '14px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e8f5ef', color: '#2d6a4f', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>{s.n}</div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '3px' }}>{s.title}</div>
              <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{s.desc}</div>
            </div>
          ))}
        </div>

        {/* Sitat */}
        <div style={{ background: '#e6f0e8', borderLeft: '3px solid #2d6a4f', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#1a2e1f', lineHeight: '1.6', fontStyle: 'italic' }}>«Jeg brukte 20 minutter på å sette opp loddsalget. Tidligere tok det meg en hel kveld med regneark og purringer.»</div>
          <div style={{ fontSize: '11px', color: '#4a5e50', marginTop: '6px' }}>— Dugnadsansvarlig, KIL Fotball</div>
        </div>

        {/* TIDLIGERE LOTTERIER */}
        {archivedLotteries.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px', marginTop: '16px' }}>Tidligere lotterier</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {archivedLotteries.map((l: any) => (
                <div key={l.id} style={{ padding: '12px 14px', background: '#fff', borderRadius: '8px', border: '0.5px solid #dedddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500', fontSize: '13px', color: '#1a2e1f' }}>{l.name}</div>
                    <div style={{ fontSize: '11px', color: '#4a5e50' }}>{l.totalSold} lodd · {l.totalRevenue} kr · {l.winnersDrawn}/{l.prizeCount} trukket</div>
                  </div>
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#6b7f70', fontWeight: '500' }}>Avsluttet</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* OPPRETT MODAL */}
        {showCreateModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px' }}>
                <div className="card" style={{ width: '700px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>🎟️ Nytt lotteri</h2>
                        <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Navn på lotteriet *</label>
                            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="F.eks. Julelotteri 2026" autoFocus />
                        </div>
                        <div>
                            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Beskrivelse</label>
                            <textarea className="input" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Kort beskrivelse..." />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                            <div>
                                <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Pris per lodd</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    {PRICE_OPTIONS.map(p => (
                                        <button key={p} onClick={() => setTicketPrice(p)} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', background: ticketPrice === p ? '#2d6a4f' : 'white', color: ticketPrice === p ? 'white' : '#1a2e1f', border: ticketPrice === p ? 'none' : '0.5px solid #dedddd', fontWeight: ticketPrice === p ? '600' : '400' }}>{p} kr</button>
                                    ))}
                                </div>
                                <input type="number" className="input" value={ticketPrice} onChange={e => setTicketPrice(parseInt(e.target.value) || 0)} placeholder="Egendefinert" style={{ fontSize: '13px' }} />
                            </div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Mål (kr)</label>
                                <input type="number" className="input" value={goal} onChange={e => setGoal(parseInt(e.target.value) || 0)} />
                                {ticketPrice > 0 && <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>= {Math.ceil(goal / ticketPrice)} lodd</p>}
                            </div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Vipps-nummer *</label>
                                <input className="input" value={vippsNumber} onChange={e => setVippsNumber(e.target.value)} placeholder="12345" />
                            </div>
                        </div>

                        {/* Premier */}
                        <div style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '15px' }}>🎁 Premier</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', marginBottom: '10px' }}>
                                <input className="input" placeholder="Premienavn" value={prizeName} onChange={e => setPrizeName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPrize(); }} />
                                <input className="input" placeholder="Verdi (kr)" value={prizeValue} onChange={e => setPrizeValue(e.target.value)} />
                                <input className="input" placeholder="Giver" value={prizeDonor} onChange={e => setPrizeDonor(e.target.value)} />
                                <button onClick={addPrize} className="btn btn-primary" style={{ padding: '8px 14px' }}>+</button>
                            </div>
                            {prizes.length > 0 ? (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCreatePrizeDragEnd}>
                                <SortableContext items={prizes.map((p: any) => p._tempId)} strategy={verticalListSortingStrategy}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {prizes.map((p: any, idx) => (
                                        <SortableCreatePrize key={p._tempId} id={p._tempId} prize={p} onRemove={() => removePrize(idx)} />
                                    ))}
                                </div>
                                </SortableContext>
                                </DndContext>
                            ) : (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', padding: '8px 0', margin: 0 }}>Legg til minst én premie</p>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px' }}>
                            <button onClick={() => setShowCreateModal(false)} className="btn">Avbryt</button>
                            <button onClick={() => { saveLottery(); setShowCreateModal(false); }} className="btn btn-primary" style={{ padding: '12px 32px' }} disabled={!name || !vippsNumber || prizes.length === 0}>
                                {loading ? 'Lagrer...' : '🚀 Start lotteriet'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};