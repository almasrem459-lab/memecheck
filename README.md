# MemeCheck

Free, open-source meme-coin safety checker. Paste a contract address and get a **Low / Medium / High / Extreme** risk verdict with plain-language reasons. Live at https://memecheck.pages.dev. English + Arabic UI.

> Not financial advice. Automated checks can miss scams or flag legit tokens. Always DYOR.

## What it checks

**Solana (deep checks)**
- Mint authority / freeze authority, Token-2022 transfer fees, mutable metadata
- Liquidity size, LP locked/burned share, price drop from peak, pair age
- Top-holder concentration (pool vaults and AMM authorities excluded)
- **Dev history** – the creator's earlier launches and how they ended (rug history)
- **Bundles / snipers** – wallets that bought in the launch window, linked by shared funders, and how much they still hold
- **Dev holdings** – current creator balance
- **Bubble map** – clusters of linked top holders (shared funding wallets)
- **Sell/honeypot signals** and RugCheck danger flags

**Ethereum / BSC / Base (basic checks)**
- GoPlus token security + Honeypot.is simulation (buy/sell tax, honeypot, owner powers)
- DexScreener market data (liquidity, LP lock, volume, age)

Extras: new pump.fun / trending lists, true-cost (tax+fee+slippage) calculator, optional Jupiter swap widget, gold and top-crypto tabs.

## How scoring works (`core.js` → `score()`)

Each check produces a finding: `pass`, `warn`, `fail`, or `na` (data unavailable), with a weight.

- `fail` adds the full weight, `warn` adds half; `na` is ignored.
- Some fails are **critical** (e.g. active mint or freeze authority, confirmed honeypot) → **Extreme**.
- Otherwise: **≥ 40 points → High**, **≥ 15 → Medium**, else **Low**.
- If no security source (RugCheck/Solana RPC, or GoPlus/Honeypot.is) answered, a "Low" is downgraded to **Unknown** – the app never calls a token safe from market data alone.

Every verdict lists the reasons and which data sources answered.

## Data sources

| Source | Used for |
|---|---|
| [RugCheck](https://rugcheck.xyz) | Solana token report, risk flags, LP lock, insider networks |
| [GoPlus](https://gopluslabs.io) | EVM token security |
| [Honeypot.is](https://honeypot.is) | EVM honeypot / tax simulation |
| [DexScreener](https://dexscreener.com) | Pairs, price, liquidity, volume, age |
| [Helius](https://helius.dev) (Solana RPC + DAS) | Dev history, bundles, holders, bubble map (server-side, keyed) |
| GeckoTerminal, CoinGecko, CoinPaprika, pump.fun, Jupiter | Lists, charts, swap |

All browser calls to third-party APIs that block CORS go through an **allowlisted** proxy (`functions/api/proxy.js`). Solana RPC goes through `functions/api/rpc.js`, which uses Helius when `HELIUS_KEY` is set and falls back to public RPCs.

## Project layout

```
index.html, style.css, *.js    static front-end (no build step, ES modules)
functions/                     Cloudflare Pages Functions
  api/proxy.js                 allowlisted CORS proxy with edge cache
  api/rpc.js                   Solana RPC relay (Helius if configured)
  api/deep.js, api/cache.js    server-side deep checks + KV result cache
  api/og.js, _lib/             dynamic OG share images
  _middleware.js
wrangler.toml                  Pages config + KV binding
```

## Run locally

Requires Node 18+ and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
npm i -g wrangler
cp .dev.vars.example .dev.vars        # put your Helius key here (optional)
wrangler pages dev . --kv MEMECHECK_CACHE
# open http://localhost:8788
```

Without `HELIUS_KEY` the app still works using public Solana RPCs (slower, rate-limited deep checks).

## Deploy (Cloudflare Pages)

```bash
wrangler kv namespace create MEMECHECK_CACHE     # paste the id into wrangler.toml
wrangler pages project create memecheck
wrangler pages secret put HELIUS_KEY --project-name memecheck
wrangler pages deploy . --project-name memecheck
```

## Configuration

| Name | Where | Required | Purpose |
|---|---|---|---|
| `HELIUS_KEY` | Pages secret / `.dev.vars` | optional (recommended) | Helius RPC + DAS for Solana deep checks |
| `MEMECHECK_CACHE` | KV binding in `wrangler.toml` | yes for `/api/cache`, `/api/deep` | Shared scan-result cache |
| `REFERRAL_ACCOUNT` | constant in `swap.js` | optional | Jupiter referral account for the 0.5% swap fee; empty = no fee |
| GA measurement id | `index.html` (`G-XXXXXXXXXX`) | optional | Google Analytics; remove the snippet to disable |

**Never commit API keys.** Secrets live only in Cloudflare Pages secrets or a local, git-ignored `.dev.vars`.

## License

MIT © 2026 Mohamad Almasre
