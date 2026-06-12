// Headless balance runner — pits random builds against each other N times and
// prints the numbers behind the M0 internal rubric:
//   * fights end in 45–100s across random builds
//   * lead changes in >= 30% of fights
//   * no stalemate (zero damage) window longer than 10s
// Run: npm run balance [-- --n 1000]

import { createFight, MAX_TICKS, TICKS_PER_SECOND, type FightEvent } from '../../src/sim/fight';
import { matchupFromSeed } from '../../src/data/builds';

const nArg = process.argv.indexOf('--n');
const N = nArg >= 0 ? parseInt(process.argv[nArg + 1], 10) : 500;

interface FightReport {
  seconds: number;
  leadChanges: number;
  longestDroughtSec: number;
  result: string;
  winnerChip: string;
  loserChip: string;
  partDisables: number;
}

function runOne(seed: number): FightReport {
  const [a, b] = matchupFromSeed(seed);
  const fight = createFight(a, b, seed);
  let lastDamageTick = 0;
  let longestDrought = 0;
  let partDisables = 0;

  while (!fight.state.over && fight.state.tick < MAX_TICKS + 10) {
    const events: FightEvent[] = fight.step();
    for (const e of events) {
      if (e.type === 'hit' || e.type === 'ram') {
        longestDrought = Math.max(longestDrought, fight.state.tick - lastDamageTick);
        lastDamageTick = fight.state.tick;
      }
      if (e.type === 'partDisabled') partDisables++;
    }
  }
  longestDrought = Math.max(longestDrought, fight.state.tick - lastDamageTick);

  const winner = fight.state.winner;
  const builds = [a, b];
  return {
    seconds: fight.state.tick / TICKS_PER_SECOND,
    leadChanges: fight.state.leadChanges,
    longestDroughtSec: longestDrought / TICKS_PER_SECOND,
    result: fight.state.result,
    winnerChip: builds[winner]?.chip.name ?? '?',
    loserChip: builds[1 - winner]?.chip.name ?? '?',
    partDisables,
  };
}

const reports: FightReport[] = [];
for (let i = 0; i < N; i++) reports.push(runOne(1000 + i));

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (n: number) => `${((n / N) * 100).toFixed(1)}%`;

const durations = reports.map((r) => r.seconds);
const inWindow = reports.filter((r) => r.seconds >= 45 && r.seconds <= 100).length;
const withLeadChange = reports.filter((r) => r.leadChanges >= 1).length;
const stalemates = reports.filter((r) => r.longestDroughtSec > 10).length;
const judges = reports.filter((r) => r.result === 'judges').length;
const withDisable = reports.filter((r) => r.partDisables > 0).length;

console.log(`\n=== Bot League balance report (${N} fights) ===\n`);
console.log(`avg duration        ${avg(durations).toFixed(1)}s   (min ${Math.min(...durations).toFixed(1)}s, max ${Math.max(...durations).toFixed(1)}s)`);
console.log(`in 45-100s window   ${pct(inWindow)}      [target: most fights]`);
console.log(`>=1 lead change     ${pct(withLeadChange)}      [target: >=30%]`);
console.log(`stalemate >10s      ${pct(stalemates)}      [target: ~0%]`);
console.log(`judges decisions    ${pct(judges)}      [KO is more fun: keep this low-ish]`);
console.log(`part disabled       ${pct(withDisable)}      [stories: higher is better]`);

// Win rate by chip — the personality layer shouldn't be a stat stick.
const chipWins = new Map<string, { w: number; n: number }>();
for (const r of reports) {
  for (const [chip, won] of [[r.winnerChip, 1], [r.loserChip, 0]] as const) {
    const e = chipWins.get(chip) ?? { w: 0, n: 0 };
    e.w += won;
    e.n += 1;
    chipWins.set(chip, e);
  }
}
console.log(`\nwin rate by chip:`);
for (const [chip, { w, n }] of [...chipWins.entries()].sort()) {
  console.log(`  ${chip.padEnd(14)} ${((w / n) * 100).toFixed(1)}%  (${n} fights)`);
}
console.log('');
