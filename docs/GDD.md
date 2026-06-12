# Bot League — Game Design Document

A robot combat management sim. Domina's architecture — run a stable of fighters, watch your decisions play out — themed as an underground robot fighting league. Sparks and flying bolts, no gore. Core fantasy: **I built that thing, and I just watched it win.**

**Locked decisions:** small stable (2–4 bots) · parts can be permanently destroyed, bots can't · 60–90s fights · 10–15 min league weeks · light flavor layer (named rivals, commentary, market events — no story campaign).

## Pillars

1. **Preparation is the gameplay; the fight is the payoff.** Depth lives in build/train/economy. The arena is readable and exciting, never micromanaged.
2. **Every fight tells a story** — emergent from part failures, energy desperation, and chip personalities interacting. Never scripted.
3. **Loss is content.** Losing costs money and creates repair decisions. Tuned for "one more fight night," never punishment.
4. **Juice over fidelity.** Programmer art with crunchy hits: hit-stop, shake, sparks, panels flying, smoke, crowd swells.

## Loops

- **Fight night (60–90s per fight):** watch your bot fight autonomously; read the fight (energy dropping, armour hanging off); spend your one command off cooldown at the right moment. 2–3 fights a night max.
- **League week (10–15 min):** results & repair triage → salvage market (rotates weekly) → workshop (swap parts, see them on the sprite) → crew jobs (repair / tune / spar) → pick next week's match from a 2–3 fight card with opponent intel → fight night.
- **Long-term:** climb 3 tiers on fame, unlock garage slots (bot #2 ~week 6–8), attract sponsors. **Win condition: the Tier-3 championship belt (~30 fight nights, 6–10 hours), then an endless prestige ladder.** A visible summit drives "one more fight night"; endless-only sims plateau emotionally.

## Bot anatomy — 5 slots, 6 derived stats

Slots: **Chassis · Weapon · Armour · Power Core · AI Chip** (see `src/data/parts.ts`, `src/data/chips.ts`).

| Stat | What it does | Derived from |
|---|---|---|
| **Hull** | total structure HP | chassis base + armour bonus |
| **Plating** | flat damage reduction per hit | armour + chassis frame |
| **Speed** | movement + turn rate | chassis agility − total weight, × core output |
| **Punch** | damage per attack | weapon × core output |
| **Reactor** | energy cap/regen — gates attack rate | power core |
| **Wits** | accuracy, part-targeting, command response | chip grade + familiarity |

Weight is internal — it only surfaces through Speed. Exact formulas: `src/sim/stats.ts`.

**Condition (0–100% per part)** scales the part's contribution and degrades from hits. A part at 0% mid-fight is disabled (dead weapon → the bot rams with its chassis — the story generator). Post-fight, a 0% part is **scrap — permanently destroyed — unless a crew salvage check saves it at heavy cost**. Real stakes per fight, fuel for the salvage economy, and a run never ends: the chassis always survives.

## AI chips as personality

A chip is behaviour weights consumed by the combat FSM (`SEEK → APPROACH → STRIKE → RECOVER → REPOSITION → RETREAT`, plus `DESPERATE`). Adding a chip is a data file, never engine code:

- `aggression` — closing/striking vs circling
- `caution` — hull% threshold that unlocks RETREAT (resolve to flee is finite per fight — no kiting)
- `opportunism` — hit-location bias toward the enemy's most damaged part
- `ferocity` — below 25% hull: berserk (ignore caution, +punch, −accuracy)
- `discipline` — player-command compliance speed; 2v2 formation later

Chips gain **familiarity** with a specific bot (raised by sparring) — a small Wits bonus. That's "training," reframed for machines: you don't train a robot, you tune it and feed its chip fight data. Pricier, higher-grade chips genuinely win more (balance runner confirms ~43% for the free chip vs ~56% for grade-2) — chips are upgrades AND personalities.

## Pit crew (thin in v1)

1–2 crew, two stats: **Wrench** (repair cost/speed, salvage-check odds) and **Tuning** (condition recovery, sparring gains). One job per crew per week: Repair / Tune / Spar. Weekly wages are a real sink. *Deferred: traits, levelling, morale, injuries, poaching.*

## Economy (cash ₵ + fame)

Start: ₵800 + a free starter bot with worn parts. Tier-1 numbers (tune with the balance runner):
entry ₵50 · win ₵250 · loss purse ₵40 · repairs ₵30–120 · parts ₵150–400 · crew wage ₵60/wk · sponsor at fame 3: ₵75/wk + ₵50/win.

Intended curve at ~60% win rate: **weeks 1–3 knife-edge** (one bad loss ≈ skip a week of upgrades), **weeks 4–7 first surplus** (crew, then ~₵900 second-bot bundle), **weeks 8–10 Tier-2 gate** (entry ₵150 / win ₵600; repair costs scale, knife-edge resets). The show-up purse + selling salvage always funds a junker rebuild — a losing streak never zeroes you out.

## Match & league structure

- **Scrapyard (T1) → Warehouse (T2) → The Circuit (T3, championship).** Fame gates promotion; the player chooses when to step up.
- Weekly card of 2–3 offered matches with visible intel. **Picking your matchup IS the difficulty slider.**
- ~6 hand-authored named rivals per tier (signature bot, one-line attitude, barks) + generated filler from the same part pools via tier-budget templates. Rivals persist and rematch.
- **2v2 is a Tier-3 feature**, not the core: it arrives when the player owns 2+ bots and `discipline` pays off. The engine is built for it (perf target: 2v2 + particles at 60fps on a mid-range phone).

## Live intervention — exactly four commands

One command slot, **20s shared cooldown** (~3–4 calls per fight):
**ATTACK** (press now) · **GUARD** (back off, regen) · **FOCUS \<part\>** (bias hit location) · **OVERDRIVE** (once per fight: +speed/punch 5s, inflicts core wear).

Compliance speed scales with chip `discipline` — a stubborn chip ignoring your call is a story, not a bug. Light-touch is deliberate: the player is a coach, not a pilot; the fight must stay a payoff for workshop decisions.
