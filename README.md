# Bot League

Underground robot combat management sim for the browser. Build bots from salvage, watch them fight autonomously, pay for the wreckage. Phaser 3 + TypeScript + Vite; pure deterministic simulation core with Phaser as renderer only.

**Status: M1** — the vertical slice. A full league week loop: garage (repair/equip) → salvage market → fight card with named rivals → fight night with live coaching commands → damage settlement → next week. Autosaved to localStorage. Play it: https://jontyswiftops.github.io/bot-league/

## Quickstart

```
npm install
npm run dev        # fight viewer at http://localhost:5173
npm test           # sim unit tests (determinism, termination, stats)
npm run balance    # headless: 500+ fights -> duration/lead-change/stalemate report
npm run build      # typecheck + production build (auto-deployed by CI on push to main)
```

## Docs

- [Game design](docs/GDD.md) — loops, bot anatomy, chips, economy, league
- [Architecture](docs/ARCHITECTURE.md) — module map, sim tick, determinism rules
- [Art & audio direction](docs/ART_DIRECTION.md) — style, juice map, audio plan
- [Build plan](docs/BUILD_PLAN.md) — milestones, exit criteria, risks, v1 cuts

## The one rule

`src/sim/` never imports Phaser, never calls `Math.random`, never reads the clock. Same seed = same fight, always. The balance runner, the tests, and v2 ghost battles all depend on it.
