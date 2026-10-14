/**
 * Save format v2 (boxes and badges), save codes and validation. Version 1
 * saves and codes still load. No Phaser or DOM imports; the storage layer
 * (src/game/storage.ts) handles localStorage.
 */
import config from '../data/config.json';
import { levelIds } from '../data/levels';
import { getMove, getPokemon, expForLevel } from '../data/pokedata';
import { createGameState, type DexEntry, type GameState, type LevelProgress } from './game';
import { createMonster, makeMoveSlot, type Monster } from './monster';
import { createBoxes, depositToBox, PC, SLOTS_PER_BOX, type Box } from './pc';
import { hashString } from './rng';
import type { SpeedConfig } from './speed';
import { createStatus } from './status';

export const SAVE_VERSION = 2;
const CODE_PREFIX = `PTD${SAVE_VERSION}.`;
const CODE_PATTERN = /^PTD([12])\./;
const GAME_SPEEDS: number[] = config.gameSpeeds;

export interface SavedMonster {
  species: number;
  level: number;
  exp: number;
  hp: number;
  moves: { id: number; pp: number }[];
  activeMove: number;
  shiny: boolean;
}

export interface SavedBox {
  name: string;
  wallpaper: string;
  slots: (SavedMonster | null)[];
}

export type SavedZoom = 'fit' | 1 | 1.5 | 2;
export const SAVED_ZOOMS: readonly SavedZoom[] = ['fit', 1, 1.5, 2];

export interface SavedSettings {
  gameSpeed: number;
  /** Canvas zoom: written by saves before it moved to its own localStorage key; read once for migration. */
  zoom?: SavedZoom;
  speed: SpeedConfig;
}

export interface SaveData {
  version: number;
  savedAt: number;
  starter?: number;
  party: SavedMonster[];
  boxes: SavedBox[];
  progress: Record<string, LevelProgress>;
  items: { balls: Record<string, number>; potions: number; rareCandies: number };
  money: number;
  pokedex: Record<string, DexEntry>;
  badges: string[];
  flags?: string[];
  conferenceWins?: number;
  tickets?: number;
  conference?: unknown;
  lotteryPending?: 'won' | 'lost';
  lotteryDay?: string;
  lotteryPlayed?: number;
  settings: SavedSettings;
}

export function saveMonster(mon: Monster): SavedMonster {
  return {
    species: mon.species,
    level: mon.level,
    exp: mon.exp,
    hp: mon.hp,
    moves: mon.moves.map((m) => ({ id: m.id, pp: m.pp })),
    activeMove: mon.activeMove,
    shiny: mon.shiny,
  };
}

export function loadMonster(saved: SavedMonster): Monster {
  const mon = createMonster(saved.species, saved.level, saved.moves.map((m) => m.id), { shiny: saved.shiny });
  mon.exp = saved.exp;
  mon.hp = Math.max(1, Math.min(mon.stats.hp, saved.hp));
  mon.moves = saved.moves.map((m) => {
    const slot = makeMoveSlot(m.id);
    slot.pp = Math.max(0, Math.min(slot.maxPp, m.pp));
    return slot;
  });
  mon.activeMove = Math.min(saved.activeMove, Math.max(0, mon.moves.length - 1));
  mon.status = createStatus();
  return mon;
}

export function serializeGame(game: GameState, settings: SavedSettings, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    ...(game.starter !== undefined ? { starter: game.starter } : {}),
    party: game.party.map(saveMonster),
    boxes: game.boxes.map((b) => ({ name: b.name, wallpaper: b.wallpaper, slots: b.slots.map((m) => (m ? saveMonster(m) : null)) })),
    progress: JSON.parse(JSON.stringify(game.progress)) as Record<string, LevelProgress>,
    items: { balls: { ...game.items.balls }, potions: game.items.potions, rareCandies: game.items.rareCandies },
    money: game.money,
    pokedex: JSON.parse(JSON.stringify(game.pokedex)) as Record<string, DexEntry>,
    badges: [...game.badges],
    flags: [...game.flags],
    ...(game.conferenceWins ? { conferenceWins: game.conferenceWins } : {}),
    ...(game.tickets ? { tickets: game.tickets } : {}),
    ...(game.conference ? { conference: JSON.parse(JSON.stringify(game.conference)) as unknown } : {}),
    ...(game.lotteryPending ? { lotteryPending: game.lotteryPending } : {}),
    ...(game.lotteryDay ? { lotteryDay: game.lotteryDay } : {}),
    ...(game.lotteryPlayed ? { lotteryPlayed: game.lotteryPlayed } : {}),
    settings: { gameSpeed: settings.gameSpeed, ...(settings.zoom !== undefined ? { zoom: settings.zoom } : {}), speed: { ...settings.speed } },
  };
}

export class SaveError extends Error {}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateMonster(raw: unknown, where: string): SavedMonster {
  if (!raw || typeof raw !== 'object') throw new SaveError(`${where}: not an object`);
  const m = raw as Record<string, unknown>;
  if (!isInt(m.species, 1, 99999)) throw new SaveError(`${where}: bad species`);
  try {
    getPokemon(m.species);
  } catch {
    throw new SaveError(`${where}: unknown species ${String(m.species)}`);
  }
  if (!isInt(m.level, 1, 100)) throw new SaveError(`${where}: bad level`);
  const data = getPokemon(m.species);
  const minExp = expForLevel(data.growth, m.level);
  const maxExp = m.level >= 100 ? minExp : expForLevel(data.growth, m.level + 1) - 1;
  if (!isInt(m.exp, 0, 10_000_000)) throw new SaveError(`${where}: bad exp`);
  const exp = Math.max(minExp, Math.min(maxExp, m.exp));
  if (!isInt(m.hp, 0, 1000)) throw new SaveError(`${where}: bad hp`);
  if (!Array.isArray(m.moves) || m.moves.length > config.combat.maxMoves) throw new SaveError(`${where}: bad moves`);
  const moves = m.moves.map((mv, i) => {
    const slot = mv as Record<string, unknown>;
    if (!slot || !isInt(slot.id, 1, 10000)) throw new SaveError(`${where}: bad move ${i}`);
    try {
      getMove(slot.id);
    } catch {
      throw new SaveError(`${where}: unknown move ${String(slot.id)}`);
    }
    if (!isInt(slot.pp, 0, 99)) throw new SaveError(`${where}: bad pp ${i}`);
    return { id: slot.id, pp: slot.pp };
  });
  if (!isInt(m.activeMove, 0, 3)) throw new SaveError(`${where}: bad activeMove`);
  if (typeof m.shiny !== 'boolean') throw new SaveError(`${where}: bad shiny`);
  return { species: m.species, level: m.level, exp, hp: m.hp, moves, activeMove: m.activeMove, shiny: m.shiny };
}

function validateBox(raw: unknown, index: number): SavedBox {
  if (!raw || typeof raw !== 'object') throw new SaveError(`boxes[${index}]: not an object`);
  const b = raw as Record<string, unknown>;
  if (typeof b.name !== 'string' || b.name.length === 0 || b.name.length > 24) throw new SaveError(`boxes[${index}]: bad name`);
  const wallpaper = typeof b.wallpaper === 'string' && PC.wallpapers.some((w) => w.id === b.wallpaper) ? b.wallpaper : (PC.wallpapers[0]?.id ?? 'forest');
  if (!Array.isArray(b.slots) || b.slots.length > SLOTS_PER_BOX) throw new SaveError(`boxes[${index}]: bad slots`);
  const slots = b.slots.map((m, i) => (m === null ? null : validateMonster(m, `boxes[${index}].slots[${i}]`)));
  while (slots.length < SLOTS_PER_BOX) slots.push(null);
  return { name: b.name, wallpaper, slots };
}

/** Version 1 saves keep a flat box list; it fills the boxes in order. */
function boxesFromFlatList(list: SavedMonster[]): SavedBox[] {
  const boxes = createBoxes().map((b) => ({ name: b.name, wallpaper: b.wallpaper, slots: new Array<SavedMonster | null>(SLOTS_PER_BOX).fill(null) }));
  list.forEach((m, i) => {
    const box = boxes[Math.floor(i / SLOTS_PER_BOX)];
    if (!box) throw new SaveError('too many boxed Pokémon for the PC');
    box.slots[i % SLOTS_PER_BOX] = m;
  });
  return boxes;
}

/** Checks a parsed object thoroughly and returns a clean SaveData, or throws SaveError. */
export function validateSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveError('save is not an object');
  const s = raw as Record<string, unknown>;
  if (s.version !== 1 && s.version !== 2) throw new SaveError(`unsupported save version ${String(s.version)}`);
  if (!isNum(s.savedAt)) throw new SaveError('bad savedAt');
  if (!Array.isArray(s.party)) throw new SaveError('party must be an array');
  if (s.party.length > config.party.maxParty) throw new SaveError('party too large');
  const party = s.party.map((m, i) => validateMonster(m, `party[${i}]`));
  let boxes: SavedBox[];
  if (s.version === 1) {
    if (!Array.isArray(s.box)) throw new SaveError('box must be an array');
    boxes = boxesFromFlatList(s.box.map((m, i) => validateMonster(m, `box[${i}]`)));
  } else {
    if (!Array.isArray(s.boxes) || s.boxes.length === 0 || s.boxes.length > 64) throw new SaveError('bad boxes');
    boxes = s.boxes.map(validateBox);
    while (boxes.length < PC.boxes) {
      const b = createBoxes()[boxes.length]!;
      boxes.push({ name: b.name, wallpaper: b.wallpaper, slots: new Array<SavedMonster | null>(SLOTS_PER_BOX).fill(null) });
    }
  }
  if (s.starter !== undefined && !isInt(s.starter, 1, 493)) throw new SaveError('bad starter');
  if (!s.progress || typeof s.progress !== 'object') throw new SaveError('bad progress');
  const progress: Record<string, LevelProgress> = {};
  const known = new Set(levelIds());
  for (const [id, p] of Object.entries(s.progress as Record<string, unknown>)) {
    if (!known.has(id)) continue; // levels can be renamed between versions; drop unknown ones
    const q = p as Record<string, unknown>;
    if (!q || !isInt(q.wavesCleared, 0, 100000) || typeof q.won !== 'boolean' || typeof q.completed !== 'boolean') throw new SaveError(`bad progress for ${id}`);
    progress[id] = { wavesCleared: q.wavesCleared, won: q.won, completed: q.completed };
  }
  const items = s.items as Record<string, unknown> | undefined;
  if (!items || !items.balls || typeof items.balls !== 'object') throw new SaveError('bad items');
  const balls: Record<string, number> = {};
  for (const [id, n] of Object.entries(items.balls as Record<string, unknown>)) {
    if (!(id in config.balls)) continue;
    if (!isInt(n, 0, 9999)) throw new SaveError(`bad ball count ${id}`);
    balls[id] = n;
  }
  if (!isInt(items.potions, 0, 9999) || !isInt(items.rareCandies, 0, 9999)) throw new SaveError('bad item counts');
  if (!isInt(s.money, 0, 1_000_000_000)) throw new SaveError('bad money');
  const pokedex: Record<string, DexEntry> = {};
  if (!s.pokedex || typeof s.pokedex !== 'object') throw new SaveError('bad pokedex');
  for (const [id, e] of Object.entries(s.pokedex as Record<string, unknown>)) {
    if (!isInt(Number(id), 1, 99999)) continue;
    try {
      getPokemon(Number(id));
    } catch {
      continue;
    }
    const d = e as Record<string, unknown>;
    if (!d || typeof d.seen !== 'boolean' || typeof d.caught !== 'boolean' || typeof d.shinyCaught !== 'boolean') throw new SaveError(`bad pokedex entry ${id}`);
    pokedex[id] = { seen: d.seen, caught: d.caught, shinyCaught: d.shinyCaught };
  }
  const badges: string[] = [];
  if (s.badges !== undefined) {
    if (!Array.isArray(s.badges)) throw new SaveError('bad badges');
    for (const b of s.badges) {
      if (typeof b !== 'string' || b.length > 32) throw new SaveError('bad badge');
      if (!badges.includes(b)) badges.push(b);
    }
  }
  const flags: string[] = [];
  if (s.flags !== undefined) {
    if (!Array.isArray(s.flags)) throw new SaveError('bad flags');
    for (const f of s.flags) {
      if (typeof f !== 'string' || f.length > 48) throw new SaveError('bad flag');
      if (!flags.includes(f)) flags.push(f);
    }
  }
  const settings = s.settings as Record<string, unknown> | undefined;
  if (!settings || !isNum(settings.gameSpeed) || !settings.speed || typeof settings.speed !== 'object') throw new SaveError('bad settings');
  const speed = { ...config.speed } as SpeedConfig;
  for (const key of Object.keys(speed) as (keyof SpeedConfig)[]) {
    const v = (settings.speed as Record<string, unknown>)[key];
    if (v !== undefined) {
      if (!isNum(v) || v < 0 || v > 1000) throw new SaveError(`bad speed constant ${key}`);
      speed[key] = v;
    }
  }
  if (settings.zoom !== undefined && !(SAVED_ZOOMS as readonly unknown[]).includes(settings.zoom)) throw new SaveError('bad zoom');
  return {
    version: SAVE_VERSION,
    savedAt: s.savedAt,
    ...(s.starter !== undefined ? { starter: s.starter as number } : {}),
    party,
    boxes,
    progress,
    items: { balls, potions: items.potions as number, rareCandies: items.rareCandies as number },
    money: s.money as number,
    pokedex,
    badges,
    flags,
    ...(isInt(s.conferenceWins, 0, 10000) ? { conferenceWins: s.conferenceWins } : {}),
    ...(isInt(s.tickets, 0, 10000) ? { tickets: s.tickets } : {}),
    ...(s.conference && typeof s.conference === 'object' ? { conference: JSON.parse(JSON.stringify(s.conference)) as unknown } : {}),
    ...(s.lotteryPending === 'won' || s.lotteryPending === 'lost' ? { lotteryPending: s.lotteryPending } : {}),
    ...(typeof s.lotteryDay === 'string' && s.lotteryDay.length <= 10 ? { lotteryDay: s.lotteryDay } : {}),
    ...(isInt(s.lotteryPlayed, 0, 100000) ? { lotteryPlayed: s.lotteryPlayed } : {}),
    settings: { gameSpeed: GAME_SPEEDS.includes(settings.gameSpeed) ? settings.gameSpeed : 1, ...(settings.zoom !== undefined ? { zoom: settings.zoom as SavedZoom } : {}), speed },
  };
}

/** Rebuilds a GameState from validated save data. */
export function restoreGame(data: SaveData): GameState {
  const game = createGameState();
  if (data.starter !== undefined) game.starter = data.starter;
  game.party = data.party.map(loadMonster);
  game.boxes = data.boxes.map((b): Box => ({ name: b.name, wallpaper: b.wallpaper, slots: b.slots.map((m) => (m ? loadMonster(m) : null)) }));
  // A party past the limit (never written by the game) spills into the boxes rather than being lost.
  while (game.party.length > config.party.maxParty) depositToBox(game, game.party.pop() as Monster);
  game.progress = data.progress;
  game.items = { balls: { ...game.items.balls, ...data.items.balls }, potions: data.items.potions, rareCandies: data.items.rareCandies };
  game.money = data.money;
  game.pokedex = data.pokedex;
  game.badges = [...data.badges];
  game.flags = [...(data.flags ?? [])];
  if (data.conferenceWins) game.conferenceWins = data.conferenceWins;
  if (data.tickets) game.tickets = data.tickets;
  if (data.conference) game.conference = JSON.parse(JSON.stringify(data.conference)) as unknown;
  if (data.lotteryPending) game.lotteryPending = data.lotteryPending;
  if (data.lotteryDay) game.lotteryDay = data.lotteryDay;
  if (data.lotteryPlayed) game.lotteryPlayed = data.lotteryPlayed;
  return game;
}

// ------------------------------------------------------------- save codes

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** `PTD2.<base64url json>.<checksum>` */
export function encodeSaveCode(data: SaveData): string {
  const json = JSON.stringify(data);
  const body = toBase64Url(json);
  return `${CODE_PREFIX}${body}.${hashString(body).toString(36)}`;
}

/** Parses and validates a save code (v1 or v2); throws SaveError for anything corrupt. */
export function decodeSaveCode(code: string): SaveData {
  const trimmed = code.trim();
  const match = CODE_PATTERN.exec(trimmed);
  if (!match) throw new SaveError('not a save code for this version');
  const rest = trimmed.slice(match[0].length);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) throw new SaveError('save code is incomplete');
  const body = rest.slice(0, dot);
  const sum = rest.slice(dot + 1);
  if (hashString(body).toString(36) !== sum) throw new SaveError('save code checksum does not match');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(body));
  } catch {
    throw new SaveError('save code could not be decoded');
  }
  return validateSave(parsed);
}
