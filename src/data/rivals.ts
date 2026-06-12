// Tier-1 named rivals: persistent opponents with signature bots and a one-line
// attitude. The light flavor layer — faces for the fight card, not a story.

import type { Slot } from '../sim/types';

export interface RivalDef {
  id: string;
  tier: 1 | 2 | 3;
  builderName: string;
  botName: string;
  attitude: string;
  accent: number;
  parts: Record<Slot, string>;
  /** Bark shown when you beat them / they beat you. */
  winBark: string;
  lossBark: string;
}

export const T1_RIVALS: RivalDef[] = [
  {
    id: 'rival_mona',
    tier: 1,
    builderName: 'Mona Sparks',
    botName: 'Widowmaker',
    attitude: 'Fast hands, faster mouth.',
    accent: 0xff4d6d,
    parts: { chassis: 'ch_wasp_deck', weapon: 'wp_tin_whisper', armour: 'ar_foil_wrap', core: 'co_hot_bottle', chip: 'chip_glass_viper' },
    winBark: '"Lucky bolt. Rematch whenever you grow a spine."',
    lossBark: '"Told you. Speed kills, sweetheart."',
  },
  {
    id: 'rival_deacon',
    tier: 1,
    builderName: 'Deacon Vex',
    botName: 'SLAB',
    attitude: 'Slow is smooth. Smooth is paid.',
    accent: 0x76ff03,
    parts: { chassis: 'ch_box_brute', weapon: 'wp_shredder_mk1', armour: 'ar_boiler_plate', core: 'co_junk_cell', chip: 'chip_cold_logic' },
    winBark: '"Hm. Recalibrating."',
    lossBark: '"SLAB abides."',
  },
  {
    id: 'rival_tammy',
    tier: 1,
    builderName: 'Tin-Can Tammy',
    botName: 'Bad Penny',
    attitude: 'Hits first. Thinks never.',
    accent: 0xffb300,
    parts: { chassis: 'ch_skip_frame', weapon: 'wp_buzz_royale', armour: 'ar_scrap_skirt', core: 'co_deep_tank', chip: 'chip_junkyard_dog' },
    winBark: '"BAD PENNY ALWAYS COMES BACK!"',
    lossBark: '"HAHAHA! Pay the lady!"',
  },
];

export const T2_RIVALS: RivalDef[] = [
  {
    id: 'rival_okafor',
    tier: 2,
    builderName: 'Professor Okafor',
    botName: 'Theorem',
    attitude: 'Has a spreadsheet for your every move.',
    accent: 0xb388ff,
    parts: { chassis: 'ch_skip_frame', weapon: 'wp_tin_whisper', armour: 'ar_boiler_plate', core: 'co_deep_tank', chip: 'chip_cold_logic' },
    winBark: '"Fascinating. An outlier."',
    lossBark: '"QED, I believe."',
  },
  {
    id: 'rival_brick',
    tier: 2,
    builderName: 'Brick Halliday',
    botName: 'Mortgage',
    attitude: 'Hits like a repossession notice.',
    accent: 0xff8a30,
    parts: { chassis: 'ch_box_brute', weapon: 'wp_buzz_royale', armour: 'ar_boiler_plate', core: 'co_junk_cell', chip: 'chip_junkyard_dog' },
    winBark: '"Keep the change. You earned it."',
    lossBark: '"Foreclosed, mate."',
  },
  {
    id: 'rival_nyx',
    tier: 2,
    builderName: 'Nyx',
    botName: 'Static',
    attitude: 'Nobody has seen her face. Her bot has seen everything.',
    accent: 0x00e5ff,
    parts: { chassis: 'ch_wasp_deck', weapon: 'wp_buzz_royale', armour: 'ar_foil_wrap', core: 'co_hot_bottle', chip: 'chip_glass_viper' },
    winBark: '"..."',
    lossBark: '"..."',
  },
];

export const T3_RIVALS: RivalDef[] = [
  {
    id: 'rival_duchess',
    tier: 3,
    builderName: 'The Duchess',
    botName: 'Guillotine',
    attitude: 'Runs the Circuit. Collects challengers like stamps.',
    accent: 0xff4d6d,
    parts: { chassis: 'ch_box_brute', weapon: 'wp_buzz_royale', armour: 'ar_boiler_plate', core: 'co_hot_bottle', chip: 'chip_glass_viper' },
    winBark: '"How NOVEL. Again, sometime."',
    lossBark: '"Next."',
  },
  {
    id: 'rival_saintly',
    tier: 3,
    builderName: 'Saintly Joe',
    botName: 'Penance',
    attitude: 'Apologizes before every knockout. Means it less each time.',
    accent: 0x76ff03,
    parts: { chassis: 'ch_box_brute', weapon: 'wp_shredder_mk1', armour: 'ar_boiler_plate', core: 'co_deep_tank', chip: 'chip_cold_logic' },
    winBark: '"Well struck. Truly."',
    lossBark: '"Forgive me. And the spinner."',
  },
  {
    id: 'rival_zero',
    tier: 3,
    builderName: 'Kid Zero',
    botName: 'Afterparty',
    attitude: 'Sixteen, sponsored, insufferable, terrifying.',
    accent: 0xffb300,
    parts: { chassis: 'ch_wasp_deck', weapon: 'wp_buzz_royale', armour: 'ar_scrap_skirt', core: 'co_hot_bottle', chip: 'chip_showboat' },
    winBark: '"Lag. That was lag."',
    lossBark: '"Clipped it. Posted it. Sorry gramps."',
  },
];

export const RIVALS_BY_TIER: Record<1 | 2 | 3, RivalDef[]> = {
  1: T1_RIVALS,
  2: T2_RIVALS,
  3: T3_RIVALS,
};
