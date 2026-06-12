// Entry point: boots Phaser for the arena canvas, then hands control to the
// DOM app (src/ui/app.ts). The canvas is one element shared by the garage
// preview and fight night; the app moves it and switches scenes.

import Phaser from 'phaser';
import { ARENA } from './sim/fight';
import { FightScene } from './game/FightScene';
import { PreviewScene } from './game/PreviewScene';
import { initApp } from './ui/app';

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
  scene: [],
});

// Exposed for perf checks in the browser console (game.loop.actualFps).
(window as unknown as { game: Phaser.Game }).game = game;

game.events.once(Phaser.Core.Events.READY, () => {
  game.scene.add('preview', PreviewScene, false);
  game.scene.add('fight', FightScene, false);
  initApp(game);
});
