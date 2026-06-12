// Drought diagnostics: for fights with a >10s no-damage window, report what
// the bots were doing (FSM states, distance, energy) during the worst window.
// Run: npx tsx tools/balance/diag.ts

import { createFight, MAX_TICKS, TICKS_PER_SECOND } from '../../src/sim/fight';
import { matchupFromSeed } from '../../src/data/builds';

interface TickSample {
  tick: number;
  states: string;
  dist: number;
  energyA: number;
  energyB: number;
}

const droughtProfiles = new Map<string, number>();
let droughtFights = 0;
const N = 300;

for (let i = 0; i < N; i++) {
  const seed = 1000 + i;
  const [a, b] = matchupFromSeed(seed);
  const fight = createFight(a, b, seed);
  const samples: TickSample[] = [];
  let lastDamage = 0;
  let worst: { start: number; end: number } | null = null;

  while (!fight.state.over && fight.state.tick < MAX_TICKS + 10) {
    const events = fight.step();
    const [ba, bb] = fight.state.bots;
    samples.push({
      tick: fight.state.tick,
      states: `${ba.fsm}/${bb.fsm}`,
      dist: Math.hypot(ba.x - bb.x, ba.y - bb.y),
      energyA: ba.energy / ba.stats.reactorCap,
      energyB: bb.energy / bb.stats.reactorCap,
    });
    if (events.some((e) => e.type === 'hit' || e.type === 'ram')) {
      const gap = fight.state.tick - lastDamage;
      if (gap > 10 * TICKS_PER_SECOND && (!worst || gap > worst.end - worst.start)) {
        worst = { start: lastDamage, end: fight.state.tick };
      }
      lastDamage = fight.state.tick;
    }
  }
  const tailGap = fight.state.tick - lastDamage;
  if (tailGap > 10 * TICKS_PER_SECOND && (!worst || tailGap > worst.end - worst.start)) {
    worst = { start: lastDamage, end: fight.state.tick };
  }

  if (worst) {
    droughtFights++;
    for (const s of samples) {
      if (s.tick >= worst.start && s.tick <= worst.end) {
        droughtProfiles.set(s.states, (droughtProfiles.get(s.states) ?? 0) + 1);
      }
    }
    if (droughtFights <= 5) {
      const mid = samples.filter((s) => s.tick >= worst!.start && s.tick <= worst!.end);
      const avgDist = mid.reduce((acc, s) => acc + s.dist, 0) / mid.length;
      const avgEA = mid.reduce((acc, s) => acc + s.energyA, 0) / mid.length;
      const avgEB = mid.reduce((acc, s) => acc + s.energyB, 0) / mid.length;
      console.log(
        `seed ${seed}: drought ${((worst.end - worst.start) / TICKS_PER_SECOND).toFixed(1)}s ` +
          `@${(worst.start / TICKS_PER_SECOND).toFixed(0)}s  avgDist ${avgDist.toFixed(0)}px  ` +
          `energy ${avgEA.toFixed(2)}/${avgEB.toFixed(2)}`,
      );
    }
  }
}

console.log(`\n${droughtFights}/${N} fights had a >10s drought. State pairs during droughts (ticks):`);
const sorted = [...droughtProfiles.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10);
for (const [statePair, ticks] of sorted) {
  console.log(`  ${statePair.padEnd(24)} ${ticks}`);
}
