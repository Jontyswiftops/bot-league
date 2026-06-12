// Core entity shapes. Plain data objects only — these get serialized into
// saves, sent through the headless balance runner, and (v2) synced to Firebase.

export type Slot = 'chassis' | 'weapon' | 'armour' | 'core' | 'chip';

interface BasePart {
  id: string;
  name: string;
  /** Contributes to total weight, which drags Speed down. */
  weight: number;
  cost: number;
}

export interface ChassisDef extends BasePart {
  kind: 'chassis';
  hull: number;
  plating: number;
  /** Higher = faster movement and turning before weight penalty. */
  agility: number;
}

// spinner: fast cadence, steady chip damage.
// hammer:  slow, huge swings that CRUSH part condition.
// ram:     contact charges — weight and speed are the weapon.
export type WeaponArchetype = 'spinner' | 'hammer' | 'ram';

export interface WeaponDef extends BasePart {
  kind: 'weapon';
  archetype: WeaponArchetype;
  damage: number;
  /** Attack range in arena units (px). */
  reach: number;
  energyCost: number;
  /** Ticks between attacks (sim runs at 20 ticks/sec). */
  cooldownTicks: number;
}

export interface ArmourDef extends BasePart {
  kind: 'armour';
  plating: number;
  hullBonus: number;
}

export interface CoreDef extends BasePart {
  kind: 'core';
  /** Max energy. */
  capacity: number;
  /** Energy per second. */
  regen: number;
  /** Multiplier on Punch and Speed (0.9 weak cell .. 1.3 hot cell). */
  output: number;
}

export interface ChipWeights {
  /** 0..1 — scoring bonus for closing in and striking vs circling. */
  aggression: number;
  /** 0..1 — hull% threshold (scaled) under which RETREAT unlocks. */
  caution: number;
  /** 0..1 — hit-location bias toward the enemy's most damaged part. */
  opportunism: number;
  /** 0..1 — below 25% hull: ignore caution, hit harder, aim worse. */
  ferocity: number;
  /** 0..1 — player-command compliance speed; 2v2 formation (v1.5). */
  discipline: number;
}

export interface ChipDef extends BasePart {
  kind: 'chip';
  grade: number; // 1..3, drives Wits
  weights: ChipWeights;
}

export type PartDef = ChassisDef | WeaponDef | ArmourDef | CoreDef | ChipDef;

/** Per-slot condition, 0..100. 0 = disabled in-fight, scrapped after. */
export type Condition = Record<Slot, number>;

/** A built bot: five slotted parts plus their current condition. */
export interface BotBuild {
  id: string;
  name: string;
  /** Accent colour for the renderer (0xRRGGBB). Cosmetic only. */
  accent: number;
  chassis: ChassisDef;
  weapon: WeaponDef;
  armour: ArmourDef;
  core: CoreDef;
  chip: ChipDef;
  condition: Condition;
  /** Chip familiarity with this frame (0–50), earned by sparring. Boosts Wits. */
  familiarity?: number;
}

/** The six derived stats — the only numbers the player ever sees on a card. */
export interface DerivedStats {
  hull: number;
  plating: number;
  /** Arena units per second. */
  speed: number;
  punch: number;
  reactorCap: number;
  reactorRegen: number;
  /** 0..1 — accuracy, part-targeting precision, command response. */
  wits: number;
}
