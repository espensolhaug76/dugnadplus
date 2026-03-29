import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Member {
  id: string;
  family_id: string;
  name: string;
  role: 'parent' | 'child';
  birth_year?: number;
  email?: string;
  phone?: string;
  subgroup?: string; 
}

interface Family {
  id: string;
  name: string;
  total_points: number;
  members: Member[];
  import_code?: string;
}

export const ManageFamilies: React.FC = () => {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  
  // UI States
  const [addingFamily, setAddingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  
  // State for redigering av enkeltmedlem (Modal)
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  useEffect(() => {
    fetchFamilies();
  }, []);

  const fetchFamilies = async () => {
    setLoading(true);
    const { data: familiesData, error: famError } = await supabase
      .from('families')
      .select('*, family_members(*)')
      .order('name');

    if (famError) {
        console.error('Feil:', famError); 
        setLoading(false); 
        return; 
    }

    const formatted: Family[] = familiesData.map((f: any) => ({
        id: f.id,
        name: f.name,
        total_points: f.total_points,
        import_code: f.import_code,
        members: f.family_members || []
    }));

    setFamilies(formatted);
    setLoading(false);
  };

  // --- ACTIONS ---

  const handleAddFamily = async () => {
      if (!newFamilyName.trim()) return alert('Må ha navn');
      const { error } = await supabase.from('families').insert({ name: newFamilyName, total_points: 0 });
      if (error) alert(error.message);
      else {
          setNewFamilyName('');
          setAddingFamily(false);
          fetchFamilies();
      }
  };

  const handleDeleteFamily = async (id: string) => {
      if (!confirm('Er du sikker? Dette sletter familien og alle medlemmer permanent.')) return;
      await supabase.from('family_members').delete().eq('family_id', id);
      const { error } = await supabase.from('families').delete().eq('id', id);
      if (error) alert(error.message);
      else fetchFamilies();
  };

  // Modal-lagring
  const handleSaveMember = async (member: Partial<Member>) => {
      if (!member.name) return;
      
      const payload = {
          name: member.name,
          role: member.role,
          email: member.email,
          phone: member.phone,
          birth_year: member.birth_year,
          subgroup: member.subgroup 
      };

      let error;
      if (member.id) {
          const res = await supabase.from('family_members').update(payload).eq('id', member.id);
          error = res.error;
      } else {
          const res = await supabase.from('family_members').insert({ ...payload, family_id: member.family_id });
          error = res.error;
      }

      if (error) alert(error.message);
      else {
          setEditingMember(null);
          fetchFamilies();
      }
  };

  // INLINE OPPDATERING AV GRUPPE (Rask endring)
  const handleQuickSubgroupChange = async (memberId: string, newValue: string) => {
      let groupName = newValue;

      if (newValue === '__NEW__') {
          const customName = prompt("Skriv inn navn på ny gruppe:");
          if (!customName) return; // Avbrøt
          groupName = customName;
      }

      // Optimistisk oppdatering i UI
      setFamilies(prev => prev.map(f => ({
          ...f,
          members: f.members.map(m => m.id === memberId ? { ...m, subgroup: groupName } : m)
      })));

      // Lagre til DB
      const { error } = await supabase.from('family_members').update({ subgroup: groupName }).eq('id', memberId);
      if (error) {
          alert('Kunne ikke lagre gruppe: ' + error.message);
          fetchFamilies(); // Revert ved feil
      }
  };

  const handleDeleteMember = async (memberId: string) => {
      if (!confirm('Slette person?')) return;
      const { error } = await supabase.from('family_members').delete().eq('id', memberId);
      if (error) alert(error.message);
      else fetchFamilies();
  };

  // --- HELPERS ---
  
  // Finn alle unike grupper fra eksisterende medlemmer
  const existingGroups = Array.from(new Set(
      families.flatMap(f => f.members.map(m => m.subgroup))
      .filter(g => g && g.trim() !== '')
  )).sort();

  const filteredFamilies = families.filter(f => {
      if (filter === 'all') return true;
      const hasParents = f.members.some(m => m.role === 'parent');
      return filter === 'completed' ? hasParents : !hasParents;
  });

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster familier... ☁️</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 8px 0' }}>Administrer familier</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            {families.length} familier • {families.reduce((sum, f) => sum + f.members.filter(m=>m.role==='child').length, 0)} spillere
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setAddingFamily(true)} className="btn btn-primary">➕ Ny familie</button>
          <button onClick={() => window.location.href = '/import-families'} className="btn btn-secondary">📁 Importer</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
        {['all', 'pending', 'completed'].map(t => (
            <button 
                key={t}
                onClick={() => setFilter(t as any)}
                style={{
                    padding: '12px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: filter === t ? '2px solid var(--primary-color)' : '2px solid transparent',
                    color: filter === t ? 'var(--primary-color)' : 'var(--text-secondary)',
                    fontWeight: filter === t ? '600' : '400',
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                }}
            >
                {t === 'all' ? 'Alle' : t === 'pending' ? 'Mangler info' : 'Fullført'}
            </button>
        ))}
      </div>

      {addingFamily && (
          <div className="card" style={{ padding: '24px', marginBottom: '24px', background: '#f0f9ff', border: '2px solid #bae6fd' }}>
              <h3>Opprett ny familie</h3>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <input className="input" placeholder="F.eks. Familien Hansen" value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} />
                  <button onClick={handleAddFamily} className="btn btn-primary">Lagre</button>
                  <button onClick={() => setAddingFamily(false)} className="btn">Avbryt</button>
              </div>
          </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredFamilies.map(family => {
            const parents = family.members.filter(m => m.role === 'parent');
            const children = family.members.filter(m => m.role === 'child');
            const title = children.map(c => c.name).join(' & ') || family.name;

            return (
                <div key={family.id} className="card" style={{ padding: '24px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #f3f4f6', paddingBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>⚽</span>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: '#1f2937' }}>{title}</h3>
                                {family.import_code && (
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                        Kode: <span style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>{family.import_code}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span className="badge" style={{background:'#ebf8ff', color:'#2b6cb0', fontSize: '12px'}}>{family.total_points} poeng</span>
                            <button onClick={() => handleDeleteFamily(family.id)} style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontSize:'12px', textDecoration: 'underline'}}>Slett</button>
                        </div>
                    </div>

                    <div style={{display:'grid', gridTemplateColumns: '2fr 1fr', gap: '32px'}}>
                        {/* FORESATTE */}
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Foresatte</div>
                                <button onClick={() => setEditingMember({ family_id: family.id, role: 'parent', name: '' } as any)} style={{fontSize:'11px', color:'#2563eb', background:'none', border:'none', cursor:'pointer'}}>+ Legg til</button>
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                {parents.map(p => (
                                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f9fafb', padding:'10px', borderRadius:'6px', border:'1px solid #e5e7eb' }}>
                                        <div onClick={() => setEditingMember(p)} style={{cursor:'pointer', flex:1}}>
                                            <div style={{fontWeight:'600', fontSize:'14px'}}>👤 {p.name}</div>
                                            <div style={{fontSize:'12px', color:'#6b7280'}}>{p.email || '-'} • {p.phone || '-'}</div>
                                        </div>
                                        <button onClick={() => handleDeleteMember(p.id)} style={{color:'#ef4444', border:'none', background:'none', cursor:'pointer'}}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* BARN (MED INLINE DROPDOWN) */}
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Spillere</div>
                                <button onClick={() => setEditingMember({ family_id: family.id, role: 'child', name: '', birth_year: 2016 } as any)} style={{fontSize:'11px', color:'#2563eb', background:'none', border:'none', cursor:'pointer'}}>+ Legg til</button>
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                {children.map(c => (
                                    <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', border:'1px solid #e5e7eb', padding:'10px', borderRadius:'6px' }}>
                                        
                                        {/* Klikk på navnet for full redigering (som før) */}
                                        <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                                            <div onClick={() => setEditingMember(c)} style={{fontWeight:'500', fontSize:'14px', cursor:'pointer'}}>🏃‍♂️ {c.name}</div>
                                            <div style={{fontSize:'11px', color:'#6b7280', display:'flex', alignItems:'center', marginTop:'4px'}}>
                                                {c.birth_year ? `Født ${c.birth_year}` : ''}
                                                
                                                {/* INLINE DROPDOWN FOR GRUPPE */}
                                                <select 
                                                    value={c.subgroup || ''}
                                                    onChange={(e) => handleQuickSubgroupChange(c.id, e.target.value)}
                                                    style={{
                                                        marginLeft: '8px', 
                                                        fontSize: '11px', 
                                                        padding: '2px 4px', 
                                                        borderRadius: '4px', 
                                                        border: '1px solid #cbd5e0', 
                                                        background: '#f8fafc',
                                                        maxWidth: '120px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="">Ingen gruppe</option>
                                                    {existingGroups.map(g => (
                                                        <option key={g} value={g}>{g}</option>
                                                    ))}
                                                    <option value="__NEW__" style={{fontWeight:'bold'}}>+ Ny gruppe...</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button onClick={() => handleDeleteMember(c.id)} style={{color:'#ef4444', border:'none', background:'none', cursor:'pointer', paddingLeft:'8px'}}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
      </div>

      {/* EDIT/ADD MODAL (Full redigering) */}
      {editingMember && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div className="card" style={{ width: '400px', padding: '24px' }}>
                  <h3 style={{ marginTop: 0 }}>{editingMember.id ? 'Rediger' : 'Ny'} {editingMember.role === 'parent' ? 'Foresatt' : 'Spiller'}</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                      <div><label className="input-label">Navn</label><input className="input" value={editingMember.name} onChange={e => setEditingMember({...editingMember, name: e.target.value})} /></div>
                      
                      {editingMember.role === 'parent' && (
                          <>
                            <div><label className="input-label">E-post</label><input className="input" value={editingMember.email || ''} onChange={e => setEditingMember({...editingMember, email: e.target.value})} /></div>
                            <div><label className="input-label">Telefon</label><input className="input" value={editingMember.phone || ''} onChange={e => setEditingMember({...editingMember, phone: e.target.value})} /></div>
                          </>
                      )}

                      {editingMember.role === 'child' && (
                          <>
                            <div><label className="input-label">Fødselsår</label><input type="number" className="input" value={editingMember.birth_year || ''} onChange={e => setEditingMember({...editingMember, birth_year: parseInt(e.target.value)})} /></div>
                            <div>
                                <label className="input-label">Gruppe / Lag</label>
                                <input 
                                    className="input" 
                                    placeholder="F.eks. KIL RØD" 
                                    value={editingMember.subgroup || ''} 
                                    onChange={e => setEditingMember({...editingMember, subgroup: e.target.value})} 
                                />
                            </div>
                          </>
                      )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingMember(null)} className="btn">Avbryt</button>
                      <button onClick={() => handleSaveMember(editingMember)} className="btn btn-primary">Lagre</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};