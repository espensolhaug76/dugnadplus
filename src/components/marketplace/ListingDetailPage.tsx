import React, { useState, useEffect } from 'react';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  size: string;
  image: string;
  sellerName: string;
  sellerId: string;
  status: 'active' | 'sold';
  createdAt: string;
  messages?: Message[];
}

const CATEGORY_ICONS: Record<string, string> = {
  'Sko': '👟', 'Treningsklær': '👕', 'Sportsutstyr': '⚽',
  'Vesker': '🎒', 'Verneutstyr': '🦺', 'Annet': '📦'
};

const getListingIdFromUrl = (): string => {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || '';
};

const getCurrentUser = () => {
  const stored = localStorage.getItem('dugnad_user');
  if (!stored) return { id: 'anonymous', name: 'Anonym' };
  try {
    const parsed = JSON.parse(stored);
    return { id: parsed.id || parsed.email || 'anonymous', name: parsed.name || parsed.email || 'Anonym' };
  } catch (e) {
    return { id: 'anonymous', name: 'Anonym' };
  }
};

export const ListingDetailPage: React.FC = () => {
  const [listing, setListing] = useState<Listing | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const listingId = getListingIdFromUrl();
  const currentUser = getCurrentUser();

  useEffect(() => {
    loadListing();
  }, []);

  const loadListing = () => {
    const stored = localStorage.getItem('dugnad_marketplace');
    if (!stored) return;
    try {
      const listings: Listing[] = JSON.parse(stored);
      const found = listings.find(l => l.id === listingId);
      if (found) setListing(found);
    } catch (e) {}
  };

  const saveListing = (updated: Listing) => {
    const stored = localStorage.getItem('dugnad_marketplace');
    if (!stored) return;
    const listings: Listing[] = JSON.parse(stored);
    const index = listings.findIndex(l => l.id === updated.id);
    if (index !== -1) {
      listings[index] = updated;
      localStorage.setItem('dugnad_marketplace', JSON.stringify(listings));
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !listing) return;

    const message: Message = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      text: newMessage.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = { ...listing, messages: [...(listing.messages || []), message] };
    setListing(updated);
    saveListing(updated);
    setNewMessage('');
  };

  const handleMarkSold = () => {
    if (!listing) return;
    if (!confirm(`Marker "${listing.title}" som solgt for ${listing.price} kr?\n\nSelger mottar ${Math.round(listing.price * 0.05)} dugnadspoeng (5%).`)) return;

    const updated = { ...listing, status: 'sold' as const };
    saveListing(updated);
    setListing(updated);

    // Legg til dugnadspoeng til selger
    const pointsEarned = Math.round(listing.price * 0.05);
    const storedFamilies = localStorage.getItem('dugnad_families_points');
    const familyPoints: Record<string, number> = storedFamilies ? JSON.parse(storedFamilies) : {};
    familyPoints[listing.sellerId] = (familyPoints[listing.sellerId] || 0) + pointsEarned;
    localStorage.setItem('dugnad_families_points', JSON.stringify(familyPoints));

    alert(`Annonsen er markert som solgt! ${listing.sellerName} mottar ${pointsEarned} dugnadspoeng.`);
  };

  if (!listing) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '18px' }}>Fant ikke annonsen.</p>
        <button onClick={() => window.location.href = '/marketplace'} className="btn btn-primary" style={{ marginTop: '16px' }}>
          Tilbake til marked
        </button>
      </div>
    );
  }

  const isOwner = currentUser.id === listing.sellerId;
  const messages = listing.messages || [];

  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/marketplace'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>
        ← Tilbake til marked
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Venstre: Bilde */}
        <div>
          <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg-secondary)', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {listing.image ? (
              <img src={listing.image} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '72px' }}>{CATEGORY_ICONS[listing.category] || '📦'}</span>
            )}
          </div>
        </div>

        {/* Høyre: Detaljer */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', background: listing.status === 'sold' ? '#fee2e2' : '#dcfce7', color: listing.status === 'sold' ? '#991b1b' : '#166534', fontWeight: '600' }}>
              {listing.status === 'sold' ? 'Solgt' : 'Til salgs'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Lagt ut {new Date(listing.createdAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--text-primary)' }}>{listing.title}</h1>
          <p style={{ fontSize: '32px', fontWeight: '800', color: 'var(--color-primary)', margin: '0 0 16px 0' }}>{listing.price} kr</p>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary)' }}>
            <span>{CATEGORY_ICONS[listing.category] || ''} {listing.category}</span>
            {listing.size && <span>Str. {listing.size}</span>}
          </div>

          {listing.description && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Beskrivelse</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{listing.description}</p>
            </div>
          )}

          <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Selger</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{listing.sellerName}</div>
          </div>

          {listing.status === 'active' && (
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '13px', color: '#166534', marginBottom: '16px' }}>
              🏆 Selger mottar <strong>{Math.round(listing.price * 0.05)} dugnadspoeng</strong> ved salg (5%)
            </div>
          )}

          {isOwner && listing.status === 'active' && (
            <button onClick={handleMarkSold} className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px' }}>
              Marker som solgt
            </button>
          )}
        </div>
      </div>

      {/* Meldinger */}
      <div className="card" style={{ padding: '24px', marginTop: '32px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', margin: '0 0 16px 0' }}>
          Meldinger ({messages.length})
        </h3>

        {messages.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Ingen meldinger ennå. Send en melding til {isOwner ? 'interesserte kjøpere' : 'selgeren'}!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px', maxHeight: '400px', overflowY: 'auto' }}>
            {messages.map(msg => {
              const isMine = msg.senderId === currentUser.id;
              return (
                <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '70%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: isMine ? '#16a8b8' : '#f3f4f6',
                    color: isMine ? 'white' : '#1f2937'
                  }}>
                    {!isMine && <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', opacity: 0.7 }}>{msg.senderName}</div>}
                    <p style={{ margin: 0, fontSize: '14px' }}>{msg.text}</p>
                    <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                      {new Date(msg.createdAt).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
            placeholder={`Skriv en melding til ${isOwner ? 'kjøper' : 'selger'}...`}
            style={{ flex: 1 }}
          />
          <button onClick={handleSendMessage} className="btn btn-primary" style={{ padding: '10px 24px' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
