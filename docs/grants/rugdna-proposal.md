# RugDNA: a public identity graph protecting Solana retail users

**Applicant:** MemeCheckShield (solo founder) · **Live:** https://memecheck.pages.dev/rugdna · **Code:** https://github.com/almasrem459-lab/memecheck (MIT) · **Data:** CC-BY-4.0
**Request:** USD 5,000 (milestone-based, 12 weeks). If $5,000 is more than you can fund, any financial support is welcome, even USD 500, and would go entirely to RPC and Cloudflare infrastructure. · **Category:** Developer Tooling
*Numbers below were read live from the public API on 2026-11-10 at 05:42 Asia/Damascus (02:42 UTC).*

---

## 1. Summary

Anyone can launch a Solana token in minutes, and a rug-puller can use a fresh wallet for every coin. But the wallet that *funded* each launcher is often the same one. **RugDNA** links launcher wallets through that shared funding wallet, tracks how each launch ended, and publishes the result as open data and a free API. Any wallet, bot, scanner or researcher can ask "is the person behind this brand-new token the same one who launched 18 dead coins?"

RugDNA went live on **2026-11-10** inside MemeCheckShield, our free, open-source token checker. It is **young and early**. This grant pays for the data coverage that a free-tier RPC cannot give us, plus the accountability work (published accuracy, a dispute process, integrations) that turns a prototype into a public good.

## 2. Problem

- Launching a token on Solana costs cents. Rug-pullers therefore repeat the pattern: new wallet, new token, same operator.
- Contract checks (mint/freeze authority, LP lock, honeypot) look at **one token at a time**. A clean contract can still come from a serial launcher.
- Our own public tracker shows the gap. Of 137 pump-style coins judged at 24h (tracked since 2026-10-15, https://memecheck.pages.dev/accuracy), **68% had rugged or died**. Coins labelled "No major red flags" by contract-style checks fell into that group **76%** of the time (n=59). Our Medium+ flag caught about half of the bad outcomes (recall 52%, precision 62%). Contract checks alone are not enough. Behaviour and identity signals are the missing layer.
- Most users cannot read raw on-chain data, and most teams that could build this will not give the result away.

## 3. Solution

RugDNA (all of this exists today in v1):

1. **Ingest** new launches every 5 minutes (mint, creator wallet, time).
2. **Resolve the funder** of each creator wallet: the source of its first incoming SOL transfer of at least 0.005 SOL.
3. **Cluster** two or more creator wallets that share a funder. Exchange hot wallets, routers, high-velocity service wallets and funders feeding 100 or more wallets are never clustered.
4. **Judge outcomes** with a public rule: *dead* means at least 6 h old and no market, or market cap under $10K. *Rugged* means dead after reaching $50K and falling below 10% of that.
5. **Warn on every scan** in MemeCheckShield (EN/AR) only when other wallets in the cluster have at least 3 dead launches and at least 70% of their judged launches are dead. The score effect is modest (+3, or +8 for a severe cluster) and never critical on its own.
6. **Publish** a public page, `/rugdna` (EN/AR), and a free CORS-open API: `/api/rugdna/stats`, `/wallet/:addr`, `/mint/:mint`, `/clusters`, `/cluster/:funder`.
7. **Audit ourselves.** "Flagged before rug" counts only launches flagged before they were judged dead, and each is re-checked later as dead, survived (alive after 24 h) or pending. Capital exposed is labelled an *estimate*, not prevented loss.

## 4. Why this is a public good

- **Open data, open code, free API:** data under CC-BY-4.0, code under MIT, no key and no signup (60 req/min/IP today).
- **Benefits competitors too.** Other scanners, wallets and Telegram bots can read the same graph.
- **Honest by design.** A shared funder is evidence of linkage, not proof of identity or intent. Limits are printed on the page (method section). Our public accuracy page publishes misses, not only hits.
- **Serves under-served users:** full Arabic UI, in a space where almost all tooling is English-only.

## 5. Why Solana

- Token creation is permissionless and nearly free, so wallet-per-launch rugging is the dominant pattern here.
- Creator wallets, funding transfers and launches are all public on-chain, so the funding link can be reproduced by anyone from public RPC data. No private data is used.
- The people hurt most are retail users trading fresh launches on Solana. A safer launch market is good for the whole ecosystem's reputation.

## 6. Prior rejection and how this proposal differs

The Solana Foundation declined MemeCheck's earlier grant on **2026-10-30**. The reason given: the application was strong, but "the need this project addresses is already covered by other tools in the Solana ecosystem." We took that seriously.

- **We are no longer asking you to fund a general risk checker.** That space has strong tools (RugCheck, GoPlus and others), and we use them as inputs. This proposal funds one narrow piece of open infrastructure.
- **Related tools exist and we say so.** Bubblemaps (per-token holder and funder maps), Cookin (deployer history API), Solami (wallet cluster API) and RugCheck (creator data) each cover a slice. As far as we could find, none publishes a **freely licensed, bulk-downloadable dataset of launcher clusters with outcome labels and a pre-registered "flagged before rug" audit trail**. If we are wrong, we want to hear it. We will interoperate (stable IDs, a documented schema) instead of competing for the same slice.
- **We lead with measured limits.** v1 has 1 cluster today (2 linked wallets, 0 serial clusters, 0 dead launches in the cluster; see section 7). The grant is conditional on delivering coverage and publishing accuracy, including bad results.
- **Scope and ask are smaller.** USD 5,000 over 12 weeks, in three milestones ($2,000 / $1,500 / $1,500). If that is more than you can fund, any amount, even $500, would help.

## 7. What is already live (proof) — verified 2026-11-10

| Item | Evidence |
|---|---|
| RugDNA page + API live since 2026-11-10 | https://memecheck.pages.dev/rugdna · https://memecheck.pages.dev/api/rugdna/stats |
| Open licences | Repo is public, MIT: https://github.com/almasrem459-lab/memecheck (created 2026-10-15, 61 commits at time of writing, `docs/RUGDNA.md`). Data CC-BY-4.0 stated in every API response. |
| Scan integration | RugDNA warning shows on the scan card, EN/AR, and in the Telegram rug alerts |
| Public accuracy tracker | https://memecheck.pages.dev/accuracy and https://memecheck.pages.dev/rugs: 619 unique mints tracked since 2026-10-15; 137 judged at 24 h |
| Live app | https://memecheck.pages.dev (EN/AR; RugCheck/GoPlus/Honeypot/DexScreener inputs; sniper, bundle and insider detection; dev history; telegram win-rate checker; pre-sign warnings) |
| Telegram bot | https://t.me/memecheckshield_bot |

**Honest RugDNA numbers (live API, 2026-11-10 02:42 UTC / 05:42 Asia/Damascus; refresh them if this is more than a few hours old):**

| Metric | Value |
|---|---|
| Launches indexed (sampled, up to 25 new per 5 min) | 1,605 |
| Launcher wallets indexed | 957 |
| Wallets with funder resolved | **228 (about 24%)** |
| Dead launches among indexed | 475 |
| **Clusters found** | **1** (2 linked wallets, 2 launches in the cluster, 0 dead in the cluster) |
| Serial clusters | 0 |
| Flagged before rug | 0 |
| Warnings served | 0 |

We are not claiming results we do not have. A first cluster has appeared as resolution coverage grew from 8% to about 24% in a few hours, but it is still a two-wallet cluster with no dead launches, so it does not trigger a warning. The free RPC tier is still the bottleneck: we cannot yet raise coverage to the 80% target or drop the sampling cap. If clusters stay this thin after paid coverage, we will publish that too.

**Usage (Cloudflare analytics, read via API):** about 3,470 production function requests in the last 7 days (to 2026-11-10). This counts API calls and automated traffic and is **not** unique users. We do not have a verified unique-user figure and will not quote one. (Earlier applications quoted ~65 weekly users from Google Analytics in Oct 2026; re-check before reusing that figure.)

## 8. Milestones (12 weeks from approval, 3 phases)

**Phase 1, weeks 1–4: Coverage and data quality**
- Move to a paid RPC/indexer plan. Raise funder resolution from about 24% to **at least 80%** of eligible indexed launcher wallets (exchange and service wallets excluded).
- Remove the 25-per-5-min sampling cap. Ingest every new launch visible through our sources, and publish how we measure coverage against a public reference.
- Add a second funding hop where the first funder is a service or router.
- Weekly CC-BY snapshot export (JSON/CSV) to GitHub releases. Versioned schema and a public changelog.
- *Deliverable:* coverage and resolution report, snapshot v1, methodology doc v1.

**Phase 2, weeks 5–8: Accountability and integration**
- Publish "flagged before rug" results with confidence intervals and a public backtest page.
- **Dispute and appeal flow** for wallets and clusters: a form plus a public log of changes. Wrongly clustered wallets can be reviewed and removed.
- OpenAPI spec, a small TypeScript client (npm), and example code. Add bulk endpoints.
- Public Telegram channel: new launches from serial clusters (EN/AR).
- Contact at least 10 scanners, wallets, bots and researchers. Target at least 3 public integrations.
- *Deliverable:* backtest page, dispute flow live, OpenAPI + client, integration list.

**Phase 3, weeks 9–12: Open ecosystem and report**
- Independent methodology review. We invite 1–2 outside Solana researchers and publish their findings. We manually verify a random sample of clusters and publish the false-positive rate.
- EN/AR guide: "How serial launchers hide, and how funding links reveal them", built on real, anonymised-by-default examples.
- Public 12-week report: all KPIs, misses included. Roadmap for ongoing operation without grant money.
- *Deliverable:* final report, review notes, guide, release of the final dataset snapshot.

## 9. Budget (USD 5,000)

| Line | M1 (wk 1–4) | M2 (wk 5–8) | M3 (wk 9–12) | Total |
|---|---|---|---|---|
| Developer time (80 h total at $35/h, solo developer) | 1,120 | 840 | 840 | 2,800 |
| Paid Solana RPC/indexer plan (about $500/month, Helius Business-tier price) | 500 | 500 | 500 | 1,500 |
| Cloudflare Workers/D1 paid usage (storage and writes for the graph) | 100 | 100 | 100 | 300 |
| Docs and snapshot hosting; independent methodology review; outreach and translation | 280 | 60 | 60 | 400 |
| **Milestone payment** | **2,000** | **1,500** | **1,500** | **5,000** |

Notes:
- Funds go only to RugDNA (open data/API). Nothing is spent on advertising or on paid product features.
- We are also asking RPC providers for in-kind credits (Helius, Alchemy, GetBlock, QuickNode). If any are approved, we will **reduce the RPC line and tell you**. We will not be paid twice for the same cost.
- If USD 5,000 is more than you can fund, any financial support is welcome, even USD 500. A $500–$1,800 amount would go entirely to RPC and Cloudflare infrastructure.

## 10. KPIs (all reported publicly each month; targets are goals, not forecasts)

| KPI | Baseline (2026-11-10) | Target at week 12 |
|---|---|---|
| Funder resolution rate (eligible indexed wallets) | 228 / 957 ≈ 24% | ≥ 80% |
| Launch coverage | sampled (≤ 25 new per 5 min) | all launches visible via our sources, with coverage % published |
| Clusters (≥ 2 launcher wallets, same funder) | 1 (2 wallets, 0 dead in cluster) | published weekly; target ≥ 50 clusters. Staying this thin after paid coverage would be published and explained. |
| Serial clusters (≥ 3 dead launches) | 0 | published weekly |
| "Flagged before rug" outcomes | 0 flagged | all published with outcome (dead/survived/pending) and a confidence interval |
| Manually verified false-positive rate (sample of clusters) | none | published, with an independent reviewer |
| Public integrations of the API or dataset | 0 | ≥ 3 named, public |
| Open data snapshots | 0 | weekly CC-BY snapshots |
| Disputes handled | no process | process live. Median response time published. |

## 11. Team

**Solo founder: Mohamad Almasre**, based in Germany. Built and operates MemeCheckShield since October 2026: web app, Cloudflare Workers/Pages/D1 back end, Telegram alert bot, MetaMask Snap prototype, public accuracy tracker. GitHub: almasrem459-lab · X: @MemeCheckpq1z · Telegram: @MemeCheckShield · Email: almasrem459@gmail.com.

## 12. Open-source commitment

- Code: MIT, in the public repo (`functions/_lib/rugdna*.js`, `rugdna/schema.sql`, `docs/RUGDNA.md`). Every grant deliverable ships to the public repo.
- Data: CC-BY-4.0, bulk snapshots, stable IDs, versioned schema.
- API: free, keyless, CORS-open. Rate limits are documented and raised for integrators who ask.
- No data is sold. No paid tier ever hides RugDNA data.

## 13. Risks and how we handle them

- **False positives and harm to real people.** The dispute flow comes first. The warning threshold is conservative (≥ 3 dead and ≥ 70%). The public wording says "linked", never "is the same person". The score impact is small.
- **Privacy.** Only public on-chain data is used. We do not try to attach real-world identities.
- **Evasion.** Scammers may add hops. We handle two hops in Phase 1 and publish the method so others can improve it.
- **Rate limits and cost.** Solved with a paid RPC plan, and monitored through Cloudflare.
- **Solo developer.** Everything is open and documented so others can fork or take over.
- **Commercial layer.** MemeCheckShield also has optional paid features (Pro at 15 USDC / 30 days for higher limits, plus labelled ads and verified listings). They never change a risk score, and RugDNA stays free and open. This grant covers only the open RugDNA work. We disclose it so you can decide whether a standard or convertible grant fits better.

## 14. Links

- RugDNA: https://memecheck.pages.dev/rugdna · API stats: https://memecheck.pages.dev/api/rugdna/stats
- App: https://memecheck.pages.dev · Accuracy: https://memecheck.pages.dev/accuracy · Rugs tracker: https://memecheck.pages.dev/rugs
- Repo: https://github.com/almasrem459-lab/memecheck · Docs: https://github.com/almasrem459-lab/memecheck/blob/main/docs/RUGDNA.md
- Telegram bot: https://t.me/memecheckshield_bot · X: https://x.com/MemeCheckpq1z
