import React from 'react';
import { LegalLayout } from './LegalLayout';
import privacyMd from '../../../docs/legal/personvernerklaering.md?raw';

export const PersonvernPage: React.FC = () => {
  return <LegalLayout source={privacyMd} />;
};
