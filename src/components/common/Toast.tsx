import React, { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, visible, onHide, duration = 2000 }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(onHide, 300); // wait for slide-out animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onHide]);

  if (!visible && !show) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        top: show ? '16px' : '-80px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e3a2f',
        color: '#fff',
        borderRadius: '10px',
        padding: '12px 18px',
        fontSize: '13px',
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        transition: 'top 0.3s ease',
        maxWidth: '90vw',
        textAlign: 'center',
        whiteSpace: 'nowrap'
      }}>
        {message}
      </div>
    </>
  );
};
