// All content is data. Adding a part never touches engine code — the sim only
// reads the typed fields. M0 ships one weapon archetype (spinner) in three
// grades; hammer and ram archetypes arrive in M3.

import type { ArmourDef, ChassisDef, CoreDef, WeaponDef } from '../sim/types';

export const CHASSIS: ChassisDef[] = [
  { kind: 'chassis', id: 'ch_skip_frame', name: 'Skip Frame', weight: 60, cost: 0, hull: 240, plating: 1, agility: 105 },
  { kind: 'chassis', id: 'ch_box_brute', name: 'Box Brute', weight: 95, cost: 280, hull: 330, plating: 3, agility: 80 },
  { kind: 'chassis', id: 'ch_wasp_deck', name: 'Wasp Deck', weight: 45, cost: 320, hull: 190, plating: 0, agility: 130 },
  { kind: 'chassis', id: 'ch_lancer_rig', name: 'Lancer Rig', weight: 55, cost: 480, hull: 270, plating: 2, agility: 120 },
  { kind: 'chassis', id: 'ch_atlas_hull', name: 'Atlas Hull', weight: 120, cost: 560, hull: 400, plating: 4, agility: 72 },
];

export const WEAPONS: WeaponDef[] = [
  // Spinners: steady chip damage, the all-rounder archetype.
  { kind: 'weapon', id: 'wp_shredder_mk1', name: 'Shredder Mk1', archetype: 'spinner', weight: 30, cost: 0, damage: 12, reach: 62, energyCost: 15, cooldownTicks: 22 },
  { kind: 'weapon', id: 'wp_buzz_royale', name: 'Buzz Royale', archetype: 'spinner', weight: 42, cost: 350, damage: 17, reach: 66, energyCost: 22, cooldownTicks: 26 },
  { kind: 'weapon', id: 'wp_tin_whisper', name: 'Tin Whisper', archetype: 'spinner', weight: 18, cost: 260, damage: 9, reach: 58, energyCost: 9, cooldownTicks: 14 },
  { kind: 'weapon', id: 'wp_cyclone_xt', name: 'Cyclone XT', archetype: 'spinner', weight: 50, cost: 620, damage: 22, reach: 68, energyCost: 26, cooldownTicks: 26 },
  // Hammers: slow, brutal, and they CRUSH part condition.
  { kind: 'weapon', id: 'wp_pit_maul', name: 'Pit Maul', archetype: 'hammer', weight: 48, cost: 400, damage: 20, reach: 60, energyCost: 30, cooldownTicks: 44 },
  { kind: 'weapon', id: 'wp_god_gavel', name: 'God Gavel', archetype: 'hammer', weight: 62, cost: 680, damage: 27, reach: 62, energyCost: 38, cooldownTicks: 52 },
  // Rams: cheap energy, contact range — chassis weight does the talking.
  { kind: 'weapon', id: 'wp_scrap_wedge', name: 'Scrap Wedge', archetype: 'ram', weight: 35, cost: 290, damage: 8, reach: 62, energyCost: 8, cooldownTicks: 26 },
  { kind: 'weapon', id: 'wp_juggernaut_plow', name: 'Juggernaut Plow', archetype: 'ram', weight: 60, cost: 560, damage: 14, reach: 64, energyCost: 10, cooldownTicks: 28 },
];

export const ARMOURS: ArmourDef[] = [
  { kind: 'armour', id: 'ar_scrap_skirt', name: 'Scrap Skirt', weight: 25, cost: 0, plating: 2, hullBonus: 45 },
  { kind: 'armour', id: 'ar_boiler_plate', name: 'Boiler Plate', weight: 55, cost: 300, plating: 5, hullBonus: 85 },
  { kind: 'armour', id: 'ar_foil_wrap', name: 'Foil Wrap', weight: 10, cost: 180, plating: 1, hullBonus: 20 },
  { kind: 'armour', id: 'ar_ghost_mesh', name: 'Ghost Mesh', weight: 18, cost: 430, plating: 3, hullBonus: 40 },
  { kind: 'armour', id: 'ar_reactive_shell', name: 'Reactive Shell', weight: 70, cost: 580, plating: 7, hullBonus: 110 },
];

export const CORES: CoreDef[] = [
  { kind: 'core', id: 'co_junk_cell', name: 'Junk Cell', weight: 20, cost: 0, capacity: 90, regen: 11, output: 1.0 },
  { kind: 'core', id: 'co_hot_bottle', name: 'Hot Bottle', weight: 28, cost: 340, capacity: 80, regen: 10, output: 1.25 },
  { kind: 'core', id: 'co_deep_tank', name: 'Deep Tank', weight: 34, cost: 310, capacity: 140, regen: 14, output: 0.95 },
  { kind: 'core', id: 'co_razor_cell', name: 'Razor Cell', weight: 22, cost: 590, capacity: 75, regen: 10, output: 1.4 },
  { kind: 'core', id: 'co_fusion_brick', name: 'Fusion Brick', weight: 40, cost: 640, capacity: 160, regen: 16, output: 1.1 },
];
