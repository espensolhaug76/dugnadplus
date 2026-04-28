import React from 'react';
import { LegalLayout } from './LegalLayout';
import termsMd from '../../../docs/legal/vilkar.md?raw';

export const VilkarPage: React.FC = () => {
  return <LegalLayout source={termsMd} />;
};
