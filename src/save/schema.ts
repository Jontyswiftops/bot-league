// Save schema — versioned from day one so future changes (and v2's Firebase
// ghost-battle sync) never need a breaking rewrite. Everything in a save is
// plain JSON-serializable data; builds reference parts by id so content
// patches don't corrupt old saves.

import type { Slot } from '../sim/types';

export const SAVE_VERSION = 2;

/** A bot as persisted: part references + condition, not embedded part defs. */
export interface SavedBot {
  id: string;
  name: string;
  accent: number;
  parts: Record<Slot, string>; // part ids, resolved against data/ at load
  condition: Record<Slot, number>;
  chipFamiliarity: number;
}

export type CrewJob = 'repair' | 'tune' | 'spar';

export interface SavedCrewMember {
  id: string;
  name: string;
  /** 1–5: repair discounts and salvage-check odds on scrapped parts. */
  wrench: number;
  /** 1–5: weekly condition recovery and sparring familiarity gains. */
  tuning: number;
  weeklyWage: number;
  /** The one job this crew member runs each week. */
  job: CrewJob;
}

export interface InventoryItem {
  partId: string;
  condition: number;
}

export interface MarketItem {
  partId: string;
  condition: number;
  price: number;
}

export interface MatchOffer {
  key: string;
  /** Named rival id, or null for generated filler. */
  rivalId: string | null;
  builderName: string;
  botName: string;
  attitude: string;
  accent: number;
  parts: Record<Slot, string>;
  condition: Record<Slot, number>;
  entryFee: number;
  prize: number;
  famePrize: number;
}

export interface GameState {
  version: typeof SAVE_VERSION;
  /** Master RNG seed for this campaign — market/card generation derive from it. */
  seed: number;
  /** League week number — the master clock of the management sim. */
  week: number;
  cash: number;
  fame: number;
  tier: 1 | 2 | 3;
  bots: SavedBot[];
  /** Which bot fights this week's match. */
  activeBot: number;
  garageSlots: number;
  crew: SavedCrewMember[];
  /** This week's hireable candidates (regenerated weekly). */
  crewMarket: SavedCrewMember[];
  inventory: InventoryItem[];
  /** This week's salvage market (items are removed when bought). */
  market: MarketItem[];
  /** This week's fight card. */
  card: MatchOffer[];
  /** Persistent named-rival records: wins/losses against the player. */
  rivalRecords: Record<string, { wins: number; losses: number }>;
  /** Lifetime W-L. */
  record: { wins: number; losses: number };
}

/**
 * Migrations run in order from the save's version to SAVE_VERSION. Adding a
 * field = bump SAVE_VERSION and append one migration. Never edit old ones.
 */
export const MIGRATIONS: Array<(raw: Record<string, unknown>) => Record<string, unknown>> = [
  // v1 -> v2: crew jobs, active-bot selection, weekly crew market.
  (raw) => ({
    ...raw,
    version: 2,
    activeBot: 0,
    crewMarket: [],
    crew: ((raw.crew as Array<Record<string, unknown>>) ?? []).map((c) => ({ job: 'tune', ...c })),
  }),
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
