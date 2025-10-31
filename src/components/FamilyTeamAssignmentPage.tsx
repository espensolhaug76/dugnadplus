import React, { useState } from 'react';

export const FamilyTeamAssignmentPage: React.FC = () => {
  const clubData = JSON.parse(localStorage.getItem('selectedClubData') || '{}');
  const selectedTeams = JSON.parse(localStorage.getItem('selectedTeams') || '[]');
  const familyMembers = JSON.parse(localStorage.getItem('familyMembers') || '[]');
  const children = familyMembers.filter((m: any) => m.type === 'child');
  
  const [assignments, setAssignments] = useState<{[key: string]: string[]}>({});

  const toggleAssignment = (childId: string, teamId: string) => {
    const current = assignments[childId] || [];
    if (current.includes(teamId)) {
      setAssignments({
        ...assignments,
        [childId]: current.filter(t => t !== teamId)
      });
    } else {
      setAssignments({
        ...assignments,
        [childId]: [...current, teamId]
      });
    }
  };

  const completeRegistration = () => {
    const registrationData = {
      club: clubData,
      teams: selectedTeams,
      family: familyMembers,
      assignments: assignments
    };
    
    localStorage.setItem('familyRegistration', JSON.stringify(registrationData));
    alert('Familie registrert! 🎉 (Dashboard kommer snart)');
    window.location.href = '/';
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <button 
        onClick={() => window.location.href = '/family-members'}
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
          Fordel barna på lag
        </h1>
        
        <p style={{ fontSize: '1em', marginBottom: '30px', color: '#666' }}>
          Klikk for å velge/fjerne lag for hvert barn (barn kan være med i flere lag)
        </p>

        {children.map((child: any) => (
          <div key={child.id} style={{
            backgroundColor: 'white',
            padding: '25px',
            borderRadius: '12px',
            marginBottom: '25px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '1.3em', color: '#333', marginBottom: '5px' }}>
              {child.name}
            </h3>
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
              Født {child.birthYear} • {(assignments[child.id] || []).length} lag valgt
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedTeams.map((teamId: string) => {
                const isAssigned = (assignments[child.id] || []).includes(teamId);
                const [sport, ...teamParts] = teamId.split('-');
                const team = teamParts.join('-');
                
                return (
                  <button
                    key={teamId}
                    onClick={() => toggleAssignment(child.id, teamId)}
                    style={{
                      width: '100%',
                      backgroundColor: isAssigned ? '#e3f2fd' : '#f5f5f5',
                      border: isAssigned ? '2px solid #2196F3' : '2px solid #e0e0e0',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div>
                      <div style={{ 
                        fontSize: '16px', 
                        fontWeight: '600', 
                        color: isAssigned ? '#2196F3' : '#333',
                        marginBottom: '4px'
                      }}>
                        {team}
                      </div>
                      <div style={{ fontSize: '13px', color: '#666' }}>
                        {sport}
                      </div>
                    </div>
                    <div style={{ 
                      fontSize: '24px', 
                      color: isAssigned ? '#2196F3' : '#ccc',
                      fontWeight: 'bold'
                    }}>
                      {isAssigned ? '✓' : '○'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <button
          onClick={completeRegistration}
          style={{
            width: '100%',
            backgroundColor: '#4CAF50',
            color: 'white',
            padding: '18px',
            border: 'none',
            borderRadius: '12px',
            fontSize: '18px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
            marginTop: '10px',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
          }}
        >
          Fullfør registrering 🎉
        </button>

        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#e3f2fd',
          borderRadius: '10px',
          fontSize: '14px',
          color: '#666',
          textAlign: 'center'
        }}>
          💡 Tips: Klikk på lagene for å velge/fjerne. Barn kan være med i flere lag!
        </div>
      </div>
    </div>
  );
};