# MemeCheck

**Live: https://memecheck.pages.dev** · [Rugs we caught](https://memecheck.pages.dev/rugs) · [How the score works](https://memecheck.pages.dev/how) · [Dev Reputation](https://memecheck.pages.dev/dev)

Free, open-source (MIT) meme-coin safety checker for **Solana, BNB Chain, Ethereum, Base and Arbitrum**. Paste a contract address and get a **Low / Medium / High / Extreme** risk verdict with plain-language reasons in seconds. No signup, no paywall. English + Arabic UI.

> Not financial advice. Low risk does not mean 100% safe. Automated checks can miss scams or flag legit tokens. Always DYOR.

## What makes it different

- **Dev history**: the creator wallet's earlier pump.fun launches and how they ended (dead / rugged, checked on DexScreener). Serial launchers add risk points (up to +10).
- **Bubble map**: interactive graph of top holders linked by shared funding wallets (bundles / clusters).
- **Sniper detection**: first buyers in the opening slots after launch, how much supply they bought and still hold.
- **Liquidity Flows**: animated map of recent swaps into/out of the pool; round-trips, fast flips, burst trading and the creator wallet are highlighted.
- **Organic Volume indicator**: Organic / Suspicious / Wash-like badge from the same swap sample (share of recent swaps made by the top 5 wallets), e.g. "40% of the last 24 swaps came from 5 wallets". Shown only when there are enough swaps to judge.
- **Buy / Sell pressure**: buys vs sells for 5m / 1h / 6h / 24h (DexScreener transaction counts) plus a green/red timeline of recent swaps from the same sample as Liquidity Flows (no extra RPC calls), with "big buy / big sell" markers. Context only, not scored.
- **Rugs we caught** ([/rugs](https://memecheck.pages.dev/rugs)): a public proof page. Every fresh Solana meme coin that meets the entry rules is scored and rechecked 24h and 48h later, Low, Medium and High alike, and **all** outcomes are published, not just the hits. Accuracy tracking of flagged tokens is ongoing; the sample is still small.
- **AI summary + Ask AI** (beta): after a scan, a 2-4 sentence plain-language explanation of the verdict with a one-line bottom line (EN / AR), plus up to 5 questions per token per session ("Can I sell?", "Who holds the most?"). Answers are grounded only in the scan data (no price predictions, no buy/sell advice). Runs on Cloudflare Workers AI through the Pages `AI` binding (`functions/api/ai.js`, `ai-ui.js`); summaries are cached 10 min per chain + CA + language + score. If AI is unavailable the card shows a calm notice and the scan is unaffected.
- **Arabic support**: full EN / AR interface (RTL).
- **Share card**: 1200×675 PNG result card (token, risk level, score, top reasons) with Download, Share on X, Copy link and the Web Share API.
- **Transparent scoring**: the exact weights and thresholds are in `core.js` and explained in plain words on [/how](https://memecheck.pages.dev/how).

## What it checks

**Solana (deep checks)**
- Mint authority / freeze authority (critical), Token-2022 transfer fees, mutable metadata
- Liquidity size, LP locked/burned share, price drop from recent high, pair age, sell pressure, volume
- Top-holder concentration (pool vaults and AMM authorities excluded), insider networks, creator balance
- Developer history, bundles / snipers, bubble map, liquidity flows, organic volume
- RugCheck danger flags; on-chain fallback via Solana RPC when RugCheck is unavailable

**BNB Chain (56), Ethereum (1), Base (8453) and Arbitrum One (42161)**
- Paste any `0x…` address: the chain is auto-detected from DexScreener (the chain whose own pairs have the most liquidity); if the token trades on several, BNB / ETH / BASE / ARB chips let you switch
- GoPlus token security + Honeypot.is buy/sell simulation, scored in one function (`evmFindings()` in `core.js`): honeypot (critical), buy/sell tax, buying blocked, mintable, hidden owner, ownership reclaim, unverified source, proxy/upgradeable, blacklist, pausable transfers, trading cooldown, modifiable tax, ownership renounced, LP locked/burned %, top-10 holders, creator/owner holding, serial honeypot creator
- Honeypot.is does not support Arbitrum, so on Arbitrum honeypot/tax checks use GoPlus only (shown as "not supported on this chain")
- **Uniswap pools:** when the top pair is a Uniswap v2/v3/v4 pool, a small "Uniswap pool" note shows the version and links to the pool on app.uniswap.org
- **Uniswap V3/V4 LP:** liquidity is an NFT position, so an LP lock usually can't be measured. ≥ 90% locked = pass; a regular wallet holding ≥ 50% of the position with no lock = warn; otherwise N/A info – never scored as "unlocked" without evidence
- Owner-only switches (blacklist / pause / cooldown / tax) pass when ownership is renounced and cannot be reclaimed
- **Four.meme** (BNB Chain): launchpad tokens are recognised (Four.meme API, GoPlus launchpad tag, DexScreener `fourmeme` pair); bonding-curve progress is shown and curve-only checks are handled (no LP / tax / holder data yet)
- Same market checks as Solana (liquidity, pair age, drop from high, pressure, volume), Buy / Sell pressure with GeckoTerminal OHLCV candles, holder bubble map (GoPlus holders)
- Buy / Sell buttons link to PancakeSwap (BNB Chain), Uniswap (Ethereum, Base, Arbitrum – correct `chain=` param) or four.meme (bonding curve); hidden for confirmed honeypots
- Not available on EVM yet: sniper detection, liquidity flows, developer history, bundle checks (Solana only, shown as "Not available on <chain> yet")
- Base still works when it is the only chain a token trades on

Extras: trending (6h) and newest-launch lists, true-cost (tax+fee+slippage) calculator, optional Jupiter swap widget.

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
| [GoPlus](https://gopluslabs.io) | EVM token security (BNB Chain / Ethereum / Base / Arbitrum) |
| [Honeypot.is](https://honeypot.is) | EVM honeypot / tax simulation (BNB Chain / Ethereum / Base; no Arbitrum) |
| [Four.meme](https://four.meme) | BNB Chain launchpad + bonding-curve status |
| [DexScreener](https://dexscreener.com) | Pairs, price, liquidity, volume, age |
| [Helius](https://helius.dev) (Solana RPC + DAS), public Solana RPC fallback | On-chain fallback checks, holders, bubble map, snipers, liquidity flows (server-side, keyed) |
| [pump.fun](https://pump.fun) | Creator wallet, developer's earlier launches, newest launches |
| [GeckoTerminal](https://www.geckoterminal.com) | Trending and new-pool lists, EVM price candles (OHLCV) |
| [Jupiter](https://jup.ag) | Optional swap widget |

All browser calls to third-party APIs that block CORS go through an **allowlisted** proxy (`functions/api/proxy.js`). EVM security data goes through `functions/api/evm-security.js` (5-minute edge cache); any part the server cannot get (GoPlus rate-limits shared Cloudflare IPs) is fetched directly by the browser. Solana RPC goes through `functions/api/rpc.js`, which uses Helius when `HELIUS_KEY` is set and falls back to public RPCs.

## Project layout

```
index.html, how.html, rugs.html, style.css, *.js    static front-end (no build step, ES modules)
functions/                     Cloudflare Pages Functions
  api/proxy.js                 allowlisted CORS proxy with edge cache
  api/evm-security.js          GoPlus + Honeypot.is (+ Four.meme) in one call, Cache API 5 min (logic in evmsec.js)
  api/rpc.js                   Solana RPC relay (Helius if configured)
  api/dev.js                   developer history (pump.fun + RugCheck + DexScreener, edge-cached)
  api/new-tokens.js            newest tokens list: pump.fun -> DexScreener -> GeckoTerminal fallback, edge-cached ~90 s
  api/liquidity-flows.js       recent pool swaps, wash-like flags, organic volume indicator, swap sample for bp-ui.js
  api/snipers.js               early buyers / sniper detection
  api/holders.js               bubble map (top holders + funders)
  api/img.js                   allowlisted logo relay so the share card canvas can draw token logos
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


## Dev Reputation Score (M1)

Public **0–100** score for Solana token-creator wallets with labels **Builder / Neutral / Serial Launcher / High Risk**.

- Lookup: https://memecheck.pages.dev/dev
- API: `GET /api/devrep?wallet=<pubkey>` or `?ca=<mint>`
- Methodology: https://memecheck.pages.dev/how#devrep
- Code: `devrep-core.js` (also attached on `/api/dev` as `rep`)

v1 uses pump.fun launch history + DexScreener survival/cadence/graduations (Helius DAS fallback when pump.fun is blocked). Gaps: funded-wallet launches, sell speed, linked supply, full LP history, formal /rugs backtest.

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

Free and open source under the MIT License (see [LICENSE](LICENSE)). © 2026 Mohamad Almasre
