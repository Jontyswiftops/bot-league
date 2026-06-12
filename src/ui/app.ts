// The management UI: plain DOM + innerHTML templates, per the architecture
// decision (HTML iterates 10x faster than canvas UI and you know CSS). The
// Phaser canvas is a single #arena element that gets MOVED between the garage
// (preview scene) and fight night (fight scene).

import type Phaser from 'phaser';
import type { GameState } from '../save/schema';
import type { Slot } from '../sim/types';
import {
  advanceWeek,
  beginMatch,
  buyItem,
  equipPart,
  newGame,
  repairCost,
  repairPart,
  sellItem,
  sellValue,
  settleMatch,
  statsFor,
  type MatchSetup,
  type SettleReport,
} from '../sim/league';
import { partById, resolveBuild } from '../data';
import { loadGame, saveGame, clearGame } from '../save/storage';
import { isMuted, music, setMuted, sfx, unlockAudio } from '../render/audio';

type ScreenId = 'garage' | 'shop' | 'league' | 'fight' | 'results';

const COMMAND_COOLDOWN_MS = 20_000;
const SLOTS: Slot[] = ['chassis', 'weapon', 'armour', 'core', 'chip'];
const SLOT_LABEL: Record<Slot, string> = {
  chassis: 'CHASSIS',
  weapon: 'WEAPON',
  armour: 'ARMOUR',
  core: 'CORE',
  chip: 'AI CHIP',
};

let game: Phaser.Game;
let state: GameState;
let screen: ScreenId = 'garage';
let setup: MatchSetup | null = null;
let report: SettleReport | null = null;
let cooldownUntil = 0;
let overdriveSpent = false;
let cooldownTimer: number | undefined;

const $ = (id: string) => document.getElementById(id)!;

export function initApp(g: Phaser.Game): void {
  game = g;
  state = loadGame() ?? freshGame();
  saveGame(state);

  document.addEventListener('click', onClick);
  // Browsers gate audio behind a user gesture — first press unlocks it and
  // kicks off the workshop music if we're on a management screen.
  document.addEventListener(
    'pointerdown',
    () => {
      unlockAudio();
      if (screen !== 'fight') music.start();
    },
    { once: true },
  );
  updateMuteButton();
  document.addEventListener('fight:bark', (e) => {
    const bark = $('bark');
    bark.textContent = (e as CustomEvent).detail.text;
    bark.classList.add('flash');
    setTimeout(() => bark.classList.remove('flash'), 450);
  });
  document.addEventListener('fight:over', (e) => onFightOver((e as CustomEvent).detail));

  show('garage');
}

function freshGame(): GameState {
  return newGame(Math.floor(Math.random() * 1_000_000_000));
}

// --- Screen routing -----------------------------------------------------------

function show(next: ScreenId): void {
  screen = next;
  for (const id of ['garage', 'shop', 'league', 'fight', 'results']) {
    $(`screen-${id}`).classList.toggle('hidden', id !== next);
  }
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === next);
  });

  if (next === 'garage') {
    $('garage-canvas-slot').appendChild($('arena'));
    switchScene('preview', { build: resolveBuild(state.bots[0]) });
  } else if (next === 'fight' && setup) {
    $('fight-canvas-slot').appendChild($('arena'));
    switchScene('fight', { seed: setup.seed, botA: setup.player, botB: setup.opponent });
    resetCommandBar();
  }

  // Workshop music runs everywhere except the arena — there, the crowd is
  // the soundtrack. (start() is a no-op while muted or already playing.)
  if (next === 'fight') music.stop();
  else music.start();

  renderHud();
  if (next === 'garage') renderGarage();
  if (next === 'shop') renderShop();
  if (next === 'league') renderLeague();
  if (next === 'results') renderResults();
}

function switchScene(key: 'preview' | 'fight', data: object): void {
  for (const k of ['preview', 'fight'] as const) {
    if (k !== key && game.scene.isActive(k)) game.scene.stop(k);
  }
  if (game.scene.isActive(key)) {
    game.scene.getScene(key).scene.restart(data);
  } else {
    game.scene.start(key, data);
  }
}

// --- Event handling -------------------------------------------------------------

function onClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const a = el.dataset;

  switch (a.action) {
    case 'tab':
      if (screen !== 'fight') {
        sfx.click();
        show(a.tab as ScreenId);
      }
      break;
    case 'newgame':
      if (window.confirm('Scrap this campaign and start over?')) {
        clearGame();
        state = freshGame();
        saveGame(state);
        show('garage');
      }
      break;
    case 'mute':
      setMuted(!isMuted());
      if (!isMuted() && screen !== 'fight') music.start();
      updateMuteButton();
      break;
    case 'repair':
      if (repairPart(state, a.slot as Slot)) {
        sfx.spend();
        persistAnd(renderGarage);
      }
      break;
    case 'buy':
      if (buyItem(state, Number(a.idx))) {
        sfx.spend();
        persistAnd(renderShop);
      }
      break;
    case 'sell':
      if (sellItem(state, Number(a.idx))) {
        sfx.spend();
        persistAnd(renderGarage);
      }
      break;
    case 'equip':
      if (equipPart(state, Number(a.idx))) {
        sfx.click();
        persistAnd(renderGarage);
        switchScene('preview', { build: resolveBuild(state.bots[0]) });
      }
      break;
    case 'fight': {
      setup = beginMatch(state, a.key!);
      if (setup) {
        sfx.click();
        saveGame(state);
        show('fight');
      }
      break;
    }
    case 'cmd':
      issueUiCommand(el);
      break;
    case 'continue':
      advanceWeek(state);
      report = null;
      setup = null;
      persistAnd(() => show('league'));
      break;
  }
}

function persistAnd(rerender: () => void): void {
  saveGame(state);
  renderHud();
  rerender();
}

// --- Fight wiring ---------------------------------------------------------------

function onFightOver(detail: {
  winnerIdx: 0 | 1;
  result: 'ko' | 'judges';
  conditions: Array<Record<Slot, number>>;
}): void {
  if (!setup) return;
  report = settleMatch(state, setup.offer, detail.winnerIdx, detail.result, detail.conditions[0]);
  saveGame(state);
  show('results');
  sfx.sting(report.won);
}

function updateMuteButton(): void {
  const btn = $('btn-mute');
  btn.textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
}

function issueUiCommand(btn: HTMLElement): void {
  const now = Date.now();
  if (now < cooldownUntil || screen !== 'fight') return;
  const type = btn.dataset.cmd!;
  if (type === 'OVERDRIVE') {
    if (overdriveSpent) return;
    overdriveSpent = true;
  }
  document.dispatchEvent(
    new CustomEvent('fight:command', { detail: { type, part: btn.dataset.part } }),
  );
  cooldownUntil = now + COMMAND_COOLDOWN_MS;
  updateCommandBar();
}

function resetCommandBar(): void {
  cooldownUntil = 0;
  overdriveSpent = false;
  $('bark').textContent = 'Bots ready... FIGHT!';
  window.clearInterval(cooldownTimer);
  cooldownTimer = window.setInterval(updateCommandBar, 250);
  updateCommandBar();
}

function updateCommandBar(): void {
  const left = Math.max(0, cooldownUntil - Date.now());
  document.querySelectorAll<HTMLButtonElement>('#command-bar button').forEach((b) => {
    const od = b.dataset.cmd === 'OVERDRIVE' && overdriveSpent;
    b.disabled = left > 0 || od;
  });
  $('cooldown').textContent = left > 0 ? `cooldown ${(left / 1000).toFixed(0)}s` : 'COACH READY';
}

// --- Renderers --------------------------------------------------------------------

function renderHud(): void {
  const r = state.record;
  $('hud-stats').innerHTML =
    `WEEK <b>${state.week}</b> &nbsp;·&nbsp; <b class="price">&#8373;${state.cash}</b>` +
    ` &nbsp;·&nbsp; FAME <b>${state.fame}</b>${state.fame >= 3 ? ' (sponsored)' : ''}` +
    ` &nbsp;·&nbsp; <b>${r.wins}W-${r.losses}L</b>`;
}

function condBar(c: number): string {
  const cls = c > 50 ? '' : c > 25 ? ' warn' : ' crit';
  return `<div class="bar${cls}"><i style="width:${Math.max(0, c)}%"></i></div>`;
}

function renderGarage(): void {
  const bot = state.bots[0];
  const s = statsFor(bot);
  const rows = SLOTS.map((slot) => {
    const part = partById(bot.parts[slot]);
    const c = bot.condition[slot];
    const scrapped = c <= 0;
    const cost = repairCost(bot.parts[slot], c);
    const action = scrapped
      ? `<span class="scrapped">SCRAPPED</span>`
      : c >= 100
        ? `<span class="muted">OK</span>`
        : `<button class="act" data-action="repair" data-slot="${slot}" ${cost > state.cash ? 'disabled' : ''}>FIX &#8373;${cost}</button>`;
    return `<div class="slot-row">
      <span class="muted">${SLOT_LABEL[slot]}</span>
      <span>${part.name}${scrapped ? ' <span class="muted">(replace via shop)</span>' : ''}</span>
      ${condBar(c)}
      ${action}
    </div>`;
  }).join('');

  const inv = state.inventory.length
    ? state.inventory
        .map((item, i) => {
          const p = partById(item.partId);
          return `<div class="item-row">
            <span>${p.name} <span class="muted">${p.kind} · ${item.condition}%</span></span>
            <button class="act" data-action="equip" data-idx="${i}">EQUIP</button>
            <button class="act" data-action="sell" data-idx="${i}">SELL &#8373;${sellValue(item.partId, item.condition)}</button>
          </div>`;
        })
        .join('')
    : `<div class="muted">Nothing in storage. The shop rotates weekly.</div>`;

  $('garage-panel').innerHTML = `
    <h2 style="color:#00e5ff">${bot.name}</h2>
    <div class="statgrid">
      <div class="stat"><b>${s.hull}</b><span>HULL</span></div>
      <div class="stat"><b>${s.plating.toFixed(1)}</b><span>PLATING</span></div>
      <div class="stat"><b>${Math.round(s.speed)}</b><span>SPEED</span></div>
      <div class="stat"><b>${s.punch.toFixed(1)}</b><span>PUNCH</span></div>
      <div class="stat"><b>${Math.round(s.reactorCap)}/${s.reactorRegen.toFixed(1)}</b><span>REACTOR</span></div>
      <div class="stat"><b>${s.wits.toFixed(2)}</b><span>WITS</span></div>
    </div>
    ${rows}
    <h3 style="margin-top:12px" class="muted">STORAGE</h3>
    ${inv}`;
}

function renderShop(): void {
  const items = state.market.length
    ? state.market
        .map((m, i) => {
          const p = partById(m.partId);
          return `<div class="item-row">
            <span>${p.name} <span class="muted">${p.kind} · ${m.condition}% · ${statLine(m.partId)}</span></span>
            <span class="price">&#8373;${m.price}</span>
            <button class="act" data-action="buy" data-idx="${i}" ${m.price > state.cash ? 'disabled' : ''}>BUY</button>
          </div>`;
        })
        .join('')
    : `<div class="muted">Sold out. New salvage next week.</div>`;
  $('shop-panel').innerHTML = `<h2>SALVAGE MARKET <span class="muted">— rotates weekly</span></h2>${items}`;
}

function statLine(partId: string): string {
  const p = partById(partId);
  switch (p.kind) {
    case 'chassis': return `hull ${p.hull} · agi ${p.agility}`;
    case 'weapon': return `dmg ${p.damage} · cost ${p.energyCost}e`;
    case 'armour': return `plate ${p.plating} · +${p.hullBonus} hull`;
    case 'core': return `cap ${p.capacity} · regen ${p.regen} · x${p.output}`;
    case 'chip': return `grade ${p.grade}`;
  }
}

function renderLeague(): void {
  const myStats = statsFor(state.bots[0]);
  const offers = state.card
    .map((o) => {
      const theirs = statsFor({
        id: o.key, name: o.botName, accent: o.accent, parts: o.parts, condition: o.condition, chipFamiliarity: 0,
      });
      const rec = o.rivalId ? state.rivalRecords[o.rivalId] : null;
      const recTxt = rec ? ` · you ${rec.losses}-${rec.wins} them` : '';
      const cmp = (mine: number, their: number) =>
        `<span class="${mine >= their ? 'adv' : 'dis'}">${Math.round(their)}</span>`;
      return `<div class="card offer">
        <div class="vs"><b style="color:#${o.accent.toString(16).padStart(6, '0')}">${o.botName}</b>
          <span class="muted">· ${o.builderName}${recTxt}</span></div>
        <div class="muted">&ldquo;${o.attitude}&rdquo;</div>
        <div class="intel">
          <div>HULL ${cmp(myStats.hull, theirs.hull)}</div>
          <div>PUNCH ${cmp(myStats.punch, theirs.punch)}</div>
          <div>SPEED ${cmp(myStats.speed, theirs.speed)}</div>
          <div>PLATE ${cmp(myStats.plating, theirs.plating)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="muted">entry <b class="price">&#8373;${o.entryFee}</b> · prize <b class="price">&#8373;${o.prize}</b> · fame +${o.famePrize}</span>
          <button class="act primary" data-action="fight" data-key="${o.key}" ${o.entryFee > state.cash ? 'disabled' : ''}>FIGHT</button>
        </div>
      </div>`;
    })
    .join('');
  $('league-panel').innerHTML =
    `<div class="card"><h2>WEEK ${state.week} FIGHT CARD</h2>
     <div class="muted">Pick your match. Intel shows THEIR numbers — green where you have the edge.</div></div>${offers}`;
}

function renderResults(): void {
  if (!report) return;
  const r = report;
  const dmg = r.damage
    .map((d) => {
      const delta = d.after - d.before;
      return `<div class="dmg-row">
        <span class="muted">${SLOT_LABEL[d.slot]}</span>
        ${condBar(d.after)}
        <span>${d.before}% &rarr; ${d.after}% ${d.scrapped ? '<span class="scrapped">SCRAPPED!</span>' : delta < 0 ? `<span class="muted">(${delta}%)</span>` : ''}</span>
      </div>`;
    })
    .join('');

  $('results-panel').innerHTML = `
    <div class="headline" style="color:${r.won ? 'var(--good)' : 'var(--bad)'}">
      ${r.won ? 'VICTORY' : 'DEFEAT'} <span class="muted">by ${r.result === 'ko' ? 'KO' : 'judges decision'}</span>
    </div>
    <div class="ledger">
      <div><span>${r.won ? 'Prize money' : 'Show-up purse'}</span><b class="price">+&#8373;${r.prize}</b></div>
      ${r.sponsorBonus ? `<div><span>Sponsor win bonus</span><b class="price">+&#8373;${r.sponsorBonus}</b></div>` : ''}
      ${r.fameGained ? `<div><span>Fame</span><b>+${r.fameGained}</b></div>` : ''}
      <div><span>Bank</span><b class="price">&#8373;${state.cash}</b></div>
    </div>
    <h3 class="muted">DAMAGE REPORT</h3>
    ${dmg}
    ${r.bark ? `<div class="rival-bark">${r.bark}</div>` : ''}
    <div style="margin-top:14px;display:flex;gap:10px">
      <button class="act primary" data-action="continue">NEXT WEEK &rarr;</button>
    </div>`;
}
