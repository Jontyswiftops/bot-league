// BotView: a HUMANOID fighting robot, assembled from its ACTUAL equipped
// parts (swap a part in data, see it on the figure). Beat-'em-up camera:
// side-view fighters on a floor plane — the sim's y axis renders as depth,
// so bots still circle each other and nearer bots draw in front.
//
// Part → body mapping:
//   chassis = frame (build/height/silhouette)   weapon = saw arm
//   armour  = shoulder + chest plates (pop off) core   = chest glow
//   chip    = head visor (accent)
//
// Still pure programmer art (Graphics.generateTexture). Upgrading later =
// swap textures for drawn sprites; rig positions and animations survive.

import Phaser from 'phaser';
import type { BotFightState } from '../sim/fight';

const STEEL = 0x3a3f47;
const STEEL_DARK = 0x23272e;
const TOOTH = 0xb9c2cc;

interface Frame {
  torsoW: number;
  torsoH: number;
  legH: number;
  headS: number;
}

function frameFor(chassisId: string): Frame {
  if (chassisId === 'ch_box_brute') return { torsoW: 44, torsoH: 34, legH: 18, headS: 15 };
  if (chassisId === 'ch_wasp_deck') return { torsoW: 26, torsoH: 30, legH: 24, headS: 12 };
  return { torsoW: 34, torsoH: 32, legH: 20, headS: 14 };
}

export class BotView {
  readonly root: Phaser.GameObjects.Container;
  private readonly weaponArm: Phaser.GameObjects.Container;
  private readonly spinner: Phaser.GameObjects.Image;
  private readonly plates: Phaser.GameObjects.Image[] = [];
  private readonly coreGlow: Phaser.GameObjects.Arc;
  private readonly legL: Phaser.GameObjects.Image;
  private readonly legR: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly frame: Frame;
  private spinnerDead = false;
  private walkPhase = 0;
  private fallen = false;

  constructor(scene: Phaser.Scene, bot: BotFightState, key: string) {
    const accent = bot.build.accent;
    const f = (this.frame = frameFor(bot.build.chassis.id));

    const g = scene.add.graphics();

    // Torso: the chassis. Accent racing stripe down one side.
    g.fillStyle(STEEL);
    g.fillRoundedRect(0, 0, f.torsoW, f.torsoH, 6);
    g.fillStyle(accent);
    g.fillRect(f.torsoW - 6, 4, 3, f.torsoH - 8);
    g.generateTexture(`${key}_torso`, f.torsoW, f.torsoH);
    g.clear();

    // Head: visor colour = the AI chip's accent. The "personality" lives here.
    g.fillStyle(STEEL_DARK);
    g.fillRoundedRect(0, 0, f.headS, f.headS, 3);
    g.fillStyle(accent);
    g.fillRect(f.headS * 0.45, f.headS * 0.28, f.headS * 0.45, 3.5);
    g.generateTexture(`${key}_head`, f.headS, f.headS);
    g.clear();

    // Leg segment (reused for both legs).
    g.fillStyle(STEEL_DARK);
    g.fillRoundedRect(0, 0, 8, f.legH, 3);
    g.generateTexture(`${key}_leg`, 8, f.legH);
    g.clear();

    // Arm segment.
    g.fillStyle(STEEL);
    g.fillRoundedRect(0, 0, 18, 8, 3);
    g.generateTexture(`${key}_arm`, 18, 8);
    g.clear();

    // Saw disc with teeth — radius scales with weapon damage.
    const wr = 7 + bot.build.weapon.damage * 0.45;
    g.fillStyle(STEEL_DARK);
    g.fillCircle(wr, wr, wr);
    g.fillStyle(TOOTH);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.fillCircle(wr + Math.cos(a) * (wr - 2.5), wr + Math.sin(a) * (wr - 2.5), 2.8);
    }
    g.generateTexture(`${key}_saw`, wr * 2, wr * 2);
    g.clear();

    // Armour plate — chunkier armour part = chunkier plates.
    const pw = 8 + bot.build.armour.plating * 2;
    g.fillStyle(STEEL_DARK);
    g.fillRoundedRect(0, 0, pw, 13, 3);
    g.fillStyle(accent);
    g.fillRect(0, 0, 2, 13);
    g.generateTexture(`${key}_plate`, pw, 13);
    g.destroy();

    // --- Rig assembly (origins at the bot's FEET, y negative going up) ---
    const hipY = -f.legH;
    const torsoTop = hipY - f.torsoH;

    this.legL = scene.add.image(-7, hipY, `${key}_leg`).setOrigin(0.5, 0);
    this.legR = scene.add.image(7, hipY, `${key}_leg`).setOrigin(0.5, 0);
    const torso = scene.add.image(0, torsoTop, `${key}_torso`).setOrigin(0.5, 0);
    const head = scene.add.image(0, torsoTop - 2, `${key}_head`).setOrigin(0.5, 1);
    this.coreGlow = scene.add.circle(0, torsoTop + f.torsoH * 0.45, 5, accent, 0.9);

    // Rear arm: simple pendulum. Front arm: a sub-container holding the saw,
    // so the whole arm can lunge forward on attacks.
    const rearArm = scene.add.image(-f.torsoW / 2 - 2, torsoTop + 8, `${key}_arm`).setOrigin(0.1, 0.5);
    rearArm.setRotation(0.6);
    this.spinner = scene.add.image(24, 0, `${key}_saw`);
    const frontArmBone = scene.add.image(0, 0, `${key}_arm`).setOrigin(0, 0.5);
    this.weaponArm = scene.add.container(f.torsoW / 2 - 4, torsoTop + 10, [frontArmBone, this.spinner]);

    // Armour: two shoulder pads + one chest plate; they pop off as armour fails.
    const shoulderL = scene.add.image(-f.torsoW / 2 + 3, torsoTop + 2, `${key}_plate`).setOrigin(0.5, 0.6).setRotation(-0.25);
    const shoulderR = scene.add.image(f.torsoW / 2 - 3, torsoTop + 2, `${key}_plate`).setOrigin(0.5, 0.6).setRotation(0.25);
    const chest = scene.add.image(-2, torsoTop + f.torsoH * 0.32, `${key}_plate`).setRotation(Math.PI / 2);
    this.plates.push(shoulderL, shoulderR, chest);

    this.shadow = scene.add.ellipse(0, 0, f.torsoW + 16, 10, 0x000000, 0.35);

    // body sub-container bobs while walking; shadow stays planted on the floor.
    this.body = scene.add.container(0, 0, [
      rearArm, this.legL, this.legR, torso, chest, shoulderL, shoulderR, this.coreGlow, head, this.weaponArm,
    ]);
    this.root = scene.add.container(bot.x, bot.y, [this.shadow, this.body]);

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
    this.smoke.setDepth(2000);
  }

  /**
   * Interpolated render update. `facing` is +1/-1 (toward the foe) — fighters
   * square up to each other regardless of which way they're drifting.
   */
  update(
    prev: { x: number; y: number },
    curr: BotFightState,
    alpha: number,
    dtMs: number,
    facing: 1 | -1,
  ) {
    const x = prev.x + (curr.x - prev.x) * alpha;
    const y = prev.y + (curr.y - prev.y) * alpha;
    this.root.x = x;
    this.root.y = y;
    // Depth = floor y: nearer fighters draw in front (beat-'em-up staging).
    this.root.setDepth(y);

    if (this.fallen) return;

    this.body.setScale(facing, 1);

    // Walk cycle: legs scissor and the body bobs, scaled by actual movement.
    const moving = Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.05;
    if (moving) this.walkPhase += dtMs * 0.014;
    const swing = moving ? Math.sin(this.walkPhase) : 0;
    this.legL.x = -7 + swing * 4;
    this.legR.x = 7 - swing * 4;
    this.body.y = moving ? -Math.abs(Math.sin(this.walkPhase)) * 2.5 : 0;

    // Saw spin sells the energy economy: fast when charged, crawling when
    // drained, stopped when the weapon part is destroyed.
    if (!this.spinnerDead) {
      const energyFrac = curr.energy / curr.stats.reactorCap;
      this.spinner.rotation += (0.004 + 0.028 * energyFrac) * dtMs;
    }
    const hullFrac = curr.hull / curr.stats.hull;
    this.coreGlow.setAlpha(0.4 + 0.6 * (curr.energy / curr.stats.reactorCap));
    this.smoke.emitting = hullFrac < 0.3 && curr.hull > 0;
    if (this.smoke.emitting) this.smoke.setPosition(x, y - this.frame.legH - this.frame.torsoH);
  }

  /** Punch the saw arm forward on an attack — windup-free but readable. */
  lunge(scene: Phaser.Scene): void {
    if (this.fallen) return;
    scene.tweens.add({
      targets: this.weaponArm,
      x: this.weaponArm.x + 14,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Pop the next armour plate off: reparent to world space and fling it. */
  popPlate(scene: Phaser.Scene): void {
    const plate = this.plates.pop();
    if (!plate) return;
    const wx = this.root.x + plate.x * this.body.scaleX;
    const wy = this.root.y + this.body.y + plate.y;
    this.body.remove(plate);
    plate.setPosition(wx, wy).setDepth(wy + 1);
    scene.add.existing(plate);
    scene.tweens.add({
      targets: plate,
      x: wx + Phaser.Math.Between(-60, 60),
      y: wy + Phaser.Math.Between(10, 50),
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

  /** KO: the robot topples over and smokes. */
  die(scene: Phaser.Scene): void {
    this.fallen = true;
    this.smoke.emitting = true;
    this.smoke.frequency = 40;
    const dir = this.body.scaleX >= 0 ? -1 : 1;
    scene.tweens.add({
      targets: this.body,
      rotation: dir * (Math.PI / 2) * 0.92,
      y: -4,
      duration: 450,
      ease: 'Bounce.easeOut',
    });
    scene.tweens.add({ targets: this.shadow, scaleX: 1.6, alpha: 0.25, duration: 450 });
  }
}
