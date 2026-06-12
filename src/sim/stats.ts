import type { BotBuild, DerivedStats } from './types';

// A part at 100% condition gives full value; at 0% it still gives half *if*
// merely worn — but a part AT exactly 0 is disabled, which each system handles
// itself (weapon can't fire, armour stops counting, core regen collapses).
export function conditionScale(condition: number): number {
  return 0.5 + 0.5 * (condition / 100);
}

// Tight band: a 3x speed spread lets fast bots kite slow ones into stalemates.
export const MIN_SPEED = 65;
export const MAX_SPEED = 180;

/**
 * Folds the five parts (scaled by their condition) into the six derived stats.
 * Weight is deliberately internal: it only surfaces through Speed.
 */
export function computeStats(bot: BotBuild): DerivedStats {
  const c = bot.condition;
  const chassisScale = conditionScale(c.chassis);
  const weaponScale = conditionScale(c.weapon);
  const armourScale = conditionScale(c.armour);
  const coreScale = conditionScale(c.core);

  const armourDisabled = c.armour <= 0;
  const coreDisabled = c.core <= 0;

  const output = bot.core.output * (coreDisabled ? 0.6 : coreScale);

  const totalWeight =
    bot.chassis.weight + bot.weapon.weight + bot.armour.weight + bot.core.weight + bot.chip.weight;

  const rawSpeed = (bot.chassis.agility * chassisScale * 1.6 - totalWeight * 0.45) * output;
  const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, rawSpeed));

  return {
    hull: Math.round(bot.chassis.hull + bot.armour.hullBonus * armourScale),
    plating: bot.chassis.plating + (armourDisabled ? 0 : bot.armour.plating * armourScale),
    speed,
    punch: bot.weapon.damage * weaponScale * output,
    reactorCap: bot.core.capacity * (coreDisabled ? 0.5 : 1),
    reactorRegen: bot.core.regen * (coreDisabled ? 0.35 : coreScale),
    // Familiarity: a chip that has sparred with this frame aims better —
    // up to +0.10 Wits at max familiarity (50).
    wits: Math.min(1, 0.45 + bot.chip.grade * 0.12 + Math.min(50, bot.familiarity ?? 0) * 0.002),
  };
}
