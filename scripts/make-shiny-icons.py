#!/usr/bin/env python3
"""Shiny box icons for sprite folders that have shiny sheets but no shiny
portrait (the game cuts shiny icons from the shiny Normal portrait at boot;
without one it would fall back to the normal icon). The first down-facing
frame of the shiny Idle sheet is cropped to its pixels and fitted into
32x32 with nearest-neighbour scaling.

Written to public/assets/icons/<name>-shiny.png, named like the other icons
(0058-hisui -> 58-hisui-shiny.png). Run after fetch-sprites.py and before
build-sprite-index.mjs, which records `shinyIcon` per folder. Skips icons
that already exist.
"""
import os
import sys
import xml.etree.ElementTree as ET

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites')
PORTRAITS = os.path.join(ROOT, 'public', 'assets', 'portraits')
ICONS = os.path.join(ROOT, 'public', 'assets', 'icons')
SIZE = 32


def icon_name(folder):
    dex, _, form = folder.partition('-')
    return str(int(dex)) + (f'-{form}' if form else '')


def idle_frame_size(anim_xml):
    tree = ET.parse(anim_xml)
    for anim in tree.getroot().iter('Anim'):
        if anim.findtext('Name') == 'Idle':
            return int(anim.findtext('FrameWidth')), int(anim.findtext('FrameHeight'))
    return None


def main():
    made = 0
    for folder in sorted(os.listdir(SPRITES)):
        shiny_dir = os.path.join(SPRITES, folder, 'shiny')
        sheet = os.path.join(shiny_dir, 'Idle-Anim.png')
        anim = os.path.join(shiny_dir, 'AnimData.xml')
        if not (os.path.isfile(sheet) and os.path.isfile(anim)):
            continue
        if os.path.isfile(os.path.join(PORTRAITS, folder, 'shiny', 'Normal.png')):
            continue  # the game cuts the icon from the shiny portrait
        dest = os.path.join(ICONS, f'{icon_name(folder)}-shiny.png')
        if os.path.isfile(dest):
            continue
        size = idle_frame_size(anim)
        if not size:
            print(f'{folder}: no Idle animation in shiny AnimData.xml', file=sys.stderr)
            continue
        fw, fh = size
        im = Image.open(sheet).convert('RGBA')
        frame = im.crop((0, 0, fw, fh))  # first frame, first row: facing down
        box = frame.getbbox()
        if not box:
            print(f'{folder}: empty first frame', file=sys.stderr)
            continue
        frame = frame.crop(box)
        w, h = frame.size
        scale = min(SIZE / w, SIZE / h, 1)
        if scale < 1:
            frame = frame.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST)
        icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        icon.paste(frame, ((SIZE - frame.width) // 2, SIZE - frame.height - 2))
        icon.save(dest)
        made += 1
        print(f'{folder} -> icons/{os.path.basename(dest)} (from the shiny Idle sheet)')
    print(f'{made} shiny icons')


if __name__ == '__main__':
    main()
