# MemeCheckShield shared cache (not served: /functions/* is 404 via _middleware)
- Browsers can only READ: GET /api/cache (KV read-only, POST -> 405) and GET /api/deep.
- Writes happen only server-side (functions/_lib/shared.js `store`): /api/deep (on-demand) and memecheck-warmer (cron).
- /api/deep?ca&chain&kind=dev|exit|core: cached -> 200; else first caller computes inline (+ctx.waitUntil so it finishes
  even if the client leaves); concurrent callers get 202 and poll (lock = Cache API entry 90 s + per-isolate in-flight map,
  no KV writes). 204 = server could not compute (50-subrequest cap, RPC limits) -> client computes locally, writes nothing.
  One kind per request: dev = dev+bundle (~15-25 subreq), exit (~30-40, needs cached dev).
- Hot copies in Cache API (free, per colo, <=10 min); KV is the cross-colo store.
- KV budget: counter wc:<UTC day>, bumped +11 with p=0.1 (unbiased, ~10% overhead). Hard stop 880/day;
  warmer paced to min(600, 40 + 600*dayFraction). Estimated use: warmer <=600, on-demand <=~280.
- Deep checks: pump.fun tokens via pump.fun API; other Solana tokens via genericDev (creator = earliest tx fee payer,
  only if the launch is reachable in 3 signature pages). EVM: core risk check only (kind=core, TTL 15 min).
- Removed: browser writes for bubble links (bubble cache now read-only; nothing writes it).
