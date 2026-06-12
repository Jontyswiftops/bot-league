// All content is data. Adding a part never touches engine code — the sim only
// reads the typed fields. M0 ships one weapon archetype (spinner) in three
// grades; hammer and ram archetypes arrive in M3.

import type { ArmourDef, ChassisDef, CoreDef, WeaponDef } from '../sim/types';

export const CHASSIS: ChassisDef[] = [
  { kind: 'chassis', id: 'ch_skip_frame', name: 'Skip Frame', weight: 60, cost: 0, hull: 240, plating: 1, agility: 105 },
  { kind: 'chassis', id: 'ch_box_brute', name: 'Box Brute', weight: 95, cost: 280, hull: 330, plating: 3, agility: 80 },
  { kind: 'chassis', id: 'ch_wasp_deck', name: 'Wasp Deck', weight: 45, cost: 320, hull: 190, plating: 0, agility: 130 },
];

export const WEAPONS: WeaponDef[] = [
  { kind: 'weapon', id: 'wp_shredder_mk1', name: 'Shredder Mk1', archetype: 'spinner', weight: 30, cost: 0, damage: 12, reach: 62, energyCost: 15, cooldownTicks: 22 },
  { kind: 'weapon', id: 'wp_buzz_royale', name: 'Buzz Royale', archetype: 'spinner', weight: 42, cost: 350, damage: 17, reach: 66, energyCost: 22, cooldownTicks: 26 },
  { kind: 'weapon', id: 'wp_tin_whisper', name: 'Tin Whisper', archetype: 'spinner', weight: 18, cost: 260, damage: 9, reach: 58, energyCost: 9, cooldownTicks: 14 },
];

export const ARMOURS: ArmourDef[] = [
  { kind: 'armour', id: 'ar_scrap_skirt', name: 'Scrap Skirt', weight: 25, cost: 0, plating: 2, hullBonus: 45 },
  { kind: 'armour', id: 'ar_boiler_plate', name: 'Boiler Plate', weight: 55, cost: 300, plating: 5, hullBonus: 85 },
  { kind: 'armour', id: 'ar_foil_wrap', name: 'Foil Wrap', weight: 10, cost: 180, plating: 1, hullBonus: 20 },
];

export const CORES: CoreDef[] = [
  { kind: 'core', id: 'co_junk_cell', name: 'Junk Cell', weight: 20, cost: 0, capacity: 90, regen: 11, output: 1.0 },
  { kind: 'core', id: 'co_hot_bottle', name: 'Hot Bottle', weight: 28, cost: 340, capacity: 80, regen: 10, output: 1.25 },
  { kind: 'core', id: 'co_deep_tank', name: 'Deep Tank', weight: 34, cost: 310, capacity: 140, regen: 14, output: 0.95 },
];
