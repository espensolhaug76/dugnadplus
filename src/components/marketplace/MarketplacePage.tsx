import React, { useState, useEffect } from 'react';

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
  listingType?: 'sell' | 'free' | 'wanted';
  createdAt: string;
}

const CATEGORIES = ['Alle', 'Sko', 'Treningsklær', 'Sportsutstyr', 'Vesker', 'Verneutstyr', 'Annet'];
const TYPE_FILTERS = ['Alle typer', 'Til salgs', 'Gis bort', 'Ønskes'];

const CATEGORY_ICONS: Record<string, string> = {
  'Sko': '👟',
  'Treningsklær': '👕',
  'Sportsutstyr': '⚽',
  'Vesker': '🎒',
  'Verneutstyr': '🦺',
  'Annet': '📦'
};

const TYPE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  'sell': { label: 'Til salgs', bg: '#dbeafe', color: '#1e40af' },
  'free': { label: 'Gis bort', bg: '#dcfce7', color: '#166534' },
  'wanted': { label: 'Ønskes', bg: '#fef3c7', color: '#92400e' },
};

export const MarketplacePage: React.FC = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [selectedType, setSelectedType] = useState('Alle typer');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('dugnad_marketplace');
    if (stored) {
      try {
        setListings(JSON.parse(stored));
      } catch (e) {}
    }
  }, []);

  const filtered = listings
    .filter(l => l.status === 'active')
    .filter(l => selectedCategory === 'Alle' || l.category === selectedCategory)
    .filter(l => {
      if (selectedType === 'Alle typer') return true;
      if (selectedType === 'Til salgs') return (l.listingType || 'sell') === 'sell';
      if (selectedType === 'Gis bort') return l.listingType === 'free';
      if (selectedType === 'Ønskes') return l.listingType === 'wanted';
      return true;
    })
    .filter(l => !selectedGender || (l as any).gender === selectedGender)
    .filter(l => !selectedSize || (l.size && l.size.toLowerCase().includes(selectedSize.toLowerCase())))
    .filter(l => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={{ background: '#faf8f4', minHeight: '100vh' }}>
      <div style={{ padding: '20px 24px 40px', maxWidth: '900px', margin: '0 auto' }}>
        {/* Back button */}
        <button
          onClick={() => window.location.href = '/coordinator-dashboard'}
          style={{ background: 'none', border: 'none', color: '#6b7f70', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '18px', display: 'block' }}
        >
          ← Tilbake til dashbordet
        </button>

        {/* Active header */}
        <div style={{
          background: '#1e3a2f',
          borderRadius: '14px',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '28px'
        }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 4px 0', color: '#ffffff' }}>Marked</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, fontSize: '13px' }}>Kjøp og selg sportsutstyr innad i klubben. 5% av salgspris gis som dugnadspoeng.</p>
          </div>
          <button
            onClick={() => window.location.href = '/marketplace/create'}
            style={{
              background: '#7ec8a0',
              color: '#1e3a2f',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            + Legg ut annonse
          </button>
        </div>

        {/* Search */}
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Søk etter utstyr..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '13px',
              border: '0.5px solid #dedddd',
              borderRadius: '8px',
              background: '#ffffff',
              color: '#1a2e1f',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Category section label */}
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Kategori</div>

        {/* Category filter pills */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '7px 16px',
                fontSize: '13px',
                borderRadius: '24px',
                background: selectedCategory === cat ? '#2d6a4f' : '#ffffff',
                color: selectedCategory === cat ? '#ffffff' : '#4a5e50',
                border: selectedCategory === cat ? '0.5px solid #2d6a4f' : '0.5px solid #dedddd',
                fontWeight: selectedCategory === cat ? '600' : '400',
                cursor: 'pointer'
              }}
            >
              {cat !== 'Alle' && `${CATEGORY_ICONS[cat] || ''} `}{cat}
            </button>
          ))}
        </div>

        {/* Type section label */}
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#4a5e50', textTransform: 'uppercase' as const, marginBottom: '8px' }}>Type</div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {TYPE_FILTERS.map(t => (
            <button key={t} onClick={() => setSelectedType(t)} style={{
              padding: '6px 14px', fontSize: '12px', borderRadius: '20px',
              background: selectedType === t ? '#2d6a4f' : '#ffffff',
              color: selectedType === t ? '#ffffff' : '#6b7f70',
              border: selectedType === t ? '0.5px solid #2d6a4f' : '0.5px solid #dedddd',
              fontWeight: selectedType === t ? '600' : '400',
              cursor: 'pointer'
            }}>{t}</button>
          ))}
        </div>

        {/* Gender / size filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', alignItems: 'center' }}>
          <select
            value={selectedGender}
            onChange={e => setSelectedGender(e.target.value)}
            style={{
              width: '140px', fontSize: '13px', padding: '7px 10px',
              border: '0.5px solid #dedddd', borderRadius: '8px',
              background: '#ffffff', color: '#1a2e1f', outline: 'none'
            }}
          >
            <option value="">Alle kjønn</option>
            <option value="gutt">Gutt</option>
            <option value="jente">Jente</option>
            <option value="unisex">Unisex</option>
          </select>
          <input
            value={selectedSize}
            onChange={e => setSelectedSize(e.target.value)}
            placeholder="Filtrer størrelse..."
            style={{
              width: '160px', fontSize: '13px', padding: '7px 10px',
              border: '0.5px solid #dedddd', borderRadius: '8px',
              background: '#ffffff', color: '#1a2e1f', outline: 'none'
            }}
          />
          {(selectedGender || selectedSize) && (
            <button onClick={() => { setSelectedGender(''); setSelectedSize(''); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Nullstill</button>
          )}
        </div>

        {/* Listing grid */}
        {filtered.length === 0 ? (
          listings.length === 0 ? (
            /* Full empty state when no listings exist */
            <>
              <div style={{ background: '#1e3a2f', borderRadius: '12px', padding: '32px 28px', textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: '#7ec8a0', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: '600', marginBottom: '10px' }}>🏪 Marked</div>
                <h1 style={{ fontSize: '22px', fontWeight: '500', color: '#fff', margin: '0 0 10px' }}>Kjøp og selg brukt sportsutstyr <span style={{ color: '#7ec8a0' }}>i laget</span></h1>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.65', margin: '0 auto 20px', maxWidth: '520px' }}>Familiene legger ut utstyr de ikke bruker lenger — sko, klær, baller og annet. Andre familier i laget kjøper det. Enkelt, bærekraftig og billigere enn nytt.</p>
                <button onClick={() => window.location.href = '/marketplace/create'} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Legg ut første annonse</button>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '10px' }}>Åpent for alle familier i laget</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { icon: '📸', title: 'Legg ut på 2 minutter', desc: 'Bilde, beskrivelse og pris. Annonsen er synlig for alle familier i laget med én gang.' },
                  { icon: '💬', title: 'Chat direkte', desc: 'Kjøper og selger avtaler levering direkte i chatten — ingen mellommann.' },
                  { icon: '🏷️', title: 'Kategorier', desc: 'Sko, klær, utstyr og mer. Lett å finne det du leter etter.' },
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
            /* No results for current filter */
            <div style={{ background: '#fff', border: '0.5px solid #dedddd', borderRadius: '10px', padding: '32px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
              <p style={{ color: '#4a5e50', fontSize: '13px', margin: 0 }}>Ingen annonser matcher søket ditt.</p>
            </div>
          )
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
            {filtered.map(listing => (
              <div
                key={listing.id}
                onClick={() => window.location.href = `/marketplace/${listing.id}`}
                style={{
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  background: '#ffffff',
                  border: '0.5px solid #dedddd',
                  borderRadius: '8px'
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
              >
                <div style={{ width: '100%', height: '180px', background: '#f0eee9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {listing.listingType && listing.listingType !== 'sell' && (
                    <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '10px', background: TYPE_BADGES[listing.listingType]?.bg || '#e5e7eb', color: TYPE_BADGES[listing.listingType]?.color || '#374151', zIndex: 1 }}>
                      {TYPE_BADGES[listing.listingType]?.label}
                    </span>
                  )}
                  {listing.image ? (
                    <img src={listing.image} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '48px' }}>{CATEGORY_ICONS[listing.category] || '📦'}</span>
                  )}
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#1a2e1f', flex: 1 }}>{listing.title}</h3>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: listing.listingType === 'free' ? '#2d6a4f' : listing.listingType === 'wanted' ? '#92400e' : '#2d6a4f', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                      {listing.listingType === 'free' ? 'Gratis' : listing.listingType === 'wanted' ? 'Ønskes' : `${listing.price} kr`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#6b7f70' }}>
                    <span>{CATEGORY_ICONS[listing.category] || ''} {listing.category}{listing.size ? ` · Str. ${listing.size}` : ''}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7f70', marginTop: '8px' }}>
                    Selger: {listing.sellerName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
