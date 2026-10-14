#!/usr/bin/env python3
"""Convert Pokémon Platinum graphics from the pret/pokeplatinum decompilation
into game assets. Run scripts/fetch-platinum.sh first (sparse checkout into
$POKEPLATINUM_DIR, default /tmp/pokeplatinum).

Writes:
  public/assets/trainers/<class>.png          80x80 battle sprite, standing pose
  public/assets/trainers/<class>-pose.png     80x80 battle sprite, throwing pose
  public/assets/trainers/mugshots/<class>.png 96x64 VS mugshot (leaders, Elite
                                              Four, Champion, Frontier Brains)
  public/assets/trainers/banners/<class>.png  128x32 VS banner where one exists
  public/assets/trainers/overworld/<name>.png 32x32 frame sheets (one column)
  public/assets/trainers/vs.png, league-banner.png, enc-galactic.png,
                        enc-trainer-high.png, enc-trainer-low.png
  public/assets/trainers/index.json           what exists per trainer id
  public/assets/badges/<id>.png, <id>-off.png 64x64 Sinnoh badges
  public/assets/ui/gen4/types/<type>.png      32x16 type and category icons
  public/assets/ui/gen4/popups/<kind>.png     136x48 location banners
  public/assets/ui/gen4/frames/*.png          message box frames (keyed)
  public/assets/ui/gen4/sinnoh-map*.png       the Platinum town map, assembled
  public/assets/ui/gen4/map-markers.png       16x16 town and city markers

Palette index 0 is the transparent background in the decomp's indexed PNGs.
The town map tiles are 4bpp stored as an 'L' image with value (15-index)*17.
"""
import json
import os
import re
import shutil
import struct
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('POKEPLATINUM_DIR', '/tmp/pokeplatinum')
RES = os.path.join(SRC, 'res')
OUT = os.path.join(ROOT, 'public', 'assets')

if not os.path.isdir(RES):
    sys.exit(f'{RES} not found; run scripts/fetch-platinum.sh first')


def keyed(path, transparent=0):
    """Indexed PNG -> RGBA with palette index `transparent` cleared."""
    im = Image.open(path)
    if im.mode != 'P':
        return im.convert('RGBA')
    pal = im.getpalette()
    px = im.load()
    w, h = im.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    o = out.load()
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            if v == transparent:
                continue
            o[x, y] = (pal[v * 3], pal[v * 3 + 1], pal[v * 3 + 2], 255)
    return out


def slug(name):
    return name.replace('_', '-')


def ensure(path):
    os.makedirs(path, exist_ok=True)
    return path


# ---------------------------------------------------------------- trainers
TRAINER_NAMES = {
    'leader_roark': ('Roark', 'Gym Leader', 'roark'),
    'leader_gardenia': ('Gardenia', 'Gym Leader', 'gardenia'),
    'leader_fantina': ('Fantina', 'Gym Leader', 'fantina'),
    'leader_maylene': ('Maylene', 'Gym Leader', 'maylene'),
    'leader_wake': ('Crasher Wake', 'Gym Leader', 'crasher_wake'),
    'leader_byron': ('Byron', 'Gym Leader', 'byron'),
    'leader_candice': ('Candice', 'Gym Leader', 'candice'),
    'leader_volkner': ('Volkner', 'Gym Leader', 'volkner'),
    'elite_four_aaron': ('Aaron', 'Elite Four', 'aaron'),
    'elite_four_bertha': ('Bertha', 'Elite Four', 'bertha'),
    'elite_four_flint': ('Flint', 'Elite Four', 'flint'),
    'elite_four_lucian': ('Lucian', 'Elite Four', 'lucian'),
    'champion_cynthia': ('Cynthia', 'Champion', 'cynthia'),
    'galactic_boss': ('Cyrus', 'Galactic Boss', 'cyrus'),
    'commander_mars': ('Mars', 'Commander', 'mars'),
    'commander_jupiter': ('Jupiter', 'Commander', 'jupiter'),
    'commander_saturn': ('Saturn', 'Commander', 'saturn'),
    'galactic_grunt_male': ('Galactic Grunt', 'Galactic Grunt', 'grunt_m'),
    'galactic_grunt_female': ('Galactic Grunt', 'Galactic Grunt', 'grunt_f'),
    'rival': ('Barry', 'Rival', 'barry'),
    'player_male': ('Lucas', 'Pokémon Trainer', None),
    'player_female': ('Dawn', 'Pokémon Trainer', None),
    'trainer_riley': ('Riley', 'Pokémon Trainer', 'riley'),
    'trainer_cheryl': ('Cheryl', 'Pokémon Trainer', 'cheryl'),
    'trainer_mira': ('Mira', 'Pokémon Trainer', 'mira'),
    'trainer_marley': ('Marley', 'Pokémon Trainer', 'marley'),
    'trainer_buck': ('Buck', 'Pokémon Trainer', 'buck'),
    'tower_tycoon': ('Palmer', 'Tower Tycoon', 'palmer'),
    'arcade_star': ('Dahlia', 'Arcade Star', 'dahlia'),
    'castle_valet': ('Darach', 'Castle Valet', 'darach'),
    'factory_head': ('Thorton', 'Factory Head', 'thorton'),
    'hall_matron': ('Argenta', 'Hall Matron', 'argenta'),
}

# Overworld sheets that match a trainer class but under another file name.
OVERWORLD_ALIASES = {'prof_rowan': 'rowan', 'crasher_wake': 'wake'}


def build_trainers():
    tdir = ensure(os.path.join(OUT, 'trainers'))
    mdir = ensure(os.path.join(tdir, 'mugshots'))
    bdir = ensure(os.path.join(tdir, 'banners'))
    odir = ensure(os.path.join(tdir, 'overworld'))
    index = {}
    classes = os.path.join(RES, 'trainers', 'classes')
    for cls in sorted(os.listdir(classes)):
        front = os.path.join(classes, cls, 'front_scan.png')
        if not os.path.isfile(front):
            continue
        sheet = keyed(front)
        w, h = sheet.size
        poses = w // 80
        sid = slug(cls)
        sheet.crop((0, 0, 80, h)).save(os.path.join(tdir, f'{sid}.png'))
        entry = {'poses': 1, 'mugshot': False, 'banner': False, 'overworld': None}
        if poses > 1:
            sheet.crop((80, 0, 160, h)).save(os.path.join(tdir, f'{sid}-pose.png'))
            entry['poses'] = 2
        mug = os.path.join(classes, cls, 'mugshot.png')
        if os.path.isfile(mug):
            keyed(mug).save(os.path.join(mdir, f'{sid}.png'))
            entry['mugshot'] = True
        ban = os.path.join(classes, cls, 'banner.png')
        if os.path.isfile(ban):
            keyed(ban).save(os.path.join(bdir, f'{sid}.png'))
            entry['banner'] = True
        name, klass, ow = TRAINER_NAMES.get(cls, (None, None, None))
        if name is None:
            name = ' '.join(p.capitalize() for p in cls.split('_'))
            klass = name
            ow = cls
        entry['name'] = name
        entry['class'] = klass
        entry['overworld'] = ow
        index[sid] = entry

    # Overworld sheets: NPCs and the two protagonists.
    for sub in ('npc', 'player'):
        src = os.path.join(RES, 'graphics', 'field_sprites', sub)
        for f in sorted(os.listdir(src)):
            if not f.endswith('.png'):
                continue
            keyed(os.path.join(src, f)).save(os.path.join(odir, f))
    for sid, entry in index.items():
        ow = entry['overworld']
        if ow and not os.path.isfile(os.path.join(odir, f'{ow}.png')):
            alt = OVERWORLD_ALIASES.get(ow)
            entry['overworld'] = alt if alt and os.path.isfile(os.path.join(odir, f'{alt}.png')) else None
    index['player-male']['overworld'] = 'player_m'
    index['player-female']['overworld'] = 'player_f'

    shared = os.path.join(classes, '.shared')
    for src, dst in (('vs.png', 'vs.png'), ('league_banner.png', 'league-banner.png'),
                     ('enc_galactic.png', 'enc-galactic.png'), ('enc_trainer_high.png', 'enc-trainer-high.png'),
                     ('enc_trainer_low.png', 'enc-trainer-low.png')):
        keyed(os.path.join(shared, src)).save(os.path.join(tdir, dst))

    # Ids the level data already uses.
    for alias, target in (('rival-barry', 'rival'), ('youngster-tristan', 'youngster')):
        shutil.copyfile(os.path.join(tdir, f'{target}.png'), os.path.join(tdir, f'{alias}.png'))
        index[alias] = dict(index[target], alias_of=target)

    with open(os.path.join(tdir, 'index.json'), 'w') as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
        f.write('\n')
    with open(os.path.join(tdir, 'CREDITS.txt'), 'w') as f:
        f.write(CREDITS)
    print(f'trainers: {len(index)} ids, overworld sheets in {odir}')


# ---------------------------------------------------------------- badges
BADGES = ['coal', 'forest', 'cobble', 'fen', 'relic', 'mine', 'icicle', 'beacon']


def build_badges():
    bdir = ensure(os.path.join(OUT, 'badges'))
    sheet = Image.open(os.path.join(RES, 'graphics', 'trainer_case', 'badge_case_sprites.png')).convert('RGBA')
    # 64x64 cells separated by a one pixel black row.
    for i, bid in enumerate(BADGES):
        cell = sheet.crop((0, i * 65, 64, i * 65 + 64))
        bg = cell.getpixel((0, 0))
        px = cell.load()
        off = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        opx = off.load()
        for y in range(64):
            for x in range(64):
                r, g, b, a = px[x, y]
                if (r, g, b, a) == bg:
                    px[x, y] = (0, 0, 0, 0)
                    continue
                grey = int(0.3 * r + 0.59 * g + 0.11 * b)
                grey = int(grey * 0.55 + 40)
                opx[x, y] = (grey, grey, grey, 255)
        cell.save(os.path.join(bdir, f'{bid}.png'))
        off.save(os.path.join(bdir, f'{bid}-off.png'))
    print(f'badges: {len(BADGES)}')


# ---------------------------------------------------------------- ui pieces
def build_ui():
    ui = ensure(os.path.join(OUT, 'ui', 'gen4'))
    tdir = ensure(os.path.join(ui, 'types'))
    src = os.path.join(RES, 'graphics', 'battle', 'type_icons')
    n = 0
    for f in sorted(os.listdir(src)):
        if f.endswith('.png'):
            keyed(os.path.join(src, f)).save(os.path.join(tdir, f))
            n += 1
    pdir = ensure(os.path.join(ui, 'popups'))
    src = os.path.join(RES, 'graphics', 'map_popups')
    for f in sorted(os.listdir(src)):
        if f.endswith('_popup.png'):
            keyed(os.path.join(src, f)).save(os.path.join(pdir, f.replace('_popup', '')))
    fdir = ensure(os.path.join(ui, 'frames'))
    src = os.path.join(RES, 'graphics', 'windows')
    for f in sorted(os.listdir(src)):
        if re.match(r'message_box_\d\d\.png$', f) or f in ('standard_field.png', 'standard_system.png'):
            keyed(os.path.join(src, f)).save(os.path.join(fdir, slug(f)))
    print(f'ui: {n} type icons, popups, frames')


# ---------------------------------------------------------------- town map
def load_pal(path):
    lines = open(path, encoding='latin-1').read().split('\n')
    count = int(lines[2])
    return [tuple(int(v) for v in ln.split()) for ln in lines[3:3 + count]]


def load_tiles(path):
    im = Image.open(path)
    w, h = im.size
    px = [15 - v // 17 for v in im.getdata()]
    tiles = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            tiles.append([px[(ty * 8 + y) * w + tx * 8 + x] for y in range(8) for x in range(8)])
    return tiles


def render_nscr(path, tiles, pal, transparent0, bg=None):
    d = open(path, 'rb').read()
    assert d[:4] == b'RCSN' and d[16:20] == b'NRCS', path
    _size, w, h, _pad, dsize = struct.unpack('<IHHII', d[20:36])
    data = d[36:36 + dsize]
    cols = w // 8
    out = bg.copy() if bg is not None else Image.new('RGBA', (w, h), (0, 0, 0, 0))
    pix = out.load()
    for i in range(len(data) // 2):
        e = struct.unpack_from('<H', data, i * 2)[0]
        tile = tiles[e & 0x3FF]
        hf = (e >> 10) & 1
        vf = (e >> 11) & 1
        pn = (e >> 12) & 0xF
        tx = (i % cols) * 8
        ty = (i // cols) * 8
        for y in range(8):
            for x in range(8):
                v = tile[(7 - y if vf else y) * 8 + (7 - x if hf else x)]
                if v == 0 and transparent0:
                    continue
                c = pal[pn * 16 + v]
                pix[tx + x, ty + y] = (c[0], c[1], c[2], 255)
    return out


def build_town_map():
    ui = ensure(os.path.join(OUT, 'ui', 'gen4'))
    base = os.path.join(RES, 'graphics', 'town_map')
    pal = load_pal(os.path.join(base, 'top_screen_map.pal'))
    tiles = load_tiles(os.path.join(base, 'top_screen_map_tiles.png'))
    bg = render_nscr(os.path.join(base, 'top_screen_region_bg_tilemap.NSCR'), tiles, pal, False)
    routes = render_nscr(os.path.join(base, 'top_screen_region_map_tilemap.NSCR'), tiles, pal, True)
    full = render_nscr(os.path.join(base, 'top_screen_region_map_tilemap.NSCR'), tiles, pal, True, bg)
    bg.save(os.path.join(ui, 'sinnoh-map-land.png'))
    routes.save(os.path.join(ui, 'sinnoh-map-routes.png'))
    full.save(os.path.join(ui, 'sinnoh-map.png'))
    keyed(os.path.join(base, 'fly_destination_blocks.png')).save(os.path.join(ui, 'map-markers.png'))
    print('town map: sinnoh-map.png 256x192 (+ land and routes layers), map-markers.png')


CREDITS = """Pokémon Platinum trainer art, badges and interface graphics.
Original art by Game Freak / The Pokémon Company / Nintendo, taken from the
pret/pokeplatinum decompilation project (https://github.com/pret/pokeplatinum),
which stores the game's graphics as indexed PNGs and NDS tilemaps.
Converted by scripts/build-platinum.py (background keyed out, town map
tilemap reassembled). Non-commercial fan project use only.

trainers/<class>.png        battle sprite, standing pose (80x80)
trainers/<class>-pose.png   battle sprite, throwing pose
trainers/mugshots/          VS screen mugshots (96x64)
trainers/banners/           VS screen class banners
trainers/overworld/         walking sprite sheets (32x32 frames, one column)
trainers/index.json         names, classes and which files exist per id
badges/                     the eight Sinnoh badges (64x64) and greyed copies
ui/gen4/types/              type and move category icons (32x16)
ui/gen4/popups/             location name banners
ui/gen4/frames/             message box frames
ui/gen4/sinnoh-map.png      the Platinum town map (256x192)
"""

if __name__ == '__main__':
    build_trainers()
    build_badges()
    build_ui()
    build_town_map()
