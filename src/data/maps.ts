/**
 * Level maps, stored as Tiled JSON under src/data/maps/ (see docs/maps.md).
 * `getMap` keeps returning the simulation's MapDef; scenes use
 * `getMapModel` for rendering and editing.
 */
import { cloneModel, fromTiled, toMapDef, type MapModel } from '../map/tiled';
import type { MapDef } from '../sim/map';
import lakeVerity from './maps/lake-verity.json';
import oreburghGate from './maps/oreburgh-gate.json';
import oreburghMine1f from './maps/oreburgh-mine-1f.json';
import route201 from './maps/route-201.json';
import route202 from './maps/route-202.json';
import route203 from './maps/route-203.json';

const sources: Record<string, unknown> = {
  'route-201': route201,
  'lake-verity': lakeVerity,
  'route-202': route202,
  'route-203': route203,
  'oreburgh-gate': oreburghGate,
  'oreburgh-mine-1f': oreburghMine1f,
};

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
