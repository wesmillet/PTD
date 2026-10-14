/**
 * localStorage persistence of the game state and settings.
 */
import { runtime, runtimeConfig } from './runtime';
import { applyZoom } from './zoom';
import type { GameState } from '../sim/game';
import { decodeSaveCode, encodeSaveCode, restoreGame, SaveError, serializeGame, validateSave, type SaveData } from '../sim/save';

export const SAVE_KEY = 'ptd.save.v1';

function currentSettings() {
  return { gameSpeed: runtime.gameSpeed, zoom: runtime.zoom, speed: { ...runtimeConfig.speed } };
}

export function buildSave(game: GameState): SaveData {
  return serializeGame(game, currentSettings());
}

/** Writes the save; returns false if storage is unavailable. */
export function writeSave(game: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSave(game)));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Reads and validates the stored save. Returns null when absent or corrupt (and logs why). */
export function readSave(): SaveData | null {
  let text: string | null;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return validateSave(JSON.parse(text));
  } catch (err) {
    console.warn('Ignoring corrupt save:', err instanceof SaveError ? err.message : err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable
  }
}

/** Applies saved settings to the runtime. */
export function applySettings(data: SaveData): void {
  runtime.gameSpeed = data.settings.gameSpeed;
  Object.assign(runtimeConfig.speed, data.settings.speed);
  applyZoom(data.settings.zoom ?? 'fit');
}

export function saveCodeFor(game: GameState): string {
  return encodeSaveCode(buildSave(game));
}

/** Validates a pasted code and returns the restored game, or throws SaveError. */
export function gameFromCode(code: string): { game: GameState; data: SaveData } {
  const data = decodeSaveCode(code);
  return { game: restoreGame(data), data };
}
