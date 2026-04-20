const keyFor = (guideId: string) => `guide_seen_${guideId}`;

export const hasSeenGuide = (guideId: string): boolean => {
  try {
    return localStorage.getItem(keyFor(guideId)) === '1';
  } catch {
    return false;
  }
};

export const markGuideSeen = (guideId: string): void => {
  try {
    localStorage.setItem(keyFor(guideId), '1');
  } catch {
    // ignore storage errors (quota, private mode)
  }
};

export const resetGuide = (guideId: string): void => {
  try {
    localStorage.removeItem(keyFor(guideId));
  } catch {
    // ignore
  }
};

export const resetAllGuides = (): void => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('guide_seen_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore
  }
};
