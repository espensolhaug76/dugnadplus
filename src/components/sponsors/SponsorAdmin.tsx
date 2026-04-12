import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';

interface Sponsor {
  id: string;
  name: string;
  logo_url: string;
  description: string;
  website: string;
  phone: string;
  discount_level1: number;
  discount_level2: number;
  discount_level3: number;
  discount_level4: number;
  is_active: boolean;
}

const TIER_LABELS = ['Basis', 'Aktiv', 'Premium', 'VIP'];
const TIER_COLORS = ['#6b7f70', '#2d6a4f', '#1e3a2f', '#7ec8a0'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  border: '0.5px solid #dedddd',
  borderRadius: '8px',
  background: '#ffffff',
  color: '#1a2e1f',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: '600',
  color: '#4a5e50',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: '4px',
  display: 'block',
};

export const SponsorAdmin: React.FC = () => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [sponsorsVisible, setSponsorsVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState({ name: '', logo_url: '', description: '', website: '', phone: '', discount_level1: 10, discount_level2: 15, discount_level3: 20, discount_level4: 25 });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('sponsors').select('*').order('name');
    if (data) setSponsors(data);

    // Hent synlighetsinnstilling
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'sponsors_visible').maybeSingle();
    setSponsorsVisible(setting?.value === 'true');
    setLoading(false);
  };

  const toggleVisibility = async () => {
    const newVal = !sponsorsVisible;
    setSponsorsVisible(newVal);
    const { error } = await supabase.from('settings').upsert({ key: 'sponsors_visible', value: String(newVal) }, { onConflict: 'key' });
    if (error) {
      // Fallback: insert
      await supabase.from('settings').insert({ key: 'sponsors_visible', value: String(newVal) });
    }
  };

  const resetForm = () => {
    setForm({ name: '', logo_url: '', description: '', website: '', phone: '', discount_level1: 10, discount_level2: 15, discount_level3: 20, discount_level4: 25 });
    setEditingId(null);
    setShowAdd(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Fyll inn sponsornavn.'); return; }
    if (editingId) {
      await supabase.from('sponsors').update(form).eq('id', editingId);
    } else {
      await supabase.from('sponsors').insert({ ...form, is_active: true });
    }
    resetForm();
    fetchData();
  };

  const handleEdit = (s: Sponsor) => {
    setForm({ name: s.name, logo_url: s.logo_url || '', description: s.description || '', website: s.website || '', phone: s.phone || '', discount_level1: s.discount_level1, discount_level2: s.discount_level2, discount_level3: s.discount_level3, discount_level4: s.discount_level4 });
    setEditingId(s.id);
    setShowAdd(true);
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from('sponsors').update({ is_active: !active }).eq('id', id);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Slette denne sponsoren permanent?')) return;
    await supabase.from('sponsors').delete().eq('id', id);
    fetchData();
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7f70', background: '#faf8f4', minHeight: '100vh' }}>Laster...</div>;

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto', background: '#faf8f4', minHeight: '100vh' }}>
      {/* Back button */}
      <button
        onClick={() => window.location.href = '/coordinator-dashboard'}
        style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '16px' }}
      >
        &larr; Tilbake til dashbordet
      </button>

      {/* Active header */}
      <div style={{
        background: '#1e3a2f',
        borderRadius: '10px',
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#ffffff' }}>Sponsorer</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '2px' }}>{sponsors.length} sponsorer &middot; {sponsors.filter(s => s.is_active).length} aktive</div>
        </div>
        <button
          onClick={() => { resetForm(); setShowAdd(true); }}
          style={{
            background: 'none',
            border: '1px solid #7ec8a0',
            color: '#7ec8a0',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          + Legg til sponsor
        </button>
      </div>

      {/* Synlighetsinnstilling */}
      <div style={{
        background: '#ffffff',
        border: '0.5px solid #dedddd',
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: '600', fontSize: '14px', color: '#1a2e1f' }}>Vis sponsorer for familier</div>
          <div style={{ fontSize: '12px', color: '#4a5e50', marginTop: '2px' }}>Når denne er av, ser bare koordinator sponsorsiden.</div>
        </div>
        <button onClick={toggleVisibility} style={{
          width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
          background: sponsorsVisible ? '#2d6a4f' : '#d1d5db',
          position: 'relative', transition: 'background 0.2s',
        }}>
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%', background: '#ffffff',
            position: 'absolute', top: '3px', left: sponsorsVisible ? '27px' : '3px',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      {/* Legg til / rediger form */}
      {showAdd && (
        <div style={{
          background: '#ffffff',
          border: '0.5px solid #dedddd',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '20px',
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: '700', color: '#1a2e1f' }}>{editingId ? 'Rediger sponsor' : 'Ny sponsor'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Sponsornavn *</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="F.eks. Kiwi Kongsvinger" />
              </div>
              <div>
                <label style={labelStyle}>Logo URL</label>
                <input style={inputStyle} value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Beskrivelse</label>
              <textarea style={{ ...inputStyle, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Hva tilbyr sponsoren?" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Nettside</label>
                <input style={inputStyle} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://www.example.no" />
              </div>
              <div>
                <label style={labelStyle}>Telefon</label>
                <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="99 88 77 66" />
              </div>
            </div>

            {/* Rabattprosent per nivå */}
            <div>
              <label style={labelStyle}>Rabatt per nivå (%)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {TIER_LABELS.map((label, idx) => {
                  const key = `discount_level${idx + 1}` as keyof typeof form;
                  return (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: TIER_COLORS[idx], marginBottom: '4px' }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <input type="number" style={{ ...inputStyle, width: '60px', textAlign: 'center' }} value={form[key] as number} onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })} min={0} max={100} />
                        <span style={{ color: '#4a5e50', fontSize: '13px' }}>%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={resetForm} style={{
                background: '#ffffff',
                border: '0.5px solid #dedddd',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                color: '#4a5e50',
                cursor: 'pointer',
                fontWeight: '500',
              }}>Avbryt</button>
              <button onClick={handleSave} style={{
                background: '#2d6a4f',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: '600',
              }}>{editingId ? 'Lagre endringer' : 'Legg til sponsor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Sponsorliste */}
      {sponsors.length === 0 ? (
        <>
          <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🤝 Sponsorer</div>
            <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>La lokale bedrifter <span style={{ color: '#7ec8a0' }}>støtte laget</span></h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Lokale bedrifter kan vise tilbud og rabatter til lagets familier. Du bestemmer hvem som er med og hva de får lov til å vise — full kontroll hele veien.</p>
            <button onClick={() => { resetForm(); setShowAdd(true); }} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Legg til første sponsor</button>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Du godkjenner alt før familiene ser det</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {[
              { icon: '✅', title: 'Du godkjenner alt', desc: 'Ingen sponsor vises til familiene uten at du har godkjent det. Full kontroll.' },
              { icon: '👨‍👩‍👧', title: 'Familiene ser tilbudene', desc: 'Rabatter og tilbud fra lokale bedrifter vises direkte i appen — relevant for dem, bra for laget.' },
              { icon: '💰', title: 'Faste sponsorinntekter', desc: 'Avtal betingelser direkte med bedriften. Vi tar ikke provisjon.' },
            ].map((f, i) => (
              <div key={i} style={{ padding: '14px', background: '#ffffff', border: '0.5px solid #dedddd', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1a2e1f', marginBottom: '4px' }}>{f.title}</div>
                <div style={{ fontSize: '11px', color: '#4a5e50', lineHeight: '1.5' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sponsors.map(s => (
            <div key={s.id} style={{
              background: '#ffffff',
              border: '0.5px solid #dedddd',
              borderRadius: '8px',
              padding: '16px 20px',
              opacity: s.is_active ? 1 : 0.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                {s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#faf8f4', border: '0.5px solid #dedddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏪</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#1a2e1f' }}>{s.name}</div>
                  <div style={{ fontSize: '12px', color: '#4a5e50', marginTop: '2px' }}>{s.description}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {TIER_LABELS.map((label, idx) => {
                      const val = [s.discount_level1, s.discount_level2, s.discount_level3, s.discount_level4][idx];
                      return <span key={label} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', background: `${TIER_COLORS[idx]}15`, color: TIER_COLORS[idx], fontWeight: '600' }}>{label}: {val}%</span>;
                    })}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => handleToggle(s.id, s.is_active)} style={{
                  background: '#ffffff',
                  border: '0.5px solid #dedddd',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  color: '#4a5e50',
                }}>{s.is_active ? 'Deaktiver' : 'Aktiver'}</button>
                <button onClick={() => handleEdit(s)} style={{
                  background: '#ffffff',
                  border: '0.5px solid #dedddd',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  color: '#4a5e50',
                }}>Rediger</button>
                <button onClick={() => handleDelete(s.id)} style={{
                  background: '#ffffff',
                  border: '0.5px solid #fac775',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  color: '#854f0b',
                }}>Slett</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
