# Bot League — Technical Architecture

## The one rule

**`src/sim/` is pure TypeScript: no Phaser imports, no `Math.random`, no wall clock.** Same seed → identical fight, tick for tick (enforced by `tests/sim.test.ts`). Everything else follows from this:

- The **headless balance runner** (`npm run balance`) runs thousands of fights in Node with zero browser.
- **Replays** are just `(seed, builds)` — v2 ghost battles ship a few bytes, not a video.
- Combat does NOT use Phaser arcade physics. Steering, separation, and damage are sim code; Phaser only draws.

## Module map

```
src/
  sim/      pure TS: fight engine (fight.ts), derived stats (stats.ts),
            seeded RNG (rng.ts), entity types (types.ts). Unit-tested headlessly.
  data/     all content: parts.ts, chips.ts, builds.ts (+ rivals/events in M1+).
            Adding content never touches engine code.
  game/     Phaser scenes. FightScene drives the sim at fixed 20Hz and renders.
  render/   botView.ts (bots composed from their actual parts), commentary.ts.
  ui/       DOM management screens (M1+). HTML/CSS, not Phaser.
  save/     schema.ts — versioned GameState + migrations, from day one.
tests/      vitest sim tests (determinism, termination, stats, part stories).
tools/
  balance/  run.ts (win-rate/duration/stalemate report), diag.ts (drought
            forensics). First-class: balance with data, not vibes.
```

## The simulation tick

20Hz fixed timestep (`TICK_DT = 50ms`). `createFight(botA, botB, seed)` returns `{state, step()}`; each `step()` advances one tick and returns a `FightEvent[]` (hits, part disables, panel pops, state changes, KO). Consumers:

- **FightScene** accumulates render delta, calls `step()` every 50ms, interpolates positions between ticks for 60fps+, and maps events to juice (shake/hit-stop/sparks) and commentary.
- **Balance runner** calls `step()` in a tight loop — a 90s fight simulates in ~1ms.

Hit-stop and slow-mo live entirely in the renderer (they stretch *when* ticks happen, never *what* happens), so juice can't desync a replay.

The league week (M1) follows the same pattern: a `GameState` reducer advancing `week` through phases (market → workshop → crew → match-pick → fight → settle) as a deterministic state machine over plain data.

## Core entity shapes

See `src/sim/types.ts` (PartDef union, BotBuild, ChipWeights, DerivedStats) and `src/save/schema.ts` (GameState, SavedBot — bots persist part *ids*, resolved against `data/` at load, so content patches don't corrupt saves).

## Save system

`localStorage` key `botleague_save_v1`; `GameState.version` + ordered `MIGRATIONS` array (append-only). Export/import = the same JSON via download/paste. Firebase in v2 syncs this exact document — no rewrite.

## Combat engine notes

- FSM scoring: each tick a bot scores candidate states; chip weights are multipliers/thresholds. Hysteresis (min 8 ticks per state) prevents flip-flopping.
- Anti-stalemate machinery (all earned from balance-runner data, do not remove):
  - lead-pursuit interception with SHORT prediction (long leads cause orbit chases)
  - finite retreat resolve (`retreatTicksTotal` decay — no endless kiting)
  - retreaters limp at 0.6 speed; speed band clamped 65–180
  - REPOSITION spirals in toward weapon reach (never disengages)
  - crowd heat after 55s: damage ramp + aggression push; judges at 90s
- Balance baseline (1000 random fights): avg 54s, 63.6% in 45–100s window, 38.9% ≥1 lead change, 0.0% stalemates >10s, 4.8% judges, 81% fights disable a part.

## Rendering decisions

- **TypeScript** everywhere; strict mode.
- **DOM/HTML for management UI**, canvas only for the arena (you're strong in HTML/CSS; screens iterate 10× faster in DOM; responsive CSS solves mobile).
- **Landscape orientation**; the arena letterboxes via `Phaser.Scale.FIT`.
- All M0 art is runtime-generated (`Graphics.generateTexture`). Upgrading art later = swap generateTexture calls for loaded sprites in `botView.ts`; nothing else changes.
