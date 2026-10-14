#!/usr/bin/env python3
"""
Hand-designed Sinnoh maps for the opening routes, built in code.

Each map below is a layout description (enemy path, terrain areas, tree and
rock stamps, placeable spots) based on the real Platinum location. This script
paints it with the Gen 5 tile catalogue and writes Tiled JSON to
src/data/maps/<id>.json in the format described in docs/maps.md.

Usage: python3 scripts/sinnoh-maps.py [map-id ...]   (default: all)
Run `npm run build-tilesets` first if src/data/tiles.json changed.
"""
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = json.loads((ROOT / 'src/data/tiles.json').read_text())
GEN = json.loads((ROOT / 'src/data/tilesets.json').read_text())
TILE = 32
DEFS = {t['id']: t for t in CAT['tiles']}


def tilesets_for(ts_id):
    main = GEN['tilesets'][ts_id]
    out = [{
        'firstgid': 1, 'name': ts_id, 'image': main['image'],
        'imagewidth': main['columns'] * TILE, 'imageheight': main['rows'] * TILE,
        'tilewidth': TILE, 'tileheight': TILE, 'columns': main['columns'],
        'tilecount': main['tilecount'], 'margin': 0, 'spacing': 0,
    }]
    nxt = 1 + main['tilecount']
    for t in CAT['terrains']:
        g = GEN['autotiles'][t['id']]
        out.append({
            'firstgid': nxt, 'name': f"autotile:{t['id']}", 'image': g['image'],
            'imagewidth': 96 * g['frames'], 'imageheight': 128, 'tilewidth': TILE,
            'tileheight': TILE, 'columns': 3, 'tilecount': 12, 'margin': 0, 'spacing': 0,
        })
        nxt += 12
    return out


class Map:
    def __init__(self, name, width, height, theme='grass', tileset='gen5-outdoor', seed=1):
        self.name, self.w, self.h, self.theme, self.ts = name, width, height, theme, tileset
        self.cols = GEN['tilesets'][tileset]['columns']
        n = width * height
        self.ground = [0] * n
        self.terrain = [0] * n
        self.deco = [0] * n
        self.deco_owner = [None] * n
        self.rng = random.Random(seed)
        self.tilesets = tilesets_for(tileset)
        self.waypoints = []
        self.path_cells = set()
        self.placeable = []
        self.reserved = set()  # cells decoration must not cover (path, spots, approach)

    # ---- helpers
    def idx(self, x, y):
        return y * self.w + x

    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def tile(self, tid):
        i = GEN['tilesets'][self.ts]['tiles'].get(tid)
        if i is None:
            raise KeyError(f'{self.name}: no packed tile {tid}')
        return i

    _alpha = None

    def transparent(self, packed):
        """True if the packed tile is mostly empty (a canopy corner)."""
        if Map._alpha is None:
            from PIL import Image
            Map._alpha = Image.open(ROOT / 'public/assets/tilesets/gen5-outdoor.png').getchannel('A')
        x, y = (packed % self.cols) * TILE, (packed // self.cols) * TILE
        hist = Map._alpha.crop((x, y, x + TILE, y + TILE)).histogram()
        return sum(hist[1:]) < TILE * TILE * 0.45

    def terrain_gid(self, tid):
        return next(t['firstgid'] for t in self.tilesets if t['name'] == f'autotile:{tid}')

    # ---- ground
    def fill_ground(self, choices):
        """choices: list of (tile id, weight)."""
        ids = [c[0] for c in choices]
        wts = [c[1] for c in choices]
        for y in range(self.h):
            for x in range(self.w):
                self.ground[self.idx(x, y)] = self.tile(self.rng.choices(ids, wts)[0]) + 1

    def ground_rect(self, tid, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.inb(x, y):
                    self.ground[self.idx(x, y)] = self.tile(tid) + 1

    # ---- terrain
    def terrain_rect(self, tid, x0, y0, x1, y1):
        self.terrain_cells(tid, [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)])

    def terrain_cells(self, tid, cells, on_path=False):
        g = self.terrain_gid(tid)
        for x, y in cells:
            if (x, y) in self.path_cells and not on_path:
                continue
            if self.inb(x, y):
                self.terrain[self.idx(x, y)] = g

    def terrain_ellipse(self, tid, cx, cy, rx, ry):
        cells = [(x, y) for y in range(cy - ry, cy + ry + 1) for x in range(cx - rx, cx + rx + 1)
                 if ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 <= 1]
        self.terrain_cells(tid, cells)
        return set(cells)

    def has_terrain(self, x, y, tid):
        return self.inb(x, y) and self.terrain[self.idx(x, y)] == self.terrain_gid(tid)

    # ---- path
    def set_path(self, pts, terrain='dirt-path', width=1):
        self.waypoints = pts
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            assert ax == bx or ay == by, f'{self.name}: diagonal segment {(ax, ay)}->{(bx, by)}'
            dx = (bx > ax) - (bx < ax)
            dy = (by > ay) - (by < ay)
            for s in range(abs(bx - ax) + abs(by - ay) + 1):
                self.path_cells.add((ax + dx * s, ay + dy * s))
        self.reserved |= self.path_cells
        if terrain:
            cells = set(self.path_cells)
            if width == 2:
                # Widen by one tile below/right so the road reads as a road.
                cells |= {(x, y + 1) for x, y in self.path_cells} | {(x + 1, y) for x, y in self.path_cells}
            self.terrain_cells(terrain, cells, on_path=True)

    def spots(self, pts):
        for p in pts:
            assert p not in self.path_cells, f'{self.name}: spot {p} on path'
            assert self.inb(*p), f'{self.name}: spot {p} out of bounds'
            self.placeable.append(p)
            self.reserved.add(p)

    # ---- decoration
    def can_stamp(self, tid, x0, y0, allow_clip=False, over_trees=False):
        d = DEFS[tid]
        w, h = d.get('w', 1), d.get('h', 1)
        for dy in range(h):
            for dx in range(w):
                x, y = x0 + dx, y0 + dy
                if not self.inb(x, y):
                    if allow_clip:
                        continue
                    return False
                if (x, y) in self.reserved:
                    return False
                if self.deco[self.idx(x, y)] and not (over_trees and DEFS[self.deco_owner[self.idx(x, y)]]['group'] == 'Trees'):
                    return False
        return True

    def stamp(self, tid, x0, y0, clip=True, must=True, over_trees=False):
        if not self.can_stamp(tid, x0, y0, allow_clip=clip, over_trees=over_trees):
            if must:
                raise ValueError(f'{self.name}: cannot place {tid} at {(x0, y0)}')
            return False
        d = DEFS[tid]
        w, h = d.get('w', 1), d.get('h', 1)
        base = self.tile(tid)
        for dy in range(h):
            for dx in range(w):
                x, y = x0 + dx, y0 + dy
                if self.inb(x, y):
                    # Transparent canopy corners must not erase the tree behind.
                    if over_trees and self.deco[self.idx(x, y)] and (dy == 0 or dx == 0 or dx == w - 1) and self.transparent(base + dy * self.cols + dx):
                        continue
                    self.deco[self.idx(x, y)] = base + dy * self.cols + dx + 1
                    self.deco_owner[self.idx(x, y)] = tid
        return True

    def scatter(self, tids, count, area=None, avoid_terrain=(), tries=400, margin=0):
        """Scatter small decorations on free plain cells."""
        x0, y0, x1, y1 = area or (0, 0, self.w - 1, self.h - 1)
        placed = 0
        for _ in range(tries):
            if placed >= count:
                break
            tid = self.rng.choice(tids)
            x = self.rng.randint(x0, x1)
            y = self.rng.randint(y0, y1)
            d = DEFS[tid]
            cells = [(x + dx, y + dy) for dy in range(d.get('h', 1)) for dx in range(d.get('w', 1))]
            if any(self.inb(cx, cy) and self.terrain[self.idx(cx, cy)] for cx, cy in cells):
                continue
            near = {(cx + ox, cy + oy) for cx, cy in cells for ox in range(-margin, margin + 1) for oy in range(-margin, margin + 1)}
            if near & self.reserved:
                continue
            if self.stamp(tid, x, y, clip=False, must=False):
                placed += 1
        return placed

    # ---- output
    def write(self):
        centre = lambda t: t * TILE + TILE // 2
        sx, sy = self.waypoints[0]
        ex, ey = self.waypoints[-1]
        oid = 1
        objs = [{
            'id': oid, 'name': 'path', 'type': 'path', 'x': centre(sx), 'y': centre(sy), 'width': 0, 'height': 0,
            'rotation': 0, 'visible': True,
            'polyline': [{'x': centre(x) - centre(sx), 'y': centre(y) - centre(sy)} for x, y in self.waypoints],
        }]
        oid += 1
        objs.append({'id': oid, 'name': 'spawn', 'type': 'spawn', 'x': centre(sx), 'y': centre(sy), 'width': 0,
                     'height': 0, 'rotation': 0, 'visible': True, 'point': True})
        oid += 1
        objs.append({'id': oid, 'name': 'exit', 'type': 'exit', 'x': centre(ex), 'y': centre(ey), 'width': 0,
                     'height': 0, 'rotation': 0, 'visible': True, 'point': True})
        oid += 1
        plc = []
        for x, y in self.placeable:
            plc.append({'id': oid, 'name': 'placeable', 'type': 'placeable', 'x': x * TILE, 'y': y * TILE,
                        'width': TILE, 'height': TILE, 'rotation': 0, 'visible': True})
            oid += 1
        size = {'width': self.w, 'height': self.h, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True}
        out = {
            'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal',
            'renderorder': 'right-down', 'compressionlevel': -1, 'infinite': False,
            'width': self.w, 'height': self.h, 'tilewidth': TILE, 'tileheight': TILE,
            'nextlayerid': 6, 'nextobjectid': oid,
            'properties': [
                {'name': 'name', 'type': 'string', 'value': self.name},
                {'name': 'theme', 'type': 'string', 'value': self.theme},
                {'name': 'tileset', 'type': 'string', 'value': self.ts},
            ],
            'tilesets': self.tilesets,
            'layers': [
                {'id': 1, 'name': 'ground', 'type': 'tilelayer', **size, 'data': self.ground},
                {'id': 2, 'name': 'terrain', 'type': 'tilelayer', **size, 'data': self.terrain},
                {'id': 3, 'name': 'decoration', 'type': 'tilelayer', **size, 'data': self.deco},
                {'id': 4, 'name': 'path', 'type': 'objectgroup', 'x': 0, 'y': 0, 'opacity': 1, 'visible': True,
                 'draworder': 'topdown', 'objects': objs},
                {'id': 5, 'name': 'placeable', 'type': 'objectgroup', 'x': 0, 'y': 0, 'opacity': 1, 'visible': True,
                 'draworder': 'topdown', 'objects': plc},
            ],
        }
        dest = ROOT / 'src/data/maps' / f'{self.name}.json'
        dest.write_text(json.dumps(out, indent=1) + '\n')
        solid = {t['id'] for t in CAT['tiles'] if t.get('solid')}
        blocked_spots = [p for p in self.placeable if self.deco_owner[self.idx(*p)] in solid]
        assert not blocked_spots, f'{self.name}: spots under solid decoration {blocked_spots}'
        print(f'{self.name}: {self.w}x{self.h}, path {len(self.path_cells)} tiles, {len(self.placeable)} spots')


GRASS = [('grass', 10), ('grass-2', 3)]
FLOWERS = ['flowers-purple', 'flowers-blue', 'flowers-white', 'flowers-white-2', 'weeds-1', 'weeds-2', 'weeds-3']


def tree_band_top(m, kinds=('tree-pair', 'tree-pair-2'), y=-1, gaps=()):
    x = 0
    while x < m.w:
        if any(g0 <= x <= g1 for g0, g1 in gaps):
            x += 1
            continue
        m.stamp(m.rng.choice(kinds), x, y, must=False)
        x += 5


def tree_band_bottom(m, kinds=('tree-pair', 'tree-pair-2'), y=None, gaps=()):
    y = m.h - 3 if y is None else y
    x = 0
    while x < m.w:
        if any(g0 <= x <= g1 for g0, g1 in gaps):
            x += 1
            continue
        m.stamp(m.rng.choice(kinds), x, y, must=False)
        x += 5


def forest(m, x0, y0, x1, y1, kinds=('tree-pair', 'tree-pair-2', 'tree-pair'), big=('tree-big', 'tree-big-2')):
    """A dense forest wall from whole tree stamps packed edge to edge (the map
    has one decoration layer, so stamps must not overlap). Rows are 4 tiles
    apart and alternate rows shift by 2 so canopies stagger; a 5x5 cluster
    replaces a pair now and then. Nothing covers reserved cells; single
    trees plug gaps a pair can't fill."""
    row = 0
    for y in range(y0, y1 + 1, 4):
        off = 2 if row % 2 else 0
        for x in range(x0 - off, x1 + 1, 5):
            tid = m.rng.choice(big) if m.rng.random() < 0.25 else m.rng.choice(kinds)
            if m.stamp(tid, x, y, must=False):
                continue
            if m.stamp(m.rng.choice(kinds), x, y, must=False):
                continue
            for dx in (0, 2):
                m.stamp('tree', x + dx, y, must=False) or m.stamp('tree', x + dx, y + 1, must=False)
        row += 1


def grass_blob(m, tid, cx, cy, rx, ry):
    """Tall grass in an irregular clump: a few overlapping rectangles."""
    m.terrain_rect(tid, cx - rx, cy - ry + 1, cx + rx, cy + ry - 1)
    m.terrain_rect(tid, cx - rx + 1, cy - ry, cx + rx - 1, cy + ry)
    if m.rng.random() < 0.6:
        m.terrain_rect(tid, cx - rx - 1, cy, cx - rx, cy + m.rng.randint(0, 1))
    if m.rng.random() < 0.6:
        m.terrain_rect(tid, cx + rx, cy - m.rng.randint(0, 1), cx + rx + 1, cy)


def flower_beds(m, n, area):
    """Small planted clusters of flowers, the way BW towns and routes use them."""
    return m.scatter(['flower-patch-pink', 'flower-patch-white', 'flower-bed-red', 'flower-patch-pink'],
                     n, area=area, margin=0)


# --------------------------------------------------------------------------
# Route 201: Twinleaf Town (west) to Sandgem Town (east). A short, friendly
# route: one dirt road through clumps of tall grass between two forest walls,
# with the side path north to Lake Verity and a route sign at the start.
def route_201():
    m = Map('route-201', 30, 14, seed=201)
    m.fill_ground(GRASS)
    path = [(0, 6), (7, 6), (7, 9), (16, 9), (16, 5), (24, 5), (24, 8), (29, 8)]
    m.set_path(path)
    m.terrain_rect('dirt-path', 11, 0, 12, 4)
    m.terrain_rect('dirt-path', 11, 4, 16, 4)
    grass_blob(m, 'tall-grass', 3, 9, 2, 1)
    grass_blob(m, 'tall-grass', 20, 8, 2, 2)
    grass_blob(m, 'tall-grass', 27, 3, 1, 1)
    grass_blob(m, 'tall-grass', 12, 7, 2, 1)
    m.spots([(4, 4), (5, 8), (9, 7), (10, 10), (14, 7), (18, 3), (20, 6), (22, 3), (26, 10), (28, 10)])
    m.reserved |= {(x, y) for x in range(10, 14) for y in range(0, 5)}
    forest(m, -1, -2, 31, -2)
    forest(m, -1, 11, 31, 11)
    m.stamp('sign', 1, 3)
    m.stamp('sign', 13, 2, must=False)
    flower_beds(m, 3, (0, 3, 29, 10))
    m.scatter(['flowers-purple', 'flowers-blue', 'flowers-white'], 6, area=(0, 3, 29, 10))
    m.write()


# --------------------------------------------------------------------------
# Lake Verity: a quiet lake in a ring of forest just north of Twinleaf. The
# path walks the shore around the water; reeds line the sandy bank.
def lake_verity():
    m = Map('lake-verity', 30, 14, seed=301)
    m.fill_ground(GRASS)
    path = [(0, 11), (4, 11), (4, 2), (25, 2), (25, 11), (29, 11)]
    m.set_path(path)
    for r in [(7, 4, 22, 10), (9, 3, 20, 3), (6, 5, 6, 9), (23, 5, 23, 9)]:
        m.terrain_rect('sand', *r)
    for r in [(9, 5, 20, 9), (8, 6, 21, 8), (11, 4, 18, 4), (12, 10, 17, 10)]:
        m.terrain_rect('water', *r)
    m.spots([(2, 8), (6, 4), (6, 10), (9, 3), (15, 3), (21, 3), (23, 4), (23, 10), (27, 4), (27, 9)])
    forest(m, -1, -3, 31, -3, kinds=('pine-pair', 'pine-pair-2'), big=('pine-big',))
    forest(m, -1, 12, 31, 12)
    forest(m, -4, 2, 0, 10)
    forest(m, 28, 2, 32, 10)
    for x, y in [(7, 4), (22, 4), (7, 9), (22, 9), (10, 11), (19, 11)]:
        m.stamp(m.rng.choice(['reeds-green', 'reeds-teal', 'reeds-green-2']), x, y - 1, clip=False, must=False)
    flower_beds(m, 2, (0, 3, 29, 11))
    m.scatter(['flowers-white', 'flowers-blue'], 5, area=(0, 3, 29, 11))
    m.write()


# --------------------------------------------------------------------------
# Route 202: Sandgem Town (south) to Jubilife City (north). The tall-grass
# route where Dawn teaches catching: the road zigzags north through wide
# grass fields between forest on both flanks, with a ledge to hop down.
def route_202():
    m = Map('route-202', 30, 14, seed=202)
    m.fill_ground(GRASS)
    path = [(3, 13), (3, 9), (12, 9), (12, 4), (20, 4), (20, 9), (26, 9), (26, 0)]
    m.set_path(path)
    grass_blob(m, 'tall-grass', 7, 5, 3, 2)
    grass_blob(m, 'tall-grass', 16, 8, 2, 3)
    grass_blob(m, 'tall-grass', 23, 4, 1, 2)
    grass_blob(m, 'tall-grass-yellow', 8, 11, 2, 1)
    m.spots([(1, 8), (5, 10), (9, 8), (11, 2), (14, 3), (17, 5), (19, 8), (21, 10), (24, 11), (28, 5)])
    forest(m, -3, -2, 1, 6)
    forest(m, 13, -2, 22, -2)
    forest(m, 27, 10, 33, 10)
    forest(m, 13, 12, 25, 12)
    m.stamp('tree', 28, -1, must=False)
    for x in range(14, 19):
        m.stamp('ledge', x, 11, clip=False, must=False)
    m.stamp('ledge-left', 13, 11, clip=False, must=False)
    m.stamp('ledge-right', 19, 11, clip=False, must=False)
    m.stamp('sign', 4, 11, must=False)
    flower_beds(m, 3, (0, 0, 29, 13))
    m.scatter(['rock-small', 'rock-small-2'], 2, area=(0, 0, 29, 13), margin=1)
    m.write()


# --------------------------------------------------------------------------
# Route 203: Jubilife City (west) to Oreburgh Gate (east). Where Barry
# challenges you. The road runs past a pond and the land turns rocky toward
# the cliffs of Mt. Coronet that hold the Oreburgh Gate cave.
def route_203():
    m = Map('route-203', 30, 14, seed=203)
    m.fill_ground(GRASS)
    path = [(0, 4), (6, 4), (6, 10), (14, 10), (14, 6), (21, 6), (21, 9), (29, 9)]
    m.set_path(path)
    for r in [(22, 3, 29, 13), (20, 5, 21, 13), (19, 8, 19, 12)]:
        m.terrain_rect('pebbles', *r)
    m.set_path(path)
    m.terrain_rect('water', 9, 5, 12, 7)
    grass_blob(m, 'tall-grass', 2, 9, 2, 2)
    grass_blob(m, 'tall-grass', 17, 11, 1, 1)
    plateau(m, 21, 0, 30, 2, open_top=True)
    m.spots([(3, 2), (4, 6), (8, 9), (9, 3), (12, 8), (13, 4), (17, 7), (19, 5), (23, 7), (26, 11)])
    forest(m, -1, -2, 20, -2)
    forest(m, -1, 12, 15, 12)
    m.stamp('tree', 15, 1, must=False)
    for tid, x, y in [('boulder', 24, 4), ('rock-big', 27, 4), ('boulder', 23, 11), ('rock-small', 28, 7),
                      ('rock-small-2', 20, 11), ('rock-small', 27, 12)]:
        m.stamp(tid, x, y, must=False)
    m.stamp('sign', 1, 5, must=False)
    for x, y in [(8, 5), (13, 5), (8, 8)]:
        m.stamp('reeds-green', x, y - 1, clip=False, must=False)
    flower_beds(m, 2, (0, 2, 18, 11))
    m.scatter(['rock-small', 'rock-small-2'], 3, area=(20, 3, 29, 12), margin=1)
    m.write()

def plateau(m, x0, y0, x1, y1, open_top=False, open_bottom=False):
    """A raised rock shelf from the cliff tiles: rim on top, face on the bottom
    row. open_top/open_bottom continue it past the map edge."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            top = y == y0 and not open_top
            bot = y == y1 and not open_bottom
            col = 'l' if x == x0 else 'r' if x == x1 else 'm'
            if bot:
                tid = {'l': 'cliff-bl', 'm': 'cliff-face', 'r': 'cliff-br'}[col]
            elif top:
                tid = {'l': 'cliff-tl', 'm': 'cliff-t', 'r': 'cliff-tr'}[col]
            else:
                tid = {'l': 'cliff-l', 'm': 'cliff-top', 'r': 'cliff-r'}[col]
            if m.inb(x, y):
                m.ground[m.idx(x, y)] = m.tile(tid) + 1
                m.reserved.add((x, y))


CAVE_FLOOR = [('dirt', 8), ('rock-floor', 2), ('dirt-dark', 1)]


# --------------------------------------------------------------------------
# Oreburgh Gate: the cave tunnel through the mountain between Route 203 and
# Oreburgh City. Rock walls above and below, an underground stream, boulders.
def oreburgh_gate():
    m = Map('oreburgh-gate', 30, 14, theme='cave', seed=401)
    m.fill_ground([('rock-floor', 1)])
    plateau(m, -1, 0, 30, 1, open_top=True)
    plateau(m, -1, 12, 30, 13, open_bottom=True)
    plateau(m, 10, 6, 13, 8)
    path = [(0, 5), (7, 5), (7, 10), (16, 10), (16, 3), (24, 3), (24, 7), (29, 7)]
    m.set_path(path, terrain='sand')
    m.terrain_rect('water', 18, 5, 21, 11)
    m.terrain_rect('pebbles', 1, 7, 5, 10)
    m.terrain_rect('pebbles', 25, 9, 28, 11)
    m.spots([(3, 3), (5, 7), (9, 4), (9, 9), (14, 8), (14, 4), (18, 2), (22, 4), (26, 5), (27, 9)])
    for tid, x, y in [('boulder', 1, 2), ('rock-big', 11, 2), ('boulder', 27, 2), ('boulder', 2, 11), ('rock-big', 13, 11),
                      ('boulder', 23, 11), ('rock-small', 6, 2), ('rock-small-2', 20, 2), ('rock-small', 11, 9)]:
        m.stamp(tid, x, y, must=False)
    m.scatter(['rock-small', 'rock-small-2', 'pebbles-brown', 'pebbles-tan'], 8, area=(0, 2, 29, 11))
    m.write()


# --------------------------------------------------------------------------
# Oreburgh Mine 1F: Roark's coal mine under Oreburgh City. Dark floor,
# rock shelves the miners left behind, coal and boulders everywhere, and a
# long winding route from the entrance (east) down to the mine face (west).
def oreburgh_mine():
    m = Map('oreburgh-mine-1f', 30, 14, theme='cave', seed=402)
    m.fill_ground([('rock-floor', 1)])
    plateau(m, -1, 0, 30, 1, open_top=True)
    plateau(m, -1, 12, 30, 13, open_bottom=True)
    plateau(m, 2, 3, 6, 5)
    plateau(m, 21, 7, 26, 9)
    path = [(29, 3), (18, 3), (18, 9), (10, 9), (10, 4), (8, 4), (8, 10), (0, 10)]
    m.set_path(path, terrain='sand')
    m.terrain_rect('pebbles', 12, 5, 16, 7)
    m.terrain_rect('pebbles', 1, 7, 5, 8)
    m.spots([(27, 5), (22, 2), (20, 6), (16, 4), (14, 8), (12, 10), (9, 6), (6, 7), (4, 11), (2, 9)])
    for tid, x, y in [('boulder', 27, 10), ('boulder', 15, 10), ('rock-big', 24, 4), ('boulder', 11, 2), ('rock-big', 0, 2),
                      ('boulder', 4, 2), ('rock-small', 20, 11), ('rock-small-2', 26, 11), ('rock-small', 17, 2)]:
        m.stamp(tid, x, y, must=False)
    m.scatter(['rock-small', 'rock-small-2', 'pebbles-brown'], 8, area=(0, 2, 29, 11))
    m.write()


MAPS = {'route-201': route_201, 'lake-verity': lake_verity, 'route-202': route_202, 'route-203': route_203,
        'oreburgh-gate': oreburgh_gate, 'oreburgh-mine-1f': oreburgh_mine}

if __name__ == '__main__':
    for name in sys.argv[1:] or MAPS:
        MAPS[name]()
