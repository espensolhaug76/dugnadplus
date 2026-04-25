import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { runGuide, hasSeenGuide } from '../../utils/guides';

const PATH_TO_GUIDE_ID: Record<string, string> = {
  '/family-dashboard': 'family-dashboard-first-time',
  '/my-shifts': 'parent-shifts',
};

interface FamilyLayoutProps {
  children: React.ReactNode;
}

export const FamilyLayout: React.FC<FamilyLayoutProps> = ({ children }) => {
  const [authGate, setAuthGate] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthGate('denied');
        window.location.href = '/login';
        return;
      }
      setAuthGate('allowed');
    })();
  }, []);

  useEffect(() => {
    if (authGate !== 'allowed') return;
    const path = window.location.pathname;
    const guideId = PATH_TO_GUIDE_ID[path];
    if (!guideId) return;
    if (hasSeenGuide(guideId)) return;
    const t = window.setTimeout(() => {
      runGuide(guideId);
    }, 800);
    return () => window.clearTimeout(t);
  }, [authGate]);

  if (authGate === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5e50' }}>Laster...</div>;
  }
  if (authGate === 'denied') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5e50' }}>Omdirigerer...</div>;
  }

  return <>{children}</>;
};
