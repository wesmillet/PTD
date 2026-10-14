#!/usr/bin/env python3
"""Read Nitro NARC archives and the 2D graphics inside them (NCLR palettes,
NCGR tile sets, NSCR tilemaps, LZ77-compressed or not), and render every
tilemap to PNG so the right screens can be picked out.

Usage: python3 scripts/narc.py <file.narc> <out dir>

Writes <out dir>/<index>-<kind>.png for each NSCR (rendered with the nearest
preceding NCGR and NCLR in the archive, which is how the games group them)
and a listing of every member. Used for Platinum's battle bottom screen
(res/prebuilt/battle/graphic/pl_batt_bg.narc in the decomp).
"""
import os
import struct
import sys

from PIL import Image


def u16(d, o):
    return struct.unpack_from('<H', d, o)[0]


def u32(d, o):
    return struct.unpack_from('<I', d, o)[0]


def lz_decompress(d):
    """Nitro LZ77 (type 0x10) and LZ11 (type 0x11)."""
    kind = d[0]
    size = u32(d, 0) >> 8
    out = bytearray()
    i = 4
    if kind == 0x10:
        while len(out) < size and i < len(d):
            flags = d[i]
            i += 1
            for b in range(8):
                if len(out) >= size or i >= len(d):
                    break
                if flags & (0x80 >> b):
                    n = (d[i] >> 4) + 3
                    disp = ((d[i] & 0xF) << 8 | d[i + 1]) + 1
                    i += 2
                    for _ in range(n):
                        out.append(out[-disp])
                else:
                    out.append(d[i])
                    i += 1
        return bytes(out)
    if kind == 0x11:
        while len(out) < size and i < len(d):
            flags = d[i]
            i += 1
            for b in range(8):
                if len(out) >= size or i >= len(d):
                    break
                if flags & (0x80 >> b):
                    b0 = d[i]
                    ind = b0 >> 4
                    if ind == 0:
                        n = (b0 << 4 | d[i + 1] >> 4) + 0x11
                        disp = ((d[i + 1] & 0xF) << 8 | d[i + 2]) + 1
                        i += 3
                    elif ind == 1:
                        n = ((b0 & 0xF) << 12 | d[i + 1] << 4 | d[i + 2] >> 4) + 0x111
                        disp = ((d[i + 2] & 0xF) << 8 | d[i + 3]) + 1
                        i += 4
                    else:
                        n = ind + 1
                        disp = ((b0 & 0xF) << 8 | d[i + 1]) + 1
                        i += 2
                    for _ in range(n):
                        out.append(out[-disp])
                else:
                    out.append(d[i])
                    i += 1
        return bytes(out)
    return d


def narc_files(d):
    assert d[:4] == b'NARC'
    o = 16
    assert d[o:o + 4] == b'BTAF'
    count = u16(d, o + 8)
    fat = [(u32(d, o + 12 + i * 8), u32(d, o + 16 + i * 8)) for i in range(count)]
    o += u32(d, o + 4)
    assert d[o:o + 4] == b'BTNF'
    o += u32(d, o + 4)
    assert d[o:o + 4] == b'GMIF'
    base = o + 8
    out = []
    for s, e in fat:
        f = d[base + s:base + e]
        if f[:1] in (b'\x10', b'\x11') and f[4:8] not in (b'RGCN', b'RLCN', b'RCSN'):
            f = lz_decompress(f)
        out.append(f)
    return out


def bgr555(v):
    r = (v & 31) << 3
    g = ((v >> 5) & 31) << 3
    b = ((v >> 10) & 31) << 3
    return (r | r >> 5, g | g >> 5, b | b >> 5)


def read_nclr(d):
    o = 16
    assert d[o:o + 4] == b'TTLP'
    depth = u32(d, o + 8)
    size = u32(d, o + 16)
    off = u32(d, o + 20)
    avail = len(d) - (o + off)
    cols = [bgr555(u16(d, o + off + i * 2)) for i in range(max(0, min(size, avail)) // 2)]
    return cols, depth


def read_ncgr(d):
    o = 16
    assert d[o:o + 4] == b'RAHC'
    h = u16(d, o + 8)
    w = u16(d, o + 10)
    depth = u32(d, o + 12)  # 3 = 4bpp, 4 = 8bpp
    linear = u32(d, o + 20)
    size = u32(d, o + 24)
    off = u32(d, o + 28)
    data = d[o + off:o + off + size]
    tiles = []
    if depth == 3:
        n = len(data) // 32
        for t in range(n):
            td = data[t * 32:(t + 1) * 32]
            tiles.append([(td[i // 2] >> ((i % 2) * 4)) & 15 for i in range(64)])
    else:
        n = len(data) // 64
        for t in range(n):
            tiles.append(list(data[t * 64:(t + 1) * 64]))
    return tiles, depth


def render_nscr(d, tiles, pal, depth):
    o = 16
    assert d[o:o + 4] == b'NRCS'
    w = u16(d, o + 8)
    h = u16(d, o + 10)
    dsize = u32(d, o + 16)
    data = d[o + 20:o + 20 + dsize]
    cols = w // 8
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    for i in range(len(data) // 2):
        e = u16(data, i * 2)
        ti = e & 0x3FF
        hf = (e >> 10) & 1
        vf = (e >> 11) & 1
        pn = (e >> 12) & 0xF
        if ti >= len(tiles):
            continue
        t = tiles[ti]
        tx = (i % cols) * 8
        ty = (i // cols) * 8
        for y in range(8):
            for x in range(8):
                v = t[(7 - y if vf else y) * 8 + (7 - x if hf else x)]
                if v == 0:
                    continue
                ci = (pn * 16 + v) if depth == 3 else v
                if ci < len(pal):
                    c = pal[ci]
                    px[tx + x, ty + y] = (c[0], c[1], c[2], 255)
    return img


def load(path):
    """-> list of (index, kind, parsed) for every member."""
    out = []
    for i, f in enumerate(narc_files(open(path, 'rb').read())):
        kind = f[:4]
        if kind == b'RLCN':
            out.append((i, 'NCLR', read_nclr(f)[0]))
        elif kind == b'RGCN':
            out.append((i, 'NCGR', read_ncgr(f)))
        elif kind == b'RCSN':
            out.append((i, 'NSCR', f))
        else:
            out.append((i, kind.decode('latin-1'), f))
    return out


def dump(path, out):
    """List the members; render every NSCR with the NCGR and NCLR named by
    NARC_PAIRS env (e.g. "1:0:171,2:0:171" = nscr:ncgr:nclr), or, without
    it, each NSCR with the nearest preceding NCGR and every NCLR (to find
    the right palette by eye)."""
    os.makedirs(out, exist_ok=True)
    members = load(path)
    by = {i: (k, v) for i, k, v in members}
    for i, k, v in members:
        print(i, k, len(v) if k == 'NCLR' else (len(v[0]) if k == 'NCGR' else len(v)))
    pairs = os.environ.get('NARC_PAIRS')
    if pairs:
        for p in pairs.split(','):
            a, b, c = [int(x) for x in p.split(':')]
            tiles, depth = by[b][1]
            img = render_nscr(by[a][1], tiles, by[c][1], depth)
            img.save(os.path.join(out, f'{a:03d}-nscr-{b:03d}-{c:03d}.png'))
            print('wrote', a, b, c, img.size)
        return
    pals = [(i, v) for i, k, v in members if k == 'NCLR']
    last_ncgr = None
    for i, k, v in members:
        if k == 'NCGR':
            last_ncgr = i
        if k == 'NSCR' and last_ncgr is not None:
            tiles, depth = by[last_ncgr][1]
            for pi, pal in pals[:16]:
                render_nscr(v, tiles, pal, depth).save(os.path.join(out, f'{i:03d}-nscr-{last_ncgr:03d}-{pi:03d}.png'))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    dump(sys.argv[1], sys.argv[2])
