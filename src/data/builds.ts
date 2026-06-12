// Build factory used by the M0 fight viewer and the headless balance runner:
// assembles a random-but-deterministic bot from the part pools.

import { mulberry32, pick, rangeInt, type Rng } from '../sim/rng';
import type { BotBuild } from '../sim/types';
import { ARMOURS, CHASSIS, CORES, WEAPONS } from './parts';
import { CHIPS } from './chips';

const NAME_FRONT = ['Rust', 'Mag', 'Volt', 'Gear', 'Scrap', 'Piston', 'Diesel', 'Socket', 'Crank', 'Brick'];
const NAME_BACK = ['Bucket', 'Fang', 'Howl', 'Mauler', 'Royale', 'Biter', 'Widow', 'Hound', 'Queen', 'Jack'];

export function randomBotName(rng: Rng): string {
  return `${pick(rng, NAME_FRONT)} ${pick(rng, NAME_BACK)}`;
}

const ACCENTS = [0xffb300, 0x00e5ff, 0xff4d6d, 0x76ff03, 0xb388ff, 0xff8a30];

export function randomBuild(rng: Rng, id: string, accentIdx: number): BotBuild {
  return {
    id,
    name: `${pick(rng, NAME_FRONT)} ${pick(rng, NAME_BACK)}`,
    accent: ACCENTS[accentIdx % ACCENTS.length],
    chassis: pick(rng, CHASSIS),
    weapon: pick(rng, WEAPONS),
    armour: pick(rng, ARMOURS),
    core: pick(rng, CORES),
    chip: pick(rng, CHIPS),
    condition: {
      chassis: rangeInt(rng, 70, 100),
      weapon: rangeInt(rng, 70, 100),
      armour: rangeInt(rng, 70, 100),
      core: rangeInt(rng, 70, 100),
      chip: 100,
    },
  };
}

/** Two distinct builds for a fight, derived from a single seed. */
export function matchupFromSeed(seed: number): [BotBuild, BotBuild] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const a = randomBuild(rng, 'bot_a', rangeInt(rng, 0, ACCENTS.length - 1));
  let b = randomBuild(rng, 'bot_b', rangeInt(rng, 0, ACCENTS.length - 1));
  while (b.accent === a.accent) b = { ...b, accent: ACCENTS[(ACCENTS.indexOf(b.accent) + 1) % ACCENTS.length] };
  if (b.name === a.name) b = { ...b, name: `${b.name} II` };
  return [a, b];
}
