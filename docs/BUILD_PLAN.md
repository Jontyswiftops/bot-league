# Bot League — Build Plan

Rule: never start a milestone before the previous one's exit criteria are met.

## M0 — "Is this fun to watch?"  ✅ PASSED (human gate cleared 2026-06-12)

Two FSM bots, one weapon archetype (spinner), sparks/shake/hit-stop/panels/KO slow-mo, commentary barks, New Fight / Replay Seed.

**Exit criteria — internal (all passing, `npm run balance`):** fights end 45–100s across random builds (avg 54s, 63.6% in window) · ≥30% of fights have a lead change (38.9%) · zero >10s stalemates (0.0%) · judges decisions rare (4.8%).

**Exit criteria — human (defined BEFORE building, still to run):** 3 people watch 5 unedited fights each. Pass if they (a) can narrate each fight's story afterward ("its spinner died and it won by ramming"), (b) react visibly at least once per fight, (c) ask to watch another unprompted. **If this fails, we fix watchability before writing a single line of management code.**

## M1 — Vertical slice  ✅ built, awaiting playtest exit check

One full league week: results → market → workshop (DOM UI, part swaps visible on sprite) → match card → fight night → repair triage. T1 opponents (3 named rivals + filler), cash + entry fees + prizes + repairs, the 4 live-intervention commands, save/load (continue only).
**Exit:** a stranger can play 3 league weeks unassisted and explain their repair-or-replace decision; balance runner gates tuning (✅ no regression); deploy live on Pages (✅).

## M2 — Full management  ✅ built, awaiting 10-week economy playtest

3 tiers + fame + promotion choice, sponsors, crew (hire/jobs/wages/salvage checks), garage slots + second bot, part destruction + salvage market, save versioning + export/import (✅ all built; v1→v2 save migration shipped).
**Exit:** 10-week campaign holds the economy tension curve (weeks 1–3 knife-edge, 4–7 surplus, 8–10 T2 gate) in playtest; a wipe-out week never dead-ends a run.

## M3 — Content & balance (~5 sessions)

Hammer + ram weapon archetypes, ~20 parts, ~8 chips, 18 named rivals, market events, audio pass, championship + endless ladder.
**Exit:** balance runner shows no part/chip >58% win rate at equal budget; 30-fight campaign completable; fight variety verdict from playtesters.

## M4 — Ship & playtest (~3 sessions)

Pages polish deploy (pipeline live since session 1), mobile pass (touch targets, portrait stacking), playtest round with mates, iterate on the top 3 complaints.
**Exit:** 5 external players complete 5+ league weeks; median session ≥10 min; "would play again" ≥3/5.

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Watching AI fight gets boring after 10 matches** | M0 human gate before ANY management code; 60–90s cap; visible part damage; commentary; interventions; balance runner enforces lead-changes/no-stalemates forever |
| 2 | Balance sprawl eats the project | small part pool; headless runner is a first-class tool; win-rate gates in M3 exit |
| 3 | Determinism breaks (replay/runner divergence) | no `Math.random`/clock in sim (test-enforced); juice is renderer-time only; golden-replay test |
| 4 | Management layer scope creep | locked screen map; v1 cuts list below; milestone exit criteria |
| 5 | Solo-dev stall | deployed from session one; milestones sized in sessions; STATUS.md resume notes |

## Deliberate v1 cuts

Multiplayer/Firebase (schema is ready, nothing else) · tournament brackets · bot painting/cosmetics · ranged weapons · multiple arenas & hazards · betting · story campaign · achievements · localization · gamepad. Each is a v2 candidate only after v1 retention proves the core.
