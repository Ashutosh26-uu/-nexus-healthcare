// Generates the PWA / app-store PNG icons (no dependencies): brand-green tile, cream heart, clay road to a dot (Sehatra).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [15, 92, 77], CREAM = [251, 247, 240], CLAY = [217, 115, 78];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const o = y * (size * 4 + 1) + 1 + x * 4; const p = px(x, y); raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3]; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Heart polygon (classic parametric heart) in unit space.
const heart = Array.from({ length: 240 }, (_, i) => { const t = (i / 240) * Math.PI * 2; return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; });
const inPoly = (x, y, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
// The road (sehat + yatra): from the heart's tip it winds up through the heart to a destination dot.
const cubic = (p0, p1, p2, p3, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, m = 1 - t; return [0, 1].map((k) => m * m * m * p0[k] + 3 * m * m * t * p1[k] + 3 * m * t * t * p2[k] + t * t * t * p3[k]); });
const fit = ([x, y]) => [x * 0.82, y * 0.82 + 2.6];
const pulse = [...cubic([5, -4.5], [2.5, -8.5], [-6, -7.5], [-5, -2.5]), ...cubic([-5, -2.5], [-4, 1.5], [5, 0.5], [5, 5]).slice(1), ...cubic([5, 5], [5, 10], [-2.5, 11.5], [-5.5, 8]).slice(1)].map(fit);
const DOT = fit([5.6, -5.2]), DOT_R = 2.1;
const segDist = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
function icon(size, { maskable }) {
  const SS = 4; const scale = maskable ? 0.62 : 0.8; const radius = maskable ? 0 : 0.22;
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      // rounded tile
      const cx = Math.min(Math.max(u, radius), 1 - radius), cy = Math.min(Math.max(v, radius), 1 - radius);
      if (radius && Math.hypot(u - cx, v - cy) > radius) continue;
      let col = GREEN;
      const hx = (u - 0.5) * 40 / scale, hy = (v - 0.53) * 40 / scale;
      if (inPoly(hx, hy, heart)) {
        col = CREAM;
        const lw = 1.55;
        for (let i = 0; i < pulse.length - 1; i++) if (segDist(hx, hy, pulse[i], pulse[i + 1]) < lw) { col = CLAY; break; }
        if (Math.hypot(hx - DOT[0], hy - DOT[1]) < DOT_R) col = CLAY;
      }
      r += col[0]; g += col[1]; b += col[2]; a += 255;
    }
    const n = SS * SS; return [Math.round(r / Math.max(1, a / 255)), Math.round(g / Math.max(1, a / 255)), Math.round(b / Math.max(1, a / 255)), Math.round(a / n)];
  });
}
const out = new URL('../public/icons/', import.meta.url);
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true], ['favicon-32.png', 32, false]]) {
  writeFileSync(new URL(name, out), icon(size, { maskable }));
  console.log('wrote', name);
}
