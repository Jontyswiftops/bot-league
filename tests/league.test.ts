import { describe, expect, it } from 'vitest';
import {
  advanceWeek,
  beginMatch,
  buyItem,
  equipPart,
  newGame,
  repairCost,
  repairPart,
  settleMatch,
  sellItem,
} from '../src/sim/league';
import { partById } from '../src/data';
import { createFight, issueCommand, MAX_TICKS } from '../src/sim/fight';

describe('campaign determinism', () => {
  it('same seed produces an identical campaign start', () => {
    expect(JSON.stringify(newGame(77))).toBe(JSON.stringify(newGame(77)));
  });

  it('market and card change week to week but derive from the seed', () => {
    const a = newGame(5);
    const b = newGame(5);
    advanceWeek(a);
    advanceWeek(b);
    expect(JSON.stringify(a.market)).toBe(JSON.stringify(b.market));
    expect(JSON.stringify(a.card)).toBe(JSON.stringify(b.card));
  });
});

describe('economy actions', () => {
  it('buy moves a part from market to inventory and charges cash', () => {
    const s = newGame(1);
    const cash = s.cash;
    const item = s.market[0];
    expect(buyItem(s, 0)).toBe(true);
    expect(s.cash).toBe(cash - item.price);
    expect(s.inventory[0].partId).toBe(item.partId);
  });

  it('equip swaps with the equipped part of the same kind', () => {
    const s = newGame(1);
    const weaponIdx = s.market.findIndex((m) => partById(m.partId).kind === 'weapon');
    s.cash = 100000;
    buyItem(s, weaponIdx);
    const newWeapon = s.inventory[0].partId;
    const oldWeapon = s.bots[0].parts.weapon;
    expect(equipPart(s, 0)).toBe(true);
    expect(s.bots[0].parts.weapon).toBe(newWeapon);
    expect(s.inventory.some((i) => i.partId === oldWeapon)).toBe(true);
  });

  it('sell pays out and scrapped parts are worth a floor price', () => {
    const s = newGame(1);
    s.inventory.push({ partId: 'wp_buzz_royale', condition: 0 });
    const cash = s.cash;
    expect(sellItem(s, 0)).toBe(true);
    expect(s.cash).toBe(cash + 10);
  });

  it('repair restores condition for a price; scrapped parts cannot be repaired', () => {
    const s = newGame(1);
    const bot = s.bots[0];
    bot.condition.weapon = 50;
    const cost = repairCost(s, 'weapon');
    expect(cost).toBeGreaterThan(0);
    const cash = s.cash;
    expect(repairPart(s, 'weapon')).toBe(true);
    expect(bot.condition.weapon).toBe(100);
    expect(s.cash).toBe(cash - cost);

    bot.condition.armour = 0;
    expect(repairPart(s, 'armour')).toBe(false);
  });
});

describe('fight night flow', () => {
  it('a full week round-trips: begin -> simulate -> settle -> advance', () => {
    const s = newGame(42);
    const offer = s.card[0]; // undercard, free entry
    const setup = beginMatch(s, offer.key)!;
    expect(setup).not.toBeNull();

    const fight = createFight(setup.player, setup.opponent, setup.seed);
    while (!fight.state.over && fight.state.tick < MAX_TICKS + 50) fight.step();
    expect(fight.state.over).toBe(true);

    const report = settleMatch(
      s,
      offer,
      fight.state.winner as 0 | 1,
      fight.state.result as 'ko' | 'judges',
      fight.state.bots[0].condition,
    );
    expect(report.prize).toBeGreaterThan(0);
    expect(s.record.wins + s.record.losses).toBe(1);
    // The dents persist — that's the whole design.
    expect(JSON.stringify(s.bots[0].condition)).toBe(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(fight.state.bots[0].condition).map(([k, v]) => [k, Math.max(0, Math.round(v))]),
        ),
      ),
    );

    const before = s.week;
    advanceWeek(s);
    expect(s.week).toBe(before + 1);
    expect(s.card.length).toBeGreaterThanOrEqual(2);
  });

  it('entry fees gate rival matches but the undercard is always free', () => {
    const s = newGame(9);
    s.cash = 0;
    const rivalOffer = s.card.find((o) => o.rivalId)!;
    expect(beginMatch(s, rivalOffer.key)).toBeNull();
    expect(beginMatch(s, s.card[0].key)).not.toBeNull();
  });
});

describe('coaching commands', () => {
  it('GUARD forces recovery and OVERDRIVE is once per fight', () => {
    const s = newGame(3);
    const setup = beginMatch(s, s.card[0].key)!;
    const fight = createFight(setup.player, setup.opponent, setup.seed);
    for (let i = 0; i < 40; i++) fight.step();

    expect(issueCommand(fight.state, 0, 'OVERDRIVE')).toBe(true);
    expect(issueCommand(fight.state, 0, 'OVERDRIVE')).toBe(false);

    issueCommand(fight.state, 0, 'GUARD');
    // Run past the worst-case compliance delay (1.5s = 30 ticks).
    for (let i = 0; i < 35 && !fight.state.over; i++) fight.step();
    if (!fight.state.over) {
      expect(fight.state.bots[0].fsm === 'RECOVER' || fight.state.bots[0].fsm === 'DESPERATE').toBe(true);
    }
  });

  it('FOCUS biases hit location toward the chosen part', () => {
    const s = newGame(8);
    const setup = beginMatch(s, s.card[0].key)!;
    const fight = createFight(setup.player, setup.opponent, setup.seed);
    issueCommand(fight.state, 0, 'FOCUS', 'weapon');
    let weaponHits = 0;
    let otherHits = 0;
    let weaponAlive = true;
    while (!fight.state.over && weaponAlive && fight.state.tick < MAX_TICKS + 50) {
      for (const e of fight.step()) {
        // Once the target weapon is destroyed, aim correctly moves on — only
        // count hits while the focused part is still worth hitting.
        if (e.type === 'partDisabled' && e.bot === 1 && e.part === 'weapon') weaponAlive = false;
        if (e.type === 'hit' && e.bot === 0 && weaponAlive) {
          if (e.part === 'weapon') weaponHits++;
          else otherHits++;
        }
      }
    }
    // Base weapon weight is 20%; with 6x focus bias it should dominate.
    if (weaponHits + otherHits >= 8) {
      expect(weaponHits).toBeGreaterThan(otherHits);
    }
  });
});
