# RugDNA (v1)

An open identity graph of serial token launchers on Solana. A rugger uses a fresh wallet for every coin, but the wallet that *funded* it is often the same. RugDNA links launcher wallets through that shared funding wallet, tracks how many of their launches died, and warns on the scan card.

- Page: `/rugdna` (EN / AR). Method, definitions and limits are on the page (`#method`).
- API (free, CORS `*`, 60 req/min/IP): `GET /api/rugdna/stats[?history=1]`, `/api/rugdna/wallet/:addr`, `/api/rugdna/mint/:mint`, `/api/rugdna/clusters?order=dead&limit=25`, `/api/rugdna/cluster/:funder`.
- Data: **CC-BY-4.0** (attribute "MemeCheckShield RugDNA, https://memecheck.pages.dev/rugdna"). Code: **MIT** (this repo).
- A shared funder is evidence of linkage, not proof of identity or intent. Exchange hot wallets, routers, high-velocity wallets and funders feeding >= 100 launcher wallets are never clustered.

## How it works
| Piece | File |
|---|---|
| Core (funder resolution, clustering, verdict, flags, stats) | `functions/_lib/rugdna.js` |
| Cron jobs (ingest every 5 min, resolve every 5 min, recheck every 10 min) | `functions/_lib/rugdna-cron.js`, `warmer/src/index.js` |
| API | `functions/api/rugdna/[[path]].js` |
| Scan card | `rugdna-ui.js` (+ `rugdnaSig` finding in `app.js` / `i18n.js`) |
| Page | `rugdna.html` |
| D1 schema | `rugdna/schema.sql` |

Setup: `wrangler d1 create memecheck-rugdna`, put its id in `wrangler.toml` and `warmer/wrangler.toml`, then `wrangler d1 execute memecheck-rugdna --remote --file rugdna/schema.sql`.

## Scoring effect (modest)
Only OTHER wallets' dead launches in the same funder cluster count. >= 3 dead and >= 70% of judged launches: warning (+3 pts). >= 5 dead and >= 80%: serious (+8 pts). Unknown, solo, unresolved or exchange/service funders are neutral. It never reaches the critical level on its own.

## Limits
Sampled, forward-looking index (about 25 new launches per 5 min plus scanned coins). Wallets with > 2,000 transactions are not traced in v1. One hop only (first funder). Free-tier RPC and D1 write budgets apply.
