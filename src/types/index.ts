// Dugnad+ TypeScript Types

export interface DugnadShift {
  id: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  duration: number;
  volunteersNeeded: number;
  assignedCount: number;
  status: 'open' | 'filled' | 'confirmed' | 'completed';
}

export interface DugnadEvent {
  id: string;
  teamId: string;
  eventName: string;
  date: string;
  location?: string;
  sport: string;
  shifts: DugnadShift[];
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  points: number;
  createdBy: string;
  createdAt: string;
  type: 'single' | 'season' | 'multiday' | 'tournament';
}

export interface SportShiftSuggestion {
  sport: string;
  commonShifts: string[];
}

export const SPORT_SHIFT_SUGGESTIONS: SportShiftSuggestion[] = [
  { sport: 'football', commonShifts: ['Kioskvakt', 'Billettsalg', 'Fair play/kampvert', 'Ryddevakt', 'Sekretæriat'] },
  { sport: 'handball', commonShifts: ['Kioskvakt', 'Kampvert', 'Dommer', 'Sekretær', 'Ryddevakt'] },
  { sport: 'ishockey', commonShifts: ['Kioskvakt', 'Tidtaker', 'Speaker', 'Ryddevakt', 'Garderobe'] },
  { sport: 'other', commonShifts: ['Generell vakt', 'Arrangement', 'Transport', 'Utstyr', 'Ryddevakt'] }
];
