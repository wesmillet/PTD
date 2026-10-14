#!/usr/bin/env python3
"""Tiles for Platinum's unique locations, cut from the game's own map texture
sets (res/field/maps/texture_sets/*.nsbtx in the pret/pokeplatinum decomp,
fetched by scripts/fetch-platinum.sh and decoded by scripts/nsbtx.py).

DS map tiles are 16 px, ours are 32 px, so most textures are scaled 2x
(nearest); column textures that wrap a 3D pillar are used at 1x so a pillar
stays one tile wide.

Writes one source sheet per location under assets-src/tilesets/gen4/
(pt-<location>.png, 8 columns of 32 px tiles) and the manifest
assets-src/tilesets/gen4/platinum-tiles.json that scripts/bw-maps.py reads
to register the tiles (ground patterns and decoration stamps) in the
bw-outdoor tileset, so the maps can mix them with the BW trees and cliffs.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import nsbtx  # noqa: E402

SRC = os.environ.get('POKEPLATINUM_DIR', '/tmp/pokeplatinum')
SETS = os.path.join(SRC, 'res', 'field', 'maps', 'texture_sets')
OUT = os.path.join(ROOT, 'assets-src', 'tilesets', 'gen4')
TILE = 32

# location -> (texture set number, [(texture, scale, tile id, kind, solid)])
# kind: 'ground' = a repeating floor pattern (every cell a ground tile),
#       'deco'   = a decoration stamp (solid blocks placement).
LOCATIONS = {
    'spear': (59, [
        ('dun08_chip_e', 2, 'floor', 'ground', False),       # plain summit stone
        ('dun08_chip_a', 2, 'carpet', 'ground', False),      # carved stone pattern, 4x4
        ('dun08_chip_d', 2, 'altar', 'ground', False),       # the triangle emblem, 2x2
        ('dun08_chip_b', 2, 'ledge', 'ground', False),       # ledge strip, 4x1
        ('dun08_chip_c', 2, 'steps', 'ground', False),       # grey steps, 2x1
        ('dun08_shin_b', 2, 'grey', 'ground', False),        # grey marble (distorted summit)
        ('dun08_shin_c', 2, 'grey-steps', 'ground', False),  # grey steps, 2x1
        ('@pillar', 1, 'pillar', 'deco', True),              # cap over two shaft tiles, outlined, 1x3
        ('@pillar-broken', 1, 'pillar-broken', 'deco', True),  # a broken stump, 1x1
        ('dun08_chip_g', 2, 'panel', 'deco', True),          # carved wall panel, 2x2
        ('dun08_chip_f', 2, 'rock', 'deco', True),           # boulder, 2x2
        ('criff', 2, 'cliff', 'ground', False),              # pink mountain rock
        ('kemuri', 2, 'cloud', 'deco', True),                # cloud, 2x2
    ]),
    'dw': (73, [
        ('s_land', 2, 'floor', 'ground', False),             # pink cracked rock, 2x2
        ('s_land2', 2, 'dark', 'ground', False),             # dark rock, 2x2
        ('s_land3', 2, 'blue', 'ground', False),             # blue-lit rock, 2x2
        ('s_landp', 2, 'edge', 'ground', False),             # rock meeting the blue, 2x2
        ('lake', 2, 'sky', 'ground', False),                 # the pale "water", 2x2
        ('bf_lake', 2, 'sky-edge', 'ground', False),
        ('s_land4', 2, 'boulder', 'deco', True),             # boulder, 2x2
        ('s_grass', 2, 'plant', 'deco', True),               # dark plant, 2x2
        ('@dw-tree', 1, 'tree', 'deco', True),               # the blue tree, 1x2
        ('criffp', 2, 'cliff', 'deco', True),                # cliff face, 2x2
        ('criffp2', 2, 'cliff-b', 'deco', True),
        ('s_land_att', 2, 'rim', 'deco', True),              # platform rim, 2x2
    ]),
    'hq': (57, [
        ('m_dun26_17', 2, 'floor', 'ground', False),         # grey floor
        ('m_dun26_18', 2, 'floor-light', 'ground', False),
        ('m_dun26_16', 2, 'grid', 'ground', False),          # grid floor
        ('m_dun26_12', 2, 'stripes', 'ground', False),
        ('m_dun26_24', 2, 'red', 'ground', False),
        ('m_dun26_rtm1', 2, 'pad-1', 'ground', False),       # warp pads
        ('m_dun26_rtm2', 2, 'pad-2', 'ground', False),
        ('m_dun26_rtm3', 2, 'pad-3', 'ground', False),
        ('ginga', 2, 'logo', 'ground', False),               # the G, as a floor decal
        ('azt_wall01', 2, 'wall', 'deco', True),             # starry wall
        ('azt_wall02', 2, 'wall-b', 'deco', True),
        ('azt_win01', 2, 'window', 'deco', True),
        ('m_dun26_01', 2, 'machine', 'deco', True),          # blue machine panels
        ('m_dun26_02', 2, 'machine-b', 'deco', True),
        ('m_dun26_10', 2, 'console', 'deco', True),
        ('m_dun26_31', 2, 'terminal', 'deco', True),
        ('m_dun26_32', 2, 'terminal-b', 'deco', True),
        ('m_dun26_08', 2, 'orb', 'deco', True),              # the spirit orb
        ('m_dun26_09', 2, 'orb-b', 'deco', True),
        ('table_g01', 2, 'table', 'deco', True),
        ('saku', 2, 'barrier', 'deco', True),
        ('mic', 2, 'mic', 'deco', True),
    ]),
    'temple': (64, [
        ('dun_floor', 2, 'floor', 'ground', False),
        ('@dark:dun_floor', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('dun_floor2', 2, 'floor-light', 'ground', False),
        ('fice_a', 2, 'ice-a', 'ground', False),
        ('fice_b', 2, 'ice-b', 'ground', False),
        ('fice_c', 2, 'ice-c', 'ground', False),
        ('fice_d', 2, 'ice-d', 'ground', False),
        ('dun_step', 2, 'steps', 'ground', False),
        ('dun_hashi', 2, 'bridge', 'ground', False),
        ('dun_wall_n', 2, 'wall', 'deco', True),
        ('dun_wall_s', 2, 'wall-s', 'deco', True),
        ('dun_wall_e', 2, 'wall-e', 'deco', True),
        ('dun_wall_w', 2, 'wall-w', 'deco', True),
        ('dun_dhole', 2, 'door', 'deco', True),
        ('dun_hanger', 2, 'rocks', 'deco', True),
        ('dun_srock', 2, 'boulder', 'deco', True),
    ]),
    'mine': (54, [
        ('dun_floor', 2, 'floor', 'ground', False),          # brown cave floor
        ('@dark:dun_floor', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('dun_floor2', 2, 'floor-b', 'ground', False),
        ('dun_step', 2, 'steps', 'ground', False),
        ('dun_hashi', 2, 'bridge', 'ground', False),
        ('dun_slope', 2, 'slope', 'ground', False),
        ('dun_wall_n', 2, 'wall', 'deco', True),
        ('dun_wall_s', 2, 'wall-s', 'deco', True),
        ('dun_wall_e', 2, 'wall-e', 'deco', True),
        ('dun_wall_w', 2, 'wall-w', 'deco', True),
        ('dun_wall_c', 2, 'wall-c', 'deco', True),
        ('dun_dhole', 2, 'door', 'deco', True),
        ('dun_hanger', 2, 'rocks', 'deco', True),
        ('dun_srock', 2, 'boulder', 'deco', True),
        ('dun_imped', 2, 'rubble', 'deco', True),
        ('c3_s03b.1', 2, 'belt', 'deco', True),              # coal conveyor
        ('c3_s03c.1', 2, 'panel', 'deco', True),             # steel panel
        ('c3_s03d', 2, 'lift', 'deco', True),                # the mine lift
    ]),
    'stark': (17, [
        ('brown', 2, 'floor', 'ground', False),              # volcanic ground
        ('@dark:brown', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('ckado', 2, 'floor-b', 'ground', False),
        ('magma', 2, 'magma', 'ground', False),
        ('criffp', 2, 'cliff', 'deco', True),                # dark cliff faces
        ('criffp2', 2, 'cliff-b', 'deco', True),
        ('criffp_mag', 2, 'cliff-magma', 'deco', True),
        ('dhole', 2, 'cave', 'deco', True),
        ('searock', 2, 'rock', 'deco', True),
        ('hanger', 2, 'rocks', 'deco', True),
        ('tree3_01', 1, 'palm', 'deco', True),
    ]),
    'ruins': (55, [
        ('dun_floor', 2, 'floor', 'ground', False),          # grey-green stone
        ('@dark:dun_floor', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('dun_floor2', 2, 'floor-b', 'ground', False),       # tan stone
        ('dun_step', 2, 'steps', 'ground', False),
        ('dun_hashi', 2, 'bridge', 'ground', False),
        ('dun_sea', 2, 'water', 'ground', False),
        ('dun_wall_n', 2, 'wall', 'deco', True),
        ('dun_wall_s', 2, 'wall-s', 'deco', True),
        ('dun_wall_e', 2, 'wall-e', 'deco', True),
        ('dun_wall_w', 2, 'wall-w', 'deco', True),
        ('dun_wall_c', 2, 'wall-c', 'deco', True),
        ('dun_dhole', 2, 'door', 'deco', True),
        ('dun_hanger', 2, 'rocks', 'deco', True),
        ('dun_level', 2, 'stairs', 'deco', True),
    ]),
    'vroad': (70, [
        ('dun_floor', 2, 'floor', 'ground', False),          # olive cave floor
        ('@dark:dun_floor', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('dun_floor2', 2, 'floor-b', 'ground', False),
        ('dun_step', 2, 'steps', 'ground', False),
        ('dun_hashi', 2, 'bridge', 'ground', False),
        ('dun_sea', 2, 'water', 'ground', False),
        ('dun_wall_n', 2, 'wall', 'deco', True),
        ('dun_wall_s', 2, 'wall-s', 'deco', True),
        ('dun_wall_e', 2, 'wall-e', 'deco', True),
        ('dun_wall_w', 2, 'wall-w', 'deco', True),
        ('dun_dhole', 2, 'door', 'deco', True),
        ('dun_hanger', 2, 'rocks', 'deco', True),
        ('dun_srock', 2, 'boulder', 'deco', True),
    ]),
    'coronet': (68, [
        ('dun_floor', 2, 'floor', 'ground', False),
        ('@dark:dun_floor', 1, 'dark', 'ground', False),           # the unlit rock beyond the walls
        ('dun_floor2', 2, 'floor-b', 'ground', False),
        ('dun_floor3', 2, 'floor-c', 'ground', False),
        ('dun_floor4', 2, 'floor-d', 'ground', False),
        ('dun_step', 2, 'steps', 'ground', False),
        ('dun_hashi', 2, 'bridge', 'ground', False),
        ('dun_sea', 2, 'water', 'ground', False),
        ('yuka_yellow.1', 2, 'pad-a', 'ground', False),
        ('yuka_yellow.5', 2, 'pad-b', 'ground', False),
        ('dun_wall_n', 2, 'wall', 'deco', True),
        ('dun_wall_s', 2, 'wall-s', 'deco', True),
        ('dun_wall_e', 2, 'wall-e', 'deco', True),
        ('dun_wall_w', 2, 'wall-w', 'deco', True),
        ('dun_wall_c', 2, 'wall-c', 'deco', True),
        ('dun_dhole', 2, 'door', 'deco', True),
        ('dun_hanger', 2, 'rocks', 'deco', True),
        ('dun_srock', 2, 'boulder', 'deco', True),
        ('dun_imped', 2, 'rubble', 'deco', True),
    ]),
}


def outline(img, shadow=True):
    """A one pixel dark outline around the opaque pixels (and a soft base
    shadow), so a column reads as a standing object on the floor."""
    w, h = img.size
    px = img.load()
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 0:
                o[x, y] = px[x, y]
                continue
            near = any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] > 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if near:
                o[x, y] = (60, 50, 30, 255)
    # darken the right edge of the opaque area for a little volume
    for y in range(h):
        row = [x for x in range(w) if o[x, y][3] > 0]
        if row:
            xr = max(row)
            r, g, b, a = o[xr, y]
            o[xr, y] = (r * 2 // 3, g * 2 // 3, b * 2 // 3, a)
            if xr - 1 >= 0 and o[xr - 1, y][3] > 0:
                r, g, b, a = o[xr - 1, y]
                o[xr - 1, y] = (r * 4 // 5, g * 4 // 5, b * 4 // 5, a)
    return out


def composite(name, by_name, d, t, palettes, tdo, cdo, cio, pal_data):
    get = lambda n: nsbtx.decode(d, t, by_name[n], nsbtx.palette_for(by_name[n], palettes), tdo, cdo, cio, pal_data)
    if name == '@pillar':
        cap, shaft = get('colum_b'), get('colum_a')
        img = Image.new('RGBA', (32, 96), (0, 0, 0, 0))
        # a narrower column: 24 px wide, centred
        shaft_n = shaft.resize((24, 32), Image.NEAREST)
        cap_n = cap.resize((28, 24), Image.NEAREST)
        img.paste(shaft_n, (4, 32))
        img.paste(shaft_n, (4, 64))
        img.paste(cap_n, (2, 10), cap_n)
        return outline(img)
    if name == '@dw-tree':
        img = get('tree_sbt01').crop((0, 0, 32, 64))
        return img
    if name.startswith('@dark:'):
        img = get(name[6:])
        img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
        px = img.load()
        for y in range(img.height):
            for x in range(img.width):
                r, g, b, a = px[x, y]
                px[x, y] = (int(r * 0.34), int(g * 0.34), int(b * 0.40), 255)
        return img
    if name == '@pillar-broken':
        shaft = get('colum_a').resize((24, 32), Image.NEAREST)
        img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        img.paste(shaft.crop((0, 8, 24, 32)), (4, 8))
        # jagged top
        px = img.load()
        for x in range(4, 28):
            for y in range(8, 8 + ((x * 7) % 5)):
                px[x, y] = (0, 0, 0, 0)
        return outline(img)
    raise KeyError(name)


def build():
    os.makedirs(OUT, exist_ok=True)
    manifest = {'sources': {}, 'tiles': []}
    for loc, (setno, specs) in LOCATIONS.items():
        path = os.path.join(SETS, f'map_texture_set_{setno:03d}.nsbtx')
        d, t, textures, palettes, tdo, cdo, cio, pal_data = nsbtx.parse(path)
        by_name = {x['name']: x for x in textures}
        cols = 8
        placed = []  # (tile id, image, w tiles, h tiles, kind, solid)
        for texname, scale, tid, kind, solid in specs:
            if texname.startswith('@'):
                img = composite(texname, by_name, d, t, palettes, tdo, cdo, cio, pal_data)
                placed.append((f'pt-{loc}-{tid}', img, img.width // TILE, img.height // TILE, kind, solid))
                continue
            tex = by_name.get(texname)
            if tex is None:
                print(f'!! {loc}: no texture {texname}', file=sys.stderr)
                continue
            img = nsbtx.decode(d, t, tex, nsbtx.palette_for(tex, palettes), tdo, cdo, cio, pal_data)
            if scale != 1:
                img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
            w = max(1, img.width // TILE)
            h = max(1, img.height // TILE)
            if img.width < TILE or img.height < TILE:  # tiny textures tile up to one cell
                tiled = Image.new('RGBA', (TILE, TILE))
                for y in range(0, TILE, img.height):
                    for x in range(0, TILE, img.width):
                        tiled.paste(img, (x, y))
                img = tiled
            placed.append((f'pt-{loc}-{tid}', img, w, h, kind, solid))
        # Pack: rows of tiles, each entry on its own rows if wider than the
        # remaining columns (simple shelf packing).
        shelves = []  # list of [y, x_used, height]
        sheet_h = 0
        entries = []
        for tid, img, w, h, kind, solid in placed:
            spot = None
            for s in shelves:
                if s[2] == h and s[1] + w <= cols:
                    spot = s
                    break
            if spot is None:
                spot = [sheet_h, 0, h]
                shelves.append(spot)
                sheet_h += h
            col, row = spot[1], spot[0]
            spot[1] += w
            entries.append((tid, img, col, row, w, h, kind, solid))
        sheet = Image.new('RGBA', (cols * TILE, sheet_h * TILE), (0, 0, 0, 0))
        src_name = f'pt-{loc}'
        for tid, img, col, row, w, h, kind, solid in entries:
            sheet.paste(img.crop((0, 0, w * TILE, h * TILE)), (col * TILE, row * TILE))
            manifest['tiles'].append({'id': tid, 'source': src_name, 'col': col, 'row': row, 'w': w, 'h': h, 'kind': kind, 'solid': solid})
        file = os.path.join(OUT, f'{src_name}.png')
        sheet.save(file)
        manifest['sources'][src_name] = {
            'file': os.path.relpath(file, ROOT),
            'artist': 'Game Freak (Pokémon Platinum map textures, via pret/pokeplatinum)',
            'description': f'Platinum texture set {setno:03d}, decoded by scripts/nsbtx.py and tiled by scripts/build-platinum-tiles.py',
        }
        print(f'{src_name}: {len(entries)} tiles, {sheet.size[0]}x{sheet.size[1]}')
    with open(os.path.join(OUT, 'platinum-tiles.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    build()
