# Study tracker

`tracker.js` runs inside the `memecheck-warmer` cron Worker (minute 7 = scan, minute 37 = recheck) and stores records in KV `study:v2`. In the deploy repo it imports `core.js`, `study-outcome.js` and `functions/_lib/shared.js` from the site root (adjust the relative paths to your layout).
