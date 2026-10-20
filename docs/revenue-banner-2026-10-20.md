# Hero Banner ad slot — 2026-10-20

**Jojo ask:** prominent paid BANNER on homepage (higher than strip).

| | |
|---|---|
| Prod (banner visible) | https://memecheck.pages.dev/ |
| Preview | https://revenue-preview.memecheck.pages.dev |
| Preview deploy | `2e55c613` (alias revenue-preview; earlier `b0d3507d`) |
| Prod deploy | `76319f73` (Production / main) |
| Price | **150 USDC / week** (Hero Banner) |
| Strip (unchanged) | 50 USDC / week |
| Verified (unchanged) | 75 USDC / 30 days |
| Pay-to Phantom | `F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5` |
| USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Source | `/workspace/cf-dist` → OSS `github.com/almasrem459-lab/memecheck` |
| KV | `revenue:v1` via `/api/verified` — now includes `banners[]` |

## What shipped

1. **Hero Banner** under the checker form on the homepage (`#mc-hero-banner`), labeled **Sponsored**.
2. Empty state (no payment yet): “Advertise here — from 150 USDC/week” → `/advertise` (static HTML + JS hydrate).
3. Paid state: optional `image` URL + title + link `/?ca=<mint>` + Sponsored tag.
4. API/KV: `kind: "banner"` → `banners[]` with `until` expiry; same claim + admin-approve path as sponsored.
5. `/advertise` EN+AR: Hero Banner 150, strip 50, Verified 75.
6. CSS: dark + teal / gold Sponsored look; mobile-friendly; never styled like organic scan results.
7. `revenue-ui.js` idle-loaded on homepage so strip + banner show without a scan.

## How Jojo / admin claims a banner after payment

**Auto-claim (on-chain):** `POST /api/verified`  
```json
{ "action": "claim", "kind": "banner", "mint": "<CA>", "tx": "<sig>", "name": "TICKER", "image": "https://..." }
```
Needs ≥ **150 USDC** to pay-to wallet.

**Admin approve:** `POST /api/verified` with `Authorization: Bearer <REVENUE_ADMIN_TOKEN>`  
```json
{ "action": "approve", "kind": "banner", "mint": "<CA>", "name": "TICKER", "image": "https://...", "tx": "<sig optional>", "days": 7 }
```

Payment never changes risk score — UI Sponsored only.

## Bots

Paper **consensus-bot** + **majors-bot** left running (not touched).

## Smoke

- Preview + prod HTML contain `#mc-hero-banner` empty CTA linking to `/advertise`.
- `/api/verified` returns `cfg.bannerPriceUsdcWeek: 150` and `banners: []`.
