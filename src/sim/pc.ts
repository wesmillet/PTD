/**
 * The PC: boxes of fixed slots (6x5 like the DS games), each with a name
 * and a wallpaper, plus the moves between any party or box slot. Pure; no
 * Phaser imports. Layout constants come from src/data/pc.json.
 */
import pcJson from '../data/pc.json';
import { typeName } from '../data/pokedata';
import type { Monster } from './monster';
import config from '../data/config.json';

export interface WallpaperDef {
  id: string;
  name: string;
  image: string;
}

export interface PcConfig {
  boxes: number;
  columns: number;
  rows: number;
  frame: string;
  cursor: string;
  defaultNames: string[];
  defaultWallpapers: string[];
  wallpapers: WallpaperDef[];
}

export const PC = pcJson as PcConfig;
export const SLOTS_PER_BOX = PC.columns * PC.rows;
export const MAX_PARTY = config.party.maxParty;

export interface Box {
  name: string;
  wallpaper: string;
  /** Exactly SLOTS_PER_BOX entries. */
  slots: (Monster | null)[];
}

export interface BoxOwner {
  party: Monster[];
  boxes: Box[];
}

export type SlotRef = { kind: 'party'; index: number } | { kind: 'box'; box: number; slot: number };

export function createBox(index: number): Box {
  return {
    name: PC.defaultNames[index] ?? `Box ${index + 1}`,
    wallpaper: PC.defaultWallpapers[index % PC.defaultWallpapers.length] ?? PC.wallpapers[0]?.id ?? 'forest',
    slots: new Array<Monster | null>(SLOTS_PER_BOX).fill(null),
  };
}

export function createBoxes(count = PC.boxes): Box[] {
  return Array.from({ length: count }, (_, i) => createBox(i));
}

/** Every boxed Pokémon in box and slot order. */
export function allBoxed(owner: BoxOwner): Monster[] {
  const out: Monster[] = [];
  for (const box of owner.boxes) for (const mon of box.slots) if (mon) out.push(mon);
  return out;
}

export function boxCount(box: Box): number {
  return box.slots.filter((m) => m !== null).length;
}

/** First empty slot across the boxes, from `startBox`, or null when the PC is full. */
export function firstFreeSlot(owner: BoxOwner, startBox = 0): { box: number; slot: number } | null {
  for (let b = 0; b < owner.boxes.length; b++) {
    const index = (startBox + b) % owner.boxes.length;
    const slot = owner.boxes[index]!.slots.indexOf(null);
    if (slot >= 0) return { box: index, slot };
  }
  return null;
}

/** Puts a Pokémon in the first free box slot. Throws when every box is full. */
export function depositToBox(owner: BoxOwner, mon: Monster, startBox = 0): { box: number; slot: number } {
  const free = firstFreeSlot(owner, startBox);
  if (!free) throw new Error('every box is full');
  owner.boxes[free.box]!.slots[free.slot] = mon;
  return free;
}

export function getAt(owner: BoxOwner, ref: SlotRef): Monster | null {
  if (ref.kind === 'party') return owner.party[ref.index] ?? null;
  const box = owner.boxes[ref.box];
  if (!box) throw new Error(`no box ${ref.box}`);
  if (ref.slot < 0 || ref.slot >= SLOTS_PER_BOX) throw new Error(`no slot ${ref.slot}`);
  return box.slots[ref.slot] ?? null;
}

/** Where a Pokémon currently sits, or null. */
export function findRef(owner: BoxOwner, mon: Monster): SlotRef | null {
  const p = owner.party.indexOf(mon);
  if (p >= 0) return { kind: 'party', index: p };
  for (let b = 0; b < owner.boxes.length; b++) {
    const s = owner.boxes[b]!.slots.indexOf(mon);
    if (s >= 0) return { kind: 'box', box: b, slot: s };
  }
  return null;
}

function sameRef(a: SlotRef, b: SlotRef): boolean {
  if (a.kind === 'party' && b.kind === 'party') return a.index === b.index;
  if (a.kind === 'box' && b.kind === 'box') return a.box === b.box && a.slot === b.slot;
  return false;
}

/**
 * Moves the Pokémon at `from` to `to`, swapping when `to` is taken. The party
 * stays dense (an empty party slot means "append") and never empties. Throws
 * with a reason when the move is not allowed.
 */
export function moveMon(owner: BoxOwner, from: SlotRef, to: SlotRef): void {
  if (sameRef(from, to)) return;
  const mon = getAt(owner, from);
  if (!mon) throw new Error('nothing to move');
  if (to.kind === 'party' && (to.index < 0 || to.index >= MAX_PARTY)) throw new Error('no such party slot');
  const target = getAt(owner, to);

  if (from.kind === 'party' && to.kind === 'party') {
    // Reorder within the party.
    const list = owner.party;
    list.splice(from.index, 1);
    list.splice(Math.min(to.index, list.length), 0, mon);
    return;
  }
  if (from.kind === 'party' && to.kind === 'box') {
    if (target) {
      owner.party[from.index] = target;
      owner.boxes[to.box]!.slots[to.slot] = mon;
    } else {
      if (owner.party.length <= 1) throw new Error('the party needs at least one Pokémon');
      owner.party.splice(from.index, 1);
      owner.boxes[to.box]!.slots[to.slot] = mon;
    }
    return;
  }
  if (from.kind === 'box' && to.kind === 'party') {
    if (target) {
      owner.party[to.index] = mon;
      owner.boxes[from.box]!.slots[from.slot] = target;
    } else {
      if (owner.party.length >= MAX_PARTY) throw new Error('the party is full');
      owner.boxes[from.box]!.slots[from.slot] = null;
      owner.party.push(mon);
    }
    return;
  }
  if (from.kind === 'box' && to.kind === 'box') {
    owner.boxes[from.box]!.slots[from.slot] = target;
    owner.boxes[to.box]!.slots[to.slot] = mon;
  }
}

/** Convenience: party member to the first free box slot. */
export function moveToBox(owner: BoxOwner, partyIndex: number, startBox = 0): { box: number; slot: number } {
  if (!owner.party[partyIndex]) throw new Error(`no party member ${partyIndex}`);
  const free = firstFreeSlot(owner, startBox);
  if (!free) throw new Error('every box is full');
  moveMon(owner, { kind: 'party', index: partyIndex }, { kind: 'box', ...free });
  return free;
}

/** Convenience: boxed Pokémon to the end of the party. */
export function moveToParty(owner: BoxOwner, box: number, slot: number): void {
  if (owner.party.length >= MAX_PARTY) throw new Error('the party is full');
  moveMon(owner, { kind: 'box', box, slot }, { kind: 'party', index: owner.party.length });
}

export type SortKey = 'level' | 'type' | 'name' | 'dex';

export function compareMonsters(a: Monster, b: Monster, key: SortKey): number {
  switch (key) {
    case 'level':
      return b.level - a.level || a.name.localeCompare(b.name);
    case 'type':
      return typeName(a.types[0] ?? 0).localeCompare(typeName(b.types[0] ?? 0)) || b.level - a.level;
    case 'name':
      return a.name.localeCompare(b.name) || b.level - a.level;
    case 'dex':
      return a.species - b.species || b.level - a.level;
  }
}

/** A sorted copy of a list (the input is untouched). */
export function sortMonsters(list: readonly Monster[], key: SortKey): Monster[] {
  return [...list].sort((a, b) => compareMonsters(a, b, key));
}

/** Packs a box's Pokémon to the front in sorted order. */
export function sortBox(box: Box, key: SortKey): void {
  const mons = sortMonsters(box.slots.filter((m): m is Monster => m !== null), key);
  box.slots = [...mons, ...new Array<Monster | null>(SLOTS_PER_BOX - mons.length).fill(null)];
}

export interface BoxFilter {
  /** Type id to match (either type). */
  type?: number;
  shiny?: boolean;
}

export function matchesFilter(mon: Monster, filter: BoxFilter): boolean {
  if (filter.type !== undefined && !mon.types.includes(filter.type)) return false;
  if (filter.shiny && !mon.shiny) return false;
  return true;
}

export function setWallpaper(box: Box, wallpaperId: string): void {
  if (!PC.wallpapers.some((w) => w.id === wallpaperId)) throw new Error(`unknown wallpaper ${wallpaperId}`);
  box.wallpaper = wallpaperId;
}

export function wallpaperDef(id: string): WallpaperDef {
  return PC.wallpapers.find((w) => w.id === id) ?? (PC.wallpapers[0] as WallpaperDef);
}
