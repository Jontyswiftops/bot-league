// AI chips are the personality layer — pure behaviour weights consumed by the
// combat FSM. This is the Domina "traits/morale" equivalent.

import type { ChipDef } from '../sim/types';

export const CHIPS: ChipDef[] = [
  {
    kind: 'chip', id: 'chip_junkyard_dog', name: 'Junkyard Dog', weight: 2, cost: 0, grade: 1,
    weights: { aggression: 0.8, caution: 0.2, opportunism: 0.5, ferocity: 0.9, discipline: 0.3 },
  },
  {
    kind: 'chip', id: 'chip_cold_logic', name: 'Cold Logic', weight: 2, cost: 250, grade: 2,
    weights: { aggression: 0.45, caution: 0.6, opportunism: 0.85, ferocity: 0.1, discipline: 0.9 },
  },
  {
    kind: 'chip', id: 'chip_showboat', name: 'Showboat', weight: 2, cost: 220, grade: 1,
    weights: { aggression: 0.6, caution: 0.35, opportunism: 0.3, ferocity: 0.5, discipline: 0.5 },
  },
  {
    kind: 'chip', id: 'chip_glass_viper', name: 'Glass Viper', weight: 2, cost: 290, grade: 2,
    weights: { aggression: 0.9, caution: 0.5, opportunism: 0.7, ferocity: 0.3, discipline: 0.6 },
  },
];
