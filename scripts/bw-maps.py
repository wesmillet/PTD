#!/usr/bin/env python3
"""
Sinnoh route maps in Black/White style, built from UltimoSpriter's Gen 5
exterior sheet (assets-src/tilesets/gen5/gen5-exterior.png).

Pipeline (all in one run):
  1. Design every map with tile *names* (ground texture, BW path terrain, tall
     grass, flowers, rocks, signs) plus tree placements and forest areas.
  2. Composite every tree (forest walls in staggered, overlapping rows the way
     BW draws them, and lone trees) onto one canvas per map, cut the covered
     cells into 32px tiles, dedupe them, and write
     assets-src/tilesets/gen5/generated-bw.png. Maps have a single decoration
     layer, so overlapping trees must be pre-composited to look right.
  3. Register the BW tiles and the generated tiles in src/data/tiles.json under
     the "bw-outdoor" tileset and run scripts/build-tilesets.mjs.
  4. Resolve names to packed indices and write Tiled JSON to src/data/maps/.

Usage: python3 scripts/bw-maps.py [map-id ...]   (default: all BW maps)
Placement spots are checked against melee range like scripts/sinnoh-maps.py.
"""
import json
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image
import importlib.util
from pathlib import Path as _P

_spec = importlib.util.spec_from_file_location('gen4_traces', Path(__file__).resolve().parent / 'gen4-traces' / 'downsample.py')
TRACES = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(TRACES)

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parent.parent
TILE = 32
CAT_PATH = ROOT / 'src/data/tiles.json'
EXTERIOR = ROOT / 'assets-src/tilesets/gen5/gen5-exterior.png'
GENERATED = ROOT / 'assets-src/tilesets/gen5/generated-bw.png'
TS = 'bw-outdoor'
ROAD_WIDTH = 1
MELEE = json.loads((ROOT / 'src/data/move_overrides.json').read_text())['defaults']['range']

# --------------------------------------------------------------------------
# BW tiles taken straight from the exterior sheet: id -> (col, row, w, h, solid)
GRASS_BLOCK = (4, 13)  # 4x4 seamless grass texture, top-left tile
STATIC = {}
for i in range(16):
    STATIC[f'bw-grass-{i}'] = (GRASS_BLOCK[0] + i % 4, GRASS_BLOCK[1] + i // 4, 1, 1, False)
STATIC.update({
    'bw-tall': (6, 6, 1, 1, False),        # BW tall grass tuft (the leafy clumps, not the reeds above them)
    'bw-reeds': (0, 3, 1, 1, False),
    'bw-flowers-white': (0, 6, 1, 1, False),
    'bw-flowers-white-2': (1, 6, 1, 1, False),
    'bw-sprig': (0, 8, 1, 1, False),
    'bw-sprig-2': (2, 8, 1, 1, False),
    'bw-sprig-3': (4, 8, 1, 1, False),
    'bw-flower-bush-red': (1, 11, 2, 2, False),
    'bw-flower-bush-mix': (5, 11, 2, 2, False),
    'bw-flower-patch-pink': (5, 9, 2, 2, False),
    'bw-sign': (3, 1220, 1, 2, True),
    'bw-cliff-tl': (0, 182, 1, 1, True), 'bw-cliff-t': (1, 182, 1, 1, True), 'bw-cliff-tr': (3, 182, 1, 1, True),
    'bw-cliff-l': (0, 183, 1, 1, True), 'bw-cliff-r': (3, 183, 1, 1, True),
    'bw-cliff-fl': (0, 185, 1, 1, True), 'bw-cliff-f': (1, 185, 1, 1, True), 'bw-cliff-fr': (3, 185, 1, 1, True),
    'bw-cliff-fl2': (0, 186, 1, 1, True), 'bw-cliff-f2': (1, 186, 1, 1, True), 'bw-cliff-fr2': (3, 186, 1, 1, True),
    'bw-rock-big': (0, 197, 4, 5, True),
    'bw-rock': (4, 198, 2, 2, True),
    'bw-rock-small': (6, 200, 1, 1, True),
    # street furniture and props
    'bw-lantern': (0, 1151, 1, 4, True),      # green Hearthome-style lantern post
    'bw-streetlamp': (0, 1143, 2, 4, True),   # tall modern street light
    'bw-log': (2, 152, 2, 1, True),           # fallen log
    'bw-logpile': (0, 154, 2, 3, True),       # stacked logs
    'bw-cave-mouth': (0, 218, 5, 3, True),    # brown rock cave entrance
    # snow and ice
    'bw-snow-rock-big': (0, 248, 4, 5, True),
    'bw-snow-rock': (5, 253, 2, 3, True),
    'bw-grey-rock-small': (5, 251, 1, 1, True),
    'bw-ice-block': (6, 272, 2, 2, True),
    'bw-ice-rock': (4, 272, 2, 3, True),
    'bw-container': (0, 1164, 3, 3, True),    # yellow cargo container
    'bw-machine': (0, 1155, 2, 3, True),      # vending machine (a generator in Sunyshore)
    'bw-barrel': (1, 1161, 1, 1, True),
})
# Ground textures other than grass (seamless 1x1 or small repeating blocks):
# id -> (col, row, w, h). Written on the ground layer by Map.floor().
GROUND = {
    'bw-cobble': (2, 93, 1, 1),      # grey cobblestone plaza
    'bw-steel': (3, 107, 1, 1),      # studded steel plate floor
    'bw-cream': (1, 97, 2, 2),       # cream diamond paving
    'bw-darkrock': (6, 96, 2, 4),    # cracked dark rock
    'bw-bluetile': (1, 117, 2, 2),   # blue tiled deck
    'bw-orangetile': (4, 92, 2, 2),  # orange tiled floor
    'bw-void': (2, 1171, 1, 1),      # near-black (the Distortion World's nothing)
}
# Kyle-Dove ('outside' sheet) pieces: plain snow for snowfields.
GROUND['bw-snow'] = (2, 123, 1, 1, 'outside')
for gid, spec in GROUND.items():
    col, row, w, h = spec[:4]
    for i in range(w * h):
        STATIC[f'{gid}-{i}'] = (col + i % w, row + i // w, 1, 1, False) + tuple(spec[4:])
STATIC['bw-snow-boulder'] = (0, 131, 2, 3, True, 'outside')
STATIC['bw-snow-log'] = (2, 122, 2, 1, True, 'outside')
# Platinum's own textures for its unique locations (scripts/build-platinum-tiles.py):
# ground patterns and decoration stamps from assets-src/tilesets/gen4/pt-*.png.
PT_MANIFEST = ROOT / 'assets-src/tilesets/gen4/platinum-tiles.json'
PT_SOURCES = {}
if PT_MANIFEST.exists():
    _pt = json.loads(PT_MANIFEST.read_text())
    PT_SOURCES = _pt['sources']
    for _t in _pt['tiles']:
        if _t['kind'] == 'ground':
            GROUND[_t['id']] = (_t['col'], _t['row'], _t['w'], _t['h'], _t['source'])
            for _i in range(_t['w'] * _t['h']):
                STATIC[f"{_t['id']}-{_i}"] = (_t['col'] + _i % _t['w'], _t['row'] + _i // _t['w'], 1, 1, False, _t['source'])
        else:
            STATIC[_t['id']] = (_t['col'], _t['row'], _t['w'], _t['h'], _t['solid'], _t['source'])
# Cliff rims other than the teal-grass one: the same eleven pieces
# (tl t tr l r fl f fr fl2 f2 fr2) from the brown rock, snow and ice sets.
CLIFF_SETS = {
    'grass': None,  # the bw-cliff-* tiles above
    'rock': (0, 213, 0, 214, 0, 216, 0, 217),
    'snow': (0, 264, 0, 265, 0, 267, 0, 268),
    'ice': (0, 288, 0, 289, 0, 291, 0, 292),
}
for cname, rows in CLIFF_SETS.items():
    if rows is None:
        continue
    _, top, _, side, _, face, _, face2 = rows
    for key, (c, r) in {'tl': (0, top), 't': (1, top), 'tr': (3, top), 'l': (0, side), 'r': (3, side),
                        'fl': (0, face), 'f': (1, face), 'fr': (3, face), 'fl2': (0, face2), 'f2': (1, face2), 'fr2': (3, face2)}.items():
        STATIC[f'bw-{cname}cliff-{key}'] = (c, r, 1, 1, True)
TREE_SRC = (2, 360)  # green BW conifer, transparent base, 2x4
TREE_KINDS = {'conifer': (2, 360), 'pine-snow': (2, 296), 'pine-dirt': (6, 296)}


def load_catalogue():
    return json.loads(CAT_PATH.read_text())


def save_catalogue(c):
    CAT_PATH.write_text(json.dumps(c, indent=1, ensure_ascii=False) + '\n')


# --------------------------------------------------------------------------
class Map:
    def __init__(self, name, w, h, seed):
        self.name, self.w, self.h = name, w, h
        self.rng = random.Random(seed)
        self.ground = [[f'bw-grass-{(x % 4) + (y % 4) * 4}' for x in range(w)] for y in range(h)]
        self.terrain = [[None] * w for _ in range(h)]
        self.deco = [[None] * w for _ in range(h)]  # (tile id, dx, dy)
        self.trees = []  # tree top-left tile positions, composited later
        self.tree_cells = set()
        self.path = []
        self.path_cells = set()
        self.road = set()
        self.spots = []
        self.reserved = set()

    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    # path
    def set_path(self, pts):
        self.path = pts
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            assert ax == bx or ay == by
            dx, dy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
            for s in range(abs(bx - ax) + abs(by - ay) + 1):
                self.path_cells.add((ax + dx * s, ay + dy * s))
        self.reserved |= self.path_cells
        self.road = set(self.path_cells) | {(x + 1, y + 1) for x, y in self.path_cells} if ROAD_WIDTH == 2 else set(self.path_cells)
        if getattr(self, 'road_tile', 'bw-path'):
            self.terrain_cells(self.road_tile if hasattr(self, 'road_tile') else 'bw-path', self.road, on_path=True)
        self.reserved |= self.road

    def terrain_cells(self, tid, cells, on_path=False):
        for x, y in cells:
            if self.inb(x, y) and (on_path or (x, y) not in self.path_cells):
                self.terrain[y][x] = tid

    def reach(self, p):
        """Distance from a cell to the nearest enemy lane (the path or any
        extra lane)."""
        best = 1e9
        segs = list(zip(self.path, self.path[1:]))
        for _, pts in getattr(self, 'extra_paths', []):
            segs += list(zip(pts, pts[1:]))
        for (ax, ay), (bx, by) in segs:
            vx, vy = bx - ax, by - ay
            ln = vx * vx + vy * vy
            t = 0 if ln == 0 else max(0, min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / ln))
            best = min(best, ((ax + t * vx - p[0]) ** 2 + (ay + t * vy - p[1]) ** 2) ** 0.5)
        return best

    def add_spots(self, pts):
        for p in pts:
            assert self.inb(*p) and p not in self.path_cells, f'{self.name}: bad spot {p}'
            assert self.reach(p) <= MELEE + 1e-9, f'{self.name}: spot {p} is {self.reach(p):.2f} tiles from the path'
            self.spots.append(p)
            self.reserved.add(p)

    # decoration
    def free(self, cells, clip=False):
        for x, y in cells:
            if not self.inb(x, y):
                if clip:
                    continue
                return False
            if (x, y) in self.reserved or self.deco[y][x] or (x, y) in self.tree_cells:
                return False
        return True

    def stamp(self, tid, x0, y0, must=True, clip=False):
        col, row, w, h, solid = STATIC[tid][:5]
        cells = [(x0 + dx, y0 + dy) for dy in range(h) for dx in range(w)]
        if not self.free(cells, clip):
            if must:
                raise ValueError(f'{self.name}: cannot place {tid} at {(x0, y0)}')
            return False
        for dy in range(h):
            for dx in range(w):
                if self.inb(x0 + dx, y0 + dy):
                    self.deco[y0 + dy][x0 + dx] = (tid, dx, dy)
        return True

    def tree(self, x, y, must=False, kind='conifer'):
        cells = [(x + dx, y + dy) for dy in range(4) for dx in range(2)]
        blocked = any(self.inb(cx, cy) and ((cx, cy) in self.reserved or self.deco[cy][cx]) for cx, cy in cells)
        if blocked:
            if must:
                raise ValueError(f'{self.name}: cannot place tree at {(x, y)}')
            return False
        self.trees.append((x, y, kind))
        self.tree_cells |= {c for c in cells}
        return True

    def floor(self, gid, x0, y0, x1, y1):
        """Lay a ground texture from GROUND over a rectangle (pattern aligned
        to the map origin so neighbouring rectangles tile)."""
        col, row, w, h = GROUND[gid][:4]
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                self.ground[y][x] = f'{gid}-{(x % w) + (y % h) * w}'

    def wall(self, x0, y0, x1, y1):
        """Mark cells as off limits for spots and decoration (e.g. a black
        void) without drawing anything."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.inb(x, y):
                    self.reserved.add((x, y))

    def forest(self, x0, y0, x1, y1, kind='conifer'):
        """Fill a rectangle (may extend past the map edge) with BW conifers in
        staggered rows two tiles apart, the way BW forests are drawn. Trees
        never cover the path or spots."""
        for y in range(y0, y1 + 1, 2):
            off = (y // 2) % 2
            for x in range(x0 - off, x1 + 1, 2):
                self.tree(x, y, kind=kind)

    def plateau(self, x0, y0, x1, y1, open_top=False, cliff='grass', interior=True):
        """A BW cliff ledge: rim on top and sides, a two-row rock face along
        the bottom (rows y1-1 and y1). The top of the ledge is the ground
        texture showing through. `cliff` picks the rim set (grass, rock, snow,
        ice). With interior=False the inside stays usable (spots may sit on the
        ledge top)."""
        pre = 'bw-cliff' if cliff == 'grass' else f'bw-{cliff}cliff'
        lanes = self.path_cells | getattr(self, 'lane_cells', set())
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if not self.inb(x, y) or (x, y) in lanes:
                    continue  # the path breaks through the rim
                col = 'l' if x == x0 else 'r' if x == x1 else 'm'
                if y == y1 - 1:
                    tid = {'l': f'{pre}-fl', 'm': f'{pre}-f', 'r': f'{pre}-fr'}[col]
                elif y == y1:
                    tid = {'l': f'{pre}-fl2', 'm': f'{pre}-f2', 'r': f'{pre}-fr2'}[col]
                elif y == y0 and not open_top:
                    tid = {'l': f'{pre}-tl', 'm': f'{pre}-t', 'r': f'{pre}-tr'}[col]
                else:
                    tid = {'l': f'{pre}-l', 'm': None, 'r': f'{pre}-r'}[col]
                if tid:
                    self.deco[y][x] = (tid, 0, 0)
                    self.reserved.add((x, y))
                elif interior:
                    self.reserved.add((x, y))

    def tall_grass(self, x0, y0, x1, y1):
        """BW tall grass: a flat field of leafy tufts."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if self.inb(x, y) and (x, y) not in self.reserved and not self.deco[y][x] and (x, y) not in self.tree_cells:
                    self.deco[y][x] = ('bw-tall', 0, 0)

    def scatter(self, tids, n, area, margin=0, tries=500):
        x0, y0, x1, y1 = area
        placed = 0
        for _ in range(tries):
            if placed >= n:
                break
            tid = self.rng.choice(tids)
            x, y = self.rng.randint(x0, x1), self.rng.randint(y0, y1)
            col, row, w, h = STATIC[tid][:4]
            cells = [(x + dx, y + dy) for dy in range(h) for dx in range(w)]
            near = {(cx + ox, cy + oy) for cx, cy in cells for ox in range(-margin, margin + 1) for oy in range(-margin, margin + 1)}
            if near & self.reserved or any(self.inb(cx, cy) and self.terrain[cy][cx] for cx, cy in cells):
                continue
            if self.stamp(tid, x, y, must=False):
                placed += 1
        return placed


def from_trace(name, seed, path, overrides=None, skip_trees=(), trace=None):
    """Build a map from the traced Platinum layout (scripts/gen4-traces):
    T forest, ~ water, = road, g tall grass, # rock, . grass. The enemy path
    is laid along the real road and clears whatever it crosses. `trace` names
    the trace when the map name differs (secret versions of a place)."""
    grid = TRACES.resample(trace or name)
    if overrides:
        grid = [''.join(overrides.get((x, y), ch) for x, ch in enumerate(row)) for y, row in enumerate(grid)]
    m = Map(name, 30, 14, seed=seed)
    m.set_path(path)
    m.grid = grid
    water = {(x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch == '~' and (x, y) not in m.path_cells}
    m.terrain_cells('water', water)
    m.reserved |= water
    # Only the enemy path is drawn as road (it follows the real road), so
    # players can always see where enemies walk.
    m.water = water
    return m


def finish_trace(m, n_spots=10, flowers=8):
    """Spots, trees, tall grass and flowers from the trace."""
    grid = m.grid
    pick_spots(m, n_spots)
    forest_cells = {(x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch == 'T'}
    # Trees on the forest lattice wherever the whole 2x4 footprint is forest
    # (cells past the map edge count as forest, so walls run off-screen).
    for y in range(-4, m.h + 1):
        if y % 2:
            continue
        off = (y // 2) % 2
        for x in range(-2 - off, m.w + 1, 2):
            cells = [(x + dx, y + dy) for dy in range(4) for dx in range(2)]
            if all((c in forest_cells) or not m.inb(*c) for c in cells) and any(m.inb(*c) for c in cells):
                m.tree(x, y)
    # Second pass: fill irregular forest edges with trees that are mostly over
    # forest and never touch water, rock, the path or a spot.
    def ok(x, y):
        cells = [(x + dx, y + dy) for dy in range(4) for dx in range(2)]
        inside = [c for c in cells if m.inb(*c)]
        if not inside or any(c in m.water or c in m.reserved or (m.inb(*c) and grid[c[1]][c[0]] == '#') for c in inside):
            return False
        return sum(1 for c in cells if c in forest_cells or not m.inb(*c)) >= 6
    for y in range(-3, m.h):
        for x in range(-1, m.w):
            if (x, y) in forest_cells and (x, y) not in m.tree_cells:
                for tx, ty in ((x, y - 3), (x - 1, y - 3), (x, y - 2), (x - 1, y - 2), (x, y - 1), (x - 1, y - 1), (x, y), (x - 1, y)):
                    if ok(tx, ty) and m.tree(tx, ty):
                        break
    # Tall grass: smooth the noisy trace into solid patches (fill holes,
    # drop lone tufts), the way the routes group their grass.
    G = {(x, y) for y, r in enumerate(grid) for x, ch in enumerate(r) if ch == 'g'}
    nb = lambda c, S: sum((c[0] + dx, c[1] + dy) in S for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    for _ in range(2):
        G |= {(x, y) for y in range(m.h) for x in range(m.w) if grid[y][x] == '.' and nb((x, y), G) >= 3}
        G = {c for c in G if nb(c, G) >= 1}
    for (x, y) in sorted(G):
        m.tall_grass(x, y, x, y)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-sprig', 'bw-sprig-2'], flowers, (0, 0, m.w - 1, m.h - 1))
    return m


def pick_spots(m, n):
    """Choose placement spots: cells within melee range of the path, not on
    the path, water or rock, scored by how many path tiles they cover (inside
    corners cover the most), spread at least 3 tiles apart."""
    cand = []
    for y in range(m.h):
        for x in range(m.w):
            p = (x, y)
            if p in m.path_cells or p in m.water or m.grid[y][x] == '#' or p in m.reserved or p in m.tree_cells or m.deco[y][x]:
                continue
            if m.reach(p) > MELEE:
                continue
            cover = sum(1 for (px, py) in m.path_cells if (px - x) ** 2 + (py - y) ** 2 <= MELEE ** 2)
            cand.append((cover, m.rng.random(), p))
    cand.sort(reverse=True)
    chosen = []
    for cover, _, p in cand:
        if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 3 for q in chosen):
            chosen.append(p)
        if len(chosen) == n:
            break
    m.add_spots(chosen)


# --------------------------------------------------------------------------
# All four outdoor maps are traced from the Platinum map renders (see
# scripts/gen4-traces/) and resampled to 30x14; the enemy path follows each
# route's real road.

# Route 201: the road climbs north out of Twinleaf (bottom left), runs east
# through the grass between two forest walls and leaves for Sandgem (right).
def route_201():
    m = from_trace('route-201', 201, [(7, 13), (7, 9), (21, 9), (21, 10), (26, 10), (26, 5), (29, 5)])
    m.stamp('bw-sign', 5, 10, must=False)
    return finish_trace(m)


# Lake Verity: the great octagonal lake with its rocky island and cave in the
# middle, forest all around, the way in from the south-east. Enemies follow a
# trail through the trees around the shore.
def lake_verity():
    island = {(x, y): '#' for x in range(13, 17) for y in range(6, 8)}
    m = from_trace('lake-verity', 301, [(0, 11), (3, 11), (3, 0), (26, 0), (26, 11), (23, 11), (23, 13)], overrides=island)
    # The island in the middle (Mesprit's cave in Platinum): a grassy islet
    # with rocks. Its secret level opens once the player has Surf.
    m.stamp('bw-rock-small', 14, 6)
    m.stamp('bw-rock-small', 15, 7)
    m.stamp('bw-flowers-white', 15, 6)
    return finish_trace(m)


# Route 202: north from Sandgem (bottom) to the Jubilife gate (top), through
# the tall-grass fields around the central stand of trees.
def route_202():
    m = from_trace('route-202', 202, [(22, 13), (22, 12), (18, 12), (18, 9), (10, 9), (10, 4), (14, 4), (14, 0)])
    m.stamp('bw-sign', 20, 13, must=False, clip=True)
    return finish_trace(m)


# Route 203: west from Jubilife across the grass and past the pond, through
# the gap in the rock divide, along the foot of Mt. Coronet to Oreburgh Gate.
def route_203():
    over = {(x, y): 'T' for x in (18,) for y in range(14) if y != 10}
    over.update({(x, y): '~' for x in range(15, 18) for y in (6, 7)})   # the pond, squared off
    m = from_trace('route-203', 203, [(0, 10), (19, 10), (19, 8), (25, 8), (25, 10), (29, 10)], overrides=over)
    m.plateau(22, 0, 30, 4, open_top=True)
    return finish_trace(m)


# --------------------------------------------------------------------------
# Hand-built arenas and set pieces (no Platinum trace: gyms are interiors in
# the games, so each is an outdoor yard in the same BW tiles).

def blank(name, seed, path, theme='grass', road='bw-path'):
    m = Map(name, 30, 14, seed)
    m.grid = ['.' * 30 for _ in range(14)]
    m.water = set()
    m.theme = theme
    m.road_tile = road
    m.set_path(path)
    return m


def lane(m, pts, road=True):
    """Cells of an extra enemy lane; drawn as road when asked and kept clear."""
    cells = set()
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
        for st in range(abs(bx - ax) + abs(by - ay) + 1):
            cells.add((ax + dx * st, ay + dy * st))
    if road and getattr(m, 'road_tile', 'bw-path'):
        m.terrain_cells(m.road_tile, cells, on_path=True)
    m.reserved |= cells
    m.lane_cells = getattr(m, 'lane_cells', set()) | cells
    return cells


def water(m, cells, tid='water'):
    cells = {c for c in cells if m.inb(*c) and c not in m.path_cells}
    m.terrain_cells(tid, cells)
    m.reserved |= cells
    m.water |= cells


def rect(x0, y0, x1, y1):
    return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}


def border_forest(m, kind='conifer', top=True, bottom=True, left=True, right=True):
    """A ring of trees just outside and along the map edges."""
    if top:
        m.forest(-2, -1, m.w + 1, -1, kind)
    if bottom:
        m.forest(-2, m.h - 1, m.w + 1, m.h + 2, kind)
    if left:
        m.forest(-2, -1, -1, m.h, kind)
    if right:
        m.forest(m.w - 1, -1, m.w + 1, m.h, kind)


# Eterna Gym: Gardenia's garden. Flower beds and hedges of trees around a
# cobbled clock face; the path winds through tall grass between the beds.
def eterna_gym():
    m = blank('eterna-gym', 2001, [(0, 11), (5, 11), (5, 4), (12, 4), (12, 9), (19, 9), (19, 3), (26, 3), (26, 13)])
    border_forest(m)
    m.floor('bw-cobble', 14, 5, 17, 8)
    for x, y in ((7, 1), (21, 1), (7, 11), (21, 11), (14, 11), (1, 1), (1, 7)):
        m.stamp('bw-flower-bush-red' if (x + y) % 2 else 'bw-flower-bush-mix', x, y, must=False)
    for x, y in ((9, 6), (22, 6), (2, 4), (27, 8), (15, 1), (9, 11)):
        m.stamp('bw-flower-patch-pink', x, y, must=False)
    m.tall_grass(6, 5, 11, 8)
    m.tall_grass(20, 5, 25, 8)
    m.tall_grass(13, 10, 18, 12)
    pick_spots(m, 10)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-sprig'], 10, (0, 0, 29, 13))
    return m


# Hearthome Gym: the courtyard behind Fantina's gym at night. A long dark
# zigzag over cobbles with a lantern post at every turn.
def hearthome_gym():
    m = blank('hearthome-gym', 2002, [(0, 7), (4, 7), (4, 2), (10, 2), (10, 11), (16, 11), (16, 2), (22, 2), (22, 11), (29, 11)])
    m.floor('bw-cobble', 2, 1, 27, 12)
    border_forest(m)
    for x, y in ((6, 3), (12, 8), (18, 3), (24, 8), (2, 9), (26, 1)):
        m.stamp('bw-lantern', x, y, must=False)
    for x, y in ((8, 7), (14, 5), (20, 7), (26, 5)):
        m.stamp('bw-flower-patch-pink', x, y, must=False)
    pick_spots(m, 10)
    return m


# Veilstone Gym: Maylene's dojo yard. Two lanes split by a training wall of
# logs; the spots between the logs reach both lanes.
def veilstone_gym():
    m = blank('veilstone-gym', 2003, [(0, 3), (6, 3), (6, 5), (23, 5), (23, 3), (29, 3)])
    m.extra_paths = [('path-2', [(0, 10), (6, 10), (6, 7), (23, 7), (23, 10), (29, 10)])]
    lane2 = lane(m, m.extra_paths[0][1])
    m.terrain_cells('sand', rect(2, 1, 27, 12) - m.path_cells - lane2)
    border_forest(m)
    wall_spots = [(10, 6), (13, 6), (16, 6), (19, 6)]
    m.add_spots(wall_spots)
    for x in (8, 11, 14, 17, 20):
        m.stamp('bw-log', x, 6)
    m.stamp('bw-logpile', 27, 1, must=False)
    m.stamp('bw-logpile', 1, 11, must=False)
    pick_spots(m, 10)
    return m


# Pastoria Gym: Crasher Wake's pool. A moat ring with an island; enemies
# walk the deck round the outside and a second lane swims the moat.
def pastoria_gym():
    m = blank('pastoria-gym', 2004, [(0, 6), (4, 6), (4, 1), (25, 1), (25, 12), (29, 12)], road=None)
    m.floor('bw-bluetile', 2, 0, 27, 13)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'bw-cream-' + str((x % 2) + (y % 2) * 2)
    moat = rect(7, 3, 22, 10) - rect(9, 5, 20, 8)
    swim = [(0, 9), (7, 9), (7, 4), (22, 4), (22, 9), (29, 9)]
    m.extra_paths = [('path-water', swim)]
    lane2 = lane(m, swim, road=False)
    water(m, moat | lane2)
    m.spot_props = {(5, 3): {'tide': True}, (24, 10): {'tide': True}}
    m.add_spots([(5, 3), (24, 10)])
    m.stamp('bw-barrel', 1, 1, must=False)
    m.stamp('bw-barrel', 28, 1, must=False)
    pick_spots(m, 10)
    return m


# Canalave Gym: Byron's harbour yard. Steel plate floor, containers, cranes
# (street lights) and the harbour water along the bottom. The path zigzags
# like the gym's lifts.
def canalave_gym():
    m = blank('canalave-gym', 2005, [(0, 2), (8, 2), (8, 9), (16, 9), (16, 2), (24, 2), (24, 9), (29, 9)], road=None)
    m.floor('bw-steel', 0, 0, 29, 10)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'bw-orangetile-' + str((x % 2) + (y % 2) * 2)
    m.floor('bw-cobble', 0, 11, 29, 11)
    water(m, rect(0, 12, 29, 13))
    for x in (2, 12, 20):
        m.stamp('bw-container', x, 4, must=False)
    for x, y in ((5, 7), (27, 3), (19, 11)):
        m.stamp('bw-streetlamp', x, y - 2, must=False)
    for x, y in ((11, 11), (1, 11), (27, 11)):
        m.stamp('bw-barrel', x, y - 1, must=False)
    pick_spots(m, 10)
    return m


# Snowpoint Gym: Candice's snowfield with an ice floor in the middle, snow
# banks and snowy pines around the edge.
def snowpoint_gym():
    m = blank('snowpoint-gym', 2006, [(0, 6), (8, 6), (8, 3), (14, 3), (14, 10), (21, 10), (21, 6), (29, 6)], road='pebbles')
    m.floor('bw-snow', 0, 0, 29, 13)
    m.terrain_cells('ice', rect(9, 4, 20, 9) - m.path_cells)
    m.terrain_cells('snow-grass', rect(2, 1, 5, 3) | rect(24, 9, 28, 12))
    border_forest(m, kind='pine-snow')
    m.stamp('bw-snow-rock-big', 2, 8, must=False)
    m.stamp('bw-snow-rock-big', 24, 0, must=False)
    for x, y in ((3, 1), (26, 10), (11, 11), (17, 0)):
        m.stamp('bw-snow-rock', x, y, must=False)
    m.scatter(['bw-grey-rock-small'], 5, (0, 0, 29, 13))
    pick_spots(m, 10)
    return m


# Sunyshore Gym: Volkner's gear floor. Solar panel decks (blue tiles) with a
# steel walkway under the path, three generator machines beside it, the
# beach and sea along the bottom.
def sunyshore_gym():
    m = blank('sunyshore-gym', 2007, [(0, 3), (10, 3), (10, 8), (19, 8), (19, 3), (29, 3)], road=None)
    m.floor('bw-bluetile', 0, 0, 29, 9)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'bw-steel-0'
    m.terrain_cells('beach-sand', rect(0, 10, 29, 11))
    water(m, rect(0, 12, 29, 13))
    for x, y in ((6, 5), (14, 0), (22, 5)):
        m.stamp('bw-machine', x, y)
    m.spot_props = {}
    pick_spots(m, 10)
    return m


# Spear Pillar: the summit, on Platinum's own textures. A stone platform
# with the carved floor and the altar emblem at the top, broken pillars down
# both sides, the two stairways (lanes) climbing from the bottom corners to
# meet in front of the altar. Pink mountain rock and cloud around it.
def spear_pillar():
    m = blank('spear-pillar', 2008, [(4, 13), (4, 9), (15, 9), (15, 1)], road=None)
    m.extra_paths = [('path-2', [(25, 13), (25, 9), (15, 9), (15, 1)])]
    lane(m, m.extra_paths[0][1], road=False)
    m.floor('pt-spear-cliff', 0, 0, 29, 13)
    m.floor('pt-spear-carpet', 3, 0, 26, 11)
    for (x, y) in m.path_cells | m.lane_cells:
        if 3 <= x <= 26 and y <= 11:
            m.ground[y][x] = 'pt-spear-grey-0'
    m.floor('pt-spear-altar', 14, 0, 15, 1)
    m.floor('pt-spear-ledge', 3, 12, 26, 12)
    m.floor('pt-spear-steps', 3, 13, 6, 13)
    m.floor('pt-spear-steps', 23, 13, 26, 13)
    for x in (6, 9, 20, 23):
        for y in (1, 5):
            m.stamp('pt-spear-pillar', x, y, must=False)
    for x, y in ((6, 10), (23, 10), (9, 9), (20, 9)):
        m.stamp('pt-spear-pillar-broken', x, y, must=False)
    m.stamp('pt-spear-panel', 4, 0, must=False)
    m.stamp('pt-spear-panel', 24, 0, must=False)
    for x, y in ((0, 11), (28, 11), (0, 0), (28, 0)):
        m.stamp('pt-spear-cloud', x, y, must=False)
    for x, y in ((1, 5), (28, 6), (2, 8), (27, 3)):
        m.stamp('pt-spear-rock', x, y, must=False)
    m.wall(0, 0, 2, 13)
    m.wall(27, 0, 29, 13)
    pick_spots(m, 10)
    m.points = [('altar', 'stage', 15, 0)]
    return m


# Temporal Spire: the Mystery Dungeon capstone. Spear Pillar's summit gone
# grey and broken, floating in the dark, the path spiralling up to the top.
def temporal_spire():
    m = blank('temporal-spire', 2011, [(2, 13), (2, 9), (27, 9), (27, 4), (6, 4), (6, 1), (15, 1)], road=None)
    m.extra_paths = [('path-2', [(27, 13), (27, 9), (27, 4), (6, 4), (6, 1), (15, 1)])]
    lane(m, m.extra_paths[0][1], road=False)
    m.theme = 'cave'
    m.floor('bw-void', 0, 0, 29, 13)
    m.floor('pt-spear-grey', 1, 0, 28, 12)
    for (x, y) in m.path_cells | m.lane_cells:
        if 1 <= x <= 28 and y <= 12:
            m.ground[y][x] = 'pt-spear-carpet-' + str((x % 4) + (y % 4) * 4)
    m.floor('pt-spear-altar', 14, 0, 15, 1)
    m.floor('pt-spear-grey-steps', 1, 13, 4, 13)
    m.floor('pt-spear-grey-steps', 25, 13, 28, 13)
    for x in (4, 10, 19, 25):
        for y in (1, 6):
            if (x, y) not in m.path_cells:
                m.stamp('pt-spear-pillar', x, y, must=False)
    for x, y in ((8, 11), (21, 11), (13, 6), (16, 6), (24, 1)):
        m.stamp('pt-spear-pillar-broken', x, y, must=False)
    for x, y in ((0, 11), (28, 11), (0, 1), (28, 0)):
        m.stamp('pt-spear-cloud', x, y, must=False, clip=True)
    m.wall(0, 0, 0, 13)
    m.wall(29, 0, 29, 13)
    pick_spots(m, 10)
    m.points = [('dialga', 'stage', 15, 0)]
    return m


# Distortion World on Platinum's own textures: platforms of pink cracked
# rock on black nothing, blue-lit rock where the path runs, sideways
# waterfalls of pale "water", the blue trees, boulders and dark plants.
def distortion_world():
    m = blank('distortion-world', 2009, [(0, 2), (6, 2), (6, 7), (13, 7), (13, 3), (20, 3), (20, 10), (27, 10), (27, 13)], road=None)
    m.theme = 'cave'
    m.floor('bw-void', 0, 0, 29, 13)
    platforms = [(0, 0, 8, 4), (4, 5, 15, 9), (11, 1, 22, 5), (18, 8, 29, 12)]
    for x0, y0, x1, y1 in platforms:
        m.floor('pt-dw-floor', x0, y0, x1, y1)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-dw-blue-0'
    # platform undersides
    for x0, y0, x1, y1 in platforms:
        for x in range(x0, x1 + 1, 2):
            if m.inb(x, y1 + 1) and (x, y1 + 1) not in m.path_cells and (x + 1, y1 + 1) not in m.path_cells:
                m.stamp('pt-dw-cliff-b', x, y1 + 1, must=False, clip=True)
    # sideways waterfalls
    m.floor('pt-dw-sky', 1, 11, 10, 12)
    m.floor('pt-dw-sky-edge', 1, 10, 10, 10)
    m.floor('pt-dw-sky', 24, 0, 29, 1)
    for x, y in ((2, 0), (14, 1), (26, 8), (9, 5)):
        m.stamp('pt-dw-tree', x, y, must=False)
    for x, y in ((6, 0), (18, 3), (21, 10), (12, 8)):
        m.stamp('pt-dw-boulder', x, y, must=False)
    for x, y in ((1, 3), (16, 5), (23, 11)):
        m.stamp('pt-dw-plant', x, y, must=False)
    m.wall(0, 13, 29, 13)
    pick_spots(m, 10)
    return m


# The Conference stadium: a floor of the field's kind inside a cobbled ring
# of stands, the path snaking down the field.
def stadium(kind):
    path = [(0, 3), (26, 3), (26, 7), (3, 7), (3, 11), (29, 11)]
    m = blank(f'stadium-{kind}', 2010, path, road={'grass': 'bw-path', 'rock': 'dirt-path-dark', 'water': 'bw-path', 'ice': 'pebbles'}[kind])
    m.floor('bw-cobble', 0, 0, 29, 13)
    field = rect(2, 1, 27, 12)
    for x, y in field:
        m.ground[y][x] = f'bw-grass-{(x % 4) + (y % 4) * 4}'
    if kind == 'rock':
        m.terrain_cells('pebbles', field - m.path_cells)
        for x, y in ((8, 5), (20, 9), (14, 1)):
            m.stamp('bw-rock', x, y, must=False)
    elif kind == 'water':
        m.terrain_cells('sand', field - m.path_cells)
        water(m, rect(8, 5, 11, 6) | rect(18, 9, 21, 10) | rect(12, 1, 15, 1), tid='pool')
    elif kind == 'ice':
        m.floor('bw-snow', 2, 1, 27, 12)
        m.terrain_cells('ice', (rect(6, 4, 23, 6) | rect(8, 8, 21, 10)) - m.path_cells)
    else:
        m.tall_grass(6, 4, 11, 6)
        m.tall_grass(18, 8, 23, 10)
    for x in (0, 29):
        for y in (1, 5, 9):
            m.stamp('bw-streetlamp' if x == 0 else 'bw-streetlamp', x if x == 0 else 28, y, must=False)
    pick_spots(m, 10)
    return m


# Hisui rifts: the same places long ago, no roads.
def hisui_fieldlands():
    m = blank('hisui-fieldlands', 2101, [(0, 9), (7, 9), (7, 4), (16, 4), (16, 10), (24, 10), (24, 5), (29, 5)], road='dirt-path')
    border_forest(m)
    m.forest(9, -1, 14, 1)
    m.forest(18, 11, 23, 14)
    for x, y in ((11, 6), (19, 6)):
        m.tree(x, y, kind='conifer')
    m.tall_grass(2, 2, 6, 6)
    m.tall_grass(18, 1, 23, 3)
    m.tall_grass(9, 11, 14, 12)
    m.stamp('bw-logpile', 27, 11, must=False)
    m.stamp('bw-log', 2, 12, must=False)
    pick_spots(m, 10)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-sprig', 'bw-sprig-2'], 10, (0, 0, 29, 13))
    return m


def hisui_mirelands():
    m = blank('hisui-mirelands', 2102, [(0, 4), (8, 4), (8, 10), (15, 10), (15, 3), (22, 3), (22, 9), (29, 9)], road='soil')
    water(m, rect(2, 7, 6, 9) | rect(10, 1, 13, 2) | rect(18, 11, 23, 13) | rect(25, 2, 29, 5), tid='shallow-water')
    border_forest(m, top=True, bottom=False, left=True, right=False)
    m.tall_grass(9, 6, 14, 8)
    m.tall_grass(17, 6, 21, 8)
    m.tall_grass(1, 11, 7, 12)
    for x, y in ((7, 6), (14, 0), (17, 10), (24, 6), (1, 6)):
        m.stamp('bw-reeds', x, y, must=False)
    m.stamp('bw-log', 25, 11, must=False)
    pick_spots(m, 10)
    return m


def hisui_coastlands():
    m = blank('hisui-coastlands', 2103, [(0, 5), (9, 5), (9, 9), (19, 9), (19, 4), (29, 4)], road='sand')
    m.terrain_cells('beach-sand', rect(0, 8, 29, 11) - m.path_cells)
    water(m, rect(0, 12, 29, 13) | rect(23, 10, 29, 11))
    m.plateau(21, 0, 29, 2, cliff='rock')
    m.stamp('bw-cave-mouth', 23, 0, must=False)
    m.stamp('bw-rock-big', 1, 0, must=False)
    for x, y in ((12, 1), (16, 11), (5, 11), (27, 7)):
        m.stamp('bw-rock', x, y, must=False)
    m.scatter(['bw-rock-small'], 6, (0, 6, 29, 11))
    border_forest(m, top=False, bottom=False, left=True, right=False)
    m.tall_grass(11, 1, 18, 3)
    pick_spots(m, 10)
    return m


def hisui_icelands():
    m = blank('hisui-icelands', 2104, [(0, 8), (6, 8), (6, 3), (14, 3), (14, 9), (22, 9), (22, 4), (29, 4)], road='pebbles')
    m.floor('bw-snow', 0, 0, 29, 13)
    m.terrain_cells('snow-grass', rect(1, 1, 4, 3) | rect(15, 11, 20, 13))
    m.terrain_cells('ice', (rect(8, 5, 12, 8) | rect(16, 1, 20, 2) | rect(24, 7, 29, 10)) - m.path_cells)
    border_forest(m, kind='pine-snow')
    m.plateau(0, 10, 5, 13, cliff='snow')
    m.stamp('bw-snow-rock-big', 25, 0, must=False)
    for x, y in ((2, 1), (10, 11), (17, 5), (18, 11)):
        m.stamp('bw-snow-rock', x, y, must=False)
    m.stamp('bw-ice-block', 9, 0, must=False)
    m.stamp('bw-ice-rock', 24, 11, must=False)
    m.scatter(['bw-grey-rock-small'], 5, (0, 0, 29, 13))
    pick_spots(m, 10)
    return m


# The title diorama: lake, meadow, forest, cliff, beach and a snowy ledge in
# one view, with named stage points for the title scenes. The path is the
# route loop the chase runs along.
def title():
    m = blank('title', 2200, [(0, 9), (9, 9), (9, 6), (15, 6), (15, 10), (21, 10), (21, 7), (29, 7)])
    lake = rect(1, 1, 8, 6) - {(1, 1), (8, 1), (1, 6), (8, 6), (0, 0)} | rect(2, 0, 7, 0) | rect(3, 7, 6, 7)
    water(m, lake - rect(4, 3, 5, 4))
    m.stamp('bw-rock-small', 4, 3)
    m.stamp('bw-flowers-white', 5, 4)
    for x, y in ((0, 2), (0, 5), (9, 2), (9, 5), (2, 7), (7, 7)):
        m.stamp('bw-reeds', x, y, must=False)
    m.plateau(21, 0, 29, 5, cliff='snow', interior=False)
    m.floor('bw-snow', 22, 0, 28, 3)
    m.tree(26, 0, kind='pine-snow')
    m.stamp('bw-snow-rock', 22, 1, must=False)
    m.stamp('bw-grey-rock-small', 24, 3, must=False)
    border_forest(m, top=True, bottom=False, left=False, right=False)
    m.forest(10, -1, 20, 1)
    m.forest(16, 11, 29, 14)
    m.terrain_cells('beach-sand', rect(0, 12, 14, 12))
    water(m, rect(0, 13, 14, 13))
    m.tall_grass(10, 3, 14, 5)
    m.tall_grass(16, 7, 20, 9)
    for x, y in ((11, 8), (17, 2), (24, 9)):
        m.stamp('bw-flower-bush-mix' if x != 17 else 'bw-flower-bush-red', x, y, must=False)
    m.stamp('bw-flower-patch-pink', 13, 11, must=False)
    m.stamp('bw-rock-big', 25, 9, must=False)
    m.stamp('bw-sign', 2, 10, must=False)
    m.stamp('bw-lantern', 20, 5, must=False)
    pick_spots(m, 6)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-sprig', 'bw-sprig-2'], 12, (0, 0, 29, 13))
    m.points = [('meadow', 'stage', 12, 7), ('beach', 'stage', 6, 11), ('lake-shore', 'stage', 3, 8),
                ('cliff', 'stage', 26, 6), ('ledge', 'stage', 25, 2), ('sky', 'stage', 15, 1)]
    return m


MAPS = {'route-201': route_201, 'lake-verity': lake_verity, 'route-202': route_202, 'route-203': route_203,
        'eterna-gym': eterna_gym, 'hearthome-gym': hearthome_gym, 'veilstone-gym': veilstone_gym,
        'pastoria-gym': pastoria_gym, 'canalave-gym': canalave_gym, 'snowpoint-gym': snowpoint_gym,
        'sunyshore-gym': sunyshore_gym, 'spear-pillar': spear_pillar, 'distortion-world': distortion_world,
        'stadium-grass': lambda: stadium('grass'), 'stadium-rock': lambda: stadium('rock'),
        'stadium-water': lambda: stadium('water'), 'stadium-ice': lambda: stadium('ice'),
        'hisui-fieldlands': hisui_fieldlands, 'hisui-mirelands': hisui_mirelands,
        'hisui-coastlands': hisui_coastlands, 'hisui-icelands': hisui_icelands, 'title': title}


# --------------------------------------------------------------------------
# Story set pieces and secret levels (hand-built where no trace exists).

# Lake Verity, the island (Surf secret level): the traced lake with the
# island made placeable and a swimming lane from the south shore to it.
def lake_verity_island():
    island = {(x, y): '.' for x in range(13, 17) for y in range(6, 8)}
    m = from_trace('lake-verity-island', 302, [(0, 11), (3, 11), (3, 0), (26, 0), (26, 11), (23, 11), (23, 13)], overrides=island, trace='lake-verity')
    swim = [(23, 12), (23, 9), (15, 9), (15, 7)]
    m.extra_paths = [('path-water', swim)]
    lane(m, swim, road=False)
    spots = [(14, 6), (16, 6), (14, 7), (16, 7)]
    m.add_spots(spots)
    m.spot_props = {p: {'island': True} for p in spots}
    m.stamp('bw-rock-small', 13, 6)
    m.stamp('bw-flowers-white', 13, 7)
    m.points = [('cave', 'stage', 15, 7)]
    return finish_trace(m, n_spots=8)


# Lake Valor: the great lake with its island, drained by Saturn's bomb in the
# story (the level code drains and refills it); same bones as Verity.
def lake_valor():
    m = blank('lake-valor', 303, [(0, 12), (4, 12), (4, 2), (25, 2), (25, 12), (29, 12)])
    lake = rect(6, 3, 23, 10) - {(6, 3), (7, 3), (6, 4), (22, 3), (23, 3), (23, 4), (6, 9), (6, 10), (7, 10), (22, 10), (23, 10), (23, 9)} | rect(9, 2, 20, 2) | rect(9, 11, 20, 11)
    island = rect(13, 6, 16, 7)
    water(m, lake - island)
    m.stamp('bw-rock', 14, 6)
    m.stamp('bw-rock-small', 16, 7, must=False)
    border_forest(m)
    m.forest(0, 4, 2, 9)
    m.forest(27, 4, 29, 9)
    for x, y in ((5, 2), (24, 2), (5, 11), (24, 11), (7, 1), (22, 1)):
        m.stamp('bw-reeds', x, y, must=False)
    m.tall_grass(6, 12, 22, 12)
    pick_spots(m, 10)
    m.scatter(['bw-flowers-white', 'bw-sprig'], 6, (0, 0, 29, 13))
    return m


# Lake Acuity: the frozen lake below Snowpoint. Snow all round, ice at the
# edge of the water, the island in the middle.
def lake_acuity():
    m = blank('lake-acuity', 304, [(0, 11), (3, 11), (3, 1), (26, 1), (26, 11), (29, 11)], road='pebbles')
    m.floor('bw-snow', 0, 0, 29, 13)
    lake = rect(7, 3, 22, 10) - {(7, 3), (22, 3), (7, 10), (22, 10)}
    island = rect(13, 6, 16, 7)
    water(m, lake - island)
    m.terrain_cells('ice', (rect(5, 2, 24, 11) - lake - m.path_cells))
    m.stamp('bw-snow-rock', 14, 5, must=False)
    border_forest(m, kind='pine-snow')
    m.stamp('bw-snow-rock-big', 0, 2, must=False)
    m.stamp('bw-snow-rock-big', 26, 2, must=False)
    m.scatter(['bw-grey-rock-small', 'bw-ice-block'], 5, (0, 0, 29, 13))
    pick_spots(m, 10)
    return m


# Valley Windworks: the river valley below the plant. The river runs down the
# map with a shallow ford, tall grass on both banks, fences of logs.
def valley_windworks():
    m = blank('valley-windworks', 401, [(0, 3), (9, 3), (9, 8), (19, 8), (19, 4), (29, 4)])
    river = rect(13, 0, 15, 13)
    water(m, river - rect(13, 8, 15, 8))
    m.terrain_cells('shallow-water', rect(13, 8, 15, 8) - m.path_cells)
    border_forest(m, bottom=False)
    m.forest(0, 10, 10, 14)
    m.tall_grass(1, 5, 7, 7)
    m.tall_grass(21, 9, 28, 11)
    m.tall_grass(17, 0, 24, 1)
    for x, y in ((4, 1), (23, 6), (10, 11)):
        m.stamp('bw-log', x, y, must=False)
    m.stamp('bw-sign', 1, 2, must=False)
    pick_spots(m, 10)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-sprig'], 8, (0, 0, 29, 13))
    return m


# Eterna Forest: deep woods, the path winding through narrow clearings; moss
# (tall grass) and fallen logs.
def eterna_forest():
    m = blank('eterna-forest', 402, [(0, 2), (6, 2), (6, 9), (13, 9), (13, 3), (21, 3), (21, 11), (29, 11)], road='dirt-path-dark')
    border_forest(m)
    m.forest(8, 4, 11, 7)
    m.forest(15, 5, 19, 8)
    m.forest(23, 0, 29, 8)
    m.forest(0, 4, 4, 8)
    m.forest(8, 11, 19, 14)
    m.tall_grass(1, 10, 4, 12)
    m.tall_grass(23, 9, 27, 10)
    m.stamp('bw-log', 10, 1, must=False)
    m.stamp('bw-logpile', 16, 0, must=False)
    pick_spots(m, 10)
    m.scatter(['bw-sprig', 'bw-sprig-2', 'bw-sprig-3', 'bw-flowers-white'], 10, (0, 0, 29, 13))
    return m


# Old Chateau grounds at night: overgrown garden, lanterns, dead-looking
# pines, a cobbled drive.
def old_chateau():
    m = blank('old-chateau', 403, [(0, 7), (5, 7), (5, 3), (12, 3), (12, 10), (18, 10), (18, 3), (25, 3), (25, 13)], road=None)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'bw-cobble-0'
    border_forest(m, kind='pine-dirt')
    m.forest(7, 6, 10, 8, kind='pine-dirt')
    m.forest(20, 6, 23, 8, kind='pine-dirt')
    for x, y in ((3, 2), (14, 1), (26, 8), (9, 11), (21, 11)):
        m.stamp('bw-lantern', x, y, must=False)
    m.tall_grass(1, 9, 4, 12)
    m.tall_grass(13, 5, 17, 8)
    m.stamp('bw-logpile', 27, 0, must=False)
    m.stamp('bw-barrel', 1, 1, must=False)
    pick_spots(m, 10)
    m.scatter(['bw-sprig-2', 'bw-sprig-3'], 8, (0, 0, 29, 13))
    return m


# Iron Island: a rock island. Brown cliffs step up to the mine mouth, a
# beach along the bottom, two lanes for the grunts.
def iron_island():
    m = blank('iron-island', 404, [(0, 9), (6, 9), (6, 5), (14, 5), (14, 9), (22, 9), (22, 5), (29, 5)], road='pebbles')
    m.extra_paths = [('path-2', [(0, 11), (10, 11), (10, 7), (18, 7), (18, 11), (29, 11)])]
    lane(m, m.extra_paths[0][1])
    m.floor('bw-darkrock', 0, 0, 29, 13)
    m.terrain_cells('beach-sand', rect(0, 12, 29, 12) - m.path_cells - m.lane_cells)
    water(m, rect(0, 13, 29, 13))
    m.plateau(0, 0, 29, 3, cliff='rock', interior=False)
    m.stamp('bw-cave-mouth', 12, 4, must=False)
    m.stamp('bw-rock-big', 25, 4, must=False)
    for x, y in ((3, 6), (26, 7), (16, 1)):
        m.stamp('bw-rock', x, y, must=False)
    m.scatter(['bw-rock-small'], 8, (0, 3, 29, 11))
    pick_spots(m, 10)
    return m


# Galactic HQ on its own textures: the starry walls, the grey floor, the
# warp pads along the route, consoles and the spirit extractor at the top.
def galactic_hq():
    m = blank('galactic-hq', 405, [(0, 10), (8, 10), (8, 4), (16, 4), (16, 10), (24, 10), (24, 2), (29, 2)], road=None)
    m.theme = 'cave'
    m.floor('pt-hq-floor', 0, 0, 29, 13)
    m.floor('pt-hq-grid', 2, 2, 27, 11)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-hq-floor-light-0'
    m.floor('pt-hq-logo', 11, 7, 12, 8)
    for x, y, k in ((2, 10, 1), (8, 7, 2), (16, 7, 3), (24, 6, 1), (27, 2, 2)):
        if (x, y) in m.path_cells:
            m.ground[y][x] = f'pt-hq-pad-{k}-0'
    for x in range(0, 30, 2):
        m.stamp('pt-hq-wall' if x % 4 == 0 else 'pt-hq-wall-b', x, -2, must=False, clip=True)
    m.stamp('pt-hq-orb', 13, 1, must=False)
    m.stamp('pt-hq-orb-b', 10, 2, must=False)
    m.stamp('pt-hq-console', 19, 1, must=False)
    m.stamp('pt-hq-machine', 4, 1, must=False)
    m.stamp('pt-hq-machine-b', 26, 4, must=False)
    for x, y in ((1, 5), (28, 8), (12, 12), (20, 12)):
        m.stamp('pt-hq-terminal', x, y, must=False)
    for x, y in ((5, 12), (22, 0)):
        m.stamp('pt-hq-table', x, y, must=False)
    for x, y in ((10, 11), (18, 11)):
        m.stamp('pt-hq-barrier', x, y, must=False)
    pick_spots(m, 10)
    m.points = [('machine', 'stage', 14, 2)]
    return m


# Snowpoint Temple: blue stone halls, the ice floor puzzle, Regigigas's
# chamber at the far end.
def snowpoint_temple():
    m = blank('snowpoint-temple', 411, [(0, 11), (6, 11), (6, 3), (14, 3), (14, 10), (22, 10), (22, 4), (29, 4)], road=None)
    m.theme = 'cave'
    m.floor('pt-temple-floor', 0, 0, 29, 13)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-temple-floor-light-0'
    m.floor('pt-temple-ice-a', 8, 5, 12, 8)
    m.floor('pt-temple-ice-b', 16, 5, 20, 8)
    m.floor('pt-temple-ice-c', 24, 7, 27, 10)
    for x in range(0, 30):
        m.stamp('pt-temple-wall-s', x, 0, must=False)
    for x in range(0, 30):
        m.stamp('pt-temple-wall', x, 13, must=False)
    m.stamp('pt-temple-door', 14, 0, must=False)
    for x, y in ((2, 2), (26, 1), (10, 11), (18, 12)):
        m.stamp('pt-temple-boulder', x, y, must=False)
    m.scatter(['pt-temple-rocks'], 6, (0, 1, 29, 12))
    pick_spots(m, 10)
    m.points = [('regigigas', 'stage', 28, 3)]
    return m


# Mt. Coronet: the purple cave, an underground stream, the glowing pads on
# the way up to the summit.
def mt_coronet():
    m = blank('mt-coronet', 412, [(0, 3), (7, 3), (7, 9), (15, 9), (15, 2), (23, 2), (23, 11), (29, 11)], road=None)
    m.theme = 'cave'
    m.floor('pt-coronet-floor', 0, 0, 29, 13)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-coronet-floor-b-0'
    m.floor('pt-coronet-water', 9, 11, 14, 13)
    m.floor('pt-coronet-water', 25, 0, 29, 1)
    m.wall(9, 11, 14, 13)
    m.wall(25, 0, 29, 1)
    for x, y in ((11, 5), (19, 6), (3, 10)):
        m.ground[y][x] = 'pt-coronet-pad-a-0'
    for x in range(0, 30):
        m.stamp('pt-coronet-wall-s', x, 0, must=False)
        m.stamp('pt-coronet-wall', x, 13, must=False)
    m.stamp('pt-coronet-door', 23, 0, must=False)
    for x, y in ((2, 6), (18, 11), (26, 6), (10, 1)):
        m.stamp('pt-coronet-boulder', x, y, must=False)
    pick_spots(m, 10)
    return m


# Oreburgh Gate and Mine on the mine's own textures: brown cave, coal
# conveyors and the lift in the mine.
def oreburgh_cave(name, seed, path, mine):
    m = blank(name, seed, path, road=None)
    m.theme = 'cave'
    m.floor('pt-mine-floor', 0, 0, 29, 13)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-mine-floor-b-0'
    for x in range(0, 30):
        m.stamp('pt-mine-wall-s', x, 0, must=False)
        m.stamp('pt-mine-wall', x, 13, must=False)
    if mine:
        for x, y in ((3, 2), (20, 2)):
            m.stamp('pt-mine-belt', x, y, must=False)
        m.stamp('pt-mine-lift', 26, 1, must=False)
        m.stamp('pt-mine-panel', 12, 11, must=False)
    else:
        m.stamp('pt-mine-door', 2, 0, must=False)
        m.stamp('pt-mine-door', 26, 11, must=False)
    for x, y in ((5, 8), (15, 1), (24, 7), (10, 11)):
        m.stamp('pt-mine-boulder', x, y, must=False)
    m.scatter(['pt-mine-rocks'], 8, (0, 1, 29, 12))
    pick_spots(m, 10)
    return m


# Stark Mountain, outside: volcanic ground, dark cliffs with magma seams,
# the cave mouth to Heatran's chamber.
def stark_mountain():
    m = blank('stark-mountain', 413, [(0, 9), (6, 9), (6, 4), (14, 4), (14, 10), (22, 10), (22, 5), (29, 5)], road=None)
    m.floor('pt-stark-floor', 0, 0, 29, 13)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'pt-mine-floor-b-0'
    m.floor('pt-stark-magma', 9, 11, 13, 13)
    m.floor('pt-stark-magma', 24, 0, 29, 2)
    m.wall(9, 11, 13, 13)
    m.wall(24, 0, 29, 2)
    for x in range(0, 30, 2):
        m.stamp('pt-stark-cliff-magma' if x % 6 == 0 else 'pt-stark-cliff', x, 0, must=False)
    m.stamp('pt-stark-cave', 16, 0, must=False)
    for x, y in ((2, 11), (17, 7), (26, 8)):
        m.stamp('pt-stark-rock', x, y, must=False)
    m.scatter(['pt-stark-rocks'], 6, (0, 2, 29, 12))
    pick_spots(m, 10)
    return m


# The S.S. Libra: Cipher's ship at Sunyshore harbour. A steel deck on the
# water, two lanes (deck and hold), cargo and lamps.
def ss_libra():
    m = blank('ss-libra', 406, [(0, 4), (7, 4), (7, 8), (22, 8), (22, 4), (29, 4)], road=None)
    m.extra_paths = [('path-2', [(0, 10), (29, 10)])]
    lane(m, m.extra_paths[0][1], road=False)
    water(m, rect(0, 0, 29, 1) | rect(0, 12, 29, 13))
    m.floor('bw-steel', 0, 2, 29, 11)
    for (x, y) in m.path_cells:
        m.ground[y][x] = 'bw-orangetile-' + str((x % 2) + (y % 2) * 2)
    for (x, y) in m.lane_cells:
        m.ground[y][x] = 'bw-cobble-0'
    for x in (3, 12, 24):
        m.stamp('bw-container', x, 5, must=False)
    for x, y in ((9, 2), (18, 2), (27, 2)):
        m.stamp('bw-barrel', x, y, must=False)
    for x, y in ((1, 2), (15, 2), (28, 6)):
        m.stamp('bw-streetlamp', x, y, must=False)
    pick_spots(m, 10)
    return m


# Flower Paradise: the Seabreak Path from the Route 224 beach into a sea of
# flowers, Shaymin at the far end.
def flower_paradise():
    m = blank('flower-paradise', 407, [(0, 10), (4, 10), (4, 6), (29, 6)], road='sand')
    m.terrain_cells('beach-sand', rect(0, 11, 6, 13) - m.path_cells)
    water(m, rect(0, 13, 29, 13) | rect(7, 12, 29, 12))
    border_forest(m, top=True, bottom=False, left=False, right=False)
    for y in (2, 4, 8, 10):
        for x in range(6, 28, 3):
            m.stamp(['bw-flower-bush-red', 'bw-flower-bush-mix', 'bw-flower-patch-pink'][(x // 3 + y) % 3], x, y, must=False)
    pick_spots(m, 10)
    m.scatter(['bw-flowers-white', 'bw-flowers-white-2'], 14, (5, 0, 29, 11))
    m.points = [('shaymin', 'stage', 28, 6)]
    return m


# Fullmoon and Newmoon Islands: a small wooded island each; Fullmoon's shore
# is sand and flowers, Newmoon's is rock and dark pines.
def moon_island(name, dark):
    m = blank(name, 408 if dark else 409, [(0, 7), (4, 7), (4, 3), (12, 3), (12, 10), (20, 10), (20, 5), (29, 5)], road='dirt-path-dark' if dark else 'bw-path')
    sea = rect(0, 0, 29, 0) | rect(0, 13, 29, 13) | rect(0, 1, 1, 12) | rect(28, 1, 29, 12)
    water(m, sea - m.path_cells)
    kind = 'pine-dirt' if dark else 'conifer'
    m.forest(6, 5, 10, 8, kind)
    m.forest(14, 5, 18, 8, kind)
    m.forest(22, 7, 26, 11, kind)
    if dark:
        m.floor('bw-darkrock', 2, 1, 27, 12)
        for x, y in ((3, 1), (24, 1), (8, 11)):
            m.stamp('bw-rock', x, y, must=False)
    else:
        m.terrain_cells('beach-sand', (rect(2, 1, 27, 1) | rect(2, 12, 27, 12)) - m.path_cells)
        m.scatter(['bw-flowers-white', 'bw-flowers-white-2', 'bw-flower-patch-pink'], 8, (2, 1, 27, 12))
    m.tall_grass(22, 1, 26, 3)
    m.tall_grass(6, 10, 10, 12)
    pick_spots(m, 10)
    return m


# Great Marsh: the Safari Zone. Pools and reeds everywhere, boardwalk-less
# mud paths, tall grass in patches.
def great_marsh():
    m = blank('great-marsh', 410, [(0, 2), (6, 2), (6, 11), (14, 11), (14, 2), (22, 2), (22, 11), (29, 11)], road='soil')
    water(m, rect(8, 4, 12, 7) | rect(16, 5, 20, 9) | rect(1, 5, 4, 8) | rect(24, 3, 28, 6), tid='shallow-water')
    for x, y in ((7, 3), (13, 8), (15, 4), (21, 10), (0, 9), (23, 7), (27, 7)):
        m.stamp('bw-reeds', x, y, must=False)
    m.tall_grass(1, 10, 5, 12)
    m.tall_grass(9, 9, 12, 10)
    m.tall_grass(24, 8, 28, 10)
    m.tall_grass(8, 0, 12, 1)
    m.forest(16, -1, 20, 1)
    m.stamp('bw-log', 2, 3, must=False)
    pick_spots(m, 10)
    return m


MAPS.update({'temporal-spire': temporal_spire, 'snowpoint-temple': snowpoint_temple, 'mt-coronet': mt_coronet, 'stark-mountain': stark_mountain,
             'oreburgh-gate': lambda: oreburgh_cave('oreburgh-gate', 414, [(0, 2), (9, 2), (9, 8), (19, 8), (19, 3), (29, 3)], False),
             'oreburgh-mine-1f': lambda: oreburgh_cave('oreburgh-mine-1f', 415, [(0, 10), (7, 10), (7, 3), (15, 3), (15, 9), (23, 9), (23, 4), (29, 4)], True),
             'lake-verity-island': lake_verity_island, 'lake-valor': lake_valor, 'lake-acuity': lake_acuity,
             'valley-windworks': valley_windworks, 'eterna-forest': eterna_forest, 'old-chateau': old_chateau,
             'iron-island': iron_island, 'galactic-hq': galactic_hq, 'ss-libra': ss_libra,
             'flower-paradise': flower_paradise, 'fullmoon-island': lambda: moon_island('fullmoon-island', False),
             'newmoon-island': lambda: moon_island('newmoon-island', True), 'great-marsh': great_marsh})


# --------------------------------------------------------------------------
def composite(maps):
    """Composite trees per map and return {map name: {(x, y): tile key}} plus
    the list of unique tile images."""
    ext = Image.open(EXTERIOR).convert('RGBA')
    tree_imgs = {k: ext.crop((c * TILE, r * TILE, (c + 2) * TILE, (r + 4) * TILE)) for k, (c, r) in TREE_KINDS.items()}
    uniq, tiles, per_map = {}, [], {}
    for m in maps:
        pad = 4
        canvas = Image.new('RGBA', ((m.w + 2 * pad) * TILE, (m.h + 2 * pad) * TILE), (0, 0, 0, 0))
        for x, y, kind in sorted(m.trees, key=lambda t: (t[1], t[0])):
            canvas.alpha_composite(tree_imgs[kind], ((x + pad) * TILE, (y + pad) * TILE))
        cells = {}
        for (x, y) in m.tree_cells:
            if not m.inb(x, y):
                continue
            t = canvas.crop(((x + pad) * TILE, (y + pad) * TILE, (x + pad + 1) * TILE, (y + pad + 1) * TILE))
            if t.getbbox() is None:
                continue
            key = t.tobytes()
            if key not in uniq:
                uniq[key] = len(tiles)
                tiles.append(t)
            cells[(x, y)] = f'bw-tree-{uniq[key]}'
        per_map[m.name] = cells
    cols = 8
    rows = max(1, (len(tiles) + cols - 1) // cols)
    sheet = Image.new('RGBA', (cols * TILE, rows * TILE), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * TILE, (i // cols) * TILE))
    sheet.save(GENERATED)
    print(f'composited {len(tiles)} unique tree tiles -> {GENERATED.relative_to(ROOT)}')
    return per_map, len(tiles)


def register(n_tree_tiles):
    c = load_catalogue()
    c['tilesets'][TS] = {'name': 'Gen 5 BW outdoor', 'columns': 8, 'theme': 'grass'}
    c['sources']['generated-bw'] = {
        'file': 'assets-src/tilesets/gen5/generated-bw.png',
        'artist': 'UltimoSpriter (trees composited by scripts/bw-maps.py)',
        'description': 'BW conifers composited into overlapping forest tiles',
    }
    for name, src in PT_SOURCES.items():
        c['sources'][name] = dict(src)
    c['tiles'] = [t for t in c['tiles'] if t.get('tileset') != TS]
    for tid, spec in STATIC.items():
        col, row, w, h, solid = spec[:5]
        src = spec[5] if len(spec) > 5 else 'exterior'
        is_ground = tid.startswith('bw-grass') or any(tid.startswith(g + '-') for g in GROUND)
        e = {'id': tid, 'name': tid.replace('bw-', 'BW ').replace('-', ' '), 'group': 'BW', 'layer': 'ground' if is_ground else 'decoration',
             'tileset': TS, 'source': src, 'col': col, 'row': row}
        if w > 1 or h > 1:
            e['w'], e['h'] = w, h
        if solid:
            e['solid'] = True
        c['tiles'].append(e)
    for i in range(n_tree_tiles):
        c['tiles'].append({'id': f'bw-tree-{i}', 'name': f'BW forest {i}', 'group': 'BW forest', 'layer': 'decoration',
                           'tileset': TS, 'source': 'generated-bw', 'col': i % 8, 'row': i // 8, 'solid': True})
    terr_ids = {t['id'] for t in c['terrains']}
    if 'bw-path' not in terr_ids:
        c['terrains'].append({'id': 'bw-path', 'name': 'BW path', 'source': 'exterior', 'block': [0, 76],
                              'group': 'Paths', 'base': 'bw-grass-0'})
    save_catalogue(c)
    subprocess.run(['node', 'scripts/build-tilesets.mjs'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)


def write(m, tree_cells):
    gen = json.loads((ROOT / 'src/data/tilesets.json').read_text())
    cat = load_catalogue()
    ts = gen['tilesets'][TS]
    cols = ts['columns']
    idx = lambda tid: ts['tiles'][tid]
    tilesets = [{'firstgid': 1, 'name': TS, 'image': ts['image'], 'imagewidth': cols * TILE, 'imageheight': ts['rows'] * TILE,
                 'tilewidth': TILE, 'tileheight': TILE, 'columns': cols, 'tilecount': ts['tilecount'], 'margin': 0, 'spacing': 0}]
    nxt = 1 + ts['tilecount']
    tgid = {}
    for t in cat['terrains']:
        g = gen['autotiles'][t['id']]
        tilesets.append({'firstgid': nxt, 'name': f"autotile:{t['id']}", 'image': g['image'], 'imagewidth': 96 * g['frames'],
                         'imageheight': 128, 'tilewidth': TILE, 'tileheight': TILE, 'columns': 3, 'tilecount': 12, 'margin': 0, 'spacing': 0})
        tgid[t['id']] = nxt
        nxt += 12
    ground, terrain, deco = [], [], []
    for y in range(m.h):
        for x in range(m.w):
            ground.append(idx(m.ground[y][x]) + 1)
            terrain.append(tgid[m.terrain[y][x]] if m.terrain[y][x] else 0)
            if (x, y) in tree_cells:
                deco.append(idx(tree_cells[(x, y)]) + 1)
            elif m.deco[y][x]:
                tid, dx, dy = m.deco[y][x]
                deco.append(idx(tid) + dy * cols + dx + 1)
            else:
                deco.append(0)
    c = lambda t: t * TILE + TILE // 2
    sx, sy = m.path[0]
    ex, ey = m.path[-1]
    objs = [{'id': 1, 'name': 'path', 'type': 'path', 'x': c(sx), 'y': c(sy), 'width': 0, 'height': 0, 'rotation': 0, 'visible': True,
             'polyline': [{'x': c(x) - c(sx), 'y': c(y) - c(sy)} for x, y in m.path]},
            {'id': 2, 'name': 'spawn', 'type': 'spawn', 'x': c(sx), 'y': c(sy), 'width': 0, 'height': 0, 'rotation': 0, 'visible': True, 'point': True},
            {'id': 3, 'name': 'exit', 'type': 'exit', 'x': c(ex), 'y': c(ey), 'width': 0, 'height': 0, 'rotation': 0, 'visible': True, 'point': True}]
    # Extra enemy lanes (name, points) and named stage points for scenes.
    nid = 4 + len(m.spots)
    for name, pts in getattr(m, 'extra_paths', []):
        px, py = pts[0]
        objs.append({'id': nid, 'name': name, 'type': 'path', 'x': c(px), 'y': c(py), 'width': 0, 'height': 0, 'rotation': 0, 'visible': True,
                     'polyline': [{'x': c(x) - c(px), 'y': c(y) - c(py)} for x, y in pts]})
        nid += 1
    for name, kind, x, y in getattr(m, 'points', []):
        objs.append({'id': nid, 'name': name, 'type': kind, 'x': c(x), 'y': c(y), 'width': 0, 'height': 0, 'rotation': 0, 'visible': True, 'point': True})
        nid += 1
    props = getattr(m, 'spot_props', {})
    plc = []
    for i, (x, y) in enumerate(m.spots):
        o = {'id': 4 + i, 'name': 'placeable', 'type': 'placeable', 'x': x * TILE, 'y': y * TILE, 'width': TILE, 'height': TILE,
             'rotation': 0, 'visible': True}
        if (x, y) in props:
            o['properties'] = [{'name': k, 'type': 'string' if isinstance(v, str) else 'bool' if isinstance(v, bool) else 'int', 'value': v} for k, v in props[(x, y)].items()]
        plc.append(o)
    size = {'width': m.w, 'height': m.h, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True}
    out = {'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
           'compressionlevel': -1, 'infinite': False, 'width': m.w, 'height': m.h, 'tilewidth': TILE, 'tileheight': TILE,
           'nextlayerid': 6, 'nextobjectid': nid,
           'properties': [{'name': 'name', 'type': 'string', 'value': m.name}, {'name': 'theme', 'type': 'string', 'value': getattr(m, 'theme', 'grass')},
                          {'name': 'tileset', 'type': 'string', 'value': TS}],
           'tilesets': tilesets,
           'layers': [{'id': 1, 'name': 'ground', 'type': 'tilelayer', **size, 'data': ground},
                      {'id': 2, 'name': 'terrain', 'type': 'tilelayer', **size, 'data': terrain},
                      {'id': 3, 'name': 'decoration', 'type': 'tilelayer', **size, 'data': deco},
                      {'id': 4, 'name': 'path', 'type': 'objectgroup', 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'draworder': 'topdown', 'objects': objs},
                      {'id': 5, 'name': 'placeable', 'type': 'objectgroup', 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'draworder': 'topdown', 'objects': plc}]}
    (ROOT / 'src/data/maps' / f'{m.name}.json').write_text(json.dumps(out, indent=1) + '\n')
    solid_spot = [p for p in m.spots if p in tree_cells]
    assert not solid_spot, f'{m.name}: spots under trees {solid_spot}'
    print(f'{m.name}: {len(m.trees)} trees, {len(m.spots)} spots')


if __name__ == '__main__':
    # Always design every BW map so the generated tree sheet covers them all.
    built = [fn() for fn in MAPS.values()]
    per_map, n = composite(built)
    register(n)
    wanted = set(sys.argv[1:]) or set(MAPS)
    for m in built:
        if m.name in wanted:
            write(m, per_map[m.name])
