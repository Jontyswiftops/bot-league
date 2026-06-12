// PreviewScene: the garage. Your bot stands on a work plinth so part swaps
// are visible on the actual figure — the workshop promise of the GDD.

import Phaser from 'phaser';
import { ARENA, type BotFightState } from '../sim/fight';
import { computeStats } from '../sim/stats';
import type { BotBuild } from '../sim/types';
import { BotView } from '../render/botView';

let nonce = 0;

/** Minimal stand-in for a fight state — enough for BotView to render idle. */
function idleState(build: BotBuild): BotFightState {
  const stats = computeStats(build);
  return {
    build,
    stats,
    x: ARENA.w / 2,
    y: ARENA.h / 2 + 60,
    vx: 0,
    vy: 0,
    heading: 0,
    hull: stats.hull,
    energy: stats.reactorCap,
    fsm: 'SEEK',
    ticksInState: 0,
    weaponCooldown: 0,
    condition: { ...build.condition },
    panels: 3,
    retreatTicksTotal: 0,
    lowPowerAnnounced: false,
    command: null,
    focusPart: null,
    odTicks: 0,
    overdriveUsed: false,
  };
}

export class PreviewScene extends Phaser.Scene {
  private view?: BotView;
  private state?: BotFightState;

  constructor() {
    super('preview');
  }

  init(data: { build: BotBuild }) {
    this.state = idleState(data.build);
  }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0x101318);
    g.fillRect(0, 0, ARENA.w, ARENA.h);
    g.lineStyle(1, 0x232830, 0.6);
    for (let y = 60; y <= ARENA.h; y += 40) g.lineBetween(0, y, ARENA.w, y);
    // Work plinth + tool glow.
    g.fillStyle(0x1a1e24);
    g.fillEllipse(ARENA.w / 2, ARENA.h / 2 + 66, 220, 40);
    g.lineStyle(2, 0xffb300, 0.35);
    g.strokeEllipse(ARENA.w / 2, ARENA.h / 2 + 66, 220, 40);

    if (!this.textures.exists('px')) {
      const pg = this.add.graphics();
      pg.fillStyle(0xffffff);
      pg.fillRect(0, 0, 2, 2);
      pg.generateTexture('px', 2, 2);
      pg.destroy();
    }

    const s = this.state!;
    this.view = new BotView(this, s, `garage_${nonce++}`);
    this.view.update({ x: s.x, y: s.y }, s, 1, 0, 1);
  }

  update(_t: number, delta: number) {
    const s = this.state;
    if (!s || !this.view) return;
    // Idle: stand still, saw ticking over.
    this.view.update({ x: s.x, y: s.y }, s, 1, delta * 0.25, 1);
  }
}
