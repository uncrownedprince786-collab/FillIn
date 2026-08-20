/**
 * Generates placeholder Fillin icons (indigo square + white checkmark).
 * These are functional placeholders; a designer pass is expected before
 * Chrome Web Store submission.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [67, 56, 202]; // indigo
const FG = [255, 255, 255]; // white

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function isCheck(px, py, size, stroke) {
  const n = (v) => v * size;
  const p1 = [n(0.28), n(0.52)];
  const p2 = [n(0.46), n(0.70)];
  const p3 = [n(0.75), n(0.34)];
  const d1 = distToSegment(px, py, p1[0], p1[1], p2[0], p2[1]);
  const d2 = distToSegment(px, py, p2[0], p2[1], p3[0], p3[1]);
  const half = (stroke * size) / 2;
  return d1 <= half || d2 <= half;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const rows = [];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter none
    const stroke = size >= 64 ? 0.11 : 0.15;
    for (let x = 0; x < size; x++) {
      const isFg = isCheck(x, y, size, stroke);
      const i = 1 + x * 4;
      row[i] = isFg ? FG[0] : BG[0];
      row[i + 1] = isFg ? FG[1] : BG[1];
      row[i + 2] = isFg ? FG[2] : BG[2];
      row[i + 3] = 255;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon${size}.png`), makePng(size));
  console.log(`icon${size}.png written`);
}