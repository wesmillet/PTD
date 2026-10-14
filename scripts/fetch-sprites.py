#!/usr/bin/env python3
"""Fetch PMDCollab SpriteCollab sprites (base forms, alternate forms and
their shinies) with a sparse checkout, copying only the sheets the game uses.

Usage:
  python3 scripts/fetch-sprites.py 0058 0058:Hisui 0150:Shadow 0487:Origin
  python3 scripts/fetch-sprites.py --list scripts/sprite-list.txt
  python3 scripts/fetch-sprites.py --trim      # trim folders already shipped

A spec is a four digit dex number with an optional ":Form" suffix naming a
tracker.json subgroup (Hisui, Mega, Origin, Sky, Shadow, Alola, Galar...).
Forms land in public/assets/sprites/<dex>-<form-slug>/ (e.g. 0058-hisui),
base forms in public/assets/sprites/<dex>/. Each folder gets AnimData.xml,
credits.txt and the Anim and Shadow sheets for Idle, Walk, Attack, Shoot (the
ranged attack, for special moves), Hurt and Faint (following CopyOf), plus a shiny/ subfolder when SpriteCollab has one
and the five portraits the game uses under public/assets/portraits/<folder>/
(shiny portraits, when drawn, under public/assets/portraits/<folder>/shiny/).

Never clones the whole repo: tracker.json is fetched first, then exactly the
files needed. Then run `node scripts/build-sprite-index.mjs`.
"""
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.environ.get('SPRITECOLLAB_DIR', '/tmp/spritecollab')
REPO = 'https://github.com/PMDCollab/SpriteCollab'
ACTIONS = ['Idle', 'Walk', 'Attack', 'Shoot', 'Hurt', 'Faint']
PORTRAITS = ['Normal', 'Happy', 'Sad', 'Angry', 'Surprised']
SPRITES = os.path.join(ROOT, 'public', 'assets', 'sprites')
PORTRAIT_DIR = os.path.join(ROOT, 'public', 'assets', 'portraits')


def git(*args, check=True):
    return subprocess.run(['git', *args], cwd=WORK, check=check, capture_output=True, text=True)


def ensure_repo():
    if not os.path.isdir(os.path.join(WORK, '.git')):
        subprocess.run(['git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO, WORK],
                       check=True, env={**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'})
    git('sparse-checkout', 'set', '--no-cone', '/tracker.json', '/sprite_config.json', '/credit_names.txt')


def sparse_add(patterns):
    """Add patterns in chunks (git reads them from stdin)."""
    current = git('sparse-checkout', 'list').stdout.split('\n')
    wanted = sorted(set(p for p in current + patterns if p))
    proc = subprocess.run(['git', 'sparse-checkout', 'set', '--no-cone', '--stdin'], cwd=WORK,
                          input='\n'.join(wanted) + '\n', check=True, capture_output=True, text=True)
    return proc


def slugify(name):
    return name.lower().replace('_', '-').replace(' ', '-')


def resolve(tracker, dex, form):
    """-> (node, path list) for the form (None = base)."""
    node = tracker.get(dex)
    if node is None:
        return None, None
    if form is None:
        return node, []

    def rec(n, path):
        for key, sub in n.get('subgroups', {}).items():
            if sub.get('name', '').lower() == form.lower():
                return sub, path + [key]
            found = rec(sub, path + [key])
            if found:
                return found
        return None

    found = rec(node, [])
    return found if found else (None, None)


def shiny_path(node):
    """Relative path of the Shiny subgroup under a form node, if drawn."""
    for key, sub in node.get('subgroups', {}).items():
        if sub.get('name') == 'Shiny' and sub.get('sprite_complete', 0) > 0:
            return [key]
        for key2, sub2 in sub.get('subgroups', {}).items():
            if sub2.get('name') == 'Shiny' and sub2.get('sprite_complete', 0) > 0:
                return [key, key2]
    return None


def sheets_for(animdata_path):
    """Sheet names the five actions need, following CopyOf."""
    root = ET.parse(animdata_path).getroot()
    copy = {}
    present = set()
    for anim in root.iter('Anim'):
        name = anim.findtext('Name')
        present.add(name)
        c = anim.findtext('CopyOf')
        if c:
            copy[name] = c
    out = []
    for action in ACTIONS:
        if action not in present:
            continue
        sheet = action
        seen = set()
        while sheet in copy and sheet not in seen:
            seen.add(sheet)
            sheet = copy[sheet]
        if sheet not in out:
            out.append(sheet)
    return out


def prune_animdata(folder):
    """Drop <Anim> entries whose sheet is not in the folder, so the loader
    never asks for a file that was not drawn (or not shipped)."""
    path = os.path.join(folder, 'AnimData.xml')
    first = open(path, encoding='utf-8').readline()
    tree = ET.parse(path)
    root = tree.getroot()
    anims = root.find('Anims')
    if anims is None:
        return
    copy = {a.findtext('Name'): a.findtext('CopyOf') for a in anims.findall('Anim')}
    for a in list(anims.findall('Anim')):
        sheet = a.findtext('Name')
        seen = set()
        while copy.get(sheet) and sheet not in seen:
            seen.add(sheet)
            sheet = copy[sheet]
        if not os.path.isfile(os.path.join(folder, f'{sheet}-Anim.png')):
            anims.remove(a)
    body = ET.tostring(root, encoding='unicode')
    with open(path, 'w', encoding='utf-8') as f:
        if first.startswith('<?xml'):
            f.write(first if first.endswith('\n') else first + '\n')
        f.write(body + '\n')


def copy_folder(src_rel, dest):
    """Copy a trimmed sprite folder from the checkout."""
    src = os.path.join(WORK, src_rel)
    anim = os.path.join(src, 'AnimData.xml')
    if not os.path.isfile(anim):
        return False
    os.makedirs(dest, exist_ok=True)
    shutil.copyfile(anim, os.path.join(dest, 'AnimData.xml'))
    cred = os.path.join(src, 'credits.txt')
    if os.path.isfile(cred):
        shutil.copyfile(cred, os.path.join(dest, 'credits.txt'))
    for sheet in sheets_for(anim):
        for kind in ('Anim', 'Shadow'):
            f = f'{sheet}-{kind}.png'
            if os.path.isfile(os.path.join(src, f)):
                shutil.copyfile(os.path.join(src, f), os.path.join(dest, f))
    prune_animdata(dest)
    return True


def trim_folder(folder):
    anim = os.path.join(folder, 'AnimData.xml')
    if not os.path.isfile(anim):
        return 0
    keep = {'AnimData.xml', 'credits.txt'}
    for sheet in sheets_for(anim):
        keep.add(f'{sheet}-Anim.png')
        keep.add(f'{sheet}-Shadow.png')
    removed = 0
    for f in os.listdir(folder):
        p = os.path.join(folder, f)
        if os.path.isfile(p) and f not in keep:
            os.remove(p)
            removed += 1
    prune_animdata(folder)
    return removed


def main(argv):
    if '--trim' in argv:
        total = 0
        for d in sorted(os.listdir(SPRITES)):
            base = os.path.join(SPRITES, d)
            if not os.path.isdir(base):
                continue
            total += trim_folder(base)
            shiny = os.path.join(base, 'shiny')
            if os.path.isdir(shiny):
                total += trim_folder(shiny)
        print(f'trimmed {total} unused files')
        return

    specs = []
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == '--list':
            with open(args.pop(0)) as f:
                for line in f:
                    line = line.split('#', 1)[0].strip()
                    if line:
                        specs.append(line)
        else:
            specs.append(a)
    if not specs:
        sys.exit(__doc__)

    ensure_repo()
    tracker = json.load(open(os.path.join(WORK, 'tracker.json')))

    targets = []
    for spec in specs:
        dex, _, form = spec.partition(':')
        dex = dex.zfill(4)
        form = form or None
        node, path = resolve(tracker, dex, form)
        if node is None:
            print(f'!! {spec}: not in tracker.json', file=sys.stderr)
            continue
        if node.get('sprite_complete', 0) == 0:
            print(f'!! {spec}: no sprites drawn yet', file=sys.stderr)
            continue
        folder = dex if form is None else f'{dex}-{slugify(form)}'
        sprite_rel = '/'.join(['sprite', dex] + path)
        portrait_rel = '/'.join(['portrait', dex] + path)
        shiny = shiny_path(node)
        targets.append((spec, folder, sprite_rel, portrait_rel, shiny, dex))

    # Phase 1: AnimData.xml for every target (and shiny), to learn the sheets.
    pats = []
    for _, _, sprite_rel, _, shiny, _ in targets:
        pats.append(f'/{sprite_rel}/AnimData.xml')
        if shiny:
            pats.append(f'/{sprite_rel}/{"/".join(shiny)}/AnimData.xml')
    sparse_add(pats)

    # Phase 2: exactly the sheets, credits and portraits.
    pats = []
    for _, _, sprite_rel, portrait_rel, shiny, dex in targets:
        for rel in [sprite_rel] + ([f'{sprite_rel}/{"/".join(shiny)}'] if shiny else []):
            anim = os.path.join(WORK, rel, 'AnimData.xml')
            if not os.path.isfile(anim):
                continue
            pats.append(f'/{rel}/credits.txt')
            for sheet in sheets_for(anim):
                pats.append(f'/{rel}/{sheet}-Anim.png')
                pats.append(f'/{rel}/{sheet}-Shadow.png')
        for emotion in PORTRAITS:
            pats.append(f'/{portrait_rel}/{emotion}.png')
            pats.append(f'/portrait/{dex}/{emotion}.png')
            if shiny:
                pats.append(f'/{portrait_rel}/{"/".join(shiny)}/{emotion}.png')
        pats.append(f'/{portrait_rel}/credits.txt')
        pats.append(f'/portrait/{dex}/credits.txt')
        if shiny:
            pats.append(f'/{portrait_rel}/{"/".join(shiny)}/credits.txt')
    sparse_add(pats)

    for spec, folder, sprite_rel, portrait_rel, shiny, dex in targets:
        dest = os.path.join(SPRITES, folder)
        if not copy_folder(sprite_rel, dest):
            print(f'!! {spec}: AnimData.xml missing after checkout', file=sys.stderr)
            continue
        msg = f'{spec} -> sprites/{folder}'
        if shiny and copy_folder(f'{sprite_rel}/{"/".join(shiny)}', os.path.join(dest, 'shiny')):
            msg += ' (+shiny)'
        pdest = os.path.join(PORTRAIT_DIR, folder)
        got = 0
        for emotion in PORTRAITS:
            src = os.path.join(WORK, portrait_rel, f'{emotion}.png')
            if not os.path.isfile(src):
                src = os.path.join(WORK, 'portrait', dex, f'{emotion}.png')
            if os.path.isfile(src):
                os.makedirs(pdest, exist_ok=True)
                shutil.copyfile(src, os.path.join(pdest, f'{emotion}.png'))
                got += 1
        cred = os.path.join(WORK, portrait_rel, 'credits.txt')
        if got and os.path.isfile(cred):
            shutil.copyfile(cred, os.path.join(pdest, 'credits.txt'))
        # Shiny portraits (same emotions) under portraits/<folder>/shiny/.
        shiny_got = 0
        if shiny:
            sdir = os.path.join(WORK, portrait_rel, '/'.join(shiny))
            for emotion in PORTRAITS:
                src = os.path.join(sdir, f'{emotion}.png')
                if os.path.isfile(src):
                    os.makedirs(os.path.join(pdest, 'shiny'), exist_ok=True)
                    shutil.copyfile(src, os.path.join(pdest, 'shiny', f'{emotion}.png'))
                    shiny_got += 1
            scred = os.path.join(sdir, 'credits.txt')
            if shiny_got and os.path.isfile(scred):
                shutil.copyfile(scred, os.path.join(pdest, 'shiny', 'credits.txt'))
        print(f'{msg}, {got} portraits' + (f', {shiny_got} shiny portraits' if shiny_got else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
