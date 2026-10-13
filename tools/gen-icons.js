// Generates the TabNote icons (sticky note with a pin, folded corner) as PNGs.
// Zero dependencies: encodes RGBA pixels into PNG using node's zlib.
// Usage: node tools/gen-icons.js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];

// --- PNG encoding -----------------------------------------------------------

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Drawing (all coordinates in a 128x128 design space) ---------------------

const YELLOW = [255, 196, 61]; // sticky-note amber
const FOLD = [224, 155, 23]; // folded corner
const LINE = [138, 90, 11]; // text lines
const PIN_COLOR = [229, 72, 77]; // pushpin dot

const RECT = { x0: 6, y0: 6, x1: 122, y1: 122, r: 26 };
const FOLD_SIZE = 36;
const C = RECT.x1 + RECT.y1 - FOLD_SIZE; // cut line: x + y > C is transparent
const LINES = [
  { x0: 30, y0: 55.5, x1: 90 },
  { x0: 30, y0: 75.5, x1: 96 },
  { x0: 30, y0: 95.5, x1: 78 },
];
const LINE_H = 7;
const PIN_POS = { cx: 34, cy: 34, r: 10 };

function sdRoundRect(px, py, { x0, y0, x1, y1, r }) {
  const qx = Math.max(x0 + r - px, px - (x1 - r), 0);
  const qy = Math.max(y0 + r - py, py - (y1 - r), 0);
  const corner = Math.min(r - Math.max(x0 + r - px, px - (x1 - r)), r - Math.max(y0 + r - py, py - (y1 - r)));
  if (qx === 0 || qy === 0) return Math.max(qx, qy);
  return Math.hypot(qx, qy) - r;
}

// distance to the capsule formed by a horizontal rounded bar
function sdBar(px, py, { x0, x1, y0 }) {
  const ax = x0 + LINE_H / 2;
  const bx = x1 - LINE_H / 2;
  const dx = Math.max(ax - px, px - bx, 0);
  const dy = py - y0;
  return Math.hypot(dx, dy) - LINE_H / 2;
}

function inFoldFlap(px, py) {
  return px >= RECT.x1 - FOLD_SIZE && py >= RECT.y1 - FOLD_SIZE && px + py <= C;
}

function sample(px, py) {
  const base = sdRoundRect(px, py, RECT);
  if (base > 0 || px + py > C) return null; // outside the note (incl. cut corner)
  if (inFoldFlap(px, py)) return FOLD;
  for (const line of LINES) {
    if (sdBar(px, py, line) <= 0) return LINE;
  }
  if (Math.hypot(px - PIN_POS.cx, py - PIN_POS.cy) <= PIN_POS.r) return PIN_COLOR;
  return YELLOW;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 128 / size;
  const SUB = size < 48 ? 5 : 3; // supersampling for small sizes
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const px = (x + (sx + 0.5) / SUB) * scale;
          const py = (y + (sy + 0.5) / SUB) * scale;
          const c = sample(px, py);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SUB * SUB;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT, `icon${size}.png`);
  writeFileSync(file, render(size));
  console.log(`wrote ${file}`);
}