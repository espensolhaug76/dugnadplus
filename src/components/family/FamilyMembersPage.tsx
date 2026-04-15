import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useCurrentFamily } from '../../hooks/useCurrentFamily';

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

const WEEKDAYS = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const TIME_SLOTS = ['Morgen', 'Ettermiddag', 'Kveld', 'Helg'];

const parseJsonArray = (json?: string): string[] => {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
};

interface FamilyPrefs {
  pref_unavailable_days: string[];
  pref_time_of_day: string[];
  pref_single_parent: boolean;
  pref_special_considerations: string;
  pref_can_help_with: string;
}

export const FamilyMembersPage: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFamilyId, setCurrentFamilyId] = useState<string>('');

  // State for Modal / Redigering
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Partial<FamilyMember>>({});
  const [saving, setSaving] = useState(false);

  // Preferanser
  const [prefs, setPrefs] = useState<FamilyPrefs>({ pref_unavailable_days: [], pref_time_of_day: [], pref_single_parent: false, pref_special_considerations: '', pref_can_help_with: '' });
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const fam = useCurrentFamily();

  useEffect(() => {
    if (fam.loading) return;
    if (fam.unauthenticated) { window.location.href = '/login'; return; }
    if (fam.noFamily) { window.location.href = '/claim-family'; return; }
    if (fam.familyId) fetchFamilyMembers(fam.familyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fam.loading, fam.unauthenticated, fam.noFamily, fam.familyId]);

  const fetchFamilyMembers = async (familyId: string) => {
    try {
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

      // Hent preferanser
      const { data: famData } = await supabase.from('families').select('pref_unavailable_days, pref_time_of_day, pref_single_parent, pref_special_considerations, pref_can_help_with').eq('id', familyId).single();
      if (famData) {
          setPrefs({
              pref_unavailable_days: parseJsonArray(famData.pref_unavailable_days),
              pref_time_of_day: parseJsonArray(famData.pref_time_of_day),
              pref_single_parent: famData.pref_single_parent || false,
              pref_special_considerations: famData.pref_special_considerations || '',
              pref_can_help_with: famData.pref_can_help_with || ''
          });
          setPrefsLoaded(true);
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

  const togglePrefDay = (day: string) => {
      setPrefs(prev => ({ ...prev, pref_unavailable_days: prev.pref_unavailable_days.includes(day) ? prev.pref_unavailable_days.filter(d => d !== day) : [...prev.pref_unavailable_days, day] }));
  };

  const togglePrefTime = (slot: string) => {
      setPrefs(prev => ({ ...prev, pref_time_of_day: prev.pref_time_of_day.includes(slot) ? prev.pref_time_of_day.filter(s => s !== slot) : [...prev.pref_time_of_day, slot] }));
  };

  const savePrefs = async () => {
      setPrefsSaving(true);
      const { error } = await supabase.from('families').update({
          pref_unavailable_days: JSON.stringify(prefs.pref_unavailable_days),
          pref_time_of_day: JSON.stringify(prefs.pref_time_of_day),
          pref_single_parent: prefs.pref_single_parent,
          pref_special_considerations: prefs.pref_special_considerations || null,
          pref_can_help_with: prefs.pref_can_help_with || null
      }).eq('id', currentFamilyId);
      setPrefsSaving(false);
      if (error) {
          alert('Kunne ikke lagre preferanser. Har koordinator kjørt SQL-migrasjonen?\n\n' + error.message);
      } else {
          alert('Preferanser lagret!');
      }
  };

  if (loading) return <div style={{padding:'40px', textAlign:'center', color: '#1a2e1f'}}>Laster familie... ☁️</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f4', paddingBottom: '80px' }}>
      <div style={{ background: '#1e3a2f', padding: '24px', color: 'white' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: 'white' }}>Min Familie</h1>
        <p style={{ opacity: 0.9, fontSize: '14px', margin: '4px 0 0 0' }}>Administrer dine medlemmer og kontaktinfo</p>
      </div>

      <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

        {/* LISTE */}
        {members.length === 0 ? (
            <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#4a5e50' }}>
                Ingen medlemmer funnet.
            </div>
        ) : (
            members.map((member) => (
              <div key={member.id} style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ fontSize: '24px', background: '#e8f5ef', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {member.role === 'parent' ? '👨‍👩‍👧' : '⚽'}
                    </div>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px 0', color: '#1a2e1f' }}>{member.name}</h3>
                        <div style={{ fontSize: '13px', color: '#4a5e50', margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                            <span>{member.role === 'parent' ? 'Foresatt' : `Spiller (Født ${member.birth_year || '?'})`}</span>

                            {/* VIS UNDERGRUPPE */}
                            {member.subgroup && (
                                <span style={{ background: '#e8f5ef', color: '#2d6a4f', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                                    {member.subgroup}
                                </span>
                            )}

                            {member.phone && <span>• Tlf: {member.phone}</span>}
                            {member.email && <span>• {member.email}</span>}
                        </div>
                    </div>
                </div>
                <div style={{display: 'flex', gap: '8px'}}>
                    <button onClick={() => openEditModal(member)} style={{padding: '8px', fontSize: '16px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', cursor: 'pointer'}}>✏️</button>
                    <button onClick={() => handleDelete(member.id)} style={{padding: '8px', fontSize: '16px', color: '#dc2626', background: '#fff5f5', border: '0.5px solid #fecaca', borderRadius: '8px', cursor: 'pointer'}}>🗑️</button>
                </div>
              </div>
            ))
        )}

        {/* KNAPPER FOR Å LEGGE TIL */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
            <button onClick={() => openAddModal('parent')} style={{ border: '2px dashed #dedddd', background: 'transparent', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#4a5e50', fontWeight: '500' }}>
                + Legg til foresatt
            </button>
            <button onClick={() => openAddModal('child')} style={{ border: '2px dashed #dedddd', background: 'transparent', padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#4a5e50', fontWeight: '500' }}>
                + Legg til barn
            </button>
        </div>
        {/* PREFERANSER */}
        {prefsLoaded && (
          <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '24px', marginTop: '32px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0', color: '#1a2e1f' }}>Mine preferanser</h3>
            <p style={{ fontSize: '13px', color: '#4a5e50', margin: '0 0 20px 0' }}>Hjelper koordinator med å fordele vakter best mulig. Ikke bindende.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Dager */}
              <div>
                <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f' }}>Dager jeg ikke kan</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {WEEKDAYS.map(day => (
                    <button key={day} onClick={() => togglePrefDay(day)} style={{
                      padding: '8px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      background: prefs.pref_unavailable_days.includes(day) ? '#fff8e6' : '#ffffff',
                      border: prefs.pref_unavailable_days.includes(day) ? '2px solid #fac775' : '0.5px solid #dedddd',
                      color: prefs.pref_unavailable_days.includes(day) ? '#854f0b' : '#1a2e1f',
                      fontWeight: prefs.pref_unavailable_days.includes(day) ? '600' : '400'
                    }}>{day}</button>
                  ))}
                </div>
              </div>

              {/* Tidspunkt */}
              <div>
                <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f' }}>Tidspunkt som passer best</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {TIME_SLOTS.map(slot => (
                    <button key={slot} onClick={() => togglePrefTime(slot)} style={{
                      padding: '8px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
                      background: prefs.pref_time_of_day.includes(slot) ? '#e8f5ef' : '#ffffff',
                      border: prefs.pref_time_of_day.includes(slot) ? '2px solid #2d6a4f' : '0.5px solid #dedddd',
                      color: prefs.pref_time_of_day.includes(slot) ? '#2d6a4f' : '#1a2e1f',
                      fontWeight: prefs.pref_time_of_day.includes(slot) ? '600' : '400'
                    }}>{slot}</button>
                  ))}
                </div>
              </div>

              {/* Eneforsørger */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: '#1a2e1f' }}>
                <input type="checkbox" checked={prefs.pref_single_parent} onChange={e => setPrefs({ ...prefs, pref_single_parent: e.target.checked })} style={{ accentColor: '#2d6a4f', width: '18px', height: '18px' }} />
                Jeg er eneforsørger
                <span style={{ fontSize: '11px', color: '#6b7f70' }}>(påvirker antall vakter)</span>
              </label>

              {/* Spesielle hensyn */}
              <div>
                <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f' }}>Spesielle hensyn</label>
                <textarea value={prefs.pref_special_considerations} onChange={e => setPrefs({ ...prefs, pref_special_considerations: e.target.value })} placeholder="F.eks. allergi, bevegelseshemming, henter barn alene..." rows={2} style={{ resize: 'vertical', width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* Kan bidra med */}
              <div>
                <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: '600', color: '#1a2e1f' }}>Jeg kan bidra ekstra med</label>
                <textarea value={prefs.pref_can_help_with} onChange={e => setPrefs({ ...prefs, pref_can_help_with: e.target.value })} placeholder="F.eks. kjøring, kiosk, bæring av utstyr..." rows={2} style={{ resize: 'vertical', width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              <button onClick={savePrefs} disabled={prefsSaving} style={{ alignSelf: 'flex-start', background: '#2d6a4f', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: prefsSaving ? 0.7 : 1 }}>
                {prefsSaving ? 'Lagrer...' : 'Lagre preferanser'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', width: '90%', maxWidth: '400px', padding: '24px' }}>
                  <h3 style={{ marginTop: 0, color: '#1a2e1f' }}>
                      {editingMember.id ? 'Rediger' : 'Legg til'} {editingMember.role === 'parent' ? 'Foresatt' : 'Barn'}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                      <div>
                          <label style={{ fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px', display: 'block' }}>Navn *</label>
                          <input
                            value={editingMember.name || ''}
                            onChange={e => setEditingMember({...editingMember, name: e.target.value})}
                            placeholder="Fullt navn"
                            style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                          />
                      </div>

                      {editingMember.role === 'parent' && (
                          <>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px', display: 'block' }}>Telefon</label>
                                <input
                                    value={editingMember.phone || ''}
                                    onChange={e => setEditingMember({...editingMember, phone: e.target.value})}
                                    placeholder="Mobilnummer"
                                    style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px', display: 'block' }}>E-post</label>
                                <input
                                    value={editingMember.email || ''}
                                    onChange={e => setEditingMember({...editingMember, email: e.target.value})}
                                    placeholder="E-postadresse"
                                    style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                                />
                            </div>
                          </>
                      )}

                      {editingMember.role === 'child' && (
                          <>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px', display: 'block' }}>Fødselsår</label>
                                <input
                                    type="number"
                                    value={editingMember.birth_year || ''}
                                    onChange={e => setEditingMember({...editingMember, birth_year: parseInt(e.target.value)})}
                                    placeholder="2016"
                                    style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                                />
                            </div>
                            {/* FELT FOR UNDERGRUPPE */}
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px', display: 'block' }}>Gruppe / Lag</label>
                                <input
                                    placeholder="F.eks. KIL RØD"
                                    value={editingMember.subgroup || ''}
                                    onChange={e => setEditingMember({...editingMember, subgroup: e.target.value})}
                                    style={{ width: '100%', padding: '10px 12px', border: '0.5px solid #dedddd', borderRadius: '8px', fontSize: '14px', color: '#1a2e1f', background: '#ffffff', boxSizing: 'border-box' }}
                                />
                                <p style={{fontSize:'11px', color:'#6b7f70', marginTop:'4px'}}>Hvilket lag spiller barnet på?</p>
                            </div>
                          </>
                      )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setIsModalOpen(false)} style={{ background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', color: '#1a2e1f', cursor: 'pointer' }}>Avbryt</button>
                      <button onClick={handleSave} disabled={saving} style={{ background: '#2d6a4f', color: '#ffffff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                          {saving ? 'Lagrer...' : 'Lagre'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '0.5px solid #dedddd', display: 'flex', justifyContent: 'space-around', padding: '8px 0', zIndex: 100 }}>
        <button onClick={() => window.location.href = '/family-dashboard'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>🏠</div>Hjem</button>
        <button onClick={() => window.location.href = '/my-shifts'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>📅</div>Vakter</button>
        <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#2d6a4f', fontSize: '11px', fontWeight: '700', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>👨‍👩‍👧</div>Familie</button>
        <button onClick={() => window.location.href = '/points-tier'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: '4px 12px', cursor: 'pointer', color: '#6b7f70', fontSize: '11px', gap: '2px' }}>
          <div style={{ fontSize: '20px' }}>⭐</div>Poeng</button>
      </div>
    </div>
  );
};
