import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface FamilyMember {
  id: string;
  name: string;
  role: 'parent' | 'child';
  birth_year?: number;
  email?: string;
  phone?: string;
  family_id: string;
  subgroup?: string; // Nytt felt
}

export const FamilyMembersPage: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFamilyId, setCurrentFamilyId] = useState<string>('');
  
  // State for Modal / Redigering
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Partial<FamilyMember>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFamilyMembers();
  }, []);

  const fetchFamilyMembers = async () => {
    try {
      const userJson = localStorage.getItem('dugnad_user');
      const user = userJson ? JSON.parse(userJson) : null;
      let familyId = user?.id;

      if (!familyId) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          familyId = authUser?.id;
      }

      if (!familyId) {
          setLoading(false);
          return;
      }

      setCurrentFamilyId(familyId);

      // Henter nå også 'subgroup'
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', familyId)
        .order('role', { ascending: false }); 

      if (error) throw error;

      if (data) {
          setMembers(data);
      }
    } catch (error) {
      console.error('Feil ved henting av familiemedlemmer:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLERS ---

  const openAddModal = (role: 'parent' | 'child') => {
      setEditingMember({ 
          role, 
          family_id: currentFamilyId,
          birth_year: role === 'child' ? 2016 : undefined 
      });
      setIsModalOpen(true);
  };

  const openEditModal = (member: FamilyMember) => {
      setEditingMember(member);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (!confirm('Er du sikker på at du vil slette denne personen?')) return;
      
      const { error } = await supabase.from('family_members').delete().eq('id', id);
      if (error) alert('Feil ved sletting: ' + error.message);
      else fetchFamilyMembers();
  };

  const handleSave = async () => {
      if (!editingMember.name) return alert('Må ha navn');
      setSaving(true);

      try {
          // Klargjør objekt for lagring (inkluderer nå subgroup)
          const payload = {
              family_id: currentFamilyId,
              name: editingMember.name,
              role: editingMember.role,
              email: editingMember.email,
              phone: editingMember.phone,
              birth_year: editingMember.birth_year,
              subgroup: editingMember.subgroup
          };

          if (editingMember.id) {
              // OPPDATER EKSISTERENDE
              const { error } = await supabase
                .from('family_members')
                .update(payload)
                .eq('id', editingMember.id);
              if (error) throw error;
          } else {
              // LEGG TIL NY
              const { error } = await supabase
                .from('family_members')
                .insert(payload);
              if (error) throw error;
          }

          setIsModalOpen(false);
          fetchFamilyMembers();

      } catch (error: any) {
          alert('Feil ved lagring: ' + error.message);
      } finally {
          setSaving(false);
      }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster familie... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingBottom: '80px' }}>
      <div style={{ background: 'linear-gradient(135deg, #16a8b8 0%, #1298a6 100%)', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Min Familie</h1>
        <p style={{ opacity: 0.9, fontSize: '14px', margin: '4px 0 0 0' }}>Administrer dine medlemmer og kontaktinfo</p>
      </div>
      
      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        
        {/* LISTE */}
        {members.length === 0 ? (
            <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Ingen medlemmer funnet.
            </div>
        ) : (
            members.map((member) => (
              <div key={member.id} className="card" style={{ padding: '20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '24px', background: '#f0f9ff', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {member.role === 'parent' ? '👨‍👩‍👧' : '⚽'}
                    </div>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px 0' }}>{member.name}</h3>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            <span>{member.role === 'parent' ? 'Foresatt' : `Spiller (Født ${member.birth_year || '?'})`}</span>
                            
                            {/* VIS UNDERGRUPPE */}
                            {member.subgroup && (
                                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                    {member.subgroup}
                                </span>
                            )}

                            {member.phone && <span>• Tlf: {member.phone}</span>}
                            {member.email && <span>• {member.email}</span>}
                        </div>
                    </div>
                </div>
                <div style={{display: 'flex', gap: '8px'}}>
                    <button onClick={() => openEditModal(member)} className="btn btn-secondary" style={{padding: '8px', fontSize: '16px'}}>✏️</button>
                    <button onClick={() => handleDelete(member.id)} className="btn" style={{padding: '8px', fontSize: '16px', color: 'red', background: '#fff5f5', border: '1px solid #fed7d7'}}>🗑️</button>
                </div>
              </div>
            ))
        )}

        {/* KNAPPER FOR Å LEGGE TIL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
            <button onClick={() => openAddModal('parent')} className="btn btn-secondary" style={{ border: '2px dashed #cbd5e0', background: 'transparent' }}>
                + Legg til foresatt
            </button>
            <button onClick={() => openAddModal('child')} className="btn btn-secondary" style={{ border: '2px dashed #cbd5e0', background: 'transparent' }}>
                + Legg til barn
            </button>
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>
                  <h3 style={{ marginTop: 0 }}>
                      {editingMember.id ? 'Rediger' : 'Legg til'} {editingMember.role === 'parent' ? 'Foresatt' : 'Barn'}
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                      <div>
                          <label className="input-label">Navn *</label>
                          <input 
                            className="input" 
                            value={editingMember.name || ''} 
                            onChange={e => setEditingMember({...editingMember, name: e.target.value})} 
                            placeholder="Fullt navn"
                          />
                      </div>

                      {editingMember.role === 'parent' && (
                          <>
                            <div>
                                <label className="input-label">Telefon</label>
                                <input 
                                    className="input" 
                                    value={editingMember.phone || ''} 
                                    onChange={e => setEditingMember({...editingMember, phone: e.target.value})} 
                                    placeholder="Mobilnummer"
                                />
                            </div>
                            <div>
                                <label className="input-label">E-post</label>
                                <input 
                                    className="input" 
                                    value={editingMember.email || ''} 
                                    onChange={e => setEditingMember({...editingMember, email: e.target.value})} 
                                    placeholder="E-postadresse"
                                />
                            </div>
                          </>
                      )}

                      {editingMember.role === 'child' && (
                          <>
                            <div>
                                <label className="input-label">Fødselsår</label>
                                <input 
                                    type="number"
                                    className="input" 
                                    value={editingMember.birth_year || ''} 
                                    onChange={e => setEditingMember({...editingMember, birth_year: parseInt(e.target.value)})} 
                                    placeholder="2016"
                                />
                            </div>
                            {/* FELT FOR UNDERGRUPPE */}
                            <div>
                                <label className="input-label">Gruppe / Lag</label>
                                <input 
                                    className="input" 
                                    placeholder="F.eks. KIL RØD" 
                                    value={editingMember.subgroup || ''} 
                                    onChange={e => setEditingMember({...editingMember, subgroup: e.target.value})} 
                                />
                                <p style={{fontSize:'11px', color:'#6b7280', marginTop:'4px'}}>Hvilket lag spiller barnet på?</p>
                            </div>
                          </>
                      )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setIsModalOpen(false)} className="btn">Avbryt</button>
                      <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                          {saving ? 'Lagrer...' : 'Lagre'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="bottom-nav">
        <button className="bottom-nav-item" onClick={() => window.location.href = '/family-dashboard'}>
          <div className="bottom-nav-icon">🏠</div>Hjem</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/my-shifts'}>
          <div className="bottom-nav-icon">📅</div>Vakter</button>
        <button className="bottom-nav-item active">
          <div className="bottom-nav-icon">👨‍👩‍👧</div>Familie</button>
        <button className="bottom-nav-item" onClick={() => window.location.href = '/points-tier'}>
          <div className="bottom-nav-icon">⭐</div>Poeng</button>
      </div>
    </div>
  );
};