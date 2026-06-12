// Entry point: boots Phaser for the arena canvas and wires the DOM chrome
// around it (per the architecture decision: management UI is HTML/CSS, the
// canvas is for the fight only).

import Phaser from 'phaser';
import { ARENA } from './sim/fight';
import { FightScene } from './game/FightScene';

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL with automatic Canvas fallback
  parent: 'arena',
  width: ARENA.w,
  height: ARENA.h,
  backgroundColor: '#0b0d10',
  scale: {
    // FIT letterboxes the fixed-size arena into whatever space the page
    // gives it — same fight on a phone and a monitor.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [], // scenes added manually so we can pass the seed
});

// Exposed for perf checks in the browser console (game.loop.actualFps).
(window as unknown as { game: Phaser.Game }).game = game;

let currentSeed = newSeed();

// Renderer-side randomness is allowed (the SIM never touches Date.now —
// the seed chosen here is recorded and makes the whole fight reproducible).
function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

function startFight(seed: number) {
  currentSeed = seed;
  if (game.scene.getScene('fight')) {
    game.scene.getScene('fight').scene.restart({ seed });
  } else {
    game.scene.add('fight', FightScene, true, { seed });
  }
  hide(overlay);
}

// --- DOM chrome -------------------------------------------------------------

const $ = (id: string) => document.getElementById(id)!;
const bark = $('bark');
const seedLabel = $('seed');
const overlay = $('overlay');
const overlayTitle = $('overlay-title');
const namesEl = [$('name-a'), $('name-b')];

const hide = (el: HTMLElement) => el.classList.add('hidden');
const show = (el: HTMLElement) => el.classList.remove('hidden');

$('btn-new').addEventListener('click', () => startFight(newSeed()));
$('btn-replay').addEventListener('click', () => startFight(currentSeed));
$('btn-again').addEventListener('click', () => startFight(newSeed()));
$('btn-rewatch').addEventListener('click', () => startFight(currentSeed));

let barkTimer: number | undefined;
document.addEventListener('fight:bark', (e) => {
  const { text } = (e as CustomEvent).detail;
  bark.textContent = text;
  bark.classList.add('flash');
  window.clearTimeout(barkTimer);
  barkTimer = window.setTimeout(() => bark.classList.remove('flash'), 450);
});

document.addEventListener('fight:new', (e) => {
  const { seed, names, accents } = (e as CustomEvent).detail;
  seedLabel.textContent = `fight #${seed}`;
  bark.textContent = 'Bots ready... FIGHT!';
  namesEl.forEach((el, i) => {
    el.textContent = names[i];
    el.style.color = `#${accents[i].toString(16).padStart(6, '0')}`;
  });
});

document.addEventListener('fight:over', (e) => {
  const { winner, result, accent } = (e as CustomEvent).detail;
  overlayTitle.textContent = result === 'ko' ? `${winner} WINS BY KO!` : `${winner} WINS ON POINTS`;
  overlayTitle.style.color = `#${accent.toString(16).padStart(6, '0')}`;
  show(overlay);
});

startFight(currentSeed);
