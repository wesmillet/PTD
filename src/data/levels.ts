import type { LevelDef } from '../sim/waves';
import levelsJson from './levels.json';

const levels = levelsJson as unknown as Record<string, LevelDef>;

export function getLevel(id: string): LevelDef {
  const def = levels[id];
  if (!def) throw new Error(`levels: unknown level "${id}"`);
  if (def.objective !== 'defend' && def.objective !== 'free') throw new Error(`levels: bad objective in "${id}"`);
  return def;
}

export function levelIds(): string[] {
  return Object.keys(levels);
}
