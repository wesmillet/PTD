// Splits a 2+ frame APNG whose frames cover the full canvas into standalone
// PNGs: <out>-f0.png, <out>-f1.png, ... No dependencies.
// Usage: node scripts/split-apng.mjs <in.png> <outPrefix>
import { readFileSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function splitApng(file) {
  const d = readFileSync(file);
  if (d.toString('latin1', 1, 4) !== 'PNG') throw new Error(`${file}: not a PNG`);
  const chunks = [];
  let p = 8;
  while (p < d.length) {
    const len = d.readUInt32BE(p);
    const type = d.toString('latin1', p + 4, p + 8);
    chunks.push({ type, data: d.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  if (!chunks.some((c) => c.type === 'acTL')) return null; // plain PNG
  const header = chunks.filter((c) => ['IHDR', 'PLTE', 'tRNS', 'gAMA', 'sRGB', 'pHYs'].includes(c.type));
  const frames = [];
  let current = null;
  for (const c of chunks) {
    if (c.type === 'fcTL') {
      const w = c.data.readUInt32BE(4);
      const h = c.data.readUInt32BE(8);
      const x = c.data.readUInt32BE(12);
      const y = c.data.readUInt32BE(16);
      const ihdr = header.find((h2) => h2.type === 'IHDR');
      if (w !== ihdr.data.readUInt32BE(0) || h !== ihdr.data.readUInt32BE(4) || x !== 0 || y !== 0) {
        throw new Error(`${file}: frame ${frames.length} is not full-canvas; compositing is not supported`);
      }
      current = [];
      frames.push(current);
    } else if (c.type === 'IDAT' && current) {
      current.push(c.data);
    } else if (c.type === 'fdAT' && current) {
      current.push(c.data.subarray(4)); // strip the sequence number
    }
  }
  return frames.map((parts) => Buffer.concat([d.subarray(0, 8), ...header.map((h) => chunk(h.type, h.data)), ...parts.map((part) => chunk('IDAT', part)), chunk('IEND', Buffer.alloc(0))]));
}

if (process.argv[1] && process.argv[1].endsWith('split-apng.mjs')) {
  const [input, prefix] = process.argv.slice(2);
  if (!input || !prefix) {
    console.error('usage: split-apng.mjs <in.png> <outPrefix>');
    process.exit(1);
  }
  const frames = splitApng(input);
  if (!frames) {
    console.log(`${input}: not animated`);
    process.exit(0);
  }
  frames.forEach((buf, i) => writeFileSync(`${prefix}-f${i}.png`, buf));
  console.log(`${input}: ${frames.length} frames`);
}
