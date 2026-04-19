import React, { useState } from 'react';
import { PremiumGateModal, hasPremium } from '../common/PremiumGateModal';

const CATEGORIES = ['Sko', 'Treningsklær', 'Sportsutstyr', 'Vesker', 'Verneutstyr', 'Annet'];

type ListingType = 'sell' | 'free' | 'wanted';

// Tillatte MIME-typer for markedsplass-bilder. SVG er eksplisitt IKKE i
// lista — SVG kan inneholde <script>-tagger og event-handlers som kan
// eksekvere når bildet rendres utenfor en <img>-tag (f.eks. i fremtidig
// liste-visning med <object>, <iframe> eller direkte data-URL-navigering).
// MIME-typen blir sjekket på File.type i tillegg til accept-attributtet,
// siden accept-attributtet bare er et klient-side hint og trivielt kan
// omgås i DevTools.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// 5 MB. Hevet fra 2 MB fordi moderne telefonkamera-bilder ofte er større,
// men stoppet godt under localStorage-quota (5-10 MB per origin i de
// fleste browsere) siden bildet lagres som base64 i localStorage.
// Post-pilot: skal migreres til Supabase Storage, se SECURITY_BACKLOG.md.
const MAX_MARKETPLACE_IMAGE_BYTES = 5 * 1024 * 1024;

export const CreateListingPage: React.FC = () => {
  const [listingType, setListingType] = useState<ListingType>('sell');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Sportsutstyr');
  const [size, setSize] = useState('');
  const [gender, setGender] = useState('');
  const [image, setImage] = useState('');
  const [imagePreview, setImagePreview] = useState('');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // MIME-type allowlist. Både blokkerer SVG eksplisitt og hindrer at
    // en angriper laster opp en HTML/JS-fil med bildenavn.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert(
        'Bildet må være i et av følgende formater: JPG, PNG, WebP eller GIF. ' +
        'SVG og andre filtyper er ikke tillatt.'
      );
      e.target.value = '';
      return;
    }

    if (file.size > MAX_MARKETPLACE_IMAGE_BYTES) {
      alert('Bildet er for stort. Maks 5 MB.');
      e.target.value = '';
      return;
    }

    // Canvas-redraw: stripper ALL metadata (EXIF, GPS, kommentarer,
    // ICC-profiler) fra bildet ved å tegne pikslene til et nytt canvas
    // og eksportere som ren JPEG. Dette forhindrer:
    // 1. EXIF-metadata med script i kommentarfelter (defence-in-depth)
    // 2. GPS-data som kan avsløre brukerens lokasjon (GDPR)
    // 3. Kamera-identifikasjon via EXIF-makernotes
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Begrens dimensjoner for å holde base64-størrelsen nede
      const MAX_DIM = 1200;
      let w = img.width;
      let h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      const cleanBase64 = canvas.toDataURL('image/jpeg', 0.85);
      setImage(cleanBase64);
      setImagePreview(cleanBase64);
    };
    img.src = URL.createObjectURL(file);
  };

  const [showPremiumGate, setShowPremiumGate] = useState(false);

  const handleSubmit = () => {
    if (!hasPremium()) { setShowPremiumGate(true); return; }
    if (!title.trim()) { alert('Fyll inn tittel.'); return; }
    if (listingType === 'sell' && (!price || parseFloat(price) <= 0)) { alert('Fyll inn en gyldig pris.'); return; }

    const user = localStorage.getItem('dugnad_user');
    let sellerName = 'Ukjent selger';
    let sellerId = 'unknown';
    if (user) {
      try {
        const parsed = JSON.parse(user);
        sellerName = parsed.name || parsed.email || 'Ukjent selger';
        sellerId = parsed.id || parsed.email || 'unknown';
      } catch (e) {}
    }

    const listing = {
      id: `listing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      description: description.trim(),
      price: listingType === 'free' ? 0 : (listingType === 'wanted' ? 0 : parseFloat(price)),
      category,
      size: size.trim(),
      gender: gender || null,
      image,
      sellerName,
      sellerId,
      listingType,
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      messages: []
    };

    const stored = localStorage.getItem('dugnad_marketplace');
    const listings = stored ? JSON.parse(stored) : [];
    listings.push(listing);
    localStorage.setItem('dugnad_marketplace', JSON.stringify(listings));

    alert('Annonsen er publisert!');
    window.location.href = '/marketplace';
  };

  return (
    <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
      <button onClick={() => window.location.href = '/marketplace'} className="btn btn-secondary" style={{ marginBottom: '16px' }}>
        ← Tilbake til marked
      </button>

      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
        {listingType === 'wanted' ? 'Legg ut ønske' : 'Legg ut annonse'}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
        {listingType === 'sell' ? 'Selg sportsutstyr til andre i klubben. 5% av salgspris gis som dugnadspoeng.' : listingType === 'free' ? 'Gi bort utstyr du ikke trenger lenger til noen i klubben.' : 'Fortell hva du er på utkikk etter — kanskje noen har det!'}
      </p>

      <div className="card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Type-velger */}
          <div>
            <label className="input-label" style={{ marginBottom: '8px', display: 'block' }}>Hva vil du gjøre?</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {([
                { type: 'sell' as ListingType, icon: '💰', label: 'Selge' },
                { type: 'free' as ListingType, icon: '🎁', label: 'Gi bort' },
                { type: 'wanted' as ListingType, icon: '🔍', label: 'Jeg ønsker' },
              ]).map(opt => (
                <button key={opt.type} onClick={() => setListingType(opt.type)} style={{
                  flex: 1, padding: '14px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                  border: listingType === opt.type ? '2px solid #0d9488' : '1px solid #e5e7eb',
                  background: listingType === opt.type ? '#f0fdfa' : 'white',
                  fontWeight: listingType === opt.type ? '700' : '400', fontSize: '14px'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>{opt.icon}</div>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bilde */}
          <div>
            <label className="input-label">Bilde</label>
            <div
              style={{
                width: '100%',
                height: '200px',
                border: '2px dashed #d1d5db',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={() => document.getElementById('image-upload')?.click()}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Forhåndsvisning" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>📷</div>
                  <p style={{ margin: 0, fontSize: '14px' }}>Klikk for å laste opp bilde</p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Maks 2 MB</p>
                </div>
              )}
            </div>
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Tittel */}
          <div>
            <label className="input-label">Tittel *</label>
            <input
              type="text"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={listingType === 'wanted' ? 'F.eks. Fotballsko str 38' : 'F.eks. Nike fotballsko str 38'}
            />
          </div>

          {/* Beskrivelse */}
          <div>
            <label className="input-label">Beskrivelse</label>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={listingType === 'wanted' ? 'Beskriv hva du er på utkikk etter, størrelse, merke osv.' : 'Beskriv tilstand, merke, bruk osv.'}
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Pris og kategori */}
          <div style={{ display: 'grid', gridTemplateColumns: listingType === 'sell' ? '1fr 1fr' : '1fr', gap: '16px' }}>
            {listingType === 'sell' && (
              <div>
                <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Pris (kr) *</label>
                <input type="number" className="input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" min="0" />
              </div>
            )}
            <div>
              <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Kategori</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
          </div>

          {/* Størrelse og kjønn */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Størrelse</label>
              <input type="text" className="input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="F.eks. 38, M, 140 cm" />
            </div>
            <div>
              <label className="input-label" style={{ marginBottom: '6px', display: 'block' }}>Kjønn</label>
              <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Ikke spesifisert</option>
                <option value="gutt">Gutt</option>
                <option value="jente">Jente</option>
                <option value="unisex">Unisex</option>
              </select>
            </div>
          </div>

          {/* Forhåndsvisning av poeng */}
          {listingType === 'sell' && price && parseFloat(price) > 0 && (
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '14px', color: '#166534' }}>
              🏆 Ved salg til {price} kr mottar du <strong>{Math.round(parseFloat(price) * 0.05)} dugnadspoeng</strong> (5%)
            </div>
          )}

          {listingType === 'free' && (
            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '14px', color: '#166534' }}>
              🎁 Fint at du gir bort! Noen i klubben blir glad.
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} className="btn btn-primary" style={{ padding: '14px', fontSize: '16px', marginTop: '8px' }}>
            {listingType === 'sell' ? 'Publiser annonse' : listingType === 'free' ? 'Legg ut — gis bort' : 'Publiser ønske'}
          </button>
        </div>
      </div>
      {showPremiumGate && <PremiumGateModal featureName="markedsplassen" onClose={() => setShowPremiumGate(false)} />}
    </div>
  );
};
