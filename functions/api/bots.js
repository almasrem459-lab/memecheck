// GET /api/bots — paper-trading bots are OFF the public site (standing rule).
// Off-site paper bots may still write KV; this endpoint no longer surfaces them.
const empty = () => new Response(JSON.stringify({ ok: true, bots: [], note: 'Paper-trading bots are not published on the public site.' }), {
  status: 200,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=60',
  },
});

export async function onRequestGet() { return empty(); }
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
}
