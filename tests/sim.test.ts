import { describe, expect, it } from 'vitest';
import { createFight, MAX_TICKS, type FightEvent } from '../src/sim/fight';
import { computeStats } from '../src/sim/stats';
import { matchupFromSeed } from '../src/data/builds';
import { CHASSIS, WEAPONS, ARMOURS, CORES } from '../src/data/parts';
import { CHIPS } from '../src/data/chips';
import type { BotBuild } from '../src/sim/types';

function freshBuild(overrides: Partial<BotBuild> = {}): BotBuild {
  return {
    id: 'test_bot',
    name: 'Test Bot',
    accent: 0xffffff,
    chassis: CHASSIS[0],
    weapon: WEAPONS[0],
    armour: ARMOURS[0],
    core: CORES[0],
    chip: CHIPS[0],
    condition: { chassis: 100, weapon: 100, armour: 100, core: 100, chip: 100 },
    ...overrides,
  };
}

function runToEnd(seed: number) {
  const [a, b] = matchupFromSeed(seed);
  const fight = createFight(a, b, seed);
  const allEvents: FightEvent[] = [];
  while (!fight.state.over && fight.state.tick < MAX_TICKS + 50) {
    allEvents.push(...fight.step());
  }
  return { fight, allEvents };
}

describe('determinism', () => {
  it('same seed produces an identical fight, tick for tick', () => {
    const run1 = runToEnd(424242);
    const run2 = runToEnd(424242);
    expect(JSON.stringify(run1.fight.state)).toBe(JSON.stringify(run2.fight.state));
    expect(JSON.stringify(run1.allEvents)).toBe(JSON.stringify(run2.allEvents));
  });

  it('different seeds diverge', () => {
    const run1 = runToEnd(1);
    const run2 = runToEnd(2);
    expect(JSON.stringify(run1.fight.state.bots[0].build)).not.toBe(
      JSON.stringify(run2.fight.state.bots[0].build),
    );
  });
});

describe('fight termination', () => {
  it('every fight ends by the 90s judge cap across 50 seeds', () => {
    for (let seed = 100; seed < 150; seed++) {
      const { fight } = runToEnd(seed);
      expect(fight.state.over).toBe(true);
      expect(fight.state.tick).toBeLessThanOrEqual(MAX_TICKS);
      expect(fight.state.winner === 0 || fight.state.winner === 1).toBe(true);
    }
  });
});

describe('derived stats', () => {
  it('computes the six stats from parts at full condition', () => {
    const stats = computeStats(freshBuild());
    // Skip Frame hull + Scrap Skirt hullBonus
    expect(stats.hull).toBe(CHASSIS[0].hull + ARMOURS[0].hullBonus);
    // plating 1 + 2
    expect(stats.plating).toBe(3);
    // Shredder Mk1 damage 12 * Junk Cell output 1.0
    expect(stats.punch).toBeCloseTo(12);
    expect(stats.reactorCap).toBe(90);
    expect(stats.wits).toBeGreaterThan(0);
    expect(stats.speed).toBeGreaterThanOrEqual(50);
    expect(stats.speed).toBeLessThanOrEqual(200);
  });

  it('worn parts give less than fresh parts', () => {
    const fresh = computeStats(freshBuild());
    const worn = computeStats(
      freshBuild({ condition: { chassis: 50, weapon: 50, armour: 50, core: 50, chip: 100 } }),
    );
    expect(worn.punch).toBeLessThan(fresh.punch);
    expect(worn.hull).toBeLessThan(fresh.hull);
  });

  it('a disabled armour part stops contributing plating', () => {
    const noArmour = computeStats(
      freshBuild({ condition: { chassis: 100, weapon: 100, armour: 0, core: 100, chip: 100 } }),
    );
    expect(noArmour.plating).toBe(CHASSIS[0].plating);
  });
});

describe('part destruction tells stories', () => {
  it('a bot with a dead weapon still fights (rams) and fights still end', () => {
    const a = freshBuild({
      id: 'rammer',
      condition: { chassis: 100, weapon: 0, armour: 100, core: 100, chip: 100 },
    });
    const b = freshBuild({ id: 'armed' });
    const fight = createFight(a, b, 7);
    const events: FightEvent[] = [];
    while (!fight.state.over && fight.state.tick < MAX_TICKS + 50) {
      events.push(...fight.step());
    }
    expect(fight.state.over).toBe(true);
    expect(events.some((e) => e.type === 'ram' && e.bot === 0)).toBe(true);
  });

  it('part disables happen organically in real fights', () => {
    let disables = 0;
    for (let seed = 200; seed < 240; seed++) {
      const { allEvents } = runToEnd(seed);
      disables += allEvents.filter((e) => e.type === 'partDisabled').length;
    }
    expect(disables).toBeGreaterThan(0);
  });
});
