// The combat engine. Pure simulation: fixed 20Hz tick over plain data, seeded
// RNG, no Phaser, no wall clock. The renderer (and the headless balance
// runner) drive it by calling step() and reading the event list each tick.

import { mulberry32, range, weightedPick, type Rng } from './rng';
import { computeStats } from './stats';
import type { BotBuild, DerivedStats, Slot } from './types';

export const TICKS_PER_SECOND = 20;
export const TICK_DT = 1 / TICKS_PER_SECOND;
/** Hard cap: at 90s the judges score the fight on remaining hull%. */
export const MAX_TICKS = 90 * TICKS_PER_SECOND;
/** After 55s "crowd heat" ramps all damage up to force a finish. */
export const HEAT_START_TICK = 55 * TICKS_PER_SECOND;

export const ARENA = { w: 800, h: 520, wall: 28 };
export const BOT_RADIUS = 26;

export type FsmState =
  | 'SEEK'
  | 'APPROACH'
  | 'STRIKE'
  | 'RECOVER'
  | 'REPOSITION'
  | 'RETREAT'
  | 'DESPERATE';

export type CommandType = 'ATTACK' | 'GUARD' | 'FOCUS' | 'OVERDRIVE';

export interface BotCommand {
  type: CommandType;
  part: Slot | null;
  /** Ticks until the chip complies — low discipline chips dawdle. */
  delay: number;
  /** Ticks the command stays in force once active. */
  remaining: number;
  activated: boolean;
}

export type FightEvent =
  | { type: 'hit'; bot: 0 | 1; target: 0 | 1; part: Slot; damage: number; x: number; y: number }
  | { type: 'command'; bot: 0 | 1; command: CommandType }
  | { type: 'miss'; bot: 0 | 1; x: number; y: number }
  | { type: 'ram'; bot: 0 | 1; target: 0 | 1; damage: number; x: number; y: number }
  | { type: 'partDisabled'; bot: 0 | 1; part: Slot }
  | { type: 'panelPop'; bot: 0 | 1; x: number; y: number }
  | { type: 'stateChange'; bot: 0 | 1; from: FsmState; to: FsmState }
  | { type: 'lowPower'; bot: 0 | 1 }
  | { type: 'desperate'; bot: 0 | 1 }
  | { type: 'crowdHeat' }
  | { type: 'ko'; bot: 0 | 1; x: number; y: number }
  | { type: 'judges'; winner: 0 | 1 };

export interface BotFightState {
  build: BotBuild;
  stats: DerivedStats;
  x: number;
  y: number;
  /** Last tick's velocity (units/sec) — used by foes for lead pursuit. */
  vx: number;
  vy: number;
  /** Radians; 0 = facing +x. */
  heading: number;
  hull: number;
  energy: number;
  fsm: FsmState;
  ticksInState: number;
  weaponCooldown: number;
  /** Live per-fight copy — the build's persistent condition is settled post-fight. */
  condition: Record<Slot, number>;
  /** Armour panels remaining for the renderer to pop (3 → 0). */
  panels: number;
  /** Cumulative ticks spent fleeing — resolve to run is a finite resource. */
  retreatTicksTotal: number;
  lowPowerAnnounced: boolean;
  /** Player coaching command in flight (delay) or in force (remaining). */
  command: BotCommand | null;
  /** Permanent hit-location bias set by a FOCUS command. */
  focusPart: Slot | null;
  /** Ticks of OVERDRIVE buff left (+speed/+punch). */
  odTicks: number;
  overdriveUsed: boolean;
}

export interface FightState {
  seed: number;
  tick: number;
  bots: [BotFightState, BotFightState];
  over: boolean;
  winner: -1 | 0 | 1;
  /** How the fight ended, for commentary. */
  result: 'none' | 'ko' | 'judges';
  leadChanges: number;
  lastLeader: -1 | 0 | 1;
  /** Tick of the last damage event — used to detect stalemates. */
  lastDamageTick: number;
  heatAnnounced: boolean;
}

export interface Fight {
  state: FightState;
  /** Advance one tick; returns the events that happened during it. */
  step(): FightEvent[];
}

function makeBotState(build: BotBuild, x: number, y: number, heading: number): BotFightState {
  const condition = { ...build.condition };
  const stats = computeStats({ ...build, condition });
  return {
    build,
    stats,
    x,
    y,
    vx: 0,
    vy: 0,
    heading,
    hull: stats.hull,
    energy: stats.reactorCap,
    fsm: 'SEEK',
    ticksInState: 0,
    weaponCooldown: 0,
    condition,
    panels: 3,
    retreatTicksTotal: 0,
    lowPowerAnnounced: false,
    command: null,
    focusPart: null,
    odTicks: 0,
    overdriveUsed: false,
  };
}

/**
 * Issue a coaching command to a bot. External input from the renderer — the
 * chip's discipline decides how fast (or whether it feels like) complying.
 * Returns false if the command is spent (OVERDRIVE is once per fight).
 */
export function issueCommand(
  state: FightState,
  idx: 0 | 1,
  type: CommandType,
  part: Slot | null = null,
): boolean {
  const me = state.bots[idx];
  if (state.over) return false;
  if (type === 'OVERDRIVE') {
    if (me.overdriveUsed) return false;
    me.overdriveUsed = true;
  }
  const delay = Math.round((1 - me.build.chip.weights.discipline) * 30); // 0–1.5s
  const remaining = type === 'ATTACK' || type === 'GUARD' ? 80 : 1; // 4s holds
  me.command = { type, part, delay, remaining, activated: false };
  return true;
}

export function createFight(botA: BotBuild, botB: BotBuild, seed: number): Fight {
  const rng = mulberry32(seed);
  const midY = ARENA.h / 2;
  const state: FightState = {
    seed,
    tick: 0,
    bots: [
      makeBotState(botA, ARENA.wall + 90, midY, 0),
      makeBotState(botB, ARENA.w - ARENA.wall - 90, midY, Math.PI),
    ],
    over: false,
    winner: -1,
    result: 'none',
    leadChanges: 0,
    lastLeader: -1,
    lastDamageTick: 0,
    heatAnnounced: false,
  };
  return { state, step: () => stepFight(state, rng) };
}

// --- FSM ------------------------------------------------------------------

function hullPct(b: BotFightState): number {
  return b.hull / b.stats.hull;
}

function dist(a: BotFightState, b: BotFightState): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function weaponReady(b: BotFightState): boolean {
  return (
    b.condition.weapon > 0 &&
    b.weaponCooldown <= 0 &&
    b.energy >= b.build.weapon.energyCost
  );
}

/** Effective attack reach: a dead weapon means ramming at point-blank. */
function reach(b: BotFightState): number {
  return b.condition.weapon > 0 ? b.build.weapon.reach : BOT_RADIUS * 2 + 6;
}

/**
 * Each tick a bot scores its candidate states; chip weights are multipliers
 * and thresholds on those scores. Hysteresis (minimum ticks in state) stops
 * twitchy flip-flopping.
 */
function decideState(me: BotFightState, foe: BotFightState, rng: Rng, tick: number): FsmState {
  const w = me.build.chip.weights;
  const hp = hullPct(me);
  const d = dist(me, foe);
  const myReach = reach(me);
  const energyFrac = me.energy / me.stats.reactorCap;

  // Berserk overrides everything once it triggers — even the coach.
  if (hp < 0.25 && w.ferocity > 0.5) return 'DESPERATE';
  if (me.fsm === 'DESPERATE') return 'DESPERATE';

  // An active coaching command overrides normal scoring while it holds.
  const cmd = me.command;
  if (cmd && cmd.delay <= 0 && cmd.remaining > 0) {
    if (cmd.type === 'GUARD') return 'RECOVER';
    if (cmd.type === 'ATTACK') {
      return d <= myReach * 1.15 && weaponReady(me) ? 'STRIKE' : 'APPROACH';
    }
  }

  // Hysteresis: commit to a state for at least 0.4s.
  if (me.ticksInState < 8 && me.fsm !== 'SEEK') return me.fsm;

  // Blood in the water: a retreating or recovering foe invites pressure.
  const foeWeak = foe.fsm === 'RETREAT' || foe.fsm === 'RECOVER';

  // Once the crowd heats up, everyone gets pushed forward — late-fight
  // circling is a stalemate, and stalemates are the one unforgivable sin.
  const heatPush = tick > HEAT_START_TICK ? 0.5 : 0;

  const scores: Partial<Record<FsmState, number>> = {};
  scores.APPROACH =
    0.5 + w.aggression * 0.6 + (d > myReach * 2 ? 0.3 : 0) + (foeWeak ? 0.45 : 0) + heatPush;
  scores.STRIKE = d <= myReach * 1.15 && weaponReady(me) ? 1.2 + w.aggression * 0.8 : 0;
  scores.REPOSITION = 0.45 + (1 - w.aggression) * 0.5 + (d <= myReach * 1.5 ? 0.2 : 0);
  scores.RECOVER = energyFrac < 0.22 ? 1.4 : energyFrac < 0.4 ? 0.5 + (1 - w.aggression) * 0.4 : 0;
  // Caution sets the hull% under which retreat becomes attractive — but the
  // resolve to run is finite across the WHOLE fight. A bot that has fled for
  // ~4s total stops fleeing and turns for a last stand. No endless kiting.
  const retreatThreshold = 0.15 + w.caution * 0.45;
  let retreatScore = hp < retreatThreshold ? 1.1 + w.caution * 0.8 : 0;
  retreatScore /= 1 + me.retreatTicksTotal / 80;
  scores.RETREAT = retreatScore;

  let best: FsmState = 'APPROACH';
  let bestScore = -1;
  for (const [s, score] of Object.entries(scores) as [FsmState, number][]) {
    // Tiny jitter keeps mirrored builds from dancing in lockstep forever.
    const jittered = score + range(rng, 0, 0.08);
    if (jittered > bestScore) {
      bestScore = jittered;
      best = s;
    }
  }
  return best;
}

// --- Movement ---------------------------------------------------------------

function moveBot(me: BotFightState, foe: BotFightState, rng: Rng): void {
  const d = dist(me, foe);
  const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
  // Lead pursuit: aim where the foe will be, not where it is — chasers must
  // actually catch runners or fights stall into kiting stalemates. Short
  // prediction only; long leads make mutual chases orbit forever.
  const interceptT = Math.min(0.55, (d / Math.max(1, me.stats.speed)) * 0.6);
  const toIntercept = Math.atan2(
    foe.y + foe.vy * interceptT - me.y,
    foe.x + foe.vx * interceptT - me.x,
  );
  let desiredHeading = toFoe;
  let speedFrac = 1;

  switch (me.fsm) {
    case 'SEEK':
    case 'APPROACH':
    case 'DESPERATE':
      desiredHeading = toIntercept;
      speedFrac = me.fsm === 'DESPERATE' ? 1.15 : 1;
      break;
    case 'STRIKE':
      desiredHeading = toFoe;
      speedFrac = d > reach(me) * 0.8 ? 0.6 : 0.15;
      break;
    case 'REPOSITION': {
      // Orbit: strafe perpendicular to the foe, spiralling in toward the edge
      // of weapon reach — circling must threaten, never disengage.
      const orbitDir = (me.build.id.charCodeAt(0) + me.panels) % 2 === 0 ? 1 : -1;
      const spiralIn = d > reach(me) * 1.05 ? -0.55 * orbitDir : 0;
      desiredHeading = toFoe + (Math.PI / 2) * orbitDir + spiralIn;
      speedFrac = 0.7;
      break;
    }
    case 'RECOVER':
    case 'RETREAT':
      desiredHeading = toFoe + Math.PI; // back off
      // A wounded bot limps — fleeing is slower than chasing, so pursuit pays.
      speedFrac = me.fsm === 'RETREAT' ? 0.6 : 0.5;
      break;
  }

  // Wall avoidance: steer back toward the centre when hugging a wall.
  const margin = ARENA.wall + BOT_RADIUS + 12;
  if (me.x < margin || me.x > ARENA.w - margin || me.y < margin || me.y > ARENA.h - margin) {
    const toCentre = Math.atan2(ARENA.h / 2 - me.y, ARENA.w / 2 - me.x);
    // Blend heavily toward centre — cornered bots must escape, not vibrate.
    desiredHeading = blendAngles(desiredHeading, toCentre, 0.65);
  }

  // Turn-rate-limited heading change (radians/tick scaled by speed stat).
  const turnRate = (3.2 + me.stats.speed / 90) * TICK_DT;
  me.heading = turnTowards(me.heading, desiredHeading, turnRate + range(rng, 0, 0.01));

  if (me.odTicks > 0) speedFrac *= 1.2; // OVERDRIVE: legs get hot too
  const v = me.stats.speed * speedFrac * TICK_DT;
  me.vx = Math.cos(me.heading) * me.stats.speed * speedFrac;
  me.vy = Math.sin(me.heading) * me.stats.speed * speedFrac;
  me.x += Math.cos(me.heading) * v;
  me.y += Math.sin(me.heading) * v;

  // Hard clamp inside the walls.
  me.x = Math.min(Math.max(me.x, ARENA.wall + BOT_RADIUS), ARENA.w - ARENA.wall - BOT_RADIUS);
  me.y = Math.min(Math.max(me.y, ARENA.wall + BOT_RADIUS), ARENA.h - ARENA.wall - BOT_RADIUS);
}

function turnTowards(current: number, target: number, maxDelta: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const clamped = Math.max(-maxDelta, Math.min(maxDelta, diff));
  return current + clamped;
}

function blendAngles(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function separate(a: BotFightState, b: BotFightState): void {
  const d = dist(a, b);
  const minD = BOT_RADIUS * 2;
  if (d >= minD || d === 0) return;
  const push = (minD - d) / 2;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  a.x -= Math.cos(angle) * push;
  a.y -= Math.sin(angle) * push;
  b.x += Math.cos(angle) * push;
  b.y += Math.sin(angle) * push;
}

// --- Damage ---------------------------------------------------------------

const HIT_LOCATIONS: Slot[] = ['chassis', 'armour', 'weapon', 'core'];
const BASE_LOCATION_WEIGHTS: Record<string, number> = {
  chassis: 0.45,
  armour: 0.25,
  weapon: 0.2,
  core: 0.1,
};

function pickHitLocation(rng: Rng, attacker: BotFightState, target: BotFightState): Slot {
  const opp = attacker.build.chip.weights.opportunism;
  const weights = HIT_LOCATIONS.map((slot) => {
    let w = BASE_LOCATION_WEIGHTS[slot];
    if (target.condition[slot] <= 0) w *= 0.15; // already-dead parts soak little
    // Opportunists aim where the enemy is already hurting.
    const damageFrac = 1 - target.condition[slot] / 100;
    w *= 1 + opp * damageFrac * 2.5;
    // A FOCUS command from the coach biases aim hard toward one part.
    if (attacker.focusPart === slot) w *= 6;
    return w;
  });
  return weightedPick(rng, HIT_LOCATIONS, weights);
}

function heatMultiplier(tick: number): number {
  if (tick <= HEAT_START_TICK) return 1;
  // +2.5% damage per second past the heat mark — fights MUST end.
  return 1 + ((tick - HEAT_START_TICK) / TICKS_PER_SECOND) * 0.025;
}

function applyDamage(
  state: FightState,
  events: FightEvent[],
  attackerIdx: 0 | 1,
  raw: number,
  isRam: boolean,
  rng: Rng,
): void {
  const targetIdx = (1 - attackerIdx) as 0 | 1;
  const attacker = state.bots[attackerIdx];
  const target = state.bots[targetIdx];

  const part = isRam ? 'chassis' : pickHitLocation(rng, attacker, target);
  const variance = range(rng, 0.8, 1.2);
  const net = Math.max(1, raw * variance * heatMultiplier(state.tick) - target.stats.plating);

  target.hull -= net;
  state.lastDamageTick = state.tick;

  // The struck part takes condition damage alongside the hull. Tuned so a
  // part dies in roughly a third of fights — a story beat, not the norm.
  const before = target.condition[part];
  if (part !== 'chassis') {
    target.condition[part] = Math.max(0, before - net * 1.3);
  } else {
    // Chassis condition floors at 1 — the frame only "dies" when hull hits 0.
    target.condition.chassis = Math.max(1, before - net * 0.7);
  }

  const hitX = (attacker.x + target.x) / 2;
  const hitY = (attacker.y + target.y) / 2;
  if (isRam) {
    events.push({ type: 'ram', bot: attackerIdx, target: targetIdx, damage: net, x: hitX, y: hitY });
  } else {
    events.push({ type: 'hit', bot: attackerIdx, target: targetIdx, part, damage: net, x: hitX, y: hitY });
  }

  if (before > 0 && target.condition[part] <= 0 && part !== 'chassis') {
    target.stats = computeStats({ ...target.build, condition: target.condition });
    events.push({ type: 'partDisabled', bot: targetIdx, part });
  }

  // Armour panels visibly fly off at 66% / 33% / disabled.
  const armourFrac = target.condition.armour / 100;
  const panelsDue = armourFrac > 0.66 ? 3 : armourFrac > 0.33 ? 2 : armourFrac > 0 ? 1 : 0;
  while (target.panels > panelsDue) {
    target.panels--;
    events.push({ type: 'panelPop', bot: targetIdx, x: target.x, y: target.y });
  }
}

function tryAttack(state: FightState, events: FightEvent[], idx: 0 | 1, rng: Rng): void {
  const me = state.bots[idx];
  const foe = state.bots[(1 - idx) as 0 | 1];
  const d = dist(me, foe);

  if (d > reach(me)) return;

  if (me.condition.weapon > 0) {
    if (me.weaponCooldown > 0) return;
    if (me.energy < me.build.weapon.energyCost) {
      if (!me.lowPowerAnnounced && me.energy < me.stats.reactorCap * 0.15) {
        me.lowPowerAnnounced = true;
        events.push({ type: 'lowPower', bot: idx });
      }
      return;
    }
    me.energy -= me.build.weapon.energyCost;
    me.weaponCooldown = me.build.weapon.cooldownTicks;
    // Swinging wears your own weapon a touch — long fights grind both bots down.
    me.condition.weapon = Math.max(0, me.condition.weapon - 0.25);

    const desperate = me.fsm === 'DESPERATE';
    const speedDodge = (foe.stats.speed / 200) * 0.18;
    const hitChance = Math.max(
      0.25,
      Math.min(0.95, 0.6 + (me.stats.wits - 0.5) - speedDodge - (desperate ? 0.08 : 0)),
    );
    if (rng() < hitChance) {
      const odBoost = me.odTicks > 0 ? 1.3 : 1;
      const punch = me.stats.punch * (desperate ? 1.3 : 1) * odBoost;
      applyDamage(state, events, idx, punch, false, rng);
    } else {
      events.push({ type: 'miss', bot: idx, x: (me.x + foe.x) / 2, y: (me.y + foe.y) / 2 });
    }
  } else {
    // Weapon's dead: ramming speed. Weight is the weapon now.
    if (me.weaponCooldown > 0) return;
    me.weaponCooldown = 24; // slow — 1.2s between rams
    const mass = me.build.chassis.weight + me.build.armour.weight;
    const ramDamage = mass * 0.06 * (me.stats.speed / MAXISH_SPEED);
    applyDamage(state, events, idx, Math.max(3, ramDamage), true, rng);
    me.hull -= 1; // ramming hurts you a little too
  }
}

const MAXISH_SPEED = 160;

// --- Main tick --------------------------------------------------------------

function stepFight(state: FightState, rng: Rng): FightEvent[] {
  if (state.over) return [];
  const events: FightEvent[] = [];
  state.tick++;

  if (!state.heatAnnounced && state.tick > HEAT_START_TICK) {
    state.heatAnnounced = true;
    events.push({ type: 'crowdHeat' });
  }

  for (const idx of [0, 1] as const) {
    const me = state.bots[idx];
    const foe = state.bots[(1 - idx) as 0 | 1];

    // Energy regen — doubled while deliberately recovering.
    const regenScale = me.fsm === 'RECOVER' || me.fsm === 'RETREAT' ? 2 : 1;
    me.energy = Math.min(me.stats.reactorCap, me.energy + me.stats.reactorRegen * regenScale * TICK_DT);
    if (me.weaponCooldown > 0) me.weaponCooldown--;
    if (me.odTicks > 0) me.odTicks--;

    // Coaching command lifecycle: dawdle (delay), activate once, hold, expire.
    const cmd = me.command;
    if (cmd) {
      if (cmd.delay > 0) {
        cmd.delay--;
      } else {
        if (!cmd.activated) {
          cmd.activated = true;
          events.push({ type: 'command', bot: idx, command: cmd.type });
          if (cmd.type === 'FOCUS') me.focusPart = cmd.part;
          if (cmd.type === 'OVERDRIVE') {
            // Energy dump: full reactor + 5s of hot output, paid in core wear.
            me.odTicks = 100;
            me.energy = me.stats.reactorCap;
            me.condition.core = Math.max(1, me.condition.core - 8);
            me.stats = computeStats({ ...me.build, condition: me.condition });
          }
        }
        cmd.remaining--;
        if (cmd.remaining <= 0) me.command = null;
      }
    }

    const next = decideState(me, foe, rng, state.tick);
    if (next !== me.fsm) {
      if (next === 'DESPERATE') events.push({ type: 'desperate', bot: idx });
      events.push({ type: 'stateChange', bot: idx, from: me.fsm, to: next });
      me.fsm = next;
      me.ticksInState = 0;
    } else {
      me.ticksInState++;
    }
    if (me.fsm === 'RETREAT') me.retreatTicksTotal++;

    moveBot(me, foe, rng);
  }

  separate(state.bots[0], state.bots[1]);

  for (const idx of [0, 1] as const) {
    const me = state.bots[idx];
    // Bots swing opportunistically whenever in reach — except while
    // deliberately conserving energy in RECOVER. Drive-by hits are flavour.
    if (me.fsm !== 'RECOVER') {
      tryAttack(state, events, idx, rng);
    }
  }

  // Lead-change tracking (the "comeback" metric for the M0 fun rubric).
  const pctA = hullPct(state.bots[0]);
  const pctB = hullPct(state.bots[1]);
  const leader: -1 | 0 | 1 = Math.abs(pctA - pctB) < 0.02 ? -1 : pctA > pctB ? 0 : 1;
  if (leader !== -1 && state.lastLeader !== -1 && leader !== state.lastLeader) {
    state.leadChanges++;
  }
  if (leader !== -1) state.lastLeader = leader;

  // End conditions.
  for (const idx of [0, 1] as const) {
    if (state.bots[idx].hull <= 0 && !state.over) {
      state.over = true;
      state.result = 'ko';
      state.winner = (1 - idx) as 0 | 1;
      const dead = state.bots[idx];
      events.push({ type: 'ko', bot: idx, x: dead.x, y: dead.y });
    }
  }
  if (!state.over && state.tick >= MAX_TICKS) {
    state.over = true;
    state.result = 'judges';
    state.winner = pctA >= pctB ? 0 : 1;
    events.push({ type: 'judges', winner: state.winner });
  }

  return events;
}
