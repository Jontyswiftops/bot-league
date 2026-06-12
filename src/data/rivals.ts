// Tier-1 named rivals: persistent opponents with signature bots and a one-line
// attitude. The light flavor layer — faces for the fight card, not a story.

import type { Slot } from '../sim/types';

export interface RivalDef {
  id: string;
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
    builderName: 'Tin-Can Tammy',
    botName: 'Bad Penny',
    attitude: 'Hits first. Thinks never.',
    accent: 0xffb300,
    parts: { chassis: 'ch_skip_frame', weapon: 'wp_buzz_royale', armour: 'ar_scrap_skirt', core: 'co_deep_tank', chip: 'chip_junkyard_dog' },
    winBark: '"BAD PENNY ALWAYS COMES BACK!"',
    lossBark: '"HAHAHA! Pay the lady!"',
  },
];
