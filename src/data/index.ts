// Part lookup: saves and opponents reference parts by id, resolved here.

import type { BotBuild, PartDef, Slot } from '../sim/types';
import { ARMOURS, CHASSIS, CORES, WEAPONS } from './parts';
import { CHIPS } from './chips';
import type { SavedBot } from '../save/schema';

export const ALL_PARTS: PartDef[] = [...CHASSIS, ...WEAPONS, ...ARMOURS, ...CORES, ...CHIPS];

const INDEX = new Map<string, PartDef>(ALL_PARTS.map((p) => [p.id, p]));

export function partById(id: string): PartDef {
  const p = INDEX.get(id);
  if (!p) throw new Error(`Unknown part id: ${id}`);
  return p;
}

/** Resolve a persisted bot (part ids) into a live build (part defs). */
export function resolveBuild(saved: SavedBot): BotBuild {
  const get = (slot: Slot) => partById(saved.parts[slot]);
  return {
    id: saved.id,
    name: saved.name,
    accent: saved.accent,
    chassis: get('chassis') as BotBuild['chassis'],
    weapon: get('weapon') as BotBuild['weapon'],
    armour: get('armour') as BotBuild['armour'],
    core: get('core') as BotBuild['core'],
    chip: get('chip') as BotBuild['chip'],
    condition: { ...saved.condition },
    familiarity: saved.chipFamiliarity,
  };
}
