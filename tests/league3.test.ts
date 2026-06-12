// M3 systems: weapon archetypes, championship belt, v3 migration.

import { describe, expect, it } from 'vitest';
import { createFight, MAX_TICKS, type FightEvent } from '../src/sim/fight';
import { advanceWeek, newGame, settleMatch, CHAMPIONSHIP_FAME, TITLE_PRIZE } from '../src/sim/league';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { CHASSIS, WEAPONS, ARMOURS, CORES } from '../src/data/parts';
import { CHIPS } from '../src/data/chips';
import type { BotBuild, Slot, WeaponDef } from '../src/sim/types';

function buildWith(weapon: WeaponDef, id = 'test'): BotBuild {
  return {
    id,
    name: id.toUpperCase(),
    accent: 0xffffff,
    chassis: CHASSIS[1], // Box Brute — meaty enough for long fights
    weapon,
    armour: ARMOURS[1],
    core: CORES[4], // Fusion Brick keeps energy flowing
    chip: CHIPS[0],
    condition: { chassis: 100, weapon: 100, armour: 100, core: 100, chip: 100 },
  };
}

function runFight(a: BotBuild, b: BotBuild, seed: number) {
  const fight = createFight(a, b, seed);
  const events: FightEvent[] = [];
  while (!fight.state.over && fight.state.tick < MAX_TICKS + 50) events.push(...fight.step());
  return { fight, events };
}

describe('weapon archetypes', () => {
  it('all three archetypes land hits and fights terminate', () => {
    const spinner = WEAPONS.find((w) => w.archetype === 'spinner')!;
    const hammer = WEAPONS.find((w) => w.archetype === 'hammer')!;
    const ram = WEAPONS.find((w) => w.archetype === 'ram')!;
    for (const [a, b] of [
      [spinner, hammer],
      [hammer, ram],
      [ram, spinner],
    ] as const) {
      const { fight, events } = runFight(buildWith(a, 'a'), buildWith(b, 'b'), 99);
      expect(fight.state.over).toBe(true);
      // Both bots must actually connect with their archetype.
      expect(events.some((e) => (e.type === 'hit' || e.type === 'ram') && e.bot === 0)).toBe(true);
      expect(events.some((e) => (e.type === 'hit' || e.type === 'ram') && e.bot === 1)).toBe(true);
    }
  });

  it('rams can actually reach: every ram weapon outranges bot contact distance', () => {
    for (const w of WEAPONS.filter((w) => w.archetype === 'ram')) {
      expect(w.reach).toBeGreaterThanOrEqual(56); // 2 * BOT_RADIUS + margin
    }
  });

  it('hammers crush part condition ~2x per point of damage, spinners ~1.3x', () => {
    // Measure the FIRST clean (non-chassis, far-from-floor) hit per archetype:
    // struck part's condition delta divided by the hit's hull damage.
    const spinner = WEAPONS.find((w) => w.id === 'wp_buzz_royale')!;
    const hammer = WEAPONS.find((w) => w.id === 'wp_pit_maul')!;
    const crushRatio = (wpn: WeaponDef): number => {
      for (let seed = 500; seed < 540; seed++) {
        const fight = createFight(buildWith(wpn, 'attacker'), buildWith(WEAPONS[0], 'defender'), seed);
        while (!fight.state.over && fight.state.tick < MAX_TICKS + 50) {
          const before = { ...fight.state.bots[1].condition };
          for (const e of fight.step()) {
            if (e.type === 'hit' && e.bot === 0 && e.part !== 'chassis' && before[e.part] > 80) {
              return (before[e.part] - fight.state.bots[1].condition[e.part]) / e.damage;
            }
          }
        }
      }
      throw new Error('no clean hit found');
    };
    expect(crushRatio(hammer)).toBeCloseTo(2.0, 1);
    expect(crushRatio(spinner)).toBeCloseTo(1.3, 1);
  });
});

describe('championship', () => {
  it('the title fight appears at fame 40 in the Circuit and pays the belt', () => {
    const s = newGame(71);
    s.tier = 3;
    s.fame = CHAMPIONSHIP_FAME;
    // Regenerate this week's card at the new tier/fame.
    advanceWeek(s);
    const title = s.card.find((o) => o.title);
    expect(title).toBeTruthy();
    expect(title!.prize).toBe(TITLE_PRIZE);

    const cond = { ...s.bots[0].condition } as Record<Slot, number>;
    const report = settleMatch(s, title!, 0, 'ko', cond);
    expect(report.titleWon).toBe(true);
    expect(s.champion).toBe(true);
  });

  it('losing a defense loses the belt', () => {
    const s = newGame(72);
    s.tier = 3;
    s.fame = 50;
    s.champion = true;
    s.week = 2; // advancing lands on week 3 — a defense week
    advanceWeek(s);
    const defense = s.card.find((o) => o.title);
    expect(defense).toBeTruthy();
    expect(defense!.entryFee).toBe(0);
    const cond = { ...s.bots[0].condition } as Record<Slot, number>;
    settleMatch(s, defense!, 1, 'ko', cond);
    expect(s.champion).toBe(false);
  });
});

describe('save migration v3', () => {
  it('v2 saves gain the champion flag', () => {
    const v2 = { version: 2, seed: 1, week: 5, cash: 100, fame: 5, tier: 2, bots: [], activeBot: 0, garageSlots: 1, crew: [], crewMarket: [], inventory: [], market: [], card: [], rivalRecords: {}, record: { wins: 0, losses: 0 } };
    const m = migrate(v2 as unknown as Record<string, unknown>);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.champion).toBe(false);
  });
});
