import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the tracker shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Bet: Daniels vs\. Prescott<\/title>/i);
  assert.match(html, /src="\/qb-bet-tracker\.html"/i);
  assert.match(html, /title="Jayden Daniels vs\. Dak Prescott bet tracker"/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships shared persistence and same-origin ESPN access", async () => {
  const tracker = await readFile(
    new URL("../public/qb-bet-tracker.html", import.meta.url),
    "utf8",
  );

  assert.match(tracker, /fetch\('\/api\/state'/);
  assert.match(tracker, /\/api\/espn\?kind=athlete/);
  assert.match(tracker, /\/api\/espn\?kind=team/);
  assert.doesNotMatch(tracker, /window\.storage/);
  assert.match(tracker, /aria-label="Jayden Daniels QBR"/);
});
