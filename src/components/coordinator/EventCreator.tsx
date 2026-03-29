import React, { useEffect } from 'react';

export const EventCreator: React.FC = () => {
  useEffect(() => {
    // Just redirect to the working multi-day creator
    window.location.href = '/multiday-bulk-creator';
  }, []);

  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p>Omdirigerer...</p>
    </div>
  );
};
