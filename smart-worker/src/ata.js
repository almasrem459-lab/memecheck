// Associated-token-account derivation without dependencies: sha256 (node:crypto) + ed25519 on-curve check (BigInt).
// CPU: ~0.15 ms per on-curve check, so the caller derives in small batches.
import { createHash } from 'node:crypto';
const P = 2n ** 255n - 19n;
const mod = (a) => { a %= P; return a < 0n ? a + P : a; };
function pow(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; }
const D = mod(-121665n * pow(121666n, P - 2n)), E58 = (P - 5n) / 8n;
export function onCurve(b) {
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? b[i] & 0x7f : b[i]);
  if (y >= P) return false;
  const y2 = y * y % P, u = mod(y2 - 1n), v = mod(D * y2 + 1n), v3 = v * v % P * v % P, v7 = v3 * v3 % P * v % P;
  const x = u * v3 % P * pow(u * v7 % P, E58) % P, vx2 = v * x % P * x % P;
  return vx2 === u || vx2 === mod(-u);
}
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', AI = Object.fromEntries([...A].map((c, i) => [c, BigInt(i)]));
export function d58(s) { let n = 0n; for (const c of s) n = n * 58n + AI[c]; const o = new Uint8Array(32); for (let i = 31; i >= 0 && n > 0n; i--) { o[i] = Number(n & 255n); n >>= 8n; } return o; }
export function e58(b) { let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const x of b) { if (x) break; s = '1' + s; } return s; }
const ATAP = d58('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'), PDA = new TextEncoder().encode('ProgramDerivedAddress');
const h = (o, p, m, bump) => createHash('sha256').update(o).update(p).update(m).update(Uint8Array.of(bump)).update(ATAP).update(PDA).digest();
// -> exact ATA (string) when bump 255 is valid (50%), else [bump254, bump253] candidates (true ATA is one of them 75% of the time)
export function ataOf(ownerBytes, progBytes, mintBytes) {
  const a = h(ownerBytes, progBytes, mintBytes, 255);
  if (!onCurve(a)) return e58(a);
  return [e58(h(ownerBytes, progBytes, mintBytes, 254)), e58(h(ownerBytes, progBytes, mintBytes, 253))];
}
