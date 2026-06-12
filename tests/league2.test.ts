// M2 systems: tiers + promotion, crew, second bot, save migration.

import { describe, expect, it } from 'vitest';
import {
  advanceWeek,
  assembleBot,
  buyGarageSlot,
  canAssembleBot,
  canPromote,
  fireCrew,
  hireCrew,
  newGame,
  promote,
  repairCost,
  setActiveBot,
  setCrewJob,
  settleMatch,
  statsFor,
  TIERS,
} from '../src/sim/league';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import type { Slot } from '../src/sim/types';

describe('tiers and promotion', () => {
  it('promotion is fame-gated and player-chosen', () => {
    const s = newGame(11);
    expect(canPromote(s)).toBe(false);
    expect(promote(s)).toBe(false);
    s.fame = TIERS[1].fameForNext!;
    expect(canPromote(s)).toBe(true);
    expect(promote(s)).toBe(true);
    expect(s.tier).toBe(2);
    // The card rerolls at the new tier with Warehouse stakes.
    const rival = s.card.find((o) => o.rivalId)!;
    expect(rival.entryFee).toBe(TIERS[2].entryFee);
    expect(rival.prize).toBe(TIERS[2].prize);
  });

  it('tier 3 has no further promotion', () => {
    const s = newGame(12);
    s.fame = 1000;
    promote(s);
    promote(s);
    expect(s.tier).toBe(3);
    expect(canPromote(s)).toBe(false);
  });
});

describe('crew', () => {
  it('hire, assign, fire — and the weekly candidate pool is deterministic', () => {
    const a = newGame(21);
    const b = newGame(21);
    expect(JSON.stringify(a.crewMarket)).toBe(JSON.stringify(b.crewMarket));
    expect(a.crewMarket.length).toBeGreaterThan(0);

    expect(hireCrew(a, 0)).toBe(true);
    expect(a.crew.length).toBe(1);
    expect(setCrewJob(a, 0, 'spar')).toBe(true);
    expect(a.crew[0].job).toBe('spar');
    expect(fireCrew(a, 0)).toBe(true);
    expect(a.crew.length).toBe(0);
  });

  it('a wrench hand on repair duty cuts repair bills', () => {
    const s = newGame(22);
    s.bots[0].condition.weapon = 40;
    const fullPrice = repairCost(s, 'weapon');
    s.crew.push({ id: 'c', name: 'Sal Spanner', wrench: 5, tuning: 1, weeklyWage: 90, job: 'repair' });
    expect(repairCost(s, 'weapon')).toBeLessThan(fullPrice);
  });

  it('wages are paid on week advance; unpaid crew walks', () => {
    const s = newGame(23);
    s.crew.push({ id: 'c', name: 'Pip Volt', wrench: 2, tuning: 2, weeklyWage: 60, job: 'tune' });
    s.cash = 1000;
    const r = advanceWeek(s);
    expect(r.wagesPaid).toBe(60);
    expect(s.crew.length).toBe(1);

    s.cash = 10;
    const r2 = advanceWeek(s);
    expect(r2.crewLeft).toContain('Pip Volt');
    expect(s.crew.length).toBe(0);
  });

  it('tune-up crew restores condition weekly; sparring builds familiarity into Wits', () => {
    const s = newGame(24);
    s.bots[0].condition.weapon = 50;
    s.crew.push({ id: 'c1', name: 'Marge Torque', wrench: 1, tuning: 4, weeklyWage: 75, job: 'tune' });
    s.crew.push({ id: 'c2', name: 'Otto Flux', wrench: 1, tuning: 3, weeklyWage: 60, job: 'spar' });
    s.cash = 1000;
    const witsBefore = statsFor(s.bots[0]).wits;
    const r = advanceWeek(s);
    expect(r.tunedBy).toBe(16);
    expect(s.bots[0].condition.weapon).toBe(66);
    expect(r.familiarityGained).toBe(6);
    expect(s.bots[0].chipFamiliarity).toBe(6);
    expect(statsFor(s.bots[0]).wits).toBeGreaterThan(witsBefore);
  });

  it('salvage check can pull a scrapped part back at 15%', () => {
    // Across many settle outcomes with a 5-wrench repair hand, some scrapped
    // parts must be saved (p=0.6 each) and the saves land at 15% condition.
    let saved = 0;
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame(seed);
      s.crew.push({ id: 'c', name: 'Sal', wrench: 5, tuning: 1, weeklyWage: 90, job: 'repair' });
      const offer = s.card[0];
      const wrecked = { chassis: 1, weapon: 0, armour: 0, core: 50, chip: 100 } as Record<Slot, number>;
      const report = settleMatch(s, offer, 1, 'ko', wrecked);
      for (const slot of report.salvaged) {
        saved++;
        expect(s.bots[0].condition[slot]).toBe(15);
      }
    }
    expect(saved).toBeGreaterThan(0);
  });
});

describe('second bot', () => {
  it('garage slot, assembly from best storage parts, and active-bot switching', () => {
    const s = newGame(31);
    s.cash = 5000;
    expect(canAssembleBot(s)).toBe(false); // no slot yet
    expect(buyGarageSlot(s)).toBe(true);
    expect(s.garageSlots).toBe(2);

    s.inventory.push(
      { partId: 'ch_box_brute', condition: 90 },
      { partId: 'wp_tin_whisper', condition: 50 },
      { partId: 'wp_buzz_royale', condition: 80 }, // better — should be chosen
      { partId: 'ar_boiler_plate', condition: 70 },
      { partId: 'co_deep_tank', condition: 60 },
      { partId: 'chip_cold_logic', condition: 100 },
    );
    expect(canAssembleBot(s)).toBe(true);
    expect(assembleBot(s, 'sidekick')).toBe(true);
    expect(s.bots.length).toBe(2);
    expect(s.bots[1].name).toBe('SIDEKICK');
    expect(s.bots[1].parts.weapon).toBe('wp_buzz_royale');
    // The lesser weapon stays in storage.
    expect(s.inventory.some((i) => i.partId === 'wp_tin_whisper')).toBe(true);

    expect(setActiveBot(s, 1)).toBe(true);
    expect(s.activeBot).toBe(1);
  });
});

describe('save migration', () => {
  it('a v1 save migrates to the current version with M2 defaults', () => {
    const v1 = {
      version: 1,
      seed: 1,
      week: 3,
      cash: 500,
      fame: 2,
      tier: 1,
      bots: [],
      garageSlots: 1,
      crew: [{ id: 'x', name: 'Old Hand', wrench: 3, tuning: 2, weeklyWage: 75 }],
      inventory: [],
      market: [],
      card: [],
      rivalRecords: {},
      record: { wins: 1, losses: 2 },
    };
    const migrated = migrate(v1 as unknown as Record<string, unknown>);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.activeBot).toBe(0);
    expect(migrated.crewMarket).toEqual([]);
    expect(migrated.crew[0].job).toBe('tune');
    expect(migrated.cash).toBe(500); // untouched fields survive
  });
});
