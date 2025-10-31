import React, { useState } from 'react';

interface FamilyMember {
  id: string;
  type: 'parent' | 'child';
  name: string;
  email?: string;
  phone?: string;
  birthYear?: string;
}

export const FamilyMembersPage: React.FC = () => {
  const clubData = JSON.parse(localStorage.getItem('selectedClubData') || '{}');
  const selectedTeams = JSON.parse(localStorage.getItem('selectedTeams') || '[]');
  
  const [members, setMembers] = useState<FamilyMember[]>([
    { id: '1', type: 'parent', name: '', email: '', phone: '' }
  ]);

  const addParent = () => {
    const newId = Date.now().toString();
    setMembers([...members, { id: newId, type: 'parent', name: '', email: '', phone: '' }]);
  };

  const addChild = () => {
    const newId = Date.now().toString();
    setMembers([...members, { id: newId, type: 'child', name: '', birthYear: '' }]);
  };

  const updateMember = (id: string, field: string, value: string) => {
    setMembers(members.map(m => 
      m.id === id ? { ...m, [field]: value } : m
    ));
  };

  const removeMember = (id: string) => {
    setMembers(members.filter(m => m.id !== id));
  };

  const continueToTeamAssignment = () => {
    const children = members.filter(m => m.type === 'child' && m.name.trim());
    
    if (children.length === 0) {
      alert('Legg til minst ett barn');
      return;
    }

    localStorage.setItem('familyMembers', JSON.stringify(members));
    window.location.href = '/family-team-assignment';
  };

  const parents = members.filter(m => m.type === 'parent');
  const children = members.filter(m => m.type === 'child');

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/family-team-selection'}
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

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2em', marginBottom: '10px', color: '#333' }}>
          Legg til familiemedlemmer
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Registrer alle i familien som skal delta i dugnader
        </p>

        {/* Parents Section */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '1.3em', color: '#333', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            👨‍👩 Foreldre/Foresatte
          </h3>
          
          {parents.map((parent, idx) => (
            <div key={parent.id} style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '15px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontWeight: '600', color: '#333' }}>
                  {idx === 0 ? 'Hovedkontakt' : 'Partner'}
                </span>
                {idx > 0 && (
                  <button
                    onClick={() => removeMember(parent.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f44336',
                      cursor: 'pointer',
                      fontSize: '20px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              
              <input
                type="text"
                placeholder="Fullt navn *"
                value={parent.name}
                onChange={(e) => updateMember(parent.id, 'name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  marginBottom: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
              
              <input
                type="email"
                placeholder="E-post *"
                value={parent.email}
                onChange={(e) => updateMember(parent.id, 'email', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  marginBottom: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
              
              <input
                type="tel"
                placeholder="Telefon *"
                value={parent.phone}
                onChange={(e) => updateMember(parent.id, 'phone', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          ))}
          
          {parents.length < 2 && (
            <button
              onClick={addParent}
              style={{
                width: '100%',
                backgroundColor: 'white',
                color: '#2196F3',
                border: '2px dashed #2196F3',
                borderRadius: '12px',
                padding: '14px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              ➕ Legg til partner
            </button>
          )}
        </div>

        {/* Children Section */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '1.3em', color: '#333', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            👶 Barn
          </h3>
          
          {children.map((child, idx) => (
            <div key={child.id} style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '15px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontWeight: '600', color: '#333' }}>Barn {idx + 1}</span>
                <button
                  onClick={() => removeMember(child.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#f44336',
                    cursor: 'pointer',
                    fontSize: '20px'
                  }}
                >
                  ✕
                </button>
              </div>
              
              <input
                type="text"
                placeholder="Fullt navn *"
                value={child.name}
                onChange={(e) => updateMember(child.id, 'name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  marginBottom: '10px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
              
              <input
                type="number"
                placeholder="Fødselsår *"
                value={child.birthYear}
                onChange={(e) => updateMember(child.id, 'birthYear', e.target.value)}
                min="2000"
                max="2025"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          ))}
          
          <button
            onClick={addChild}
            style={{
              width: '100%',
              backgroundColor: 'white',
              color: '#2196F3',
              border: '2px dashed #2196F3',
              borderRadius: '12px',
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            ➕ Legg til barn
          </button>
        </div>

        <button
          onClick={continueToTeamAssignment}
          style={{
            width: '100%',
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '18px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)'
          }}
        >
          Fortsett til lagfordeling →
        </button>
      </div>
    </div>
  );
};