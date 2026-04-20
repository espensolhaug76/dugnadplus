import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { getGuide } from './guideDefinitions';
import { markGuideSeen } from './guideStorage';

export { hasSeenGuide, markGuideSeen, resetGuide, resetAllGuides } from './guideStorage';
export { getGuide, listGuideIds } from './guideDefinitions';

export const runGuide = (guideId: string): void => {
  const guide = getGuide(guideId);
  if (!guide) {
    console.warn(`[guide] Ukjent guide-id: ${guideId}`);
    return;
  }

  const missing = guide.steps.filter(s => {
    if (typeof s.element !== 'string') return false;
    return document.querySelector(s.element) === null;
  });
  if (missing.length === guide.steps.length) {
    console.warn(`[guide] Ingen av stegene fant mål-elementer for guide "${guideId}".`);
    return;
  }

  const availableSteps = guide.steps.filter(s => {
    if (typeof s.element !== 'string') return true;
    return document.querySelector(s.element) !== null;
  });

  const d = driver({
    showProgress: true,
    progressText: 'Steg {{current}} av {{total}}',
    nextBtnText: 'Neste',
    prevBtnText: 'Forrige',
    doneBtnText: 'Ferdig',
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: 'dugnad-driver-popover',
    steps: availableSteps,
    onDestroyed: () => {
      markGuideSeen(guideId);
    },
  });

  d.drive();
};
