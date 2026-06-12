// FightScene: Phaser renders, the sim decides. The scene owns a Fight from
// sim/fight.ts, advances it at a fixed 20Hz regardless of display framerate,
// and interpolates bot positions in between — so a 60fps phone and a 144Hz
// monitor watch the *same* fight.
//
// Phaser primer (first appearance of each concept):
//  * A Scene is a self-contained screen with a lifecycle: init(data) receives
//    parameters, create() builds the world once, update(time, delta) runs
//    every rendered frame. There is no preload() here because all art is
//    generated at runtime.
//  * The game loop calls update() with `delta` = ms since last frame. We
//    accumulate delta and step the sim every 50ms (20Hz) — the classic
//    "fixed timestep with interpolation" pattern.

import Phaser from 'phaser';
import {
  ARENA,
  createFight,
  TICK_DT,
  type Fight,
  type FightEvent,
} from '../sim/fight';
import { matchupFromSeed } from '../data/builds';
import { BotView } from '../render/botView';
import { eventToBark } from '../render/commentary';

const TICK_MS = TICK_DT * 1000;

interface Snapshot {
  x: number;
  y: number;
  heading: number;
}

export class FightScene extends Phaser.Scene {
  private fight!: Fight;
  private views: BotView[] = [];
  private prev: Snapshot[] = [];
  private accumulator = 0;
  /** Hit-stop: freeze the sim clock for N ms while the renderer keeps going. */
  private hitStopMs = 0;
  /** Slow-mo: scales how fast sim time accumulates (1 = realtime). */
  private simSpeed = 1;
  private hud!: Phaser.GameObjects.Graphics;
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private clockText!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bolts!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ended = false;

  constructor() {
    super('fight');
  }

  init(data: { seed?: number }) {
    const seed = data.seed ?? 1;
    const [a, b] = matchupFromSeed(seed);
    this.fight = createFight(a, b, seed);
    this.views = [];
    this.prev = [];
    this.accumulator = 0;
    this.hitStopMs = 0;
    this.simSpeed = 1;
    this.ended = false;
    this.nameTexts = [];
    document.dispatchEvent(
      new CustomEvent('fight:new', {
        detail: { seed, names: [a.name, b.name], accents: [a.accent, b.accent] },
      }),
    );
  }

  create() {
    this.drawArena();

    // 1px white texture: the cheapest possible particle. Tint does the rest.
    const g = this.add.graphics();
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);
    g.destroy();

    const bots = this.fight.state.bots;
    this.views = bots.map((b, i) => new BotView(this, b, `bot${i}_${this.fight.state.seed}`));
    this.prev = bots.map((b) => ({ x: b.x, y: b.y, heading: b.heading }));

    // Sparks: short-lived hot flecks on every hit. One emitter, re-aimed per
    // hit with explode() — emitters are pooled and cheap to reuse.
    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 60, max: 260 },
      scale: { start: 1.6, end: 0 },
      tint: [0xffd54a, 0xffa726, 0xffffff],
      lifespan: { min: 120, max: 380 },
      emitting: false,
    });
    this.sparks.setDepth(2500);

    // Bolts: chunkier, slower debris for part deaths and KOs.
    this.bolts = this.add.particles(0, 0, 'px', {
      speed: { min: 40, max: 170 },
      scale: { start: 2.4, end: 0.8 },
      alpha: { start: 1, end: 0 },
      tint: [0x8d99a6, 0x5c6670],
      lifespan: { min: 400, max: 900 },
      gravityY: 60,
      emitting: false,
    });
    this.bolts.setDepth(2500);

    this.hud = this.add.graphics().setDepth(3000);
    for (const [i, b] of bots.entries()) {
      this.nameTexts.push(
        this.add
          .text(i === 0 ? 22 : ARENA.w - 22, 8, b.build.name.toUpperCase(), {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#e8edf2',
          })
          .setOrigin(i === 0 ? 0 : 1, 0)
          .setDepth(3001),
      );
    }
    this.clockText = this.add
      .text(ARENA.w / 2, 8, '0:00', { fontFamily: 'monospace', fontSize: '15px', color: '#9aa7b5' })
      .setOrigin(0.5, 0)
      .setDepth(3001);
  }

  private drawArena() {
    const g = this.add.graphics();
    g.fillStyle(0x14171c);
    g.fillRect(0, 0, ARENA.w, ARENA.h);
    // Oil stains: deterministic from the fight seed, because even set
    // dressing should replay identically.
    let s = this.fight.state.seed;
    const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    g.fillStyle(0x0e1014, 0.8);
    for (let i = 0; i < 7; i++) {
      g.fillEllipse(40 + rand() * (ARENA.w - 80), 40 + rand() * (ARENA.h - 80), 30 + rand() * 70, 20 + rand() * 40);
    }
    g.lineStyle(1, 0x232830, 0.6);
    for (let x = 0; x <= ARENA.w; x += 40) g.lineBetween(x, 0, x, ARENA.h);
    for (let y = 0; y <= ARENA.h; y += 40) g.lineBetween(0, y, ARENA.w, y);
    g.lineStyle(ARENA.wall, 0x2c333d);
    g.strokeRect(ARENA.wall / 2, ARENA.wall / 2, ARENA.w - ARENA.wall, ARENA.h - ARENA.wall);
    g.lineStyle(2, 0xffb300, 0.5);
    g.strokeRect(ARENA.wall, ARENA.wall, ARENA.w - ARENA.wall * 2, ARENA.h - ARENA.wall * 2);

    // Back wall + crowd: a dark band of silhouette heads behind the top rope.
    // The fighters are humanoid now — the venue should read like a fight pit.
    g.fillStyle(0x07080a, 0.92);
    g.fillRect(0, 0, ARENA.w, ARENA.wall + 26);
    for (let i = 0; i < 60; i++) {
      const cx = 10 + rand() * (ARENA.w - 20);
      const cy = 6 + rand() * (ARENA.wall + 12);
      g.fillStyle(0x1a1e24);
      g.fillCircle(cx, cy, 5 + rand() * 3);
    }
    g.lineStyle(3, 0xffb300, 0.6);
    g.lineBetween(0, ARENA.wall + 26, ARENA.w, ARENA.wall + 26);
  }

  update(_time: number, delta: number) {
    // Hit-stop eats real time before the sim sees it: the renderer keeps
    // drawing (sparks fly, camera shakes) but the fight itself freezes for a
    // few frames. That beat is what makes hits feel heavy.
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta;
    } else {
      this.accumulator += delta * this.simSpeed;
    }

    while (this.accumulator >= TICK_MS && !this.fight.state.over) {
      this.accumulator -= TICK_MS;
      this.prev = this.fight.state.bots.map((b) => ({ x: b.x, y: b.y, heading: b.heading }));
      const events = this.fight.step();
      for (const e of events) this.onEvent(e);
    }

    const alpha = Math.min(1, this.accumulator / TICK_MS);
    const bots = this.fight.state.bots;
    for (const [i, view] of this.views.entries()) {
      // Fighters always square up to their opponent, whichever way they drift.
      const facing: 1 | -1 = bots[1 - i].x >= bots[i].x ? 1 : -1;
      view.update(this.prev[i], bots[i], alpha, delta, facing);
    }
    this.drawHud();

    if (this.fight.state.over && !this.ended && this.fight.state.winner !== -1) {
      this.ended = true;
      const winner = this.fight.state.bots[this.fight.state.winner].build;
      this.time.delayedCall(900, () => {
        document.dispatchEvent(
          new CustomEvent('fight:over', {
            detail: { winner: winner.name, result: this.fight.state.result, accent: winner.accent },
          }),
        );
      });
    }
  }

  private onEvent(e: FightEvent) {
    const names = this.fight.state.bots.map((b) => b.build.name) as [string, string];
    const bark = eventToBark(e, names, this.fight.state.tick);
    if (bark) {
      document.dispatchEvent(new CustomEvent('fight:bark', { detail: { text: bark } }));
    }

    switch (e.type) {
      case 'miss':
        this.views[e.bot].lunge(this);
        break;
      case 'hit': {
        this.views[e.bot].lunge(this);
        this.sparks.explode(Math.min(26, 6 + e.damage * 1.2), e.x, e.y);
        // Camera shake intensity and hit-stop scale with how hard the hit
        // landed — small hits tick, big hits THUD.
        const big = e.damage >= 12;
        this.cameras.main.shake(big ? 130 : 70, big ? 0.012 : 0.004);
        if (big) this.hitStopMs = Math.max(this.hitStopMs, 70);
        break;
      }
      case 'ram': {
        this.views[e.bot].lunge(this);
        this.sparks.explode(10, e.x, e.y);
        this.bolts.explode(4, e.x, e.y);
        this.cameras.main.shake(110, 0.01);
        this.hitStopMs = Math.max(this.hitStopMs, 50);
        break;
      }
      case 'panelPop':
        this.views[e.bot].popPlate(this);
        this.bolts.explode(6, e.x, e.y);
        break;
      case 'partDisabled': {
        const v = this.views[e.bot];
        if (e.part === 'weapon') v.killSpinner();
        const b = this.fight.state.bots[e.bot];
        this.bolts.explode(14, b.x, b.y);
        this.cameras.main.shake(160, 0.01);
        this.hitStopMs = Math.max(this.hitStopMs, 90);
        break;
      }
      case 'ko': {
        // Finishing blow: brief slow-mo + the biggest shake we allow. The
        // tween eases sim speed back to realtime over the follow-through.
        this.bolts.explode(30, e.x, e.y);
        this.sparks.explode(30, e.x, e.y);
        this.cameras.main.shake(400, 0.02);
        this.simSpeed = 0.2;
        this.tweens.add({ targets: this, simSpeed: 1, duration: 1100, ease: 'Quad.easeIn' });
        this.views[e.bot].die(this);
        break;
      }
      default:
        break;
    }
  }

  private drawHud() {
    const g = this.hud;
    g.clear();
    const bots = this.fight.state.bots;
    for (const [i, b] of bots.entries()) {
      const x = i === 0 ? 22 : ARENA.w - 22 - 220;
      const hullFrac = Math.max(0, b.hull / b.stats.hull);
      const energyFrac = b.energy / b.stats.reactorCap;
      g.fillStyle(0x000000, 0.45);
      g.fillRect(x, 28, 220, 16);
      g.fillStyle(hullFrac > 0.5 ? 0x57d75b : hullFrac > 0.25 ? 0xffb300 : 0xff4d4d);
      g.fillRect(x + 2, 30, 216 * hullFrac, 8);
      g.fillStyle(0x35c5e8);
      g.fillRect(x + 2, 40, 216 * energyFrac, 3);
    }
    const secs = Math.floor(this.fight.state.tick * TICK_DT);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  }
}
