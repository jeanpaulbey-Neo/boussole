// Génère les icônes PWA (192 & 512) sans dépendance externe : encodage PNG via zlib.
// Dessin : fond vert de marque + cercle/aiguille de boussole en or. Reproductible.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const GREEN = [14, 92, 74];
const GREEN_DARK = [10, 69, 56];
const GOLD = [201, 162, 39];
const CREAM = [244, 241, 234];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size) {
  const px = (x, y) => {
    const cx = size / 2, cy = size / 2;
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const ring = size * 0.40;
    // fond dégradé radial vert
    let col = r > ring ? lerp(GREEN, GREEN_DARK, Math.min(1, (r - ring) / (size * 0.1))) : GREEN;
    if (r <= ring && r >= ring - size * 0.035) col = GOLD; // anneau or
    // aiguille (losange) nord/sud
    const ang = Math.atan2(dy, dx);
    const needleLen = ring * 0.78;
    const onNeedle = Math.abs(dx) < (1 - r / needleLen) * size * 0.10 && r < needleLen;
    const onNeedleV = Math.abs(dy) < (1 - r / needleLen) * size * 0.10 && r < needleLen;
    if (onNeedle || onNeedleV) {
      col = dy < 0 || dx < 0 ? (dy < 0 ? GOLD : CREAM) : CREAM;
      if (dy < 0) col = GOLD; else col = CREAM;
    }
    if (r < size * 0.045) col = CREAM; // centre
    return col;
  };
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const c = px(x, y);
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }

for (const s of [192, 512]) {
  const out = new URL(`./icon-${s}.png`, import.meta.url);
  writeFileSync(out, png(s));
  console.log('écrit', out.pathname);
}
