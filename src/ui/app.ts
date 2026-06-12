// The management UI: plain DOM + innerHTML templates, per the architecture
// decision (HTML iterates 10x faster than canvas UI and you know CSS). The
// Phaser canvas is a single #arena element that gets MOVED between the garage
// (preview scene) and fight night (fight scene).

import type Phaser from 'phaser';
import type { CrewJob, GameState } from '../save/schema';
import type { Slot } from '../sim/types';
import {
  activeBot,
  advanceWeek,
  assembleBot,
  backfillCrewMarket,
  beginMatch,
  buyGarageSlot,
  buyItem,
  canAssembleBot,
  canPromote,
  equipPart,
  fireCrew,
  GARAGE_SLOT_COST,
  hireCrew,
  MAX_CREW,
  MAX_GARAGE_SLOTS,
  newGame,
  promote,
  repairCost,
  repairPart,
  sellItem,
  sellValue,
  setActiveBot,
  setCrewJob,
  settleMatch,
  statsFor,
  TIERS,
  type MatchSetup,
  type SettleReport,
  type WeekReport,
} from '../sim/league';
import { partById, resolveBuild } from '../data';
import { loadGame, saveGame, clearGame } from '../save/storage';
import { migrate } from '../save/schema';
import { isMuted, music, setMuted, sfx, unlockAudio } from '../render/audio';

type ScreenId = 'garage' | 'shop' | 'crew' | 'league' | 'fight' | 'results';

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
let weekReport: WeekReport | null = null;
let cooldownUntil = 0;
let overdriveSpent = false;
let cooldownTimer: number | undefined;

const $ = (id: string) => document.getElementById(id)!;

export function initApp(g: Phaser.Game): void {
  game = g;
  state = loadGame() ?? freshGame();
  backfillCrewMarket(state);
  saveGame(state);

  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
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
  for (const id of ['garage', 'shop', 'crew', 'league', 'fight', 'results']) {
    $(`screen-${id}`).classList.toggle('hidden', id !== next);
  }
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === next);
  });

  if (next === 'garage') {
    $('garage-canvas-slot').appendChild($('arena'));
    switchScene('preview', { build: resolveBuild(activeBot(state)) });
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
  if (next === 'crew') renderCrew();
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
    case 'mute':
      setMuted(!isMuted());
      if (!isMuted() && screen !== 'fight') music.start();
      updateMuteButton();
      break;
    case 'newgame':
      if (window.confirm('Scrap this campaign and start over?')) {
        clearGame();
        state = freshGame();
        saveGame(state);
        show('garage');
      }
      break;
    case 'export':
      exportSave();
      break;
    case 'import':
      importSave();
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
        switchScene('preview', { build: resolveBuild(activeBot(state)) });
      }
      break;
    case 'botselect':
      if (setActiveBot(state, Number(a.idx))) {
        sfx.click();
        persistAnd(renderGarage);
        switchScene('preview', { build: resolveBuild(activeBot(state)) });
      }
      break;
    case 'buyslot':
      if (buyGarageSlot(state)) {
        sfx.spend();
        persistAnd(renderGarage);
      }
      break;
    case 'assemble': {
      const input = $('assemble-name') as HTMLInputElement;
      if (assembleBot(state, input.value || 'SPARE PARTS')) {
        sfx.spend();
        persistAnd(renderGarage);
      }
      break;
    }
    case 'hire':
      if (hireCrew(state, Number(a.idx))) {
        sfx.click();
        persistAnd(renderCrew);
      }
      break;
    case 'fire':
      if (fireCrew(state, Number(a.idx))) {
        sfx.click();
        persistAnd(renderCrew);
      }
      break;
    case 'promote':
      if (promote(state)) {
        sfx.sting(true);
        persistAnd(renderLeague);
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
      weekReport = advanceWeek(state);
      report = null;
      setup = null;
      persistAnd(() => show('league'));
      break;
  }
}

function onChange(e: Event): void {
  const el = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-action="crewjob"]');
  if (!el) return;
  if (setCrewJob(state, Number(el.dataset.idx), el.value as CrewJob)) {
    sfx.click();
    persistAnd(renderCrew);
  }
}

function persistAnd(rerender: () => void): void {
  saveGame(state);
  renderHud();
  rerender();
}

// --- Save transfer ---------------------------------------------------------------

function exportSave(): void {
  const json = JSON.stringify(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `botleague-save-week${state.week}.json`;
  link.click();
  URL.revokeObjectURL(url);
  void navigator.clipboard?.writeText(json).catch(() => {});
  sfx.click();
}

function importSave(): void {
  const raw = window.prompt('Paste your exported save JSON:');
  if (!raw) return;
  try {
    const candidate = migrate(JSON.parse(raw));
    if (!Array.isArray(candidate.bots) || !candidate.bots.length || typeof candidate.week !== 'number') {
      throw new Error('not a save');
    }
    state = candidate;
    saveGame(state);
    sfx.sting(true);
    show('garage');
  } catch {
    window.alert('That did not look like a Bot League save. Nothing was changed.');
  }
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
    `${state.champion ? '<b style="color:var(--hot)">&#9733; CHAMPION</b> &nbsp;·&nbsp; ' : ''}` +
    `<b>${TIERS[state.tier].label.toUpperCase()}</b> &nbsp;·&nbsp; WEEK <b>${state.week}</b>` +
    ` &nbsp;·&nbsp; <b class="price">&#8373;${state.cash}</b>` +
    ` &nbsp;·&nbsp; FAME <b>${state.fame}</b>${state.fame >= 3 ? ' (sponsored)' : ''}` +
    ` &nbsp;·&nbsp; <b>${r.wins}W-${r.losses}L</b>`;
}

function condBar(c: number): string {
  const cls = c > 50 ? '' : c > 25 ? ' warn' : ' crit';
  return `<div class="bar${cls}"><i style="width:${Math.max(0, c)}%"></i></div>`;
}

function accentHex(accent: number): string {
  return `#${accent.toString(16).padStart(6, '0')}`;
}

function renderGarage(): void {
  const bot = activeBot(state);
  const s = statsFor(bot);

  const botTabs =
    state.bots.length > 1
      ? `<div style="display:flex;gap:6px;margin-bottom:8px">${state.bots
          .map(
            (b, i) =>
              `<button class="act ${i === state.activeBot ? 'primary' : ''}" data-action="botselect" data-idx="${i}">${b.name}</button>`,
          )
          .join('')}</div>`
      : '';

  const rows = SLOTS.map((slot) => {
    const part = partById(bot.parts[slot]);
    const c = bot.condition[slot];
    const scrapped = c <= 0;
    const cost = repairCost(state, slot);
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

  // Second-bot block: buy the slot, then assemble from storage.
  let expansion = '';
  if (state.garageSlots < MAX_GARAGE_SLOTS) {
    expansion = `<div class="item-row"><span class="muted">A second garage slot means a second bot — and a backup when this one's in pieces.</span>
      <span></span>
      <button class="act" data-action="buyslot" ${state.cash < GARAGE_SLOT_COST ? 'disabled' : ''}>BUY SLOT &#8373;${GARAGE_SLOT_COST}</button></div>`;
  } else if (state.bots.length < state.garageSlots) {
    expansion = canAssembleBot(state)
      ? `<div class="item-row"><input id="assemble-name" placeholder="NAME YOUR BOT" maxlength="14"
           style="background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:8px;font:inherit">
           <span></span>
           <button class="act primary" data-action="assemble">ASSEMBLE BOT</button></div>`
      : `<div class="muted" style="padding:7px 0">Empty slot ready — stock one part of EVERY kind in storage to assemble a second bot.</div>`;
  }

  $('garage-panel').innerHTML = `
    ${botTabs}
    <h2 style="color:${accentHex(bot.accent)}">${bot.name}</h2>
    <div class="statgrid">
      <div class="stat"><b>${s.hull}</b><span>HULL</span></div>
      <div class="stat"><b>${s.plating.toFixed(1)}</b><span>PLATING</span></div>
      <div class="stat"><b>${Math.round(s.speed)}</b><span>SPEED</span></div>
      <div class="stat"><b>${s.punch.toFixed(1)}</b><span>PUNCH</span></div>
      <div class="stat"><b>${Math.round(s.reactorCap)}/${s.reactorRegen.toFixed(1)}</b><span>REACTOR</span></div>
      <div class="stat"><b>${s.wits.toFixed(2)}${bot.chipFamiliarity > 0 ? ` <span class="muted" style="font-size:10px">+fam ${bot.chipFamiliarity}</span>` : ''}</b><span>WITS</span></div>
    </div>
    ${rows}
    <h3 style="margin-top:12px" class="muted">STORAGE</h3>
    ${inv}
    ${expansion}`;
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
    case 'weapon': return `${p.archetype.toUpperCase()} · dmg ${p.damage} · cost ${p.energyCost}e`;
    case 'armour': return `plate ${p.plating} · +${p.hullBonus} hull`;
    case 'core': return `cap ${p.capacity} · regen ${p.regen} · x${p.output}`;
    case 'chip': return `grade ${p.grade}`;
  }
}

const JOB_BLURB: Record<CrewJob, string> = {
  repair: 'cheaper fixes + salvage checks on scrapped parts',
  tune: 'free condition recovery every week',
  spar: 'chips learn their frames (Wits grows)',
};

function renderCrew(): void {
  const crew = state.crew.length
    ? state.crew
        .map(
          (c, i) => `<div class="item-row">
          <span><b>${c.name}</b> <span class="muted">wrench ${c.wrench} · tuning ${c.tuning} · &#8373;${c.weeklyWage}/wk</span><br>
            <span class="muted" style="font-size:11px">${JOB_BLURB[c.job]}</span></span>
          <select data-action="crewjob" data-idx="${i}"
            style="background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:8px;font:inherit">
            <option value="repair" ${c.job === 'repair' ? 'selected' : ''}>REPAIR</option>
            <option value="tune" ${c.job === 'tune' ? 'selected' : ''}>TUNE</option>
            <option value="spar" ${c.job === 'spar' ? 'selected' : ''}>SPAR</option>
          </select>
          <button class="act danger" data-action="fire" data-idx="${i}">FIRE</button>
        </div>`,
        )
        .join('')
    : `<div class="muted" style="padding:7px 0">No crew. You're doing your own wrenching — full price, no salvage saves.</div>`;

  const candidates = state.crewMarket.length
    ? state.crewMarket
        .map(
          (c, i) => `<div class="item-row">
          <span><b>${c.name}</b> <span class="muted">wrench ${c.wrench} · tuning ${c.tuning}</span></span>
          <span class="price">&#8373;${c.weeklyWage}/wk</span>
          <button class="act" data-action="hire" data-idx="${i}" ${state.crew.length >= MAX_CREW ? 'disabled' : ''}>HIRE</button>
        </div>`,
        )
        .join('')
    : `<div class="muted">Nobody's looking for work this week.</div>`;

  $('crew-panel').innerHTML = `
    <h2>PIT CREW <span class="muted">— ${state.crew.length}/${MAX_CREW}, wages due weekly</span></h2>
    ${crew}
    <h3 style="margin-top:12px" class="muted">LOOKING FOR WORK</h3>
    ${candidates}`;
}

function renderLeague(): void {
  const myStats = statsFor(activeBot(state));
  const tier = TIERS[state.tier];

  // Week-opening report: what happened overnight (sponsor, wages, crew work).
  let opening = '';
  if (weekReport) {
    const lines: string[] = [];
    if (weekReport.sponsorPaid) lines.push(`sponsor stipend <b class="price">+&#8373;${weekReport.sponsorPaid}</b>`);
    if (weekReport.wagesPaid) lines.push(`crew wages <b class="price">-&#8373;${weekReport.wagesPaid}</b>`);
    if (weekReport.tunedBy) lines.push(`tune-up: all parts <b>+${weekReport.tunedBy}%</b>`);
    if (weekReport.familiarityGained) lines.push(`sparring: familiarity <b>+${weekReport.familiarityGained}</b>`);
    for (const name of weekReport.crewLeft) lines.push(`<span class="scrapped">${name} walked — unpaid wages</span>`);
    if (lines.length) opening = `<div class="card"><span class="muted">Overnight: ${lines.join(' · ')}</span></div>`;
  }

  const promotion = canPromote(state)
    ? `<div class="card" style="border-color:var(--hot)">
        <b style="color:var(--hot)">PROMOTION OFFER</b>
        <span class="muted">— your fame opened the door to ${TIERS[(state.tier + 1) as 2 | 3].label}. Bigger purses, harder steel. No way back down.</span>
        <div style="margin-top:8px"><button class="act primary" data-action="promote">STEP UP</button></div>
      </div>`
    : '';

  const offers = state.card
    .map((o) => {
      const theirs = statsFor({
        id: o.key, name: o.botName, accent: o.accent, parts: o.parts, condition: o.condition, chipFamiliarity: 0,
      });
      const rec = o.rivalId ? state.rivalRecords[o.rivalId] : null;
      const recTxt = rec ? ` · you ${rec.losses}-${rec.wins} them` : '';
      const cmp = (mine: number, their: number) =>
        `<span class="${mine >= their ? 'adv' : 'dis'}">${Math.round(their)}</span>`;
      return `<div class="card offer"${o.title ? ' style="border-color:var(--hot);box-shadow:0 0 12px rgba(255,179,0,.15)"' : ''}>
        <div class="vs">${o.title ? '<b style="color:var(--hot)">&#9733; TITLE FIGHT — </b>' : ''}<b style="color:${accentHex(o.accent)}">${o.botName}</b>
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
    `${opening}${promotion}<div class="card"><h2>${tier.label.toUpperCase()} — WEEK ${state.week}</h2>
     <div class="muted">Fighting as <b style="color:${accentHex(activeBot(state).accent)}">${activeBot(state).name}</b> (switch bots in the garage). Intel shows THEIR numbers — green where you have the edge.</div></div>${offers}`;
}

function renderResults(): void {
  if (!report) return;
  const r = report;
  const dmg = r.damage
    .map((d) => {
      const delta = d.after - d.before;
      const salvaged = r.salvaged.includes(d.slot);
      return `<div class="dmg-row">
        <span class="muted">${SLOT_LABEL[d.slot]}</span>
        ${condBar(d.after)}
        <span>${d.before}% &rarr; ${d.after}% ${
          d.scrapped
            ? '<span class="scrapped">SCRAPPED!</span>'
            : salvaged
              ? '<span style="color:var(--good)">SAVED BY THE CREW</span>'
              : delta < 0
                ? `<span class="muted">(${delta}%)</span>`
                : ''
        }</span>
      </div>`;
    })
    .join('');

  const headline = r.titleWon
    ? `<div class="headline" style="color:var(--hot)">&#9733; CHAMPION OF THE CIRCUIT &#9733;</div>
       <div class="muted" style="margin-bottom:8px">You built that thing. And you just watched it take the belt.</div>`
    : `<div class="headline" style="color:${r.won ? 'var(--good)' : 'var(--bad)'}">
        ${r.won ? 'VICTORY' : 'DEFEAT'} <span class="muted">by ${r.result === 'ko' ? 'KO' : 'judges decision'}</span>
      </div>`;
  $('results-panel').innerHTML = `
    ${headline}
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
