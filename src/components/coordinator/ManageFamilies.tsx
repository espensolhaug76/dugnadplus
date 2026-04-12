import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { csvRow } from '../../utils/csvSafe';

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

interface Verv {
  name: string;
  points: number;
}

interface Family {
  id: string;
  name: string;
  total_points: number;
  members: Member[];
  import_code?: string;
  shift_preferences?: string;
  verv?: string; // JSON: Verv[]
  exempt_from_shifts?: boolean;
  // Skjerming
  shield_level: 'none' | 'reduced' | 'full' | number;
  is_shielded?: boolean;
  shield_reason?: string;
  shield_start_points?: number;
  shield_set_by?: string;
  shield_set_at?: string;
  // Preferanser (fra familien)
  pref_unavailable_days?: string;
  pref_time_of_day?: string;
  pref_single_parent?: boolean;
  pref_special_considerations?: string;
  pref_can_help_with?: string;
}

const SHIELD_CONFIG = {
  none: { label: 'Normal', color: 'transparent', bg: 'transparent', text: '' },
  reduced: { label: 'Redusert', color: '#f59e0b', bg: '#fef3c7', text: '🟡' },
  full: { label: 'Fullt skjermet', color: '#ef4444', bg: '#fee2e2', text: '🔴' },
};

// New numeric shield levels with start points
const SHIELD_LEVELS = [
  { value: 0, label: 'Ikke skjermet', is_shielded: false, shield_start_points: 0 },
  { value: 1, label: 'Lagleder', is_shielded: true, shield_start_points: 300 },
  { value: 2, label: 'Trener', is_shielded: true, shield_start_points: 500 },
  { value: 3, label: 'Dugnadsansvarlig', is_shielded: true, shield_start_points: 1000 },
];

// Map old string shield_level to numeric
const normalizeShieldLevel = (level: 'none' | 'reduced' | 'full' | number): number => {
  if (typeof level === 'number') return level;
  if (level === 'none') return 0;
  if (level === 'reduced') return 1;
  if (level === 'full') return 2;
  return 0;
};

// Check if family is shielded (supports both old and new)
const isFamilyShielded = (family: Family): boolean => {
  if (family.is_shielded !== undefined) return family.is_shielded;
  return normalizeShieldLevel(family.shield_level) > 0;
};

// Get shield start points for family
const getShieldStartPoints = (family: Family): number => {
  if (family.shield_start_points !== undefined && family.shield_start_points > 0) return family.shield_start_points;
  const numLevel = normalizeShieldLevel(family.shield_level);
  const found = SHIELD_LEVELS.find(l => l.value === numLevel);
  return found ? found.shield_start_points : 0;
};

// Get old-style shield config key from numeric level
const getShieldConfigKey = (family: Family): 'none' | 'reduced' | 'full' => {
  if (typeof family.shield_level === 'string' && family.shield_level in SHIELD_CONFIG) {
    return family.shield_level as 'none' | 'reduced' | 'full';
  }
  const num = normalizeShieldLevel(family.shield_level);
  if (num === 0) return 'none';
  if (num === 1) return 'reduced';
  return 'full';
};

// WEEKDAYS and TIME_SLOTS reserved for future scheduling UI

const parseJsonArray = (json?: string): string[] => {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
};

// Automatisk skjerming basert på verv
const AUTO_SHIELD_VERV = ['Hovedtrener', 'Trener', 'Lagleder', 'Styremedlem'];

interface ShiftPrefs {
  preferred: string[];
  avoided: string[];
}

const ALL_SHIFT_TYPES = [
  'Kioskvakt', 'Billettsalg', 'Fair play/kampvert', 'Sekretæriat',
  'Garderobe', 'Ryddevakt', 'Parkering', 'Inngang', 'Kiosk',
  'Opprigg', 'Nedrigg'
];

const VERV_SUGGESTIONS: { name: string; points: number; exempt: boolean }[] = [
  { name: 'Hovedtrener', points: 300, exempt: true },
  { name: 'Trener', points: 200, exempt: true },
  { name: 'Lagleder', points: 150, exempt: true },
  { name: 'Styremedlem', points: 100, exempt: true },
  { name: 'Materialforvalter', points: 80, exempt: false },
  { name: 'Dommer', points: 100, exempt: false },
  { name: 'Arrangementsansvarlig', points: 120, exempt: false },
  { name: 'Webansvarlig', points: 60, exempt: false },
  { name: 'Kasserer', points: 80, exempt: false },
];

const parsePrefs = (json?: string): ShiftPrefs => {
  if (!json) return { preferred: [], avoided: [] };
  try { return JSON.parse(json); } catch { return { preferred: [], avoided: [] }; }
};

const parseVerv = (json?: string): Verv[] => {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
};

const vervPoints = (json?: string): number => {
  return parseVerv(json).reduce((sum, v) => sum + v.points, 0);
};

export const ManageFamilies: React.FC = () => {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'shielded'>('all');
  
  // UI States
  const [addingFamily, setAddingFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newChildren, setNewChildren] = useState<{ name: string; birthYear: number; subgroup: string }[]>([{ name: '', birthYear: new Date().getFullYear() - 10, subgroup: '' }]);
  const [newParents, setNewParents] = useState<{ name: string; phone: string; email: string }[]>([{ name: '', phone: '', email: '' }]);
  
  // State for redigering av enkeltmedlem (Modal)
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Bulk-handlinger
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Dugnadsoversikt per barn
  const [childOverview, setChildOverview] = useState<{ name: string; familyId: string; assignments: any[] } | null>(null);

  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  // Skjerming modal
  const [shieldEditFamily, setShieldEditFamily] = useState<Family | null>(null);
  const [shieldForm, setShieldForm] = useState<{ level: number; reason: string }>({ level: 0, reason: '' });

  // Pending foreldre
  const [pendingParents, setPendingParents] = useState<any[]>([]);

  // Family preferences (from family_preferences table)
  const [familyPrefsMap, setFamilyPrefsMap] = useState<Record<string, any>>({});

  // Invitasjonstekst
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    fetchFamilies();
    fetchPendingParents();
  }, []);

  const getActiveTeam = () => {
    try {
      const activeTeamId = localStorage.getItem('dugnad_active_team_filter');
      if (!activeTeamId) return null;
      const teams = JSON.parse(localStorage.getItem('dugnad_teams') || '[]');
      return teams.find((t: any) => t.id === activeTeamId) || null;
    } catch { return null; }
  };

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

    // Filtrer på aktivt lag via team_id
    const activeTeam = getActiveTeam();
    const activeTeamId = activeTeam?.id || null;
    const filtered = activeTeamId
      ? familiesData.filter((f: any) => f.team_id === activeTeamId || !f.team_id)
      : familiesData;

    const formatted: Family[] = filtered.map((f: any) => ({
        id: f.id,
        name: f.name,
        total_points: f.total_points,
        import_code: f.import_code,
        shift_preferences: f.shift_preferences,
        verv: f.verv,
        exempt_from_shifts: f.exempt_from_shifts || false,
        shield_level: f.shield_level ?? 'none',
        is_shielded: f.is_shielded ?? false,
        shield_reason: f.shield_reason,
        shield_start_points: f.shield_start_points ?? 0,
        shield_set_by: f.shield_set_by,
        shield_set_at: f.shield_set_at,
        pref_unavailable_days: f.pref_unavailable_days,
        pref_time_of_day: f.pref_time_of_day,
        pref_single_parent: f.pref_single_parent || false,
        pref_special_considerations: f.pref_special_considerations,
        pref_can_help_with: f.pref_can_help_with,
        members: f.family_members || []
    }));

    setFamilies(formatted);

    // Fetch family preferences for the active team
    const teamId = activeTeamId;
    if (teamId) {
      const { data: prefsData } = await supabase.from('family_preferences').select('*').eq('team_id', teamId);
      if (prefsData) {
        const map: Record<string, any> = {};
        prefsData.forEach((p: any) => { map[p.family_id] = p; });
        setFamilyPrefsMap(map);
      }
    } else {
      const { data: prefsData } = await supabase.from('family_preferences').select('*');
      if (prefsData) {
        const map: Record<string, any> = {};
        prefsData.forEach((p: any) => { map[p.family_id] = p; });
        setFamilyPrefsMap(map);
      }
    }

    setLoading(false);
  };

  const fetchPendingParents = async () => {
    const { data } = await supabase
      .from('pending_parents')
      .select('*, families(name), family_members!pending_parents_child_member_id_fkey(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setPendingParents(data);
  };

  const approveParent = async (pending: any) => {
    // Opprett som family_member
    await supabase.from('family_members').insert({
      family_id: pending.family_id,
      name: pending.name,
      role: 'parent',
      email: pending.email,
      phone: pending.phone
    });
    await supabase.from('pending_parents').update({ status: 'approved' }).eq('id', pending.id);
    fetchPendingParents();
    fetchFamilies();
    alert(`✅ ${pending.name} er godkjent som foresatt.`);
  };

  const rejectParent = async (id: string) => {
    if (!confirm('Avvis denne registreringen?')) return;
    await supabase.from('pending_parents').update({ status: 'rejected' }).eq('id', id);
    fetchPendingParents();
  };

  const generateInviteText = (): string => {
    (() => { try { return JSON.parse(localStorage.getItem('dugnad_club') || '{}'); } catch { return {}; } })();
    const teams = (() => { try { return JSON.parse(localStorage.getItem('dugnad_teams') || '[]'); } catch { return []; } })();
    const teamName = teams[0]?.name || 'laget';
    const joinUrl = `${window.location.origin}/join`;

    const childrenWithCodes = families.flatMap(f =>
      f.members.filter(m => m.role === 'child' && (m as any).join_code).map(m => `${m.name} → ${(m as any).join_code}`)
    );

    let text = `Hei alle i ${teamName}! 👋\n\n`;
    text += `Vi bruker Dugnad+ for å organisere dugnader denne sesongen. `;
    text += `For å koble deg til barnet ditt, gå til:\n\n`;
    text += `🔗 ${joinUrl}\n\n`;
    text += `Tast inn koden for ditt barn:\n\n`;
    if (childrenWithCodes.length > 0) {
      text += childrenWithCodes.join('\n') + '\n\n';
    } else {
      text += '(Kodene genereres ved import av spillerliste)\n\n';
    }
    text += `Koordinator godkjenner registreringen din, og du får tilgang med en gang. Spørsmål? Kontakt lagets koordinator.`;
    return text;
  };

  // --- ACTIONS ---

  const generateJoinCode = (): string => {
      let prefix = 'DUG';
      try { const club = JSON.parse(localStorage.getItem('dugnad_club') || '{}'); if (club.name) prefix = club.name.replace(/[^a-zA-ZæøåÆØÅ]/g, '').substring(0, 3).toUpperCase(); } catch {}
      return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const handleAddFamily = async () => {
      const validChildren = newChildren.filter(c => c.name.trim());
      const validParents = newParents.filter(p => p.name.trim());
      if (validChildren.length === 0) { alert('Legg til minst ett barn.'); return; }

      // Generer familienavn fra første barns etternavn
      const familyName = newFamilyName.trim() || `Fam. ${validChildren[0].name.split(' ').pop()}`;

      const activeTeamId = localStorage.getItem('dugnad_active_team_filter') || null;
      const { data: insertedFamily, error } = await supabase.from('families').insert({ name: familyName, total_points: 0, team_id: activeTeamId }).select().single();
      if (error) { alert(error.message); return; }

      // Legg til barn
      const childInserts = validChildren.map(c => ({
          family_id: insertedFamily.id, name: c.name.trim(), role: 'child',
          birth_year: c.birthYear, subgroup: c.subgroup || null, join_code: generateJoinCode()
      }));
      await supabase.from('family_members').insert(childInserts);

      // Legg til foresatte
      if (validParents.length > 0) {
          const parentInserts = validParents.map(p => ({
              family_id: insertedFamily.id, name: p.name.trim(), role: 'parent',
              email: p.email || null, phone: p.phone || null
          }));
          await supabase.from('family_members').insert(parentInserts);
      }

      setNewFamilyName('');
      setNewChildren([{ name: '', birthYear: new Date().getFullYear() - 10, subgroup: '' }]);
      setNewParents([{ name: '', phone: '', email: '' }]);
      setAddingFamily(false);
      fetchFamilies();
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

  const handleTogglePref = async (familyId: string, shiftName: string, type: 'preferred' | 'avoided') => {
      const family = families.find(f => f.id === familyId);
      if (!family) return;
      const prefs = parsePrefs(family.shift_preferences);

      if (type === 'preferred') {
          prefs.avoided = prefs.avoided.filter(s => s !== shiftName);
          if (prefs.preferred.includes(shiftName)) prefs.preferred = prefs.preferred.filter(s => s !== shiftName);
          else prefs.preferred.push(shiftName);
      } else {
          prefs.preferred = prefs.preferred.filter(s => s !== shiftName);
          if (prefs.avoided.includes(shiftName)) prefs.avoided = prefs.avoided.filter(s => s !== shiftName);
          else prefs.avoided.push(shiftName);
      }

      const json = JSON.stringify(prefs);
      setFamilies(prev => prev.map(f => f.id === familyId ? { ...f, shift_preferences: json } : f));
      await supabase.from('families').update({ shift_preferences: json }).eq('id', familyId);
  };

  const handleAddVerv = async (familyId: string, vervName: string, points: number) => {
      const family = families.find(f => f.id === familyId);
      if (!family) return;
      const current = parseVerv(family.verv);
      if (current.some(v => v.name === vervName)) return;
      const updated = [...current, { name: vervName, points }];
      const json = JSON.stringify(updated);

      // Auto-skjerming: Trener/Lagleder/Styremedlem → skjermet
      const shouldAutoShield = AUTO_SHIELD_VERV.includes(vervName);
      const currentNumLevel = normalizeShieldLevel(family.shield_level);
      // Auto-assign: Trener→2, Lagleder→1, others→2
      const autoLevel = vervName === 'Lagleder' ? 1 : 2;
      const newShieldLevel = shouldAutoShield ? Math.max(currentNumLevel, autoLevel) : currentNumLevel;
      const shieldReason = shouldAutoShield && currentNumLevel === 0
          ? `Automatisk skjermet (${vervName})`
          : family.shield_reason;
      const autoShieldInfo = SHIELD_LEVELS.find(l => l.value === newShieldLevel) || SHIELD_LEVELS[0];

      const updateData: any = {
          verv: json,
          exempt_from_shifts: shouldAutoShield || family.exempt_from_shifts,
          shield_level: newShieldLevel,
          is_shielded: autoShieldInfo.is_shielded,
          shield_start_points: autoShieldInfo.shield_start_points
      };
      if (shouldAutoShield) {
          updateData.shield_reason = shieldReason;
          updateData.shield_set_at = new Date().toISOString();
      }

      setFamilies(prev => prev.map(f => f.id === familyId ? { ...f, ...updateData } : f));
      const { error } = await supabase.from('families').update(updateData).eq('id', familyId);
      if (error) {
          console.error('Feil ved lagring av verv:', error.message);
          alert('Kunne ikke lagre verv/skjerming. Kjør SQL-migrasjonen (supabase_all_extra_columns.sql) først.\n\n' + error.message);
      }
  };

  const handleRemoveVerv = async (familyId: string, vervName: string) => {
      const family = families.find(f => f.id === familyId);
      if (!family) return;
      const updated = parseVerv(family.verv).filter(v => v.name !== vervName);
      const json = JSON.stringify(updated);

      const stillExempt = updated.some(v => AUTO_SHIELD_VERV.includes(v.name));
      const newShieldLevel = stillExempt ? 2 : 0;
      const newShieldInfo = SHIELD_LEVELS.find(l => l.value === newShieldLevel) || SHIELD_LEVELS[0];

      setFamilies(prev => prev.map(f => f.id === familyId ? { ...f, verv: json, exempt_from_shifts: stillExempt, shield_level: newShieldLevel, is_shielded: newShieldInfo.is_shielded, shield_start_points: newShieldInfo.shield_start_points } : f));
      await supabase.from('families').update({ verv: json, exempt_from_shifts: stillExempt, shield_level: newShieldLevel, is_shielded: newShieldInfo.is_shielded, shield_start_points: newShieldInfo.shield_start_points }).eq('id', familyId);
  };

  const handleSaveShield = async () => {
      if (!shieldEditFamily) return;
      const selectedLevel = SHIELD_LEVELS.find(l => l.value === shieldForm.level) || SHIELD_LEVELS[0];
      const update: any = {
          shield_level: shieldForm.level,
          is_shielded: selectedLevel.is_shielded,
          shield_start_points: selectedLevel.shield_start_points,
          shield_reason: shieldForm.reason || null,
          shield_set_by: 'coordinator',
          shield_set_at: new Date().toISOString(),
          exempt_from_shifts: shieldForm.level >= 2
      };
      setFamilies(prev => prev.map(f => f.id === shieldEditFamily.id ? { ...f, ...update } as Family : f));
      const { error } = await supabase.from('families').update(update).eq('id', shieldEditFamily.id);
      if (error) {
          console.error('Feil ved lagring av skjerming:', error.message);
          alert('Kunne ikke lagre skjerming. Har du kjørt SQL-migrasjonen?\n\nSe filen: supabase_all_extra_columns.sql');
      }
      setShieldEditFamily(null);
  };

  const handleDeleteMember = async (memberId: string) => {
      if (!confirm('Slette person?')) return;
      const { error } = await supabase.from('family_members').delete().eq('id', memberId);
      if (error) alert(error.message);
      else fetchFamilies();
  };

  // --- DUGNADSOVERSIKT PER BARN ---
  const showChildOverview = async (childName: string, familyId: string) => {
    const { data } = await supabase
      .from('assignments')
      .select('*, shifts(name, start_time, end_time, events(name, date))')
      .eq('family_id', familyId);
    setChildOverview({ name: childName, familyId, assignments: data || [] });
  };

  // --- BULK-HANDLINGER ---
  const toggleSelectFamily = (id: string) => {
    setSelectedFamilyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFamilies = () => {
    if (selectedFamilyIds.size === filteredFamilies.length) setSelectedFamilyIds(new Set());
    else setSelectedFamilyIds(new Set(filteredFamilies.map(f => f.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedFamilyIds.size === 0) return;
    if (!confirm(`Slette ${selectedFamilyIds.size} familier permanent?`)) return;
    for (const id of selectedFamilyIds) {
      await supabase.from('family_members').delete().eq('family_id', id);
      await supabase.from('families').delete().eq('id', id);
    }
    setSelectedFamilyIds(new Set());
    setBulkMode(false);
    fetchFamilies();
  };

  const exportCsv = () => {
    const toExport = bulkMode && selectedFamilyIds.size > 0
      ? filteredFamilies.filter(f => selectedFamilyIds.has(f.id))
      : filteredFamilies;
    // CSV-injection-beskyttelse: celler bygges via csvRow() som prefikser
    // formel-trigger-tegn (=, +, -, @, \t, \r) med apostrof og quoter
    // spesialtegn. Se src/utils/csvSafe.ts.
    const header = 'Spillernavn;Familienavn;Foresatte;Telefon;E-post;Gruppe;Poeng';
    const rows = toExport.map(f => {
      const children = f.members.filter(m => m.role === 'child');
      const parents = f.members.filter(m => m.role === 'parent');
      const childNames = children.map(c => c.name).join(' & ');
      const parentNames = parents.map(p => p.name).join(', ');
      const phones = parents.map(p => p.phone || '').filter(Boolean).join(', ');
      const emails = parents.map(p => p.email || '').filter(Boolean).join(', ');
      const subgroup = children[0]?.subgroup || '';
      return csvRow([childNames, f.name, parentNames, phones, emails, subgroup, f.total_points]);
    }).join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'familier.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Trener-toggle per forelder
  const toggleParentTrainer = async (familyId: string, _parentName: string) => {
    const family = families.find(f => f.id === familyId);
    if (!family) return;
    const current = parseVerv(family.verv);
    const isTrainer = current.some(v => v.name === 'Trener');
    if (isTrainer) {
      await handleRemoveVerv(familyId, 'Trener');
    } else {
      await handleAddVerv(familyId, 'Trener', 200);
    }
  };

  // --- HELPERS ---

  // Finn alle unike grupper fra eksisterende medlemmer
  const existingGroups = Array.from(new Set(
      families.flatMap(f => f.members.map(m => m.subgroup))
      .filter(g => g && g.trim() !== '')
  )).sort();

  const filteredFamilies = families.filter(f => {
      if (filter === 'all') return true;
      if (filter === 'shielded') return isFamilyShielded(f) || f.exempt_from_shifts;
      if (filter === 'pending') return !f.members.some(m => m.role === 'parent');
      return true;
  });

  if (loading) return <div style={{padding:'40px', textAlign:'center'}}>Laster familier... ☁️</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <button onClick={() => window.location.href = '/coordinator-dashboard'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>← Tilbake</button>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 8px 0' }}>Administrer familier</h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            {(() => { const t = getActiveTeam(); return t ? `${t.name} · ` : ''; })()}
            {families.length} familier • {families.reduce((sum, f) => sum + f.members.filter(m=>m.role==='child').length, 0)} spillere
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setBulkMode(!bulkMode)} className="btn" style={{ fontSize: '12px', background: bulkMode ? '#1f2937' : 'var(--card-bg)', color: bulkMode ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            {bulkMode ? `✓ ${selectedFamilyIds.size} valgt` : '☑️ Velg flere'}
          </button>
          {bulkMode && selectedFamilyIds.size > 0 && (
            <button onClick={handleBulkDelete} className="btn" style={{ fontSize: '12px', color: '#ef4444', border: '1px solid #fecaca' }}>🗑️ Slett valgte</button>
          )}
          <button onClick={exportCsv} className="btn" style={{ fontSize: '12px', border: '1px solid var(--border-color)' }}>📥 Eksporter CSV</button>
          <button onClick={() => setShowInviteModal(true)} className="btn btn-secondary" style={{ fontSize: '12px' }}>📋 Invitasjon</button>
          <button onClick={() => setAddingFamily(true)} className="btn btn-primary" style={{ fontSize: '12px' }}>➕ Ny familie</button>
          <button onClick={() => window.location.href = '/import-families'} className="btn btn-secondary" style={{ fontSize: '12px' }}>📁 Importer</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb' }}>
        {['all', 'shielded', 'pending'].map(t => (
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
                    cursor: 'pointer'
                }}
            >
                {t === 'all' ? `Alle (${families.length})` : t === 'shielded' ? `🛡️ Skjermede (${families.filter(f => isFamilyShielded(f) || f.exempt_from_shifts).length})` : `Uten foresatte (${families.filter(f => !f.members.some(m => m.role === 'parent')).length})`}
            </button>
        ))}
        {bulkMode && (
          <button onClick={selectAllFamilies} style={{ padding: '12px 0', background: 'none', border: 'none', borderBottom: '2px solid transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', marginLeft: 'auto' }}>
            {selectedFamilyIds.size === filteredFamilies.length ? 'Fjern alle' : 'Velg alle'}
          </button>
        )}
      </div>

      {addingFamily && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
              <div className="card" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto', padding: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Registrer ny familie</h2>
                      <button onClick={() => setAddingFamily(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                  </div>

                  {/* Barn */}
                  <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <label style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>🏃 Barn / spillere *</label>
                          <button onClick={() => setNewChildren(prev => [...prev, { name: '', birthYear: new Date().getFullYear() - 10, subgroup: '' }])} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>+ Legg til søsken</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {newChildren.map((child, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'end', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ flex: 2 }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Navn</label>
                                      <input className="input" value={child.name} onChange={e => { const u = [...newChildren]; u[idx].name = e.target.value; setNewChildren(u); }} placeholder="Fullt navn" autoFocus={idx === 0} />
                                  </div>
                                  <div style={{ width: '80px' }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Født</label>
                                      <input type="number" className="input" value={child.birthYear} onChange={e => { const u = [...newChildren]; u[idx].birthYear = parseInt(e.target.value) || 0; setNewChildren(u); }} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Gruppe</label>
                                      <input className="input" value={child.subgroup} onChange={e => { const u = [...newChildren]; u[idx].subgroup = e.target.value; setNewChildren(u); }} placeholder="Valgfritt" />
                                  </div>
                                  {newChildren.length > 1 && (
                                      <button onClick={() => setNewChildren(prev => prev.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 4px', marginBottom: '4px' }}>×</button>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>

                  {/* Foresatte */}
                  <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <label style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>👤 Foresatte</label>
                          <button onClick={() => setNewParents(prev => [...prev, { name: '', phone: '', email: '' }])} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>+ Legg til foresatt</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {newParents.map((parent, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'end', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ flex: 2 }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Navn</label>
                                      <input className="input" value={parent.name} onChange={e => { const u = [...newParents]; u[idx].name = e.target.value; setNewParents(u); }} placeholder="Fullt navn" />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Telefon</label>
                                      <input className="input" value={parent.phone} onChange={e => { const u = [...newParents]; u[idx].phone = e.target.value; setNewParents(u); }} placeholder="99 88 77 66" />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>E-post</label>
                                      <input className="input" value={parent.email} onChange={e => { const u = [...newParents]; u[idx].email = e.target.value; setNewParents(u); }} placeholder="ola@mail.no" />
                                  </div>
                                  {newParents.length > 1 && (
                                      <button onClick={() => setNewParents(prev => prev.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 4px', marginBottom: '4px' }}>×</button>
                                  )}
                              </div>
                          ))}
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>Foresatte kan også registrere seg selv via barnekoden senere.</p>
                  </div>

                  {/* Familienavn (valgfritt) */}
                  <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <label className="input-label" style={{ marginBottom: '4px', display: 'block' }}>Familienavn (valgfritt)</label>
                      <input className="input" value={newFamilyName} onChange={e => setNewFamilyName(e.target.value)} placeholder="Genereres automatisk fra barnets etternavn" style={{ background: 'var(--card-bg, white)' }} />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setAddingFamily(false)} className="btn">Avbryt</button>
                      <button onClick={handleAddFamily} className="btn btn-primary" style={{ padding: '10px 24px' }}>Registrer familie</button>
                  </div>
              </div>
          </div>
      )}

      {/* Pending foreldre */}
      {pendingParents.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '20px', borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '700', color: '#92400e' }}>⏳ Venter godkjenning ({pendingParents.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingParents.map((p: any) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--card-bg, white)', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{p.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {p.email && `${p.email} · `}{p.phone && `${p.phone} · `}
                    Barn: {p.family_members?.name || 'Ukjent'} · {p.families?.name || ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => approveParent(p)} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>✅ Godkjenn</button>
                  <button onClick={() => rejectParent(p.id)} className="btn" style={{ padding: '6px 14px', fontSize: '12px', color: '#ef4444', border: '1px solid #fecaca' }}>Avvis</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredFamilies.map(family => {
            const parents = family.members.filter(m => m.role === 'parent');
            const children = family.members.filter(m => m.role === 'child');
            const title = children.map(c => c.name).join(' & ') || family.name;
            const isExpanded = expandedFamily === family.id;
            const vervList = parseVerv(family.verv);

            return (
                <div key={family.id} className="card" style={{ padding: 0, overflow: 'hidden', border: isExpanded ? '2px solid #16a8b8' : '1px solid var(--border-color)' }}>
                    {/* Kompakt header — klikk for å utvide */}
                    <div
                        onClick={() => setExpandedFamily(isExpanded ? null : family.id)}
                        style={{ padding: '14px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isExpanded ? '#f0fdfa' : 'white', transition: 'background 0.15s' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                            {bulkMode && (
                                <input type="checkbox" checked={selectedFamilyIds.has(family.id)} onChange={(e) => { e.stopPropagation(); toggleSelectFamily(family.id); }} onClick={e => e.stopPropagation()} style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
                            )}
                            <span style={{ fontSize: '16px', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>›</span>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>{title}</span>
                                    {(family as any).red_flag && (
                                        <span style={{ fontSize: '10px', fontWeight: '700', background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: '8px' }}>🚩</span>
                                    )}
                                    {isFamilyShielded(family) && (
                                        <span title={family.shield_reason || 'Skjermet'} style={{ fontSize: '12px', fontWeight: '600', background: SHIELD_CONFIG[getShieldConfigKey(family)].bg || '#e0f2fe', color: SHIELD_CONFIG[getShieldConfigKey(family)].color || '#0369a1', padding: '1px 6px', borderRadius: '8px', cursor: 'default' }}>
                                            🛡️ {SHIELD_LEVELS.find(l => l.value === normalizeShieldLevel(family.shield_level))?.label || 'Skjermet'}
                                        </span>
                                    )}
                                    {vervList.map(v => (
                                        <span key={v.name} style={{ fontSize: '10px', background: '#ede9fe', color: '#5b21b6', padding: '1px 6px', borderRadius: '8px', fontWeight: '600' }}>{v.name}</span>
                                    ))}
                                    {/* Preference profile icons */}
                                    {(() => {
                                      const fp = familyPrefsMap[family.id];
                                      const icons = [
                                        { key: 'pref_kiosk', icon: '\u{1F6D2}', label: 'kiosk' },
                                        { key: 'pref_practical', icon: '\u{1F527}', label: 'praktisk' },
                                        { key: 'pref_transport', icon: '\u{1F697}', label: 'transport' },
                                        { key: 'pref_arrangement', icon: '\u{1F4CB}', label: 'arrangement' },
                                        { key: 'pref_security', icon: '\u{1F512}', label: 'sikkerhet' },
                                      ];
                                      const activeLabels = fp ? icons.filter(i => fp[i.key]).map(i => i.label) : [];
                                      const timeLabels: string[] = [];
                                      if (fp?.pref_weekdays) timeLabels.push('hverdager');
                                      if (fp?.pref_weekends) timeLabels.push('helger');
                                      if (fp?.pref_mornings) timeLabels.push('formiddag');
                                      if (fp?.pref_evenings) timeLabels.push('kveld');
                                      const tooltip = activeLabels.length > 0
                                        ? `Foretrekker: ${activeLabels.join(', ')}${timeLabels.length > 0 ? ` \u00B7 Tilgjengelig: ${timeLabels.join(', ')}` : ''}`
                                        : 'Ingen profil satt';
                                      return (
                                        <span title={tooltip} style={{ display: 'inline-flex', gap: '2px', fontSize: '14px', marginLeft: 4 }}>
                                          {icons.map(i => (
                                            <span key={i.key} style={{ opacity: fp && fp[i.key] ? 1.0 : 0.25 }}>{i.icon}</span>
                                          ))}
                                        </span>
                                      );
                                    })()}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {parents.map(p => p.name).join(', ') || 'Ingen foresatte'}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {(() => {
                                const shieldPts = getShieldStartPoints(family);
                                const totalWithShield = family.total_points + vervPoints(family.verv) + shieldPts;
                                return (
                                    <span style={{ fontSize: '12px', background: shieldPts > 0 ? '#e0f2fe' : '#ebf8ff', color: shieldPts > 0 ? '#0369a1' : '#2b6cb0', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {totalWithShield}p {shieldPts > 0 && '🛡️'}
                                    </span>
                                );
                            })()}
                            {getShieldStartPoints(family) > 0 && (
                                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>(inkl. {getShieldStartPoints(family)} startpoeng)</span>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setShieldEditFamily(family); setShieldForm({ level: normalizeShieldLevel(family.shield_level), reason: family.shield_reason || '' }); }}
                                title="Skjerming"
                                style={{ fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', opacity: isFamilyShielded(family) ? 1 : 0.4 }}
                            >🛡️</button>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{family.members.length} pers</span>
                        </div>
                    </div>

                    {/* Utvidet innhold */}
                    {isExpanded && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid #e5e7eb' }}>

                    {/* Handlingsrad */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {family.import_code && (
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Kode: <span style={{ fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>{family.import_code}</span></span>
                            )}
                            {vervPoints(family.verv) > 0 && (
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({family.total_points} dugnad + {vervPoints(family.verv)} verv)</span>
                            )}
                        </div>
                        <button onClick={() => handleDeleteFamily(family.id)} className="btn" style={{ fontSize: '11px', color: '#ef4444', border: '1px solid #fecaca', background: '#fff5f5', padding: '4px 12px' }}>Slett familie</button>
                    </div>

                    <div style={{display:'grid', gridTemplateColumns: '2fr 1fr', gap: '32px'}}>
                        {/* FORESATTE */}
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                                <div style={{fontSize:'11px', fontWeight:'700', color:'#6b7280', textTransform:'uppercase'}}>Foresatte</div>
                                <button onClick={() => setEditingMember({ family_id: family.id, role: 'parent', name: '' } as any)} style={{fontSize:'11px', color:'#2563eb', background:'none', border:'none', cursor:'pointer'}}>+ Legg til</button>
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                {parents.map(p => {
                                    const isTrainer = parseVerv(family.verv).some(v => v.name === 'Trener' || v.name === 'Hovedtrener');
                                    return (
                                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f9fafb', padding:'10px', borderRadius:'6px', border:'1px solid #e5e7eb' }}>
                                        <div onClick={() => setEditingMember(p)} style={{cursor:'pointer', flex:1}}>
                                            <div style={{fontWeight:'600', fontSize:'14px'}}>👤 {p.name}</div>
                                            <div style={{fontSize:'12px', color:'#6b7280'}}>{p.email || '-'} • {p.phone || '-'}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button onClick={() => toggleParentTrainer(family.id, p.name)} title={isTrainer ? 'Fjern trener-status' : 'Sett som trener'} style={{ fontSize: '14px', padding: '4px 8px', borderRadius: '6px', border: '1px solid ' + (isTrainer ? '#7c3aed' : '#e5e7eb'), background: isTrainer ? '#ede9fe' : 'white', cursor: 'pointer', color: isTrainer ? '#7c3aed' : '#9ca3af' }}>
                                                {isTrainer ? '🏅' : '🎓'}
                                            </button>
                                            <button onClick={() => handleDeleteMember(p.id)} style={{color:'#ef4444', border:'none', background:'none', cursor:'pointer'}}>×</button>
                                        </div>
                                    </div>
                                    );
                                })}
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
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <div onClick={() => setEditingMember(c)} style={{fontWeight:'500', fontSize:'14px', cursor:'pointer'}}>🏃‍♂️ {c.name}</div>
                                                <button onClick={() => showChildOverview(c.name, family.id)} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-secondary)' }}>📊</button>
                                            </div>
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
                                                        background: 'var(--bg-secondary)',
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

                    {/* SKJERMING & VERV */}
                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Skjerming & verv</div>
                            <button
                                onClick={() => { setShieldEditFamily(family); setShieldForm({ level: normalizeShieldLevel(family.shield_level), reason: family.shield_reason || '' }); }}
                                className="btn" style={{ padding: '4px 12px', fontSize: '11px', background: isFamilyShielded(family) ? '#e0f2fe' : '#f9fafb', color: isFamilyShielded(family) ? '#0369a1' : '#6b7280', border: `1px solid ${isFamilyShielded(family) ? '#0369a1' : '#e5e7eb'}` }}
                            >
                                {isFamilyShielded(family) ? `🛡️ ${SHIELD_LEVELS.find(l => l.value === normalizeShieldLevel(family.shield_level))?.label || 'Skjermet'}` : 'Sett skjerming'}
                            </button>
                        </div>

                        {family.shield_reason && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: '#fefce8', padding: '8px 12px', borderRadius: '6px', marginBottom: '10px', fontStyle: 'italic', border: '1px solid #fef08a' }}>
                                🔒 {family.shield_reason}
                            </div>
                        )}

                        {/* Verv */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                            {parseVerv(family.verv).map(v => (
                                <span key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', background: '#ede9fe', color: '#5b21b6', fontWeight: '600', border: '1px solid #c4b5fd' }}>
                                    {v.name} <span style={{ fontSize: '10px', opacity: 0.7 }}>+{v.points}p</span>
                                    <button onClick={() => handleRemoveVerv(family.id, v.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: '14px', padding: 0, lineHeight: 1 }}>×</button>
                                </span>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {VERV_SUGGESTIONS.filter(s => !parseVerv(family.verv).some(v => v.name === s.name)).map(s => (
                                <button key={s.name} onClick={() => handleAddVerv(family.id, s.name, s.points)} style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', background: 'var(--card-bg, white)', border: '1px dashed #d1d5db', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    + {s.name} ({s.points}p{s.exempt ? ', skjermet' : ''})
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* FAMILIENS PREFERANSER (sendt inn av familien) */}
                    {(family.pref_unavailable_days || family.pref_time_of_day || family.pref_single_parent || family.pref_special_considerations || family.pref_can_help_with) && (
                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px' }}>Familiens preferanser</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                {parseJsonArray(family.pref_unavailable_days).length > 0 && (
                                    <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                        <strong>Kan ikke:</strong> {parseJsonArray(family.pref_unavailable_days).join(', ')}
                                    </div>
                                )}
                                {parseJsonArray(family.pref_time_of_day).length > 0 && (
                                    <div style={{ padding: '8px 12px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                        <strong>Passer best:</strong> {parseJsonArray(family.pref_time_of_day).join(', ')}
                                    </div>
                                )}
                                {family.pref_single_parent && (
                                    <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                        <strong>Eneforsørger</strong> — redusert kapasitet
                                    </div>
                                )}
                                {family.pref_special_considerations && (
                                    <div style={{ padding: '8px 12px', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', gridColumn: family.pref_can_help_with ? 'auto' : '1 / -1' }}>
                                        <strong>Hensyn:</strong> {family.pref_special_considerations}
                                    </div>
                                )}
                                {family.pref_can_help_with && (
                                    <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                        <strong>Kan hjelpe med:</strong> {family.pref_can_help_with}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* VAKTPREFERANSER (koordinator-styrt) */}
                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>Vaktpreferanser</div>
                        {(() => {
                            const prefs = parsePrefs(family.shift_preferences);
                            return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {ALL_SHIFT_TYPES.map(shift => {
                                        const isPref = prefs.preferred.includes(shift);
                                        const isAvoid = prefs.avoided.includes(shift);
                                        return (
                                            <div key={shift} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '20px', fontSize: '12px', border: isPref ? '2px solid #10b981' : isAvoid ? '2px solid #ef4444' : '1px solid #e5e7eb', background: isPref ? '#ecfdf5' : isAvoid ? '#fef2f2' : 'white', color: isPref ? '#065f46' : isAvoid ? '#991b1b' : '#374151' }}>
                                                <span style={{ fontWeight: '500' }}>{shift}</span>
                                                <button onClick={() => handleTogglePref(family.id, shift, 'preferred')} title="Foretrekker" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '14px', opacity: isPref ? 1 : 0.3 }}>👍</button>
                                                <button onClick={() => handleTogglePref(family.id, shift, 'avoided')} title="Vil unngå" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '14px', opacity: isAvoid ? 1 : 0.3 }}>👎</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                    </div>
                    )}
                </div>
            );
        })}
      </div>

      {/* SKJERMING MODAL */}
      {shieldEditFamily && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div className="card" style={{ width: '380px', padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px' }}>Skjerming for {(() => { const ch = shieldEditFamily.members.filter(m => m.role === 'child'); return ch.length > 0 ? ch.map(c => c.name).join(' & ') : shieldEditFamily.name; })()}</h3>
                      <button onClick={() => setShieldEditFamily(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                      <div>
                          <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Skjermingsnivå</label>
                          <select
                              className="input"
                              value={shieldForm.level}
                              onChange={e => setShieldForm({ ...shieldForm, level: parseInt(e.target.value) })}
                              style={{ width: '100%', padding: '10px 12px', fontSize: '14px' }}
                          >
                              {SHIELD_LEVELS.map(l => (
                                  <option key={l.value} value={l.value}>
                                      {l.label}{l.shield_start_points > 0 ? ` (+${l.shield_start_points} startpoeng)` : ''}
                                  </option>
                              ))}
                          </select>
                      </div>

                      {shieldForm.level > 0 && (
                          <div style={{ padding: '10px 12px', background: '#e0f2fe', borderRadius: '8px', fontSize: '12px', color: '#0369a1', border: '1px solid #bae6fd' }}>
                              🛡️ Startpoeng: <strong>{SHIELD_LEVELS.find(l => l.value === shieldForm.level)?.shield_start_points || 0}p</strong>
                          </div>
                      )}

                      <div>
                          <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Årsak (valgfritt)</label>
                          <textarea
                              className="input"
                              value={shieldForm.reason}
                              onChange={e => setShieldForm({ ...shieldForm, reason: e.target.value })}
                              placeholder="F.eks. lagleder, trener, medisinsk grunn..."
                              rows={3}
                              style={{ resize: 'vertical' }}
                          />
                      </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setShieldEditFamily(null)} className="btn">Lukk</button>
                      <button onClick={handleSaveShield} className="btn btn-primary">Lagre</button>
                  </div>
              </div>
          </div>
      )}

      {/* INVITASJONSTEKST MODAL */}
      {showInviteModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
              <div className="card" style={{ width: '600px', maxHeight: '80vh', overflow: 'auto', padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px' }}>📋 Invitasjonstekst</h3>
                      <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Kopier teksten under og lim inn i Spond, WhatsApp eller SMS til foresatte.</p>
                  <textarea
                      readOnly
                      value={generateInviteText()}
                      style={{ width: '100%', minHeight: '300px', padding: '16px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                      <button onClick={() => setShowInviteModal(false)} className="btn">Lukk</button>
                      <button onClick={() => { navigator.clipboard.writeText(generateInviteText()); alert('Kopiert til utklippstavle!'); }} className="btn btn-primary">📋 Kopier til utklippstavle</button>
                  </div>
              </div>
          </div>
      )}

      {/* DUGNADSOVERSIKT MODAL */}
      {childOverview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '500px', maxHeight: '80vh', overflow: 'auto', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>📊 Dugnadsoversikt — {childOverview.name}</h3>
              <button onClick={() => setChildOverview(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
            </div>
            {childOverview.assignments.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>Ingen vakter registrert ennå.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-primary)' }}>{childOverview.assignments.length}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Vakter totalt</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{childOverview.assignments.filter((a: any) => a.status === 'completed').length}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fullført</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{childOverview.assignments.filter((a: any) => a.status === 'assigned').length}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Kommende</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {childOverview.assignments.map((a: any) => (
                    <div key={a.id} style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>{a.shifts?.name || 'Vakt'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{a.shifts?.events?.name} · {a.shifts?.events?.date ? new Date(a.shifts.events.date).toLocaleDateString('nb-NO') : ''}</div>
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', fontWeight: '600', background: a.status === 'completed' ? '#dcfce7' : a.status === 'missed' ? '#fee2e2' : '#fef3c7', color: a.status === 'completed' ? '#166534' : a.status === 'missed' ? '#991b1b' : '#92400e' }}>
                        {a.status === 'completed' ? '✅ Fullført' : a.status === 'missed' ? '❌ Ikke møtt' : '📅 Kommende'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EDIT/ADD MODAL */}
      {editingMember && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div className="card" style={{ width: '450px', padding: '28px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px' }}>{editingMember.id ? 'Rediger' : 'Ny'} {editingMember.role === 'parent' ? 'foresatt' : 'spiller'}</h3>
                      <button onClick={() => setEditingMember(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                      <div>
                          <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Fullt navn *</label>
                          <input className="input" value={editingMember.name} onChange={e => setEditingMember({...editingMember, name: e.target.value})} placeholder="Ola Nordmann" autoFocus />
                      </div>

                      {editingMember.role === 'parent' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Telefon</label>
                                <input className="input" value={editingMember.phone || ''} onChange={e => setEditingMember({...editingMember, phone: e.target.value})} placeholder="99 88 77 66" />
                            </div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>E-post</label>
                                <input className="input" type="email" value={editingMember.email || ''} onChange={e => setEditingMember({...editingMember, email: e.target.value})} placeholder="ola@mail.no" />
                            </div>
                          </div>
                      )}

                      {editingMember.role === 'child' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Fødselsår</label>
                                <input type="number" className="input" value={editingMember.birth_year || ''} onChange={e => setEditingMember({...editingMember, birth_year: parseInt(e.target.value)})} placeholder="2016" />
                            </div>
                            <div>
                                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Gruppe / lag</label>
                                <select className="input" value={editingMember.subgroup || ''} onChange={e => setEditingMember({...editingMember, subgroup: e.target.value})}>
                                    <option value="">Ingen gruppe</option>
                                    {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                          </div>
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