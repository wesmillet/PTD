/**
 * localStorage persistence of the game state and settings.
 */
import { runtime, runtimeConfig } from './runtime';
import { migrateZoomFromSave } from './zoom';
import type { GameState } from '../sim/game';
import { decodeSaveCode, encodeSaveCode, restoreGame, SaveError, serializeGame, validateSave, type SaveData } from '../sim/save';

/** Slot 1 keeps the original key so existing saves stay where they are. */
const SLOT_KEYS = ['ptd.save.v1', 'ptd.save.slot2', 'ptd.save.slot3'] as const;
const CURRENT_SLOT_KEY = 'ptd.save.slot';
export const SLOT_COUNT = SLOT_KEYS.length;
export const SAVE_KEY = SLOT_KEYS[0];

function readSlotIndex(): number {
  try {
    const n = Number(localStorage.getItem(CURRENT_SLOT_KEY) ?? '1');
    return Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT ? n : 1;
  } catch {
    return 1;
  }
}

let currentSlot = readSlotIndex();

/** The active save slot (1 to 3). */
export function activeSlot(): number {
  return currentSlot;
}

/** Switches the active slot; the caller reloads the game afterwards. */
export function setActiveSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new Error(`no save slot ${slot}`);
  currentSlot = slot;
  try {
    localStorage.setItem(CURRENT_SLOT_KEY, String(slot));
  } catch {
    // storage unavailable
  }
}

function slotKey(slot = currentSlot): string {
  return SLOT_KEYS[slot - 1] ?? SLOT_KEYS[0];
}

export interface SlotInfo {
  slot: number;
  empty: boolean;
  savedAt?: number;
  party?: number;
  badges?: number;
  money?: number;
}

/** What each slot holds, for the slot picker. */
export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    let text: string | null = null;
    try {
      text = localStorage.getItem(slotKey(slot));
    } catch {
      text = null;
    }
    if (!text) {
      out.push({ slot, empty: true });
      continue;
    }
    try {
      const data = validateSave(JSON.parse(text));
      out.push({ slot, empty: false, savedAt: data.savedAt, party: data.party.length, badges: data.badges.length, money: data.money });
    } catch {
      out.push({ slot, empty: true });
    }
  }
  return out;
}

function currentSettings() {
  // The zoom is not here: it lives under its own key (game/zoom.ts), so codes and slots never carry it.
  return { gameSpeed: runtime.gameSpeed, speed: { ...runtimeConfig.speed } };
}

export function buildSave(game: GameState): SaveData {
  return serializeGame(game, currentSettings());
}

/** Writes the save; returns false if storage is unavailable. */
export function writeSave(game: GameState): boolean {
  try {
    localStorage.setItem(slotKey(), JSON.stringify(buildSave(game)));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(slotKey()) !== null;
  } catch {
    return false;
  }
}

/** Reads and validates the stored save. Returns null when absent or corrupt (and logs why). */
export function readSave(): SaveData | null {
  let text: string | null;
  try {
    text = localStorage.getItem(slotKey());
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
    localStorage.removeItem(slotKey());
  } catch {
    // storage unavailable
  }
}

/** Applies saved settings to the runtime (a zoom an old save carries migrates to its own key once). */
export function applySettings(data: SaveData): void {
  runtime.gameSpeed = data.settings.gameSpeed;
  Object.assign(runtimeConfig.speed, data.settings.speed);
  migrateZoomFromSave(data.settings.zoom);
}

export function saveCodeFor(game: GameState): string {
  return encodeSaveCode(buildSave(game));
}

/** Validates a pasted code and returns the restored game, or throws SaveError. */
export function gameFromCode(code: string): { game: GameState; data: SaveData } {
  const data = decodeSaveCode(code);
  return { game: restoreGame(data), data };
}
