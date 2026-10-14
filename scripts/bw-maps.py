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
})
TREE_SRC = (2, 360)  # green BW conifer, transparent base, 2x4


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
        self.terrain_cells('bw-path', self.road, on_path=True)
        self.reserved |= self.road

    def terrain_cells(self, tid, cells, on_path=False):
        for x, y in cells:
            if self.inb(x, y) and (on_path or (x, y) not in self.path_cells):
                self.terrain[y][x] = tid

    def reach(self, p):
        best = 1e9
        for (ax, ay), (bx, by) in zip(self.path, self.path[1:]):
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
        col, row, w, h, solid = STATIC[tid]
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

    def tree(self, x, y, must=False):
        cells = [(x + dx, y + dy) for dy in range(4) for dx in range(2)]
        blocked = any(self.inb(cx, cy) and ((cx, cy) in self.reserved or self.deco[cy][cx]) for cx, cy in cells)
        if blocked:
            if must:
                raise ValueError(f'{self.name}: cannot place tree at {(x, y)}')
            return False
        self.trees.append((x, y))
        self.tree_cells |= {c for c in cells}
        return True

    def forest(self, x0, y0, x1, y1):
        """Fill a rectangle (may extend past the map edge) with BW conifers in
        staggered rows two tiles apart, the way BW forests are drawn. Trees
        never cover the path or spots."""
        for y in range(y0, y1 + 1, 2):
            off = (y // 2) % 2
            for x in range(x0 - off, x1 + 1, 2):
                self.tree(x, y)

    def plateau(self, x0, y0, x1, y1, open_top=False):
        """A BW grassy cliff ledge: teal-grass rim on top and sides, a
        two-row rock face along the bottom (rows y1-1 and y1). The top of the
        ledge is the ground texture showing through."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if not self.inb(x, y):
                    continue
                col = 'l' if x == x0 else 'r' if x == x1 else 'm'
                if y == y1 - 1:
                    tid = {'l': 'bw-cliff-fl', 'm': 'bw-cliff-f', 'r': 'bw-cliff-fr'}[col]
                elif y == y1:
                    tid = {'l': 'bw-cliff-fl2', 'm': 'bw-cliff-f2', 'r': 'bw-cliff-fr2'}[col]
                elif y == y0 and not open_top:
                    tid = {'l': 'bw-cliff-tl', 'm': 'bw-cliff-t', 'r': 'bw-cliff-tr'}[col]
                else:
                    tid = {'l': 'bw-cliff-l', 'm': None, 'r': 'bw-cliff-r'}[col]
                if tid:
                    self.deco[y][x] = (tid, 0, 0)
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
            col, row, w, h, _ = STATIC[tid]
            cells = [(x + dx, y + dy) for dy in range(h) for dx in range(w)]
            near = {(cx + ox, cy + oy) for cx, cy in cells for ox in range(-margin, margin + 1) for oy in range(-margin, margin + 1)}
            if near & self.reserved or any(self.inb(cx, cy) and self.terrain[cy][cx] for cx, cy in cells):
                continue
            if self.stamp(tid, x, y, must=False):
                placed += 1
        return placed


def from_trace(name, seed, path, overrides=None, skip_trees=()):
    """Build a map from the traced Platinum layout (scripts/gen4-traces):
    T forest, ~ water, = road, g tall grass, # rock, . grass. The enemy path
    is laid along the real road and clears whatever it crosses."""
    grid = TRACES.resample(name)
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
            if p in m.path_cells or p in m.water or m.grid[y][x] == '#' or p in m.reserved:
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

MAPS = {'route-201': route_201, 'lake-verity': lake_verity, 'route-202': route_202, 'route-203': route_203}


# --------------------------------------------------------------------------
def composite(maps):
    """Composite trees per map and return {map name: {(x, y): tile key}} plus
    the list of unique tile images."""
    ext = Image.open(EXTERIOR).convert('RGBA')
    tree_img = ext.crop((TREE_SRC[0] * TILE, TREE_SRC[1] * TILE, (TREE_SRC[0] + 2) * TILE, (TREE_SRC[1] + 4) * TILE))
    uniq, tiles, per_map = {}, [], {}
    for m in maps:
        pad = 4
        canvas = Image.new('RGBA', ((m.w + 2 * pad) * TILE, (m.h + 2 * pad) * TILE), (0, 0, 0, 0))
        for x, y in sorted(m.trees, key=lambda t: (t[1], t[0])):
            canvas.alpha_composite(tree_img, ((x + pad) * TILE, (y + pad) * TILE))
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
    c['tiles'] = [t for t in c['tiles'] if t.get('tileset') != TS]
    for tid, (col, row, w, h, solid) in STATIC.items():
        e = {'id': tid, 'name': tid.replace('bw-', 'BW ').replace('-', ' '), 'group': 'BW', 'layer': 'ground' if tid.startswith('bw-grass') else 'decoration',
             'tileset': TS, 'source': 'exterior', 'col': col, 'row': row}
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
    plc = [{'id': 4 + i, 'name': 'placeable', 'type': 'placeable', 'x': x * TILE, 'y': y * TILE, 'width': TILE, 'height': TILE,
            'rotation': 0, 'visible': True} for i, (x, y) in enumerate(m.spots)]
    size = {'width': m.w, 'height': m.h, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True}
    out = {'type': 'map', 'version': '1.10', 'tiledversion': '1.11.0', 'orientation': 'orthogonal', 'renderorder': 'right-down',
           'compressionlevel': -1, 'infinite': False, 'width': m.w, 'height': m.h, 'tilewidth': TILE, 'tileheight': TILE,
           'nextlayerid': 6, 'nextobjectid': 4 + len(plc),
           'properties': [{'name': 'name', 'type': 'string', 'value': m.name}, {'name': 'theme', 'type': 'string', 'value': 'grass'},
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
