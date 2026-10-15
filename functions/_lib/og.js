// Dynamic share image (1200x630 indexed PNG) drawn without wasm: a pre-rendered base image + Inter glyph atlases
// (see og-assets.js). Very cheap on CPU: palette indices only, native (De)CompressionStream for zlib.
import { PAL, BASE, KINDS, FONTS } from './og-assets.js';
const W = 1200, H = 630, WHITE = 64, GREY = 80, KB = (k) => 96 + 32 * Math.max(0, KINDS.indexOf(k)); // KB = bg->pill ramp, KB+16 = pill->fg ramp
const b64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pipe(bytes, stream) { const r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
let assets = null;
async function load() {
  if (assets) return assets;
  const fonts = {};
  for (const [k, f] of Object.entries(FONTS)) fonts[k] = { ...f, a: await pipe(b64(f.d), new DecompressionStream('deflate')) };
  assets = { base: await pipe(b64(BASE), new DecompressionStream('deflate')), pal: b64(PAL), fonts };
  return assets;
}
const glyph = (f, ch) => f.g[ch.codePointAt(0)];
const measure = (f, s) => [...s].reduce((w, ch) => w + (glyph(f, ch)?.[5] || 0), 0);
function fit(f, s, max) { // drop unsupported chars, ellipsize to max px
  s = [...s].filter(ch => glyph(f, ch)).join('').replace(/\s+/g, ' ').trim();
  if (measure(f, s) <= max) return s;
  while (s && measure(f, s + '…') > max) s = [...s].slice(0, -1).join('');
  return s + '…';
}
function text(px, f, s, x, y, ramp) {
  let cx = x;
  for (const ch of s) {
    const g = glyph(f, ch); if (!g) continue; const [off, gw, gh, bx, by, adv] = g;
    const ox = Math.round(cx) + bx, oy = y + by;
    for (let j = 0; j < gh; j++) { const yy = oy + j; if (yy < 0 || yy >= H) continue;
      for (let i = 0; i < gw; i++) { const a = f.a[off + j * gw + i]; const xx = ox + i; if (a && xx >= 0 && xx < W) { const p = yy * W + xx; const cur = px[p] - ramp; px[p] = ramp + Math.max(a, cur >= 0 && cur < 16 ? cur : 0); } } }
    cx += adv;
  }
  return cx;
}
function pill(px, x, y, w, h, r, ramp) { // anti-aliased rounded rect, 4x4 supersampling at the corners
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const dx = Math.max(x + r - xx - 0.5, xx + 0.5 - (x + w - r), 0), dy = Math.max(y + r - yy - 0.5, yy + 0.5 - (y + h - r), 0);
    let cov = 16;
    if (dx > 0 && dy > 0) { cov = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const sx = Math.max(x + r - (xx + (a + .5) / 4), (xx + (a + .5) / 4) - (x + w - r), 0), sy = Math.max(y + r - (yy + (b + .5) / 4), (yy + (b + .5) / 4) - (y + h - r), 0); if (sx * sx + sy * sy <= r * r) cov++; } }
    px[yy * W + xx] = ramp + Math.min(15, Math.round(cov * 15 / 16));
  }
}
const LV = { low: 'LOW RISK', medium: 'MEDIUM RISK', high: 'HIGH RISK', extreme: 'EXTREME RISK' };
const CH = { solana: 'Solana', ethereum: 'Ethereum', base: 'Base', bsc: 'BSC' };
export async function renderOg({ sym, name, level, pts, chain, ca }) {
  const { base, pal, fonts } = await load(); const px = base.slice();
  const big = fonts.big, mid = fonts.mid, sm = fonts.sm;
  const s = fit(big, sym ? '$' + sym : (ca ? ca.slice(0, 4) + '…' + ca.slice(-4) : 'Token'), 1040);
  text(px, big, s, 80, 268, WHITE);
  const nm = fit(mid, name && name !== sym ? name : 'Meme-coin safety check', 1040);
  text(px, mid, nm, 80, 334, GREY);
  const kind = LV[level] ? level : 'check', label = LV[level] || 'Check safety →', ramp = KB(kind);
  const tw = measure(mid, label), pw = Math.round(tw) + 56, py = 384, ph = 72;
  pill(px, 80, py, pw, ph, 16, ramp);
  text(px, mid, label, 108, py + 52, ramp + 16);
  const info = [LV[level] && pts != null ? `${pts} risk points` : 'Rug, honeypot, dev & bundle checks', CH[chain]].filter(Boolean).join(' · ');
  text(px, sm, fit(sm, info, 1040 - pw - 28), 80 + pw + 28, py + 47, GREY);
  return png(px, pal);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer); dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  let c = 0xffffffff; for (let i = 4; i < 8 + data.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0); return out;
}
async function png(px, pal) {
  const raw = new Uint8Array((W + 1) * H); for (let y = 0; y < H; y++) raw.set(px.subarray(y * W, y * W + W), y * (W + 1) + 1);
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, W); dv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 3;
  const idat = await pipe(raw, new CompressionStream('deflate'));
  const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('PLTE', pal), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
