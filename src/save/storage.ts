// localStorage persistence. One key, JSON, migrated on load.

import { migrate, type GameState } from './schema';

const KEY = 'botleague_save_v1';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode) — the session still plays.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(KEY);
}
