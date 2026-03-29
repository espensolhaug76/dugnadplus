import React, { useState, useEffect } from 'react';

interface Club {
  id: string;
  name: string;
  logoUrl?: string;
  sport: string;
}

export const ClubSelectionPage: React.FC = () => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Load clubs from localStorage
    // In real app, this would be API call
    const storedClub = localStorage.getItem('dugnad_club');
    if (storedClub) {
      setClubs([JSON.parse(storedClub)]);
    }
  }, []);

  const filteredClubs = clubs.filter((club) =>
    club.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectClub = (club: Club) => {
    localStorage.setItem('dugnad_selected_club', JSON.stringify(club));
    window.location.href = '/select-team';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Finn din klubb
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>
            Søk etter klubbnavn eller velg fra listen
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '24px' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            placeholder="🔍 Søk etter klubb..."
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Clubs List */}
        {filteredClubs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredClubs.map((club) => (
              <div
                key={club.id}
                onClick={() => handleSelectClub(club)}
                className="card"
                style={{
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  {/* Logo */}
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: 'var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '24px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    {club.name.substring(0, 2).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>{club.name}</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      {club.sport === 'football' ? '⚽ Fotball' : 
                       club.sport === 'handball' ? '🤾 Håndball' : 
                       club.sport === 'ishockey' ? '🏒 Ishockey' : 'Idrett'}
                    </p>
                  </div>

                  {/* Arrow */}
                  <div style={{ fontSize: '24px', color: 'var(--text-secondary)' }}>→</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>
              {searchTerm ? 'Ingen klubber funnet' : 'Ingen klubber tilgjengelig ennå'}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Kontakt din dugnadsansvarlig for klubbkode
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
