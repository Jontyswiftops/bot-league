// Event → commentary bark mapping. Variant selection uses the event tick, not
// Math.random — the renderer must stay as deterministic as the sim it draws.

import type { FightEvent } from '../sim/fight';

const PART_LABEL: Record<string, string> = {
  chassis: 'frame',
  weapon: 'spinner',
  armour: 'armour',
  core: 'power core',
};

export function eventToBark(e: FightEvent, names: [string, string], tick: number): string | null {
  const pick = (lines: string[]) => lines[tick % lines.length];
  switch (e.type) {
    case 'hit':
      if (e.damage >= 14) {
        return pick([
          `${names[e.bot]} lands a MONSTER hit!`,
          `Huge contact from ${names[e.bot]}!`,
          `${names[e.target]} gets rocked!`,
        ]);
      }
      return null; // ordinary hits stay visual — barks are for beats
    case 'ram':
      return pick([
        `${names[e.bot]} just RAMS ${names[e.target]}!`,
        `No weapon, no problem — ${names[e.bot]} uses the chassis!`,
      ]);
    case 'partDisabled':
      return pick([
        `${names[e.bot]}'s ${PART_LABEL[e.part]} is GONE!`,
        `There goes the ${PART_LABEL[e.part]} on ${names[e.bot]}!`,
      ]);
    case 'lowPower':
      return `${names[e.bot]} is running on fumes...`;
    case 'desperate':
      return `${names[e.bot]} goes BERSERK!`;
    case 'crowdHeat':
      return `The crowd wants a finish — damage is ramping up!`;
    case 'judges':
      return `The bell! It goes to the judges... ${names[e.winner]} takes it on hull damage.`;
    case 'ko':
      return `IT'S OVER! ${names[e.bot]} is DOWN!`;
    default:
      return null;
  }
}
