import React from 'react';
import { useTheme, MODE_CONFIG } from './ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { mode, cycleMode } = useTheme();
  const safeMode = Object.keys(MODE_CONFIG).includes(mode) ? mode : 'light' as const;
  const config = MODE_CONFIG[safeMode];

  return (
    <button
      onClick={cycleMode}
      title={`Tema: ${config.label}`}
      style={{
        background: 'none',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: '18px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        color: 'var(--text-secondary)',
        transition: 'all 0.15s'
      }}
    >
      {config.icon}
    </button>
  );
};
