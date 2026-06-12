// BotView: the visual half of a bot, assembled from its ACTUAL equipped parts
// (swap a weapon in the data, see it on the sprite). Pure programmer art:
// flat-shaded shapes generated at runtime — no image assets. Upgrading art
// later = swapping generateTexture calls for loaded sprites; nothing else.

import Phaser from 'phaser';
import { BOT_RADIUS, type BotFightState } from '../sim/fight';

const STEEL = 0x3a3f47;
const STEEL_DARK = 0x23272e;
const TOOTH = 0xb9c2cc;

export class BotView {
  /**
   * A Phaser Container groups display objects so they move/rotate as one.
   * Children are positioned relative to the container's origin.
   */
  readonly root: Phaser.GameObjects.Container;
  private readonly spinner: Phaser.GameObjects.Image;
  private readonly plates: Phaser.GameObjects.Image[] = [];
  private readonly coreGlow: Phaser.GameObjects.Arc;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private spinnerDead = false;

  constructor(scene: Phaser.Scene, bot: BotFightState, key: string) {
    const accent = bot.build.accent;

    // Generate flat-shaded textures once per bot. A Graphics object draws
    // vector shapes; generateTexture bakes it into a reusable GPU texture
    // (drawing Graphics every frame is slow, baked textures are cheap).
    const g = scene.add.graphics();

    // Chassis silhouette varies by part so builds read at a glance.
    g.fillStyle(STEEL);
    const r = BOT_RADIUS;
    if (bot.build.chassis.id === 'ch_box_brute') {
      g.fillRoundedRect(0, 4, r * 2, r * 2 - 8, 6);
    } else if (bot.build.chassis.id === 'ch_wasp_deck') {
      g.fillTriangle(r * 2, r, 0, 2, 0, r * 2 - 2);
    } else {
      g.fillRoundedRect(2, 2, r * 2 - 4, r * 2 - 4, 10);
    }
    g.fillStyle(accent);
    g.fillRect(4, r - 3, r, 6); // accent stripe pointing at the weapon
    g.generateTexture(`${key}_chassis`, r * 2, r * 2);
    g.clear();

    // Spinner disc with teeth — size scales with weapon damage.
    const wr = 8 + bot.build.weapon.damage * 0.55;
    g.fillStyle(STEEL_DARK);
    g.fillCircle(wr, wr, wr);
    g.fillStyle(TOOTH);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.fillCircle(wr + Math.cos(a) * (wr - 3), wr + Math.sin(a) * (wr - 3), 3.2);
    }
    g.generateTexture(`${key}_spinner`, wr * 2, wr * 2);
    g.clear();

    // Armour plate — chunkier armour part = chunkier plates.
    const pw = 8 + bot.build.armour.plating * 2;
    g.fillStyle(STEEL_DARK);
    g.fillRoundedRect(0, 0, pw, 16, 3);
    g.fillStyle(accent);
    g.fillRect(0, 0, 2, 16);
    g.generateTexture(`${key}_plate`, pw, 16);
    g.destroy();

    const chassis = scene.add.image(0, 0, `${key}_chassis`);
    this.coreGlow = scene.add.circle(-6, 0, 6, accent, 0.9);
    this.spinner = scene.add.image(BOT_RADIUS + wr * 0.55, 0, `${key}_spinner`);

    this.root = scene.add.container(bot.x, bot.y, [this.coreGlow, chassis, this.spinner]);
    this.root.setDepth(10);

    // Three armour plates: left, right, rear. They pop off as armour fails.
    const plateOffsets: [number, number, number][] = [
      [0, -BOT_RADIUS + 4, -Math.PI / 2],
      [0, BOT_RADIUS - 4, Math.PI / 2],
      [-BOT_RADIUS + 4, 0, Math.PI],
    ];
    for (const [px, py, pa] of plateOffsets) {
      const plate = scene.add.image(px, py, `${key}_plate`).setRotation(pa);
      this.plates.push(plate);
      this.root.add(plate);
    }

    // Particle emitter for damage smoke; off until the bot is hurting.
    this.smoke = scene.add.particles(0, 0, 'px', {
      speed: { min: 8, max: 24 },
      angle: { min: 250, max: 290 },
      scale: { start: 2.2, end: 5 },
      alpha: { start: 0.35, end: 0 },
      tint: 0x666666,
      lifespan: 900,
      frequency: 90,
      emitting: false,
    });
    this.smoke.setDepth(20);
  }

  /** Interpolated render update; alpha is the fraction between sim ticks. */
  update(prev: { x: number; y: number; heading: number }, curr: BotFightState, alpha: number, dtMs: number) {
    this.root.x = prev.x + (curr.x - prev.x) * alpha;
    this.root.y = prev.y + (curr.y - prev.y) * alpha;
    this.root.rotation = lerpAngle(prev.heading, curr.heading, alpha);

    // Spinner spin rate sells the energy economy: fast when charged, dying
    // flicker when drained, stopped when the weapon part is destroyed.
    if (!this.spinnerDead) {
      const energyFrac = curr.energy / curr.stats.reactorCap;
      this.spinner.rotation += (0.004 + 0.028 * energyFrac) * dtMs;
    }
    const hullFrac = curr.hull / curr.stats.hull;
    this.coreGlow.setAlpha(0.4 + 0.6 * (curr.energy / curr.stats.reactorCap));
    this.smoke.emitting = hullFrac < 0.3 && curr.hull > 0;
    if (this.smoke.emitting) {
      this.smoke.setPosition(this.root.x, this.root.y);
    }
  }

  /** Pop the next armour plate off: reparent to world space and fling it. */
  popPlate(scene: Phaser.Scene): void {
    const plate = this.plates.pop();
    if (!plate) return;
    const wx = this.root.x + plate.x;
    const wy = this.root.y + plate.y;
    this.root.remove(plate);
    plate.setPosition(wx, wy).setDepth(5);
    scene.add.existing(plate);
    // A tween animates properties over time (Phaser's built-in interpolator) —
    // here the plate skids away, spinning, and settles as arena litter.
    scene.tweens.add({
      targets: plate,
      x: wx + Phaser.Math.Between(-70, 70),
      y: wy + Phaser.Math.Between(-70, 70),
      rotation: plate.rotation + Phaser.Math.FloatBetween(-6, 6),
      alpha: 0.55,
      duration: 600,
      ease: 'Cubic.easeOut',
    });
  }

  killSpinner(): void {
    this.spinnerDead = true;
    this.spinner.setTint(0x444444);
  }

  die(scene: Phaser.Scene): void {
    this.smoke.emitting = true;
    this.smoke.frequency = 40;
    scene.tweens.add({ targets: this.root, alpha: 0.6, duration: 400 });
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
