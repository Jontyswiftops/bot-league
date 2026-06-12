// Save schema — versioned from day one so M2's real save system (and v2's
// Firebase ghost-battle sync) never needs a breaking rewrite. Everything in a
// save is plain JSON-serializable data; builds reference parts by id so
// content patches don't corrupt old saves.

import type { Slot } from '../sim/types';

export const SAVE_VERSION = 1;

/** A bot as persisted: part references + condition, not embedded part defs. */
export interface SavedBot {
  id: string;
  name: string;
  accent: number;
  parts: Record<Slot, string>; // part ids, resolved against data/ at load
  condition: Record<Slot, number>;
  chipFamiliarity: number;
}

export interface SavedCrewMember {
  id: string;
  name: string;
  wrench: number;
  tuning: number;
  weeklyWage: number;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  /** League week number — the master clock of the management sim. */
  week: number;
  cash: number;
  fame: number;
  tier: 1 | 2 | 3;
  bots: SavedBot[];
  garageSlots: number;
  crew: SavedCrewMember[];
  /** Part ids in storage (unequipped inventory). */
  inventory: string[];
  /** Persistent named-rival records: wins/losses against the player. */
  rivalRecords: Record<string, { wins: number; losses: number }>;
}

/**
 * Migrations run in order from the save's version to SAVE_VERSION. Adding a
 * field = bump SAVE_VERSION and append one migration. Never edit old ones.
 */
export const MIGRATIONS: Array<(raw: Record<string, unknown>) => Record<string, unknown>> = [
  // index 0 migrates version 1 -> 2 (none yet)
];

export function migrate(raw: Record<string, unknown>): GameState {
  let data = raw;
  let v = typeof data.version === 'number' ? data.version : 1;
  while (v < SAVE_VERSION) {
    data = MIGRATIONS[v - 1](data);
    v++;
  }
  return data as unknown as GameState;
}
