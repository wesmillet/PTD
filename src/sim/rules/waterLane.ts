/**
 * Water lane (the lake islands after Surf): the spots marked with
 * `spotProp` ("island"), or the `waterSpots` spots nearest the end of the
 * path, are water: only Water or Flying types may stand there, and Water
 * type enemies take the map's `path-water` lane when it has one (every
 * other spawn, so the shore still sees traffic). With `refill`, the lake
 * is dry for that many waves (anyone may stand on the water spots, no
 * water lane) and then refills. With `ice`, enemies on the water lane walk
 * at `iceSpeed`; a map without one freezes the whole shore instead.
 */
import { getPokemon } from '../../data/pokedata';
import { spotProps, type Tile } from '../map';
import { unplaceTower } from '../level';
import { FLYING, WATER } from './helpers';
import type { RuleModule } from './types';
import { num, str } from './types';

const WATER_LANE = 'path-water';

export const waterLane: RuleModule = {
  id: 'water-lane',
  create(params) {
    const prop = str(params, 'spotProp', 'island');
    const count = num(params, 'waterSpots', 4);
    const refill = num(params, 'refill', 0);
    const ice = params.ice === true;
    const iceSpeed = num(params, 'iceSpeed', 0.7);
    let water: Tile[] = [];
    let wave = 0; // 1-based wave running or about to run
    const flooded = () => refill === 0 || wave > refill;
    const swims = (types: readonly number[]) => types.includes(WATER) || types.includes(FLYING);
    const isWater = (tile: Tile) => water.some(([x, y]) => x === tile[0] && y === tile[1]);
    return {
      id: 'water-lane',
      onCreate(ctx) {
        const map = ctx.state.map;
        water = map.placeable.filter(([x, y]) => spotProps(map, x, y)[prop]);
        if (water.length === 0) {
          const end = map.lanes?.[WATER_LANE]?.[0] ?? map.path[map.path.length - 1]!;
          water = [...map.placeable].sort((a, b) => Math.hypot(a[0] - end[0], a[1] - end[1]) - Math.hypot(b[0] - end[0], b[1] - end[1])).slice(0, count);
        }
      },
      onWaveStart(ctx, waveIndex) {
        const was = flooded();
        wave = waveIndex + 1;
        if (flooded() && !was && refill > 0) {
          for (const tower of [...ctx.state.towers]) {
            if (!isWater(tower.tile) || swims(tower.mon.types) || tower.ally) continue;
            unplaceTower(ctx.state, tower.id);
            ctx.events.push({ type: 'rule', rule: 'water-lane', towerId: tower.id, tile: tower.tile, text: `The lake refills! ${tower.mon.name} had to leave the water.` });
          }
          ctx.events.push({ type: 'rule', rule: 'water-lane', text: 'The lake has refilled: the water spots are for Water and Flying types.' });
        }
      },
      canPlace(_ctx, mon, tile) {
        return flooded() && isWater(tile) && !swims(mon.types) ? 'Only Water or Flying types can stand on the water' : null;
      },
      pickLane(ctx, _waveIndex, spawnIndex, species) {
        if (!flooded() || species === undefined || !ctx.state.lanes[WATER_LANE]) return undefined;
        return getPokemon(species).types.includes(WATER) && spawnIndex % 2 === 0 ? WATER_LANE : undefined;
      },
      enemySpeed(ctx, enemy) {
        if (!ice) return 1;
        return !ctx.state.lanes[WATER_LANE] || enemy.lane === WATER_LANE ? iceSpeed : 1;
      },
      banner() {
        if (refill > 0) return flooded() ? 'The lake is full' : `Dry lake bed (${refill - wave + 1} more)`;
        return ice ? 'Ice on the water' : 'Water lane';
      },
      status() {
        return flooded() ? { id: 'water-lane', label: ice ? 'Ice on the water' : 'Water spots', blocked: water } : { id: 'water-lane', label: 'Dry lake bed' };
      },
    };
  },
};
