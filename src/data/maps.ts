/**
 * Level maps, stored as Tiled JSON under src/data/maps/ (see docs/maps.md).
 * `getMap` keeps returning the simulation's MapDef; scenes use
 * `getMapModel` for rendering and editing.
 */
import { cloneModel, fromTiled, toMapDef, type MapModel } from '../map/tiled';
import type { MapDef } from '../sim/map';
// Every Tiled JSON under src/data/maps/ is a map, keyed by its file name
// (route-201.json -> "route-201"); drop a file in and it is registered.
const sources: Record<string, unknown> = Object.fromEntries(
  Object.entries(import.meta.glob('./maps/*.json', { eager: true, import: 'default' })).map(([path, json]) => [
    path.replace(/^.*\//, '').replace(/\.json$/, ''),
    json,
  ]),
);

const models = new Map<string, MapModel>();

/** The editable map model (a fresh copy each call). */
export function getMapModel(name: string): MapModel {
  let model = models.get(name);
  if (!model) {
    const json = sources[name];
    if (!json) throw new Error(`maps: unknown map "${name}"`);
    model = fromTiled(json, name);
    models.set(name, model);
  }
  return cloneModel(model);
}

export function getMap(name: string): MapDef {
  return toMapDef(getMapModel(name));
}

export function mapNames(): string[] {
  return Object.keys(sources);
}
