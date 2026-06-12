# Bot League — Art, UI & Audio Direction

## Visual style

**Humanoid fighting robots, beat-'em-up camera.** Side-view figures on a floor plane — the sim's y axis renders as depth, so fighters circle each other and the nearer one draws in front (depth = floor y). Flat-shaded programmer art that looks *intentional* through discipline, not detail:

- **Palette:** backgrounds in 4 dark steels (`#0b0d10`, `#14171c`, `#2c333d`, `#3a3f47`); ONE hot accent per bot (amber, cyan, magenta, lime, violet, orange). League gold `#ffb300` for UI highlights. Nothing else.
- **Bots are their parts**, mapped to a body: chassis = frame (brute = broad slab, wasp = slim), weapon = saw arm (disc scales with damage), armour = shoulder + chest plates, core = chest glow, chip = head visor. Swap a part in data → see it on the figure.
- **Fighters behave like fighters:** they square up to each other (facing flips toward the foe), legs scissor in a walk cycle, the saw arm lunges on attacks, KO'd bots topple over and smoke. The venue reads like a fight pit: crowd-silhouette band behind the top rope.
- **Damage is visible state:** plates litter the floor, dead saws stop and grey out, smoke above 70% hull damage. A glance tells you who's winning and why.
- **Upgrade path:** all shapes come from `Graphics.generateTexture` in `botView.ts`, assembled on a simple rig (legs/torso/head/arms). Real sprites later = replace textures; the rig, animations, popping, and tinting all survive.

## Screen map (M1+)

DOM/HTML over the canvas for everything except the fight: **Workshop** (garage: bot, slots, stats card) · **Shop** (weekly salvage market) · **Crew** · **League** (table, fame, fight card) · **Fight Night** (canvas) · **Settings/Save**. Single-page app feel; tabs across the top; the canvas mounts only on fight night.

## Juice map

| Event | Effect |
|---|---|
| ordinary hit | sparks burst (6–26 by damage), 70ms shake @ 0.004 |
| big hit (≥12 dmg) | + 130ms shake @ 0.012, 70ms hit-stop |
| ram | sparks + bolts, 110ms shake, 50ms hit-stop |
| armour panel pops | plate sprite flung with spin, settles as litter; bolt debris |
| part disabled | 14 bolts, 160ms shake @ 0.01, 90ms hit-stop, commentary bark |
| low power | energy bar at <15%, spinner visibly slows |
| berserk trigger | commentary bark (red glow ring in M1) |
| hull <30% | smoke emitter on |
| KO | 30 bolts + 30 sparks, 400ms shake @ 0.02, slow-mo 0.2× easing back over 1.1s |
| judges decision | bell bark, scorecard overlay |

Hit-stop and slow-mo are renderer-time only — they never touch sim state (replay-safe).

## Audio plan (M3)

- **Impacts/servos:** synthesize with Web Audio (short filtered noise bursts for hits, saw sweeps for servos) — zero assets, infinite variation by seeding parameters with the fight tick. Tone.js only if hand-rolling gets tedious.
- **Crowd:** one CC0 crowd loop (freesound.org), volume swelled by recent-damage rate; cheer stab on KO.
- **Music:** none in fights (crowd IS the soundtrack); one lo-fi menu loop later, CC0.
- Mobile: audio unlocks on first tap (browser requirement); everything routed through one master gain with a mute toggle.
