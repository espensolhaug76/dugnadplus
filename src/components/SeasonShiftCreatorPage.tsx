import React, { useState } from 'react';

interface ShiftRole {
  id: string;
  name: string;
  peopleNeeded: number;
  points: number;
}

interface GeneratedShift {
  date: Date;
  roles: ShiftRole[];
}

export const SeasonShiftCreatorPage: React.FC = () => {
  const [startDate, setStartDate] = useState('2025-03-01');
  const [endDate, setEndDate] = useState('2025-10-31');
  const [selectedDays, setSelectedDays] = useState<number[]>([6, 0]); // Saturday, Sunday
  const [roles, setRoles] = useState<ShiftRole[]>([
    { id: '1', name: 'Kioskvakt', peopleNeeded: 2, points: 3 },
    { id: '2', name: 'Banekeeper', peopleNeeded: 1, points: 2 },
    { id: '3', name: 'Inngang/Billett', peopleNeeded: 2, points: 2 },
  ]);
  const [showPreview, setShowPreview] = useState(false);

  const dayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];

  const toggleDay = (dayIndex: number) => {
    if (selectedDays.includes(dayIndex)) {
      setSelectedDays(selectedDays.filter(d => d !== dayIndex));
    } else {
      setSelectedDays([...selectedDays, dayIndex].sort());
    }
  };

  const addRole = () => {
    const newId = (Math.max(...roles.map(r => parseInt(r.id))) + 1).toString();
    setRoles([...roles, { id: newId, name: '', peopleNeeded: 1, points: 1 }]);
  };

  const updateRole = (id: string, field: keyof ShiftRole, value: any) => {
    setRoles(roles.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeRole = (id: string) => {
    setRoles(roles.filter(r => r.id !== id));
  };

  const generateShifts = (): GeneratedShift[] => {
    const shifts: GeneratedShift[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      if (selectedDays.includes(date.getDay())) {
        shifts.push({
          date: new Date(date),
          roles: [...roles]
        });
      }
    }
    
    return shifts;
  };

  const generatedShifts = showPreview ? generateShifts() : [];
  const totalShifts = generatedShifts.length;
  const totalSlots = generatedShifts.reduce((sum, shift) => 
    sum + shift.roles.reduce((roleSum, role) => roleSum + role.peopleNeeded, 0), 0
  );

  const createAllShifts = () => {
    const shifts = generateShifts();
    localStorage.setItem('seasonShifts', JSON.stringify(shifts));
    alert(`${shifts.length} vakter opprettet! 🎉`);
    window.location.href = '/dashboard';
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/dashboard'}
        style={{
          background: 'none',
          border: 'none',
          color: '#333',
          fontSize: '24px',
          cursor: 'pointer',
          padding: '10px',
          marginBottom: '20px'
        }}
      >
        ←
      </button>

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2.5em', marginBottom: '10px', color: '#333' }}>
          📅 Legg inn vakter for sesongen
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Opprett alle dugnadvakter for hele sesongen på én gang
        </p>

        {/* Date Range */}
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.3em', marginBottom: '20px', color: '#333' }}>
            1️⃣ Velg sesongperiode
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#555' }}>
                Startdato:
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#555' }}>
                Sluttdato:
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>

        {/* Day Selection */}
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.3em', marginBottom: '20px', color: '#333' }}>
            2️⃣ Velg kampdager
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            {dayNames.map((day, index) => {
              const isSelected = selectedDays.includes(index);
              return (
                <button
                  key={index}
                  onClick={() => toggleDay(index)}
                  style={{
                    padding: '14px',
                    border: isSelected ? '2px solid #2196F3' : '2px solid #e0e0e0',
                    backgroundColor: isSelected ? '#e3f2fd' : 'white',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: isSelected ? '#2196F3' : '#666',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {day}
                  {isSelected && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Roles */}
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.3em', marginBottom: '20px', color: '#333' }}>
            3️⃣ Definer roller
          </h3>
          
          {roles.map((role) => (
            <div key={role.id} style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr auto',
              gap: '10px',
              alignItems: 'center',
              marginBottom: '12px',
              padding: '12px',
              backgroundColor: '#f9f9f9',
              borderRadius: '8px'
            }}>
              <input
                type="text"
                placeholder="Rollenavn (f.eks. Kioskvakt)"
                value={role.name}
                onChange={(e) => updateRole(role.id, 'name', e.target.value)}
                style={{
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
              
              <input
                type="number"
                placeholder="Antall"
                value={role.peopleNeeded}
                onChange={(e) => updateRole(role.id, 'peopleNeeded', parseInt(e.target.value))}
                min="1"
                style={{
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
              
              <input
                type="number"
                placeholder="Poeng"
                value={role.points}
                onChange={(e) => updateRole(role.id, 'points', parseInt(e.target.value))}
                min="1"
                style={{
                  padding: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '15px'
                }}
              />
              
              <button
                onClick={() => removeRole(role.id)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  backgroundColor: '#ffebee',
                  color: '#f44336',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          
          <button
            onClick={addRole}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px dashed #2196F3',
              backgroundColor: 'transparent',
              color: '#2196F3',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '10px'
            }}
          >
            ➕ Legg til rolle
          </button>
        </div>

        {/* Preview */}
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '12px',
          marginBottom: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ fontSize: '1.3em', marginBottom: '20px', color: '#333' }}>
            4️⃣ Forhåndsvisning
          </h3>
          
          {!showPreview ? (
            <button
              onClick={() => setShowPreview(true)}
              style={{
                width: '100%',
                padding: '16px',
                border: 'none',
                backgroundColor: '#2196F3',
                color: 'white',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              👁️ Vis forhåndsvisning
            </button>
          ) : (
            <>
              <div style={{
                padding: '20px',
                backgroundColor: '#e3f2fd',
                borderRadius: '10px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333', marginBottom: '10px' }}>
                  📊 Oppsummering
                </div>
                <div style={{ fontSize: '16px', color: '#666', lineHeight: '1.8' }}>
                  • <strong>{totalShifts}</strong> vakter vil bli opprettet<br/>
                  • <strong>{totalSlots}</strong> totalt antall plasser<br/>
                  • Periode: {new Date(startDate).toLocaleDateString('nb-NO')} - {new Date(endDate).toLocaleDateString('nb-NO')}<br/>
                  • Dager: {selectedDays.map(d => dayNames[d]).join(', ')}
                </div>
              </div>

              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '15px'
              }}>
                {generatedShifts.slice(0, 10).map((shift, idx) => (
                  <div key={idx} style={{
                    padding: '12px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '6px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '6px' }}>
                      {shift.date.toLocaleDateString('nb-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '14px', color: '#666' }}>
                      {shift.roles.map(r => `${r.name} (${r.peopleNeeded} personer)`).join(', ')}
                    </div>
                  </div>
                ))}
                {generatedShifts.length > 10 && (
                  <div style={{ textAlign: 'center', color: '#999', fontSize: '14px', marginTop: '10px' }}>
                    ... og {generatedShifts.length - 10} vakter til
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    border: '2px solid #e0e0e0',
                    backgroundColor: 'white',
                    color: '#666',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ← Tilbake
                </button>
                
                <button
                  onClick={createAllShifts}
                  style={{
                    flex: 2,
                    padding: '16px',
                    border: 'none',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)'
                  }}
                >
                  ✓ Opprett alle vakter ({totalShifts})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};