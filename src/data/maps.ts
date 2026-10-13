import type { MapDef } from '../sim/map';
import route201 from './maps/route-201.json';
import oreburghMine1f from './maps/oreburgh-mine-1f.json';

const maps: Record<string, MapDef> = {
  'route-201': route201 as unknown as MapDef,
  'oreburgh-mine-1f': oreburghMine1f as unknown as MapDef,
};

export function getMap(name: string): MapDef {
  const map = maps[name];
  if (!map) throw new Error(`maps: unknown map "${name}"`);
  return map;
}

export function mapNames(): string[] {
  return Object.keys(maps);
}
