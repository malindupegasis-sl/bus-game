/**
 * Generates the home-screen icons from the bus sprite: `npm run icons`.
 * Pure Node (no deps): draws into an RGBA buffer and writes PNGs with zlib.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { BUS_WHEELS, PALETTE, SPRITES } from '../src/render/sprites.ts';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function png(size: number, px: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Icon art on a 64×64 grid: sky, road, the bus. `pad` shrinks it for the maskable safe zone. */
function icon(size: number, maskable: boolean): Buffer {
  const G = 64;
  const grid: string[][] = Array.from({ length: G }, (_, y) =>
    Array.from({ length: G }, () => (y < 30 ? '#3cbcfc' : y < 34 ? '#b85c28' : y < 56 ? '#5c5c5c' : '#c41c00')),
  );
  for (let x = 0; x < G; x++) if (x % 8 < 5) grid[46][x] = '#fcfcfc';
  const bus = SPRITES.bus;
  const ox = 1;
  const oy = 44 - bus.length - 4;
  bus.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== '.') grid[oy + y][ox + x] = PALETTE[ch];
    }),
  );
  // Wheels (the game draws these procedurally so they spin)
  const r = BUS_WHEELS.r;
  for (const wx of BUS_WHEELS.xs) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = dx * dx + dy * dy;
        if (q > r * r + 1) continue;
        grid[oy + BUS_WHEELS.y + dy][ox + wx + dx] = q >= (r - 1) * (r - 1) + 1 ? '#000000' : '#4a4a4a';
      }
    }
    grid[oy + BUS_WHEELS.y][ox + wx] = '#fcfcfc';
  }
  const px = new Uint8Array(size * size * 4);
  const inset = maskable ? 0.1 : 0; // keep the bus inside the maskable safe zone
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size - inset) / (1 - 2 * inset);
      const v = (y / size - inset) / (1 - 2 * inset);
      const c = u < 0 || v < 0 || u >= 1 || v >= 1 ? '#c41c00' : grid[Math.floor(v * G)][Math.floor(u * G)];
      const [r, g, b] = hex(c);
      px.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return png(size, px);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, false));
writeFileSync('public/icons/icon-512.png', icon(512, false));
writeFileSync('public/icons/icon-maskable-512.png', icon(512, true));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, false));
console.log('icons written');
