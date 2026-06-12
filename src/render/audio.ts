// Synthesized sound effects — Web Audio API, zero asset files. Chiptune/MIDI
// flavour: square and triangle oscillators for tones, filtered noise for
// impacts and crowd. Renderer-side only, so Math.random is allowed (sound
// variation never touches the sim).
//
// Browsers block audio until a user gesture: unlock() is wired to the first
// pointerdown anywhere on the page.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = localStorage.getItem('botleague_muted') === '1';
const lastPlayed = new Map<string, number>();

function ensureContext(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      // 1s of white noise, reused for every impact/crowd sound.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture once; safe to call repeatedly. */
export function unlockAudio(): void {
  ensureContext();
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('botleague_muted', m ? '1' : '0');
}

export function isMuted(): boolean {
  return muted;
}

/** Drop a sound if the same kind played within `gapMs` — fights are busy. */
function throttled(kind: string, gapMs: number): boolean {
  const now = performance.now();
  if (now - (lastPlayed.get(kind) ?? -1e9) < gapMs) return true;
  lastPlayed.set(kind, now);
  return false;
}

function ready(kind: string, gapMs = 45): AudioContext | null {
  if (muted || throttled(kind, gapMs)) return null;
  return ensureContext();
}

// --- Synth primitives -------------------------------------------------------

function tone(
  c: AudioContext,
  opts: {
    freq: number;
    endFreq?: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    delay?: number;
  },
): void {
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t0 + opts.duration);
  g.gain.setValueAtTime(opts.gain ?? 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.duration);
  osc.connect(g).connect(master!);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

function noise(
  c: AudioContext,
  opts: {
    duration: number;
    gain?: number;
    filterType?: BiquadFilterType;
    freq?: number;
    endFreq?: number;
    q?: number;
    attack?: number;
    delay?: number;
  },
): void {
  const t0 = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuffer!;
  src.loop = true;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = c.createBiquadFilter();
  filter.type = opts.filterType ?? 'lowpass';
  filter.frequency.setValueAtTime(opts.freq ?? 1200, t0);
  if (opts.endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.endFreq), t0 + opts.duration);
  filter.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  const attack = opts.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.25, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.duration);
  src.connect(filter).connect(g).connect(master!);
  src.start(t0);
  src.stop(t0 + opts.duration + 0.05);
}

function arp(c: AudioContext, freqs: number[], stepSec: number, type: OscillatorType, gain = 0.16): void {
  freqs.forEach((f, i) => tone(c, { freq: f, duration: stepSec * 1.7, type, gain, delay: i * stepSec }));
}

// --- The effect set -----------------------------------------------------------

export const sfx = {
  /** Saw connects. Bigger damage = deeper thump + brighter shrapnel. */
  hit(damage: number): void {
    const c = ready('hit');
    if (!c) return;
    const big = damage >= 12;
    noise(c, { duration: 0.09, gain: big ? 0.32 : 0.2, filterType: 'highpass', freq: 2200 });
    tone(c, { freq: big ? 130 : 190, endFreq: 50, duration: big ? 0.16 : 0.09, type: 'triangle', gain: big ? 0.4 : 0.22 });
    if (big) noise(c, { duration: 0.25, gain: 0.14, freq: 700, endFreq: 120 });
  },

  miss(): void {
    const c = ready('miss', 120);
    if (!c) return;
    noise(c, { duration: 0.12, gain: 0.08, filterType: 'bandpass', freq: 900, endFreq: 2400, q: 2 });
  },

  ram(): void {
    const c = ready('ram');
    if (!c) return;
    tone(c, { freq: 90, endFreq: 35, duration: 0.22, type: 'sine', gain: 0.5 });
    noise(c, { duration: 0.18, gain: 0.25, freq: 500, endFreq: 90 });
  },

  /** Armour plate clatters off — resonant metallic clank. */
  panelPop(): void {
    const c = ready('panel', 80);
    if (!c) return;
    noise(c, { duration: 0.2, gain: 0.22, filterType: 'bandpass', freq: 2800, q: 9 });
    tone(c, { freq: 1450 + Math.random() * 400, endFreq: 600, duration: 0.16, type: 'square', gain: 0.08 });
  },

  /** A part dies: descending glitch zap. */
  partDead(): void {
    const c = ready('partDead', 150);
    if (!c) return;
    tone(c, { freq: 880, endFreq: 110, duration: 0.3, type: 'sawtooth', gain: 0.22 });
    tone(c, { freq: 1320, endFreq: 165, duration: 0.3, type: 'square', gain: 0.1, delay: 0.04 });
    noise(c, { duration: 0.3, gain: 0.18, freq: 1500, endFreq: 200 });
  },

  lowPower(): void {
    const c = ready('lowPower', 800);
    if (!c) return;
    tone(c, { freq: 520, endFreq: 260, duration: 0.18, type: 'triangle', gain: 0.12 });
    tone(c, { freq: 390, endFreq: 195, duration: 0.18, type: 'triangle', gain: 0.12, delay: 0.2 });
  },

  /** Berserk alarm — rising urgency. */
  desperate(): void {
    const c = ready('desperate', 500);
    if (!c) return;
    for (let i = 0; i < 3; i++) {
      tone(c, { freq: 600 + i * 160, duration: 0.1, type: 'square', gain: 0.13, delay: i * 0.09 });
    }
  },

  /** Coach command acknowledged — clean comms blip. */
  command(): void {
    const c = ready('command', 100);
    if (!c) return;
    tone(c, { freq: 980, duration: 0.06, type: 'square', gain: 0.12 });
    tone(c, { freq: 1470, duration: 0.09, type: 'square', gain: 0.12, delay: 0.07 });
  },

  /** KO: boom, debris, and the crowd losing it. */
  ko(): void {
    const c = ready('ko', 400);
    if (!c) return;
    tone(c, { freq: 150, endFreq: 28, duration: 0.7, type: 'sine', gain: 0.6 });
    noise(c, { duration: 0.5, gain: 0.35, freq: 900, endFreq: 80 });
    // Crowd roar: slow-attack bandpass noise swell.
    noise(c, { duration: 2.2, gain: 0.3, filterType: 'bandpass', freq: 750, q: 0.6, attack: 0.25, delay: 0.25 });
  },

  crowdHeat(): void {
    const c = ready('crowdHeat', 2000);
    if (!c) return;
    noise(c, { duration: 1.6, gain: 0.18, filterType: 'bandpass', freq: 700, q: 0.7, attack: 0.4 });
  },

  /** Generic UI press. */
  click(): void {
    const c = ready('click', 60);
    if (!c) return;
    tone(c, { freq: 720, duration: 0.05, type: 'square', gain: 0.08 });
  },

  /** Cash leaves your hand (buy/repair) — register chunk. */
  spend(): void {
    const c = ready('spend', 80);
    if (!c) return;
    tone(c, { freq: 660, duration: 0.06, type: 'square', gain: 0.1 });
    tone(c, { freq: 880, duration: 0.08, type: 'square', gain: 0.1, delay: 0.06 });
    noise(c, { duration: 0.08, gain: 0.08, filterType: 'highpass', freq: 3000, delay: 0.05 });
  },

  /** Results sting: chiptune jingle, major up for a win, minor down for a loss. */
  sting(won: boolean): void {
    const c = ready('sting', 500);
    if (!c) return;
    if (won) {
      arp(c, [523.25, 659.25, 783.99, 1046.5, 1318.5], 0.09, 'square', 0.15);
      tone(c, { freq: 261.63, duration: 0.5, type: 'triangle', gain: 0.12, delay: 0.18 });
    } else {
      arp(c, [392, 369.99, 311.13, 261.63], 0.16, 'triangle', 0.16);
    }
  },
};
