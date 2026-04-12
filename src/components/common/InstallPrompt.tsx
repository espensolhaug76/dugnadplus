import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Already dismissed?
    if (localStorage.getItem('dugnad_install_dismissed') === 'true') {
      setDismissed(true);
      return;
    }

    // Already installed as PWA?
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setDismissed(true);
      return;
    }

    // iOS detection
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isiOS);

    // Android/Chrome prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        localStorage.setItem('dugnad_install_dismissed', 'true');
        setDismissed(true);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('dugnad_install_dismissed', 'true');
    setDismissed(true);
  };

  // Don't show if dismissed, already installed, or no prompt available (and not iOS)
  if (dismissed || (!deferredPrompt && !isIOS)) return null;

  // iOS instructions
  if (isIOS) {
    return (
      <div style={{ background: '#1e3a2f', borderRadius: '16px', padding: '20px', margin: '12px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#2d6a4f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: '#7ec8a0', flexShrink: 0, fontFamily: 'serif' }}>D+</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 500, color: '#fff', marginBottom: '6px' }}>Legg Dugnad+ til på hjemskjermen</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '14px' }}>Da får du varsler når du har vakter og kan åpne appen med ett trykk</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { n: '1', text: 'Trykk på del-knappen (↑) nederst i Safari' },
                { n: '2', text: 'Bla ned og velg «Legg til på Hjem-skjerm»' },
                { n: '3', text: 'Trykk «Legg til» øverst til høyre' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(126,200,160,0.2)', color: '#7ec8a0', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '12px', cursor: 'pointer', marginTop: '12px', padding: 0 }}>Ikke nå</button>
      </div>
    );
  }

  // Android/Chrome prompt
  return (
    <div style={{ background: '#1e3a2f', borderRadius: '16px', padding: '20px', margin: '12px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#2d6a4f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: '#7ec8a0', flexShrink: 0, fontFamily: 'serif' }}>D+</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: '#fff', marginBottom: '6px' }}>Legg Dugnad+ til på hjemskjermen</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '14px' }}>Da får du varsler når du har vakter og kan åpne appen med ett trykk</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleInstall} style={{ background: '#7ec8a0', color: '#1e3a2f', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Legg til</button>
            <button onClick={handleDismiss} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer' }}>Ikke nå</button>
          </div>
        </div>
      </div>
    </div>
  );
};
