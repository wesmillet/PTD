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
MELEE = json.loads((ROOT / 'src/data/move_overrides.json').read_text())['defaults']['range']
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

    def reach(self, p):
        """Distance in tiles from a spot to the nearest point on the enemy path."""
        best = 1e9
        px, py = p
        for (ax, ay), (bx, by) in zip(self.waypoints, self.waypoints[1:]):
            vx, vy = bx - ax, by - ay
            ln = vx * vx + vy * vy
            t = 0 if ln == 0 else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / ln))
            best = min(best, ((ax + t * vx - px) ** 2 + (ay + t * vy - py) ** 2) ** 0.5)
        return best

    def spots(self, pts):
        """Placement spots. Every spot must be in reach of the path for a
        melee move (move_overrides.json defaults.range, 1.5 tiles), since
        early Pokémon only know Tackle, Scratch, Pound and the like."""
        for p in pts:
            assert p not in self.path_cells, f'{self.name}: spot {p} on path'
            assert self.inb(*p), f'{self.name}: spot {p} out of bounds'
            assert self.reach(p) <= MELEE + 1e-9, f'{self.name}: spot {p} is {self.reach(p):.2f} tiles from the path (max {MELEE})'
            assert p not in self.placeable, f'{self.name}: duplicate spot {p}'
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



def forest(m, x0, y0, x1, y1, kinds=('pine-pair', 'pine-pair-2'), big=('pine-big',)):
    """A Sinnoh forest wall: conifer stamps packed edge to edge in rows four
    tiles apart, alternate rows shifted by two, a 5x5 cluster now and then.
    Stamps never overlap (one decoration layer) or cover reserved cells; round
    trees plug gaps a pair can't fill."""
    row = 0
    for y in range(y0, y1 + 1, 4):
        off = 2 if row % 2 else 0
        for x in range(x0 - off, x1 + 1, 5):
            tid = m.rng.choice(big) if m.rng.random() < 0.2 else m.rng.choice(kinds)
            if m.stamp(tid, x, y, must=False) or m.stamp(m.rng.choice(kinds), x, y, must=False):
                continue
            for dx in (0, 2, 1):
                m.stamp('tree', x + dx, y, must=False) or m.stamp('tree', x + dx, y + 1, must=False)
        row += 1


def fill_trees(m, x0, y0, x1, y1):
    """Plug leftover holes in a forest area with round trees."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            m.stamp('tree', x, y, must=False)


def auto_cliff(m, walls):
    """Paint a set of wall cells with the raised rock-shelf tiles, choosing
    rim, side and face pieces from the neighbouring cells (cells outside the
    map count as wall)."""
    W = lambda x, y: (x, y) in walls or not m.inb(x, y)
    for (x, y) in walls:
        if not m.inb(x, y):
            continue
        up, down, left, right = W(x, y - 1), W(x, y + 1), W(x - 1, y), W(x + 1, y)
        if not down:
            tid = 'cliff-bl' if not left else 'cliff-br' if not right else 'cliff-face'
        elif not up:
            tid = 'cliff-tl' if not left else 'cliff-tr' if not right else 'cliff-t'
        elif not left:
            tid = 'cliff-l'
        elif not right:
            tid = 'cliff-r'
        else:
            tid = 'cliff-top'
        m.ground[m.idx(x, y)] = m.tile(tid) + 1
        m.reserved.add((x, y))


def rect_cells(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


GRASS = [('grass', 30), ('grass-2', 1)]
DOTS = ['flowers-white', 'flowers-white-2', 'weeds-1', 'weeds-2']


# --------------------------------------------------------------------------
# Route 201 (Platinum: 65x22, Twinleaf to the south-west, Sandgem east).
# The road climbs out of Twinleaf, runs east in a wide band with right-angle
# jogs, conifer forest several rows deep on both sides, tall grass in blocks,
# a long ledge, lone trees in the clearing, a side path north toward Lake
# Verity, tiny white flowers along the verge.
def route_201():
    m = Map('route-201', 30, 14, seed=201)
    m.fill_ground(GRASS)
    path = [(3, 13), (3, 8), (12, 8), (12, 5), (22, 5), (22, 8), (29, 8)]
    m.set_path(path)
    m.terrain_rect('dirt-path', 17, 0, 17, 4)          # side path north to Lake Verity
    m.terrain_rect('tall-grass', 14, 7, 20, 9)
    m.terrain_rect('tall-grass', 24, 10, 29, 10)
    m.terrain_rect('tall-grass', 5, 10, 10, 10)
    m.spots([(4, 7), (11, 7), (13, 6), (21, 6), (23, 7), (2, 11), (7, 9), (16, 4), (27, 7), (18, 4)])
    m.reserved |= rect_cells(16, 0, 18, 4)
    forest(m, -1, -1, 31, -1)
    forest(m, -1, 11, 31, 11)
    m.stamp('tree', 5, 4, must=False)
    m.stamp('tree', 8, 4, must=False)
    m.stamp('tree', 25, 2, must=False)
    m.stamp('sign', 1, 6)
    m.stamp('sign', 19, 2, must=False)
    m.scatter(DOTS, 12, area=(0, 3, 29, 10))
    m.write()


# --------------------------------------------------------------------------
# Lake Verity (Platinum: a great octagonal lake filling the clearing, a rocky
# island with a cave in the middle, a thin grass shore under dense forest,
# tall grass in the south-west). Enemies walk the shore around the water.
def lake_verity():
    m = Map('lake-verity', 30, 14, seed=301)
    m.fill_ground(GRASS)
    path = [(29, 11), (24, 11), (24, 2), (5, 2), (5, 11), (0, 11)]
    m.set_path(path)
    lake = rect_cells(7, 4, 22, 9) | rect_cells(8, 3, 21, 3) | rect_cells(8, 10, 21, 10)
    island = rect_cells(14, 6, 15, 7)
    m.terrain_cells('water', lake - island)
    m.ground_rect('dirt', 14, 6, 15, 7)
    m.stamp('rock-big', 14, 6, clip=False)
    m.reserved |= lake
    m.terrain_rect('tall-grass', 6, 11, 12, 12)
    m.spots([(6, 4), (6, 8), (10, 1), (15, 1), (20, 1), (23, 4), (23, 8), (4, 10), (25, 10), (6, 11)])
    forest(m, -1, -3, 31, -3)
    forest(m, 13, 12, 31, 12)
    forest(m, -1, 12, 5, 12)
    forest(m, -3, 2, 3, 9)
    forest(m, 26, 2, 32, 9)
    fill_trees(m, 0, 0, 3, 10)
    fill_trees(m, 26, 0, 29, 10)
    m.scatter(DOTS, 6, area=(5, 1, 25, 12))
    m.write()


# --------------------------------------------------------------------------
# Route 202 (Platinum: north-south from Sandgem up to the Jubilife gate.
# Forest walls on both sides, a column of trees down the middle splitting the
# route, ledges across it, big tall-grass fields where Dawn teaches catching).
def route_202():
    m = Map('route-202', 30, 14, seed=202)
    m.fill_ground(GRASS)
    path = [(5, 13), (5, 8), (12, 8), (12, 3), (20, 3), (20, 9), (25, 9), (25, 0)]
    m.set_path(path)
    m.terrain_rect('tall-grass', 6, 3, 10, 6)
    m.terrain_rect('tall-grass', 21, 2, 23, 7)
    m.terrain_rect('tall-grass', 8, 10, 17, 10)
    m.spots([(6, 7), (11, 7), (13, 4), (19, 4), (21, 8), (24, 8), (4, 11), (9, 9), (16, 2), (26, 5)])
    forest(m, -3, -1, 1, 11)
    forest(m, 27, -1, 33, 11)
    forest(m, 2, -2, 26, -2)
    forest(m, 2, 11, 26, 11)
    m.stamp('pine-pair', 14, 5, clip=False)      # the tree column splitting the route
    m.stamp('tree', 15, 9, clip=False, must=False)
    m.stamp('sign', 6, 11, must=False)
    m.scatter(DOTS, 10, area=(2, 2, 26, 10))
    m.write()


# --------------------------------------------------------------------------
# Route 203 (Platinum: west from Jubilife, a middle section with a pond, then
# a wide tall-grass field under the stepped brown cliffs of Mt. Coronet, with
# Oreburgh Gate's cave in the cliff to the east).
def route_203():
    m = Map('route-203', 30, 14, seed=203)
    m.fill_ground(GRASS)
    path = [(0, 5), (8, 5), (8, 9), (17, 9), (17, 6), (23, 6), (23, 9), (29, 9)]
    m.set_path(path)
    mountain = rect_cells(24, 0, 29, 2) | rect_cells(26, 3, 29, 5) | rect_cells(27, 6, 29, 7)
    auto_cliff(m, mountain)
    m.terrain_rect('water', 10, 2, 14, 4)
    m.reserved |= rect_cells(10, 2, 14, 4)
    m.terrain_rect('tall-grass', 1, 7, 5, 10)
    m.terrain_rect('tall-grass', 18, 2, 22, 4)
    m.terrain_rect('tall-grass', 19, 10, 22, 11)
    m.spots([(7, 6), (9, 8), (16, 8), (18, 7), (22, 7), (24, 8), (3, 4), (12, 10), (20, 5), (27, 10)])
    forest(m, -1, -2, 23, -2)
    forest(m, -1, 11, 18, 11)
    forest(m, 24, 11, 31, 11)
    m.stamp('tree', 3, 1, must=False)
    m.stamp('tree', 15, 1, must=False)
    for x, y in [(9, 3), (15, 3)]:
        m.stamp('reeds-green', x, y - 1, clip=False, must=False)
    m.stamp('sign', 1, 3, must=False)
    m.stamp('rock-small', 25, 4, must=False)
    m.scatter(DOTS, 8, area=(0, 2, 25, 10))
    m.write()


# --------------------------------------------------------------------------
# Caves: corridors carved out of rock-shelf walls, like Platinum's tunnels.
def carve_cave(m, path, extra=()):
    """Everything is wall except a three-tile corridor around the path (plus
    any extra open cells); the walls get rimmed rock-shelf tiles."""
    m.fill_ground([('rock-floor', 1)])
    open_cells = set()
    for (x, y) in m.path_cells:
        open_cells |= rect_cells(x - 1, y - 1, x + 1, y + 1)
    for c in extra:
        open_cells |= c
    walls = {(x, y) for y in range(m.h) for x in range(m.w)} - open_cells
    auto_cliff(m, walls)
    return open_cells


# Oreburgh Gate 1F (Platinum: a narrow C-shaped tunnel, boulders and small
# rocks along the walls, the exits east and west).
def oreburgh_gate():
    m = Map('oreburgh-gate', 30, 14, theme='cave', seed=401)
    path = [(0, 10), (6, 10), (6, 3), (22, 3), (22, 10), (29, 10)]
    m.set_path(path, terrain=None)
    open_cells = carve_cave(m, path, extra=[rect_cells(9, 5, 19, 7)])
    m.set_path(path, terrain=None)
    for (x, y) in m.path_cells:
        m.ground[m.idx(x, y)] = m.tile('gravel') + 1
    m.spots([(5, 9), (7, 9), (7, 4), (5, 2), (12, 4), (16, 2), (21, 4), (23, 2), (23, 9), (26, 11)])
    for tid, x, y in [('boulder', 10, 5), ('boulder', 17, 6), ('rock-small', 13, 6), ('rock-small-2', 1, 11),
                      ('rock-small', 28, 11), ('rock-small-2', 9, 2), ('rock-small', 20, 4)]:
        m.stamp(tid, x, y, clip=False, must=False)
    m.write()


# Oreburgh Mine (Platinum: a big dug-out floor stepping down in terraces,
# conveyor belts down the middle, coal and boulders everywhere). The path
# winds from the entrance down across the terraces to the mine face.
def oreburgh_mine():
    m = Map('oreburgh-mine-1f', 30, 14, theme='cave', seed=402)
    path = [(29, 2), (18, 2), (18, 7), (9, 7), (9, 11), (0, 11)]
    m.set_path(path, terrain=None)
    hall = rect_cells(3, 1, 26, 12)
    carve_cave(m, path, extra=[hall])
    # Terrace shelves left in the hall, like the stepped floors of the mine.
    auto_cliff(m, rect_cells(3, 1, 7, 4) | rect_cells(21, 9, 26, 12) | rect_cells(12, 9, 16, 12) - rect_cells(12, 9, 16, 9))
    m.set_path(path, terrain=None)
    for (x, y) in m.path_cells:
        m.ground[m.idx(x, y)] = m.tile('gravel') + 1
    m.spots([(19, 3), (17, 1), (17, 6), (19, 8), (10, 6), (8, 8), (10, 10), (8, 12), (24, 1), (3, 10)])
    for tid, x, y in [('boulder', 12, 4), ('boulder', 22, 5), ('rock-big', 13, 6) , ('rock-small', 20, 4), ('rock-small-2', 5, 7),
                      ('boulder', 25, 6), ('rock-small', 15, 4), ('rock-small-2', 11, 9)]:
        m.stamp(tid, x, y, clip=False, must=False)
    m.write()


# The outdoor routes moved to scripts/bw-maps.py (Black/White tiles); this
# script now only builds the caves. The old outdoor designs stay above for
# reference but are not run.
MAPS = {'oreburgh-gate': oreburgh_gate, 'oreburgh-mine-1f': oreburgh_mine}

if __name__ == '__main__':
    for name in sys.argv[1:] or MAPS:
        MAPS[name]()
