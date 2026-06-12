// The league week: a deterministic state machine over GameState. Pure TS —
// every function here runs identically in the browser, tests, and tools.
// All randomness derives from (state.seed, state.week), so a campaign is
// reproducible end to end.

import { mulberry32, pick, range, rangeInt, type Rng } from './rng';
import { computeStats } from './stats';
import type { Slot } from './types';
import type {
  CrewJob,
  GameState,
  MarketItem,
  MatchOffer,
  SavedBot,
  SavedCrewMember,
} from '../save/schema';
import { ALL_PARTS, partById, resolveBuild } from '../data';
import { RIVALS_BY_TIER } from '../data/rivals';
import { randomBotName } from '../data/builds';
import { ARMOURS, CHASSIS, CORES, WEAPONS } from '../data/parts';
import { CHIPS } from '../data/chips';

export const SPONSOR_FAME = 3;
export const CHAMPIONSHIP_FAME = 40;
export const TITLE_ENTRY = 500;
export const TITLE_PRIZE = 2500;
export const TITLE_FAME = 10;
export const DEFENSE_PRIZE = 1500;
export const SPONSOR_WEEKLY = 75;
export const SPONSOR_WIN_BONUS = 50;
export const SCRAP_VALUE = 10;
export const GARAGE_SLOT_COST = 600;
export const MAX_GARAGE_SLOTS = 2;
export const MAX_CREW = 2;

export interface TierConfig {
  label: string;
  entryFee: number;
  prize: number;
  underPrize: number;
  lossPurse: number;
  /** Fame needed to unlock promotion out of this tier; null at the top. */
  fameForNext: number | null;
}

export const TIERS: Record<1 | 2 | 3, TierConfig> = {
  1: { label: 'Scrapyard', entryFee: 50, prize: 250, underPrize: 120, lossPurse: 40, fameForNext: 10 },
  2: { label: 'Warehouse', entryFee: 150, prize: 600, underPrize: 280, lossPurse: 100, fameForNext: 25 },
  3: { label: 'The Circuit', entryFee: 300, prize: 1200, underPrize: 550, lossPurse: 200, fameForNext: null },
};

const SLOTS: Slot[] = ['chassis', 'weapon', 'armour', 'core', 'chip'];
const ACCENTS = [0xffb300, 0x00e5ff, 0xff4d6d, 0x76ff03, 0xb388ff, 0xff8a30];

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
    version: 3,
    seed,
    week: 1,
    cash: 800,
    fame: 0,
    tier: 1,
    bots: [starter],
    activeBot: 0,
    garageSlots: 1,
    crew: [],
    crewMarket: [],
    inventory: [],
    market: [],
    card: [],
    rivalRecords: {},
    record: { wins: 0, losses: 0 },
    champion: false,
  };
  rollWeek(state);
  return state;
}

export function activeBot(state: GameState): SavedBot {
  return state.bots[state.activeBot] ?? state.bots[0];
}

/** Week-scoped RNG: same seed + same week = same market, card, candidates. */
function weekRng(state: GameState, salt: number): Rng {
  return mulberry32((state.seed ^ (state.week * 7919) ^ salt) >>> 0);
}

function rollWeek(state: GameState): void {
  state.market = generateMarket(state);
  state.card = generateCard(state);
  state.crewMarket = generateCrewMarket(state);
}

/** Saves migrated from before the crew system have no candidates yet. */
export function backfillCrewMarket(state: GameState): void {
  if (state.crewMarket.length === 0 && state.crew.length < MAX_CREW) {
    state.crewMarket = generateCrewMarket(state);
  }
}

// --- Market -----------------------------------------------------------------

function generateMarket(state: GameState): MarketItem[] {
  const rng = weekRng(state, 0x5eed);
  const items: MarketItem[] = [];
  // One offer per part kind so the market always has *some* answer...
  for (const kind of ['weapon', 'armour', 'core', 'chassis', 'chip'] as const) {
    const pool = ALL_PARTS.filter((p) => p.kind === kind);
    const part = pickByTier(rng, pool, state.tier);
    const condition = rangeInt(rng, 60, 100);
    items.push({ partId: part.id, condition, price: priceFor(part.id, condition, range(rng, 0.85, 1.2)) });
  }
  // ...plus the junk bin: one beat-up part, cheap. Keeps a broke stable alive.
  const junk = pick(rng, ALL_PARTS);
  const junkCond = rangeInt(rng, 35, 55);
  items.push({ partId: junk.id, condition: junkCond, price: priceFor(junk.id, junkCond, 0.45) });
  return items;
}

/** Higher tiers shop (and fight) from the upper end of the part pool. */
function pickByTier<T extends { cost: number }>(rng: Rng, pool: T[], tier: 1 | 2 | 3): T {
  const sorted = [...pool].sort((a, b) => a.cost - b.cost);
  if (tier === 1) return pick(rng, sorted);
  if (tier === 2) return pick(rng, sorted.slice(Math.floor(sorted.length / 3)));
  return pick(rng, sorted.slice(-2));
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
  const tier = TIERS[state.tier];
  const offers: MatchOffer[] = [];

  // Undercard: generated filler, free entry — you can ALWAYS afford a fight.
  const fillerCondFloor = state.tier === 1 ? 70 : state.tier === 2 ? 80 : 88;
  const fillerParts: Record<Slot, string> = {
    chassis: pickByTier(rng, CHASSIS, state.tier).id,
    weapon: pickByTier(rng, WEAPONS, state.tier).id,
    armour: pickByTier(rng, ARMOURS, state.tier).id,
    core: pickByTier(rng, CORES, state.tier).id,
    chip: pickByTier(rng, [...CHIPS].sort((a, b) => a.grade - b.grade), state.tier).id,
  };
  offers.push({
    key: `w${state.week}_under`,
    rivalId: null,
    builderName: 'Open bracket',
    botName: randomBotName(rng),
    attitude: 'Some kid with a wrench and a dream.',
    accent: pick(rng, ACCENTS),
    parts: fillerParts,
    condition: {
      chassis: rangeInt(rng, fillerCondFloor, 100),
      weapon: rangeInt(rng, fillerCondFloor, 100),
      armour: rangeInt(rng, fillerCondFloor, 100),
      core: rangeInt(rng, fillerCondFloor, 100),
      chip: 100,
    },
    entryFee: 0,
    prize: tier.underPrize,
    famePrize: state.tier,
  });

  // Main card: one or two named rivals of this tier, rotating by week.
  const rivals = RIVALS_BY_TIER[state.tier];
  const rivalCount = rng() < 0.4 ? 2 : 1;
  const startIdx = (state.week - 1) % rivals.length;
  for (let i = 0; i < rivalCount; i++) {
    const rival = rivals[(startIdx + i) % rivals.length];
    const condFloor = 80 + state.tier * 4;
    const condition: Record<Slot, number> = {
      chassis: rangeInt(rng, condFloor, 100),
      weapon: rangeInt(rng, condFloor, 100),
      armour: rangeInt(rng, condFloor, 100),
      core: rangeInt(rng, condFloor, 100),
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
      entryFee: tier.entryFee,
      prize: tier.prize,
      famePrize: state.tier * 2,
    });
  }

  // The summit: at fame 40 in the Circuit, The Duchess puts the belt up.
  // As champion, you defend it every third week for serious money.
  if (state.tier === 3) {
    const titleShot = !state.champion && state.fame >= CHAMPIONSHIP_FAME;
    const defense = state.champion && state.week % 3 === 0;
    if (titleShot || defense) {
      const duchess = RIVALS_BY_TIER[3][0]; // Guillotine, in title trim
      offers.push({
        key: `w${state.week}_title`,
        rivalId: duchess.id,
        builderName: titleShot ? duchess.builderName : 'Challenger of the week',
        botName: titleShot ? 'GUILLOTINE PRIME' : pick(rng, RIVALS_BY_TIER[3]).botName,
        attitude: titleShot
          ? 'The belt has a name on it. Hers.'
          : 'They want what you have.',
        accent: duchess.accent,
        parts: {
          chassis: 'ch_atlas_hull',
          weapon: 'wp_god_gavel',
          armour: 'ar_reactive_shell',
          core: 'co_fusion_brick',
          chip: 'chip_warden',
        },
        condition: { chassis: 100, weapon: 100, armour: 100, core: 100, chip: 100 },
        entryFee: titleShot ? TITLE_ENTRY : 0,
        prize: titleShot ? TITLE_PRIZE : DEFENSE_PRIZE,
        famePrize: titleShot ? TITLE_FAME : 3,
        title: true,
      });
    }
  }
  return offers;
}

// --- Promotion -----------------------------------------------------------------

export function canPromote(state: GameState): boolean {
  const gate = TIERS[state.tier].fameForNext;
  return gate !== null && state.fame >= gate && state.tier < 3;
}

/** Step up a tier — player's choice, never automatic. Rerolls the week. */
export function promote(state: GameState): boolean {
  if (!canPromote(state)) return false;
  state.tier = (state.tier + 1) as 1 | 2 | 3;
  rollWeek(state);
  return true;
}

// --- Crew -----------------------------------------------------------------------

const CREW_FIRST = ['Sal', 'Pip', 'Marge', 'Otto', 'Reyna', 'Bolt', 'Greasy', 'Iggy', 'Fern', 'Duke'];
const CREW_LAST = ['Spanner', 'Calipers', 'Volt', 'Grimes', 'Torque', 'Soldera', 'Flux', 'Crank'];

function generateCrewMarket(state: GameState): SavedCrewMember[] {
  const rng = weekRng(state, 0xc4e3);
  const count = state.crew.length < MAX_CREW ? 2 : 1;
  const out: SavedCrewMember[] = [];
  for (let i = 0; i < count; i++) {
    const wrench = rangeInt(rng, 1, 5);
    const tuning = rangeInt(rng, 1, Math.max(1, 6 - wrench)); // budgeted: no 5/5 gods
    out.push({
      id: `crew_w${state.week}_${i}`,
      name: `${pick(rng, CREW_FIRST)} ${pick(rng, CREW_LAST)}`,
      wrench,
      tuning,
      weeklyWage: 15 * (wrench + tuning),
      job: wrench >= tuning ? 'repair' : 'tune',
    });
  }
  return out;
}

export function hireCrew(state: GameState, marketIdx: number): boolean {
  const candidate = state.crewMarket[marketIdx];
  if (!candidate || state.crew.length >= MAX_CREW) return false;
  state.crewMarket.splice(marketIdx, 1);
  state.crew.push(candidate);
  return true;
}

export function fireCrew(state: GameState, crewIdx: number): boolean {
  if (!state.crew[crewIdx]) return false;
  state.crew.splice(crewIdx, 1);
  return true;
}

export function setCrewJob(state: GameState, crewIdx: number, job: CrewJob): boolean {
  const member = state.crew[crewIdx];
  if (!member) return false;
  member.job = job;
  return true;
}

/** Best Wrench among crew assigned to repairs — drives discounts + salvage. */
export function bestWrench(state: GameState): number {
  return Math.max(0, ...state.crew.filter((c) => c.job === 'repair').map((c) => c.wrench));
}

function bestTuning(state: GameState, job: CrewJob): number {
  return Math.max(0, ...state.crew.filter((c) => c.job === job).map((c) => c.tuning));
}

// --- Garage actions -----------------------------------------------------------

export function repairCost(state: GameState, slot: Slot): number {
  const bot = activeBot(state);
  const condition = bot.condition[slot];
  if (condition <= 0) return Infinity; // scrapped — replace, don't repair
  const base = Math.max(partById(bot.parts[slot]).cost, 120);
  const raw = Math.ceil(((100 - condition) / 100) * base * 0.5);
  // A good wrench hand cuts the bill, up to 30%.
  const discounted = Math.ceil(raw * (1 - 0.06 * bestWrench(state)));
  return Math.max(10, discounted);
}

/** Repair an equipped part to 100%. Returns false if unaffordable/scrapped. */
export function repairPart(state: GameState, slot: Slot): boolean {
  const bot = activeBot(state);
  const cost = repairCost(state, slot);
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

/** Swap an inventory part into the active bot; the old part goes to inventory. */
export function equipPart(state: GameState, invIdx: number): boolean {
  const bot = activeBot(state);
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

export function buyGarageSlot(state: GameState): boolean {
  if (state.garageSlots >= MAX_GARAGE_SLOTS || state.cash < GARAGE_SLOT_COST) return false;
  state.cash -= GARAGE_SLOT_COST;
  state.garageSlots++;
  return true;
}

/** True when storage holds at least one part of every kind. */
export function canAssembleBot(state: GameState): boolean {
  if (state.bots.length >= state.garageSlots) return false;
  return SLOTS.every((slot) => state.inventory.some((i) => partById(i.partId).kind === slot));
}

/** Build a second bot from storage — takes the best-condition part per slot. */
export function assembleBot(state: GameState, name: string): boolean {
  if (!canAssembleBot(state)) return false;
  const parts = {} as Record<Slot, string>;
  const condition = {} as Record<Slot, number>;
  for (const slot of SLOTS) {
    const candidates = state.inventory
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => partById(item.partId).kind === slot)
      .sort((a, b) => b.item.condition - a.item.condition);
    const best = candidates[0];
    parts[slot] = best.item.partId;
    condition[slot] = best.item.condition;
    state.inventory.splice(best.idx, 1);
  }
  state.bots.push({
    id: `player_bot_${state.bots.length + 1}`,
    name: name.trim().toUpperCase().slice(0, 14) || 'SPARE PARTS',
    accent: ACCENTS[state.bots.length % ACCENTS.length],
    parts,
    condition,
    chipFamiliarity: 0,
  });
  return true;
}

export function setActiveBot(state: GameState, idx: number): boolean {
  if (!state.bots[idx]) return false;
  state.activeBot = idx;
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
    player: resolveBuild(activeBot(state)),
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
  /** Parts your wrench hand pulled back from the scrap pile. */
  salvaged: Slot[];
  bark: string | null;
  /** This fight just won the Circuit belt. */
  titleWon: boolean;
}

/**
 * Apply a finished fight to the campaign: money, fame, rival records, and —
 * the part that makes losses matter — the player bot keeps every dent.
 * A crew member on repair duty gets a salvage check per scrapped part.
 */
export function settleMatch(
  state: GameState,
  offer: MatchOffer,
  winnerIdx: 0 | 1,
  result: 'ko' | 'judges',
  playerConditionAfter: Record<Slot, number>,
): SettleReport {
  const bot = activeBot(state);
  const won = winnerIdx === 0;
  const salvageRng = mulberry32((state.seed ^ (state.week * 31337) ^ hashKey(offer.key)) >>> 0);
  const wrench = bestWrench(state);
  const salvaged: Slot[] = [];

  const damage = SLOTS.map((slot) => {
    const before = bot.condition[slot];
    let after = Math.max(0, Math.round(playerConditionAfter[slot]));
    let scrapped = before > 0 && after <= 0;
    if (scrapped && wrench > 0 && salvageRng() < 0.12 * wrench) {
      after = 15; // dragged off the scrap pile, barely
      scrapped = false;
      salvaged.push(slot);
    }
    return { slot, before, after, scrapped };
  });
  for (const d of damage) bot.condition[d.slot] = d.after;

  const tier = TIERS[state.tier];
  const sponsored = state.fame >= SPONSOR_FAME;
  const prize = won ? offer.prize : tier.lossPurse;
  const sponsorBonus = won && sponsored ? SPONSOR_WIN_BONUS : 0;
  const fameGained = won ? offer.famePrize : 0;
  state.cash += prize + sponsorBonus;
  state.fame += fameGained;
  state.record[won ? 'wins' : 'losses']++;

  let bark: string | null = null;
  if (offer.rivalId) {
    const rec = (state.rivalRecords[offer.rivalId] ??= { wins: 0, losses: 0 });
    rec[won ? 'losses' : 'wins']++; // record is from the rival's side
    const rival = RIVALS_BY_TIER[state.tier].find((r) => r.id === offer.rivalId);
    bark = rival ? (won ? rival.winBark : rival.lossBark) : null;
  }

  let titleWon = false;
  if (offer.title) {
    if (won && !state.champion) {
      state.champion = true;
      titleWon = true;
      bark = '"...Keep it polished. I\'ll be back for it." — The Duchess';
    } else if (!won && state.champion && offer.entryFee === 0) {
      // Lost a defense: the belt walks.
      state.champion = false;
      bark = '"GIVE IT HERE." The Circuit has a new champion.';
    }
  }

  return { won, result, prize, sponsorBonus, fameGained, damage, salvaged, bark, titleWon };
}

export interface WeekReport {
  sponsorPaid: number;
  wagesPaid: number;
  /** Crew who walked because the till was empty. */
  crewLeft: string[];
  /** Condition % restored per part by the tune-up crew. */
  tunedBy: number;
  familiarityGained: number;
}

/** Advance to next week: sponsor stipend, wages, crew jobs, fresh everything. */
export function advanceWeek(state: GameState): WeekReport {
  state.week++;
  const sponsorPaid = state.fame >= SPONSOR_FAME ? SPONSOR_WEEKLY : 0;
  state.cash += sponsorPaid;

  // Wages first: anyone you can't pay walks. Loyalty costs money.
  let wagesPaid = 0;
  const crewLeft: string[] = [];
  state.crew = state.crew.filter((member) => {
    if (state.cash >= member.weeklyWage) {
      state.cash -= member.weeklyWage;
      wagesPaid += member.weeklyWage;
      return true;
    }
    crewLeft.push(member.name);
    return false;
  });

  // Tune-up: weekly free condition recovery on every non-scrapped part.
  const tunedBy = bestTuning(state, 'tune') * 4;
  if (tunedBy > 0) {
    for (const bot of state.bots) {
      for (const slot of SLOTS) {
        if (bot.condition[slot] > 0) bot.condition[slot] = Math.min(100, bot.condition[slot] + tunedBy);
      }
    }
  }

  // Sparring: chips learn their frames — familiarity feeds Wits.
  const familiarityGained = bestTuning(state, 'spar') * 2;
  if (familiarityGained > 0) {
    for (const bot of state.bots) {
      bot.chipFamiliarity = Math.min(50, bot.chipFamiliarity + familiarityGained);
    }
  }

  rollWeek(state);
  return { sponsorPaid, wagesPaid, crewLeft, tunedBy, familiarityGained };
}

/** Derived stats for any saved bot — the card the player reads everywhere. */
export function statsFor(saved: SavedBot) {
  return computeStats(resolveBuild(saved));
}
