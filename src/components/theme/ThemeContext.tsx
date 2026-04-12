import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

export interface SportTheme {
  id: string;
  name: string;
  emoji: string;
  primary: string;
}

export const SPORT_THEMES: SportTheme[] = [
  { id: 'handball', name: 'Håndball', emoji: '🤾', primary: '#0d9488' },
  { id: 'football', name: 'Fotball', emoji: '⚽', primary: '#16a34a' },
  { id: 'ishockey', name: 'Ishockey', emoji: '🏒', primary: '#1e40af' },
  { id: 'basketball', name: 'Basketball', emoji: '🏀', primary: '#ea580c' },
  { id: 'volleyball', name: 'Volleyball', emoji: '🏐', primary: '#7c3aed' },
];

export const MODE_CONFIG: Record<ThemeMode, { label: string; icon: string; bg: string; bgSecondary: string; text: string; textSecondary: string; border: string; cardBg: string }> = {
  light: {
    label: 'Lys', icon: '☀️',
    bg: '#faf9f5', bgSecondary: '#fefcf5', text: '#2d3748', textSecondary: '#718096',
    border: '#dedddd', cardBg: '#ffffff'
  },
  dark: {
    label: 'Mørk', icon: '🌙',
    bg: '#111827', bgSecondary: '#1f2937', text: '#f9fafb', textSecondary: '#d1d5db',
    border: '#374151', cardBg: '#1f2937'
  },
};

interface ThemeState {
  mode: ThemeMode;
  primaryColor: string;
  sportThemeId: string | null;
}

interface ThemeContextType extends ThemeState {
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  setPrimaryColor: (color: string) => void;
  setSportTheme: (id: string) => void;
  currentModeConfig: typeof MODE_CONFIG['light'];
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'dugnad_theme';

const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const applyTheme = (state: ThemeState) => {
  const root = document.documentElement;
  const mode = MODE_CONFIG[state.mode];
  const primary = state.primaryColor;
  const hsl = hexToHsl(primary);

  // Primærfarge-varianter
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-dark', `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 15, 10)}%)`);
  root.style.setProperty('--color-primary-light', `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 30, 95)}%)`);
  root.style.setProperty('--color-primary-bg', `hsl(${hsl.h}, ${hsl.s}%, ${state.mode === 'dark' ? 20 : 95}%)`);

  // Modus-variabler
  root.style.setProperty('--bg-primary', mode.bg);
  root.style.setProperty('--bg-secondary', mode.bgSecondary);
  root.style.setProperty('--text-primary', mode.text);
  root.style.setProperty('--text-secondary', mode.textSecondary);
  root.style.setProperty('--border-color', mode.border);
  root.style.setProperty('--card-bg', mode.cardBg);

  // Body og HTML
  document.body.style.backgroundColor = mode.bg;
  document.body.style.color = mode.text;
  document.documentElement.setAttribute('data-theme', state.mode);

  // Injisér dynamisk stylesheet som overskriver alle hardkodede farger
  let styleEl = document.getElementById('dugnad-theme-override') as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dugnad-theme-override';
    document.head.appendChild(styleEl);
  }

  if (state.mode !== 'light') {
    // Build rgb selectors for all design system light colors
    const cardBg = mode.cardBg;
    const secBg = mode.bgSecondary;
    const pageBg = mode.bg;
    const border = mode.border;
    const text = mode.text;
    const textSec = mode.textSecondary;

    styleEl.textContent = `
      /* ===== DARK MODE OVERRIDE ===== */

      /* Opt-out scope — applied below at the end */

      /* --- White / card backgrounds → dark card --- */
      [style*="rgb(255, 255, 255)"],
      [style*="rgb(255,255,255)"] {
        background-color: ${cardBg} !important;
      }

      /* --- #faf8f4 page bg → dark bg --- */
      [style*="rgb(250, 248, 244)"],
      [style*="rgb(250,248,244)"] {
        background-color: ${pageBg} !important;
      }

      /* --- #faf9f5 light bg --- */
      [style*="rgb(250, 249, 245)"],
      [style*="rgb(250,249,245)"] {
        background-color: ${pageBg} !important;
      }

      /* --- #e8f5ef success green bg → dark subtle --- */
      [style*="rgb(232, 245, 239)"],
      [style*="rgb(232,245,239)"] {
        background-color: rgba(45, 106, 79, 0.15) !important;
      }

      /* --- #e6f0e8 quote bg → dark subtle --- */
      [style*="rgb(230, 240, 232)"],
      [style*="rgb(230,240,232)"] {
        background-color: rgba(45, 106, 79, 0.12) !important;
      }

      /* --- #fff8e6 warning bg → dark warning --- */
      [style*="rgb(255, 248, 230)"],
      [style*="rgb(255,248,230)"] {
        background-color: rgba(250, 199, 117, 0.12) !important;
      }

      /* --- #fff5f5 danger bg → dark danger --- */
      [style*="rgb(255, 245, 245)"],
      [style*="rgb(255,245,245)"] {
        background-color: rgba(220, 38, 38, 0.1) !important;
      }

      /* --- #f3f4f6 / #f0f0f0 neutral bg → dark secondary --- */
      [style*="rgb(243, 244, 246)"],
      [style*="rgb(243,244,246)"],
      [style*="rgb(240, 240, 240)"],
      [style*="rgb(240,240,240)"] {
        background-color: ${secBg} !important;
      }

      /* --- #e8e0d0 progress track → dark track --- */
      [style*="rgb(232, 224, 208)"],
      [style*="rgb(232,224,208)"] {
        background-color: ${border} !important;
      }

      /* --- Other light pastels → dark secondary --- */
      [style*="rgb(248, 250, 252)"],
      [style*="rgb(249, 250, 251)"],
      [style*="rgb(247, 250, 252)"],
      [style*="rgb(240, 253, 250)"],
      [style*="rgb(240, 249, 255)"],
      [style*="rgb(242, 250, 246)"],
      [style*="rgb(237, 245, 224)"],
      [style*="rgb(240, 247, 228)"],
      [style*="rgb(245, 250, 232)"] {
        background-color: ${secBg} !important;
      }

      /* --- Borders: #dedddd → dark border --- */
      [style*="rgb(222, 221, 221)"] {
        border-color: ${border} !important;
      }

      /* --- Text overrides in main content --- */
      .coordinator-main div,
      .coordinator-main span,
      .coordinator-main p,
      .coordinator-main label,
      .coordinator-main h1, .coordinator-main h2, .coordinator-main h3, .coordinator-main h4,
      .coordinator-main td, .coordinator-main th {
        color: ${text};
      }

      /* Preserve white text on dark hero sections (#1e3a2f) */
      [style*="rgb(30, 58, 47)"] *,
      [style*="rgb(30,58,47)"] * {
        color: inherit !important;
      }

      /* Preserve colored text for specific elements */
      [style*="color: rgb(45, 106, 79)"],
      [style*="color: rgb(45,106,79)"] { color: #7ec8a0 !important; }

      [style*="color: rgb(133, 79, 11)"],
      [style*="color: rgb(133,79,11)"] { color: #fac775 !important; }

      [style*="color: rgb(26, 46, 31)"],
      [style*="color: rgb(26,46,31)"] { color: ${text} !important; }

      [style*="color: rgb(74, 94, 80)"],
      [style*="color: rgb(74,94,80)"] { color: ${textSec} !important; }

      [style*="color: rgb(107, 127, 112)"],
      [style*="color: rgb(107,127,112)"] { color: ${textSec} !important; }

      /* --- Inputs --- */
      input, select, textarea {
        background-color: ${cardBg} !important;
        color: ${text} !important;
        border-color: ${border} !important;
      }

      input::placeholder, textarea::placeholder {
        color: ${textSec} !important;
        opacity: 0.6 !important;
      }

      /* --- Cards with className --- */
      .card {
        background-color: ${cardBg} !important;
        border-color: ${border} !important;
      }

      /* --- Sidebar --- */
      .coordinator-sidebar {
        background-color: ${cardBg} !important;
        border-color: ${border} !important;
      }
      .sidebar-header { border-color: ${border} !important; }

      /* --- Buttons with className --- */
      .btn:not(.btn-primary) {
        background-color: ${cardBg} !important;
        color: ${text} !important;
        border-color: ${border} !important;
      }

      /* --- Tabeller --- */
      th { color: ${textSec} !important; }

      /* --- Select arrow --- */
      select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='${encodeURIComponent(textSec)}' d='M6 8L1 3h10z'/%3E%3C/svg%3E") !important;
      }

      /* === OPT-OUT: Landing page and other light-forced sections === */
      [data-theme="light"] *:not(nav):not(nav *) {
        color: inherit !important;
        background-color: inherit !important;
        border-color: inherit !important;
      }
      [data-theme="light"] input,
      [data-theme="light"] select,
      [data-theme="light"] textarea {
        background-color: inherit !important;
        color: inherit !important;
        border-color: inherit !important;
      }
    `;
  } else {
    styleEl.textContent = '';
  }
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ThemeState>(() => {
    const defaultState: ThemeState = { mode: 'light', primaryColor: '#0d9488', sportThemeId: 'handball' };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Valider at mode er gyldig
        if (parsed.mode && Object.keys(MODE_CONFIG).includes(parsed.mode)) {
          return { ...defaultState, ...parsed };
        }
      }
    } catch {}
    return defaultState;
  });

  useEffect(() => {
    applyTheme(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setMode = (mode: ThemeMode) => setState(prev => ({ ...prev, mode }));

  const cycleMode = () => {
    setMode(state.mode === 'light' ? 'dark' : 'light');
  };

  const setPrimaryColor = (color: string) => setState(prev => ({ ...prev, primaryColor: color, sportThemeId: null }));

  const setSportTheme = (id: string) => {
    const theme = SPORT_THEMES.find(t => t.id === id);
    if (theme) setState(prev => ({ ...prev, primaryColor: theme.primary, sportThemeId: id }));
  };

  return (
    <ThemeContext.Provider value={{ ...state, setMode, cycleMode, setPrimaryColor, setSportTheme, currentModeConfig: MODE_CONFIG[state.mode] }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
