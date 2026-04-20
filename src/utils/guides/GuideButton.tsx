import React from 'react';
import { runGuide } from './index';

interface Props {
  guideId: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const GuideButton: React.FC<Props> = ({ guideId, label = 'Vis guide', className, style }) => {
  return (
    <button
      type="button"
      onClick={() => runGuide(guideId)}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: '6px',
        border: '1px solid var(--border-color, #dedddd)',
        background: 'var(--card-bg, #ffffff)',
        color: 'var(--text-secondary, #4a5e50)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
      aria-label={label}
    >
      <span aria-hidden="true">💡</span>
      <span>{label}</span>
    </button>
  );
};
