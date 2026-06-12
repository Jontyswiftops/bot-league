// The league week: a deterministic state machine over GameState. Pure TS —
// every function here runs identically in the browser, tests, and tools.
// All randomness derives from (state.seed, state.week), so a campaign is
// reproducible end to end.

import { mulberry32, pick, range, rangeInt, type Rng } from './rng';
import { computeStats } from './stats';
import type { Slot } from './types';
import type { GameState, MarketItem, MatchOffer, SavedBot } from '../save/schema';
import { ALL_PARTS, partById, resolveBuild } from '../data';
import { T1_RIVALS } from '../data/rivals';
import { randomBuild } from '../data/builds';

export const ENTRY_FEE_RIVAL = 50;
export const PRIZE_RIVAL = 250;
export const PRIZE_UNDERCARD = 120;
export const LOSS_PURSE = 40;
export const SPONSOR_FAME = 3;
export const SPONSOR_WEEKLY = 75;
export const SPONSOR_WIN_BONUS = 50;
export const SCRAP_VALUE = 10;

const SLOTS: Slot[] = ['chassis', 'weapon', 'armour', 'core', 'chip'];

// --- New game ---------------------------------------------------------------

export function newGame(seed: number): GameState {
  const starter: SavedBot = {
    id: 'player_bot_1',
    name: 'RUSTBUCKET',
    accent: 0x00e5ff,
    parts: {
      chassis: 'ch_skip_frame',
      weapon: 'wp_shredder_mk1',
      armour: 'ar_scrap_skirt',
      core: 'co_junk_cell',
      chip: 'chip_junkyard_dog',
    },
    condition: { chassis: 85, weapon: 80, armour: 75, core: 85, chip: 100 },
    chipFamiliarity: 0,
  };
  const state: GameState = {
    version: 1,
    seed,
    week: 1,
    cash: 800,
    fame: 0,
    tier: 1,
    bots: [starter],
    garageSlots: 1,
    crew: [],
    inventory: [],
    market: [],
    card: [],
    rivalRecords: {},
    record: { wins: 0, losses: 0 },
  };
  rollWeek(state);
  return state;
}

/** Week-scoped RNG: same seed + same week = same market and card. */
function weekRng(state: GameState, salt: number): Rng {
  return mulberry32((state.seed ^ (state.week * 7919) ^ salt) >>> 0);
}

function rollWeek(state: GameState): void {
  state.market = generateMarket(state);
  state.card = generateCard(state);
}

// --- Market -----------------------------------------------------------------

function generateMarket(state: GameState): MarketItem[] {
  const rng = weekRng(state, 0x5eed);
  const items: MarketItem[] = [];
  // One offer per part kind so the market always has *some* answer...
  for (const kind of ['weapon', 'armour', 'core', 'chassis', 'chip'] as const) {
    const pool = ALL_PARTS.filter((p) => p.kind === kind);
    const part = pick(rng, pool);
    const condition = rangeInt(rng, 60, 100);
    items.push({ partId: part.id, condition, price: priceFor(part.id, condition, range(rng, 0.85, 1.2)) });
  }
  // ...plus the junk bin: one beat-up part, cheap. Keeps a broke stable alive.
  const junk = pick(rng, ALL_PARTS);
  const junkCond = rangeInt(rng, 35, 55);
  items.push({ partId: junk.id, condition: junkCond, price: priceFor(junk.id, junkCond, 0.45) });
  return items;
}

function priceFor(partId: string, condition: number, factor: number): number {
  const base = Math.max(partById(partId).cost, 120); // free starter parts still have value
  return Math.max(15, Math.round((base * factor * (0.55 + 0.45 * (condition / 100))) / 5) * 5);
}

export function sellValue(partId: string, condition: number): number {
  const base = Math.max(partById(partId).cost, 120);
  return Math.max(SCRAP_VALUE, Math.floor((base * 0.3 * condition) / 100));
}

// --- Fight card ---------------------------------------------------------------

function generateCard(state: GameState): MatchOffer[] {
  const rng = weekRng(state, 0xca5d);
  const offers: MatchOffer[] = [];

  // Undercard: generated filler, free entry — you can ALWAYS afford a fight.
  const filler = randomBuild(rng, `filler_w${state.week}`, rangeInt(rng, 0, 5));
  offers.push({
    key: `w${state.week}_under`,
    rivalId: null,
    builderName: 'Open bracket',
    botName: filler.name,
    attitude: 'Some kid with a wrench and a dream.',
    accent: filler.accent,
    parts: {
      chassis: filler.chassis.id,
      weapon: filler.weapon.id,
      armour: filler.armour.id,
      core: filler.core.id,
      chip: filler.chip.id,
    },
    condition: { ...filler.condition },
    entryFee: 0,
    prize: PRIZE_UNDERCARD,
    famePrize: 1,
  });

  // Main card: one or two named rivals, rotating by week.
  const rivalCount = rng() < 0.4 ? 2 : 1;
  const startIdx = (state.week - 1) % T1_RIVALS.length;
  for (let i = 0; i < rivalCount; i++) {
    const rival = T1_RIVALS[(startIdx + i) % T1_RIVALS.length];
    const condition: Record<Slot, number> = {
      chassis: rangeInt(rng, 80, 100),
      weapon: rangeInt(rng, 80, 100),
      armour: rangeInt(rng, 80, 100),
      core: rangeInt(rng, 80, 100),
      chip: 100,
    };
    offers.push({
      key: `w${state.week}_${rival.id}`,
      rivalId: rival.id,
      builderName: rival.builderName,
      botName: rival.botName,
      attitude: rival.attitude,
      accent: rival.accent,
      parts: { ...rival.parts },
      condition,
      entryFee: ENTRY_FEE_RIVAL,
      prize: PRIZE_RIVAL,
      famePrize: 2,
    });
  }
  return offers;
}

// --- Garage actions -----------------------------------------------------------

export function repairCost(partId: string, condition: number): number {
  if (condition <= 0) return Infinity; // scrapped — replace, don't repair
  const base = Math.max(partById(partId).cost, 120);
  return Math.max(10, Math.ceil(((100 - condition) / 100) * base * 0.5));
}

/** Repair an equipped part to 100%. Returns false if unaffordable/scrapped. */
export function repairPart(state: GameState, slot: Slot): boolean {
  const bot = state.bots[0];
  const cost = repairCost(bot.parts[slot], bot.condition[slot]);
  if (!isFinite(cost) || cost > state.cash || bot.condition[slot] >= 100) return false;
  state.cash -= cost;
  bot.condition[slot] = 100;
  return true;
}

export function buyItem(state: GameState, marketIdx: number): boolean {
  const item = state.market[marketIdx];
  if (!item || item.price > state.cash) return false;
  state.cash -= item.price;
  state.market.splice(marketIdx, 1);
  state.inventory.push({ partId: item.partId, condition: item.condition });
  return true;
}

export function sellItem(state: GameState, invIdx: number): boolean {
  const item = state.inventory[invIdx];
  if (!item) return false;
  state.cash += sellValue(item.partId, item.condition);
  state.inventory.splice(invIdx, 1);
  return true;
}

/** Swap an inventory part into the bot; the old part goes to inventory. */
export function equipPart(state: GameState, invIdx: number): boolean {
  const bot = state.bots[0];
  const item = state.inventory[invIdx];
  if (!item) return false;
  const slot = partById(item.partId).kind as Slot;
  const old = { partId: bot.parts[slot], condition: bot.condition[slot] };
  bot.parts[slot] = item.partId;
  bot.condition[slot] = item.condition;
  state.inventory.splice(invIdx, 1);
  state.inventory.push(old);
  return true;
}

// --- Fight night ---------------------------------------------------------------

export interface MatchSetup {
  seed: number;
  player: ReturnType<typeof resolveBuild>;
  opponent: ReturnType<typeof resolveBuild>;
  offer: MatchOffer;
}

/** Pay the entry fee and assemble both builds. */
export function beginMatch(state: GameState, offerKey: string): MatchSetup | null {
  const offer = state.card.find((o) => o.key === offerKey);
  if (!offer || offer.entryFee > state.cash) return null;
  state.cash -= offer.entryFee;
  const oppSaved: SavedBot = {
    id: offer.key,
    name: offer.botName,
    accent: offer.accent,
    parts: offer.parts,
    condition: offer.condition,
    chipFamiliarity: 0,
  };
  return {
    seed: (state.seed ^ (state.week * 104729) ^ hashKey(offerKey)) >>> 0,
    player: resolveBuild(state.bots[0]),
    opponent: resolveBuild(oppSaved),
    offer,
  };
}

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

export interface SettleReport {
  won: boolean;
  result: 'ko' | 'judges';
  prize: number;
  sponsorBonus: number;
  fameGained: number;
  /** Per-slot condition: [before, after]. */
  damage: Array<{ slot: Slot; before: number; after: number; scrapped: boolean }>;
  bark: string | null;
}

/**
 * Apply a finished fight to the campaign: money, fame, rival records, and —
 * the part that makes losses matter — the player bot keeps every dent.
 */
export function settleMatch(
  state: GameState,
  offer: MatchOffer,
  winnerIdx: 0 | 1,
  result: 'ko' | 'judges',
  playerConditionAfter: Record<Slot, number>,
): SettleReport {
  const bot = state.bots[0];
  const won = winnerIdx === 0;

  const damage = SLOTS.map((slot) => {
    const before = bot.condition[slot];
    const after = Math.max(0, Math.round(playerConditionAfter[slot]));
    return { slot, before, after, scrapped: before > 0 && after <= 0 };
  });
  for (const d of damage) bot.condition[d.slot] = d.after;

  const sponsored = state.fame >= SPONSOR_FAME;
  const prize = won ? offer.prize : LOSS_PURSE;
  const sponsorBonus = won && sponsored ? SPONSOR_WIN_BONUS : 0;
  const fameGained = won ? offer.famePrize : 0;
  state.cash += prize + sponsorBonus;
  state.fame += fameGained;
  state.record[won ? 'wins' : 'losses']++;

  let bark: string | null = null;
  if (offer.rivalId) {
    const rec = (state.rivalRecords[offer.rivalId] ??= { wins: 0, losses: 0 });
    rec[won ? 'losses' : 'wins']++; // record is from the rival's side
    const rival = T1_RIVALS.find((r) => r.id === offer.rivalId);
    bark = rival ? (won ? rival.winBark : rival.lossBark) : null;
  }

  return { won, result, prize, sponsorBonus, fameGained, damage, bark };
}

/** Advance to next week: sponsor stipend, fresh market and card. */
export function advanceWeek(state: GameState): { sponsorPaid: number } {
  state.week++;
  const sponsorPaid = state.fame >= SPONSOR_FAME ? SPONSOR_WEEKLY : 0;
  state.cash += sponsorPaid;
  rollWeek(state);
  return { sponsorPaid };
}

/** Derived stats for any saved bot — the card the player reads everywhere. */
export function statsFor(saved: SavedBot) {
  return computeStats(resolveBuild(saved));
}
