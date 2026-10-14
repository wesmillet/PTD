/**
 * Level definitions: every JSON under src/data/levels/ is merged in file
 * order (00-opening, 10-gyms, ...), so the order of the files is the story
 * order of the level select. A level may put its badge under `reward`; it
 * is mirrored to `badge` here so older code keeps working.
 */
import type { LevelDef } from '../sim/waves';

const files = Object.entries(import.meta.glob('./levels/*.json', { eager: true, import: 'default' })).sort(([a], [b]) => a.localeCompare(b));
const levels: Record<string, LevelDef> = {};
for (const [, json] of files) {
  for (const [id, raw] of Object.entries(json as Record<string, LevelDef>)) {
    if (levels[id]) throw new Error(`levels: "${id}" is defined twice`);
    const def = { ...raw };
    if (!def.badge && def.reward?.badge) def.badge = def.reward.badge;
    levels[id] = def;
  }
}

export function getLevel(id: string): LevelDef {
  const def = levels[id];
  if (!def) throw new Error(`levels: unknown level "${id}"`);
  if (def.objective !== 'defend' && def.objective !== 'free') throw new Error(`levels: bad objective in "${id}"`);
  return def;
}

export function levelIds(): string[] {
  return Object.keys(levels);
}

export function hasLevel(id: string): boolean {
  return id in levels;
}
