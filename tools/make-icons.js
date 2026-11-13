/* Maakt de app-iconen (PNG) zonder externe pakketten.  Draaien: node tools/make-icons.js */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x24, 0x43, 0xD0];       // accentblauw
const FG = [0xFF, 0xFF, 0xFF];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                         // 8 bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/* scale: hoe groot het vinkje is t.o.v. het icoon (maskable heeft meer marge nodig) */
function draw(size, scale) {
  const buf = Buffer.alloc(size * size * 4);
  const pts = [[0.27, 0.52], [0.44, 0.69], [0.75, 0.33]].map(p => [0.5 + (p[0] - 0.5) * scale, 0.5 + (p[1] - 0.5) * scale]);
  const half = 0.055 * scale * size;                // halve lijndikte in pixels
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x + 0.5, py = y + 0.5;
    const d = Math.min(
      distSeg(px, py, pts[0][0] * size, pts[0][1] * size, pts[1][0] * size, pts[1][1] * size),
      distSeg(px, py, pts[1][0] * size, pts[1][1] * size, pts[2][0] * size, pts[2][1] * size));
    const a = Math.max(0, Math.min(1, half - d + 0.5));   // zachte rand (anti-aliasing)
    const i = (y * size + x) * 4;
    buf[i] = Math.round(BG[0] + (FG[0] - BG[0]) * a);
    buf[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a);
    buf[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a);
    buf[i + 3] = 255;
  }
  return buf;
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
const files = [
  ['icon-192.png', 192, 1.0],
  ['icon-512.png', 512, 1.0],
  ['icon-maskable-512.png', 512, 0.72],             // binnen het veilige midden (80%)
  ['apple-touch-icon.png', 180, 1.0]
];
files.forEach(([name, size, scale]) => {
  fs.writeFileSync(path.join(out, name), png(size, draw(size, scale)));
  console.log('gemaakt:', name);
});
