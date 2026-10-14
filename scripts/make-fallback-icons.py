#!/usr/bin/env python3
"""Box icons for sprite folders that PokeAPI has no Gen 5 or Gen 8 icon for
(species after 898, Hisuian forms, Shadow and Primal forms): the PMDCollab
Normal portrait scaled to 32x32.

Icon file names follow public/assets/sprites folder names without the zero
padding: 0900 -> 900.png, 0058-hisui -> 58-hisui.png. Run after
fetch-sprites.py and fetch-icons.sh; skips icons that already exist.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites')
PORTRAITS = os.path.join(ROOT, 'public', 'assets', 'portraits')
ICONS = os.path.join(ROOT, 'public', 'assets', 'icons')


def icon_name(folder):
    dex, _, form = folder.partition('-')
    return str(int(dex)) + (f'-{form}' if form else '')


def main():
    made = 0
    for folder in sorted(os.listdir(SPRITES)):
        if not os.path.isdir(os.path.join(SPRITES, folder)):
            continue
        name = icon_name(folder)
        dest = os.path.join(ICONS, f'{name}.png')
        if os.path.isfile(dest):
            continue
        portrait = os.path.join(PORTRAITS, folder, 'Normal.png')
        if not os.path.isfile(portrait):
            print(f'no portrait for {folder}; no icon made', file=sys.stderr)
            continue
        im = Image.open(portrait).convert('RGBA')
        im = im.resize((32, 32), Image.LANCZOS)
        im.save(dest)
        made += 1
        print(f'{folder} -> icons/{name}.png (from portrait)')
    print(f'{made} fallback icons')


if __name__ == '__main__':
    main()
