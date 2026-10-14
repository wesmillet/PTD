#!/usr/bin/env python3
"""Read Nitro NSBTX texture sets (the .nsbtx files the Platinum decomp keeps
under res/field/maps/texture_sets/) and export every texture as a PNG.

Usage: python3 scripts/nsbtx.py <file.nsbtx> <out dir>

Formats handled: A3I5, 4-colour, 16-colour, 256-colour, 4x4 texel
compressed, A5I3 and direct colour. A texture is paired with the palette of
the same name, then "<name>_pl", then the first palette whose name starts
with the texture's name, else the first palette.
"""
import os
import struct
import sys

from PIL import Image


def u8(d, o):
    return d[o]


def u16(d, o):
    return struct.unpack_from('<H', d, o)[0]


def u32(d, o):
    return struct.unpack_from('<I', d, o)[0]


def bgr555(v):
    r = (v & 31) << 3
    g = ((v >> 5) & 31) << 3
    b = ((v >> 10) & 31) << 3
    return (r | r >> 5, g | g >> 5, b | b >> 5)


def read_dict(d, base, entry_size):
    """Nitro '3D info' dictionary at `base`: names and entry bytes."""
    num = u8(d, base + 1)
    o = base + 4
    # unknown block: u16 header size, u16 data size, u32 const, num * 4 bytes
    o += 8 + num * 4
    size = u16(d, o)
    o += 4
    entries = [d[o + i * size: o + (i + 1) * size] for i in range(num)]
    o += num * size
    names = [d[o + i * 16: o + (i + 1) * 16].split(b'\0')[0].decode('ascii', 'replace') for i in range(num)]
    return list(zip(names, entries))


def parse(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'BTX0', 'not an NSBTX file'
    nblocks = u16(d, 14)
    offs = [u32(d, 16 + 4 * i) for i in range(nblocks)]
    tex0 = next(o for o in offs if d[o:o + 4] == b'TEX0')
    t = tex0
    tex_info_off = u16(d, t + 0x0E)
    tex_data_off = u32(d, t + 0x14)
    ctex_info_off = u16(d, t + 0x1E)
    ctex_data_off = u32(d, t + 0x24)
    ctex_idx_off = u32(d, t + 0x28)
    pal_info_off = u16(d, t + 0x34)
    pal_data_off = u32(d, t + 0x38)

    textures = []
    for name, e in read_dict(d, t + tex_info_off, 8):
        off = u16(e, 0) << 3
        params = u16(e, 2)
        width = 8 << ((params >> 4) & 7)
        height = 8 << ((params >> 7) & 7)
        fmt = (params >> 10) & 7
        color0 = (params >> 13) & 1
        textures.append({'name': name, 'offset': off, 'width': width, 'height': height, 'format': fmt, 'color0': color0})
    palettes = []
    for name, e in read_dict(d, t + pal_info_off, 4):
        palettes.append({'name': name, 'offset': u16(e, 0) << 3})
    pal_data = d[t + pal_data_off:]
    return d, t, textures, palettes, tex_data_off, ctex_data_off, ctex_idx_off, pal_data


def palette_for(tex, palettes):
    n = tex['name']
    for p in palettes:
        if p['name'] == n:
            return p
    for p in palettes:
        if p['name'] == n + '_pl':
            return p
    for p in palettes:
        if p['name'].startswith(n) or n.startswith(p['name']):
            return p
    return palettes[0] if palettes else None


def decode(d, t, tex, pal, tex_data_off, ctex_data_off, ctex_idx_off, pal_data):
    w, h, fmt = tex['width'], tex['height'], tex['format']
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    px = img.load()
    pcol = lambda i: bgr555(u16(pal_data, pal['offset'] + i * 2)) if pal and pal['offset'] + i * 2 + 1 < len(pal_data) else (255, 0, 255)
    if fmt == 5:
        base = t + ctex_data_off + tex['offset']
        idx_base = t + ctex_idx_off + tex['offset'] // 2
        bw = w // 4
        for by in range(h // 4):
            for bx in range(bw):
                i = by * bw + bx
                block = u32(d, base + i * 4)
                pidx = u16(d, idx_base + i * 2)
                mode = pidx >> 14
                poff = (pidx & 0x3FFF) * 4
                c = [bgr555(u16(pal_data, pal['offset'] + poff + k * 2)) if pal['offset'] + poff + k * 2 + 1 < len(pal_data) else (255, 0, 255) for k in range(4)]
                cols = [None] * 4
                cols[0] = c[0] + (255,)
                cols[1] = c[1] + (255,)
                if mode == 0:
                    cols[2] = c[2] + (255,)
                    cols[3] = (0, 0, 0, 0)
                elif mode == 1:
                    cols[2] = tuple((a + b) // 2 for a, b in zip(c[0], c[1])) + (255,)
                    cols[3] = (0, 0, 0, 0)
                elif mode == 2:
                    cols[2] = c[2] + (255,)
                    cols[3] = c[3] + (255,)
                else:
                    cols[2] = tuple((a * 5 + b * 3) // 8 for a, b in zip(c[0], c[1])) + (255,)
                    cols[3] = tuple((a * 3 + b * 5) // 8 for a, b in zip(c[0], c[1])) + (255,)
                for y in range(4):
                    row = (block >> (y * 8)) & 0xFF
                    for x in range(4):
                        px[bx * 4 + x, by * 4 + y] = cols[(row >> (x * 2)) & 3]
        return img
    base = t + tex_data_off + tex['offset']
    n = w * h
    for i in range(n):
        x, y = i % w, i // w
        if fmt == 1:
            v = d[base + i]
            ci, a = v & 31, (v >> 5) * 36
            px[x, y] = pcol(ci) + (a,)
        elif fmt == 2:
            v = (d[base + i // 4] >> ((i % 4) * 2)) & 3
            px[x, y] = pcol(v) + (0 if (v == 0 and tex['color0']) else 255,)
        elif fmt == 3:
            v = (d[base + i // 2] >> ((i % 2) * 4)) & 15
            px[x, y] = pcol(v) + (0 if (v == 0 and tex['color0']) else 255,)
        elif fmt == 4:
            v = d[base + i]
            px[x, y] = pcol(v) + (0 if (v == 0 and tex['color0']) else 255,)
        elif fmt == 6:
            v = d[base + i]
            ci, a = v & 7, (v >> 3) * 8
            px[x, y] = pcol(ci) + (min(255, a + a // 31),)
        elif fmt == 7:
            v = u16(d, base + i * 2)
            px[x, y] = bgr555(v) + (255 if v & 0x8000 else 0,)
    return img


def export(path, out):
    os.makedirs(out, exist_ok=True)
    d, t, textures, palettes, tdo, cdo, cio, pal_data = parse(path)
    done = []
    for tex in textures:
        pal = palette_for(tex, palettes)
        if pal is None and tex['format'] != 7:
            continue
        img = decode(d, t, tex, pal, tdo, cdo, cio, pal_data)
        img.save(os.path.join(out, f"{tex['name']}.png"))
        done.append((tex['name'], tex['width'], tex['height'], tex['format'], pal['name'] if pal else '-'))
    return done


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    for row in export(sys.argv[1], sys.argv[2]):
        print(*row)
