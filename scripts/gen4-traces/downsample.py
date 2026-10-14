import json, re, sys
from collections import Counter
from pathlib import Path
d = json.load(open(Path(__file__).resolve().parent / 'traces.json'))

def dec(rle):
    return [''.join(ch * (int(n) if n else 1) for n, ch in re.findall(r'(\d*)(\D)', r)) for r in rle.split('|')]

def clean(rows):
    g = [list(r) for r in rows]
    H, W = len(g), len(g[0])
    for y in range(H):
        for x in range(W):
            if g[y][x] in 'g.':
                n = [g[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < W and 0 <= y + dy < H]
                if n.count('T') >= 3 or (g[y][x] == 'g' and n.count('T') >= 2):
                    g[y][x] = 'T'
            if g[y][x] == '?':
                g[y][x] = '#'
    return [''.join(r) for r in g]

def down(rows, x0=0, y0=0, w=None, h=None):
    H, W = len(rows), len(rows[0])
    w = w or (W - x0) // 2
    h = h or (H - y0) // 2
    out = []
    for ty in range(h):
        row = ''
        for tx in range(w):
            cells = [rows[y][x] for y in (y0 + 2 * ty, y0 + 2 * ty + 1) for x in (x0 + 2 * tx, x0 + 2 * tx + 1) if y < H and x < W]
            c = Counter(cells)
            if c['~'] >= 2: ch = '~'
            elif c['='] >= 1 and c['T'] <= 2: ch = '='
            elif c['#'] >= 2: ch = '#'
            elif c['T'] >= 3: ch = 'T'
            elif c['g'] >= 2: ch = 'g'
            elif c['T'] >= 2 and c['g'] == 0: ch = 'T'
            else: ch = '.'
            row += ch
        out.append(row)
    return out

if __name__ == '__main__':
    for k in sys.argv[1:] or [k for k in d if not k.startswith('$')]:
        rows = clean(dec(d[k]['rle']))
        g = down(rows)
        print(k, len(g[0]), 'x', len(g))
        for i, r in enumerate(g): print(f'{i:2} {r}')


FIT = {
    # map: (crop x0, crop y0) in the downsampled grid, then pad with forest to 30x14
    'lake-verity': dict(cx=0, cy=1, px=2, py=0),
    'route-201': dict(cx=1, cy=0, px=0, py=2),
    'route-202': dict(cx=0, cy=0, px=5, py=0),
    'route-203': dict(cx=0, cy=0, px=0, py=1),
}


def fitted(name, W=30, H=14):
    g = down(clean(dec(d[name]['rle'])))
    f = FIT[name]
    out = [['T'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            sx, sy = x - f['px'] + f['cx'], y - f['py'] + f['cy']
            if 0 <= sy < len(g) and 0 <= sx < len(g[0]):
                out[y][x] = g[sy][sx]
    return [''.join(r) for r in out]


def show(name):
    rows = fitted(name)
    print(name)
    print('   ' + ''.join(str(x % 10) for x in range(30)))
    for i, r in enumerate(rows):
        print(f'{i:2} {r}')


CROP = {
    # source crop (x0, y0, x1, y1) in 16px trace tiles, resampled to 30x14
    'route-201': (0, 0, 65, 22),
    'lake-verity': (0, 2, 54, 34),
    'route-202': (0, 0, 38, 28),
    'route-203': (0, 0, 61, 23),
}


def resample(name, W=30, H=14):
    rows = clean(dec(d[name]['rle']))
    x0, y0, x1, y1 = CROP[name]
    sx, sy = (x1 - x0) / W, (y1 - y0) / H
    out = []
    for ty in range(H):
        row = ''
        for tx in range(W):
            cells = [rows[y][x] for y in range(int(y0 + ty * sy), max(int(y0 + ty * sy) + 1, int(y0 + (ty + 1) * sy)))
                     for x in range(int(x0 + tx * sx), max(int(x0 + tx * sx) + 1, int(x0 + (tx + 1) * sx)))]
            c = Counter(cells)
            n = len(cells)
            if c['~'] * 2 >= n: ch = '~'
            elif c['='] >= 1 and c['T'] * 2 < n: ch = '='
            elif c['#'] * 2 >= n: ch = '#'
            elif c['T'] * 2 > n: ch = 'T'
            elif c['g'] * 3 >= n: ch = 'g'
            else: ch = '.'
            row += ch
        out.append(row)
    return out


def show2(name):
    rows = resample(name)
    print(name, CROP[name])
    print('   ' + ''.join(str(x % 10) for x in range(30)))
    for i, r in enumerate(rows):
        print(f'{i:2} {r}')
