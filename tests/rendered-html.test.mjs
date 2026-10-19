import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TRACKER_URL = new URL("../public/qb-bet-tracker.html", import.meta.url);

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

/**
 * The tracker's scoring helpers live above the "rendering" divider and touch no
 * DOM, so the real source can be evaluated here rather than reimplemented.
 */
async function loadScoring() {
  const tracker = await readFile(TRACKER_URL, "utf8");
  const script = tracker.slice(tracker.indexOf("const SEASON_YEAR = 2026;"));
  const pure = script.slice(0, script.indexOf("/* ---------- rendering ---------- */"));
  return new Function(
    `${pure}
     return { state, num, ratioValue, compareCategory, compareRatio, computeResults, betState, recordFromGameLog };`,
  )();
}

function score(results) {
  return Object.values(results).reduce(
    (acc, result) => {
      if (result.winner === "a") acc.daniels++;
      if (result.winner === "b") acc.prescott++;
      if (result.winner === "push") acc.even++;
      return acc;
    },
    { daniels: 0, prescott: 0, even: 0 },
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

test("pulls every number from ESPN and exposes no editable fields", async () => {
  const tracker = await readFile(TRACKER_URL, "utf8");

  assert.match(tracker, /site\.web\.api\.espn\.com/);
  assert.match(tracker, /sports\.core\.api\.espn\.com/);
  assert.doesNotMatch(tracker, /\/api\/espn/, "ESPN is called directly, no proxy");
  assert.doesNotMatch(tracker, /<input/i, "the tracker must be read-only");
  assert.doesNotMatch(tracker, /contenteditable/i);
  assert.doesNotMatch(tracker, /\/api\/state/, "shared persistence was removed");
  assert.doesNotMatch(tracker, /fetch\(['"`]\//, "the page must not depend on same-origin routes");
  assert.doesNotMatch(tracker, /window\.storage/);
  assert.match(tracker, /const SEASON_YEAR = 2026;/);
  assert.match(tracker, /s\.season\.year === SEASON_YEAR/);
});

test("total touchdowns add passing and rushing, not ESPN's scoring column", async () => {
  const tracker = await readFile(TRACKER_URL, "utf8");

  // ESPN's "scoring" category TD column counts only TDs the player scored
  // himself, so reading it drops every touchdown pass.
  assert.doesNotMatch(tracker, /scoring\.labels\.indexOf\('TD'\)/);
  assert.match(tracker, /out\.passTd = statFromRow\(passing, passRow, 'TD'\);/);
  assert.match(tracker, /out\.rushTd = statFromRow\(rushing, rushRow, 'TD'\);/);
  assert.match(tracker, /\(passTd \?\? 0\) \+ \(rushTd \?\? 0\)/);
});

test("a clean sheet beats a quarterback with picks in the TD:INT category", async () => {
  const { compareRatio, ratioValue } = await loadScoring();

  // Week 1, 2026: both threw 2 TDs, Prescott threw the only interception.
  const daniels = { passTd: 2, int: 0 };
  const prescott = { passTd: 2, int: 1 };

  assert.equal(ratioValue(daniels.passTd, daniels.int), Infinity);
  assert.equal(ratioValue(prescott.passTd, prescott.int), 2);
  assert.equal(compareRatio(daniels, prescott).winner, "a");
  assert.equal(compareRatio(prescott, daniels).winner, "b");
});

test("the TD:INT ratio counts passing touchdowns only, never rushing ones", async () => {
  const { compareRatio } = await loadScoring();

  // Daniels: 3 passing + 2 rushing TDs, 1 pick. Prescott: 4 passing, 1 pick.
  // On passing alone Prescott wins it 4.00 to 3.00; counting the rushing scores
  // would wrongly tie them at 5.00 vs 4.00 in Daniels' favour.
  const daniels = { passTd: 3, rushTd: 2, td: 5, int: 1 };
  const prescott = { passTd: 4, rushTd: 0, td: 4, int: 1 };

  assert.equal(compareRatio(daniels, prescott).winner, "b");
  assert.equal(compareRatio(daniels, prescott).marginLabel, "+1.00");
});

test("two clean sheets are broken by passing touchdown count, not called even", async () => {
  const { compareRatio } = await loadScoring();

  assert.equal(compareRatio({ passTd: 5, int: 0 }, { passTd: 2, int: 0 }).winner, "a");
  assert.equal(compareRatio({ passTd: 2, int: 0 }, { passTd: 5, int: 0 }).winner, "b");
  assert.equal(compareRatio({ passTd: 3, int: 0 }, { passTd: 3, int: 0 }).winner, "push");

  // Rushing scores must not break the tie between two clean sheets either.
  assert.equal(
    compareRatio({ passTd: 3, rushTd: 4, int: 0 }, { passTd: 3, rushTd: 0, int: 0 }).winner,
    "push",
  );
});

test("no touchdowns and no picks does not count as a perfect ratio", async () => {
  const { ratioValue, compareRatio } = await loadScoring();

  assert.equal(ratioValue(0, 0), 0);
  // A quarterback with 5 TDs and 1 pick beats one who has done nothing.
  assert.equal(compareRatio({ passTd: 0, int: 0 }, { passTd: 5, int: 1 }).winner, "b");
});

test("scores the real week 1 2026 slate as Daniels 2, Prescott 1, two dead even", async () => {
  const scoring = await loadScoring();

  scoring.state.current.daniels = { qbr: "66.4", rtg: "85.9", td: 2, passTd: 2, int: "0", wins: 0 };
  scoring.state.current.prescott = { qbr: "89.0", rtg: "84.8", td: 2, passTd: 2, int: "1", wins: 0 };

  const results = scoring.computeResults();
  assert.equal(results.qbr.winner, "b", "Prescott's 89.0 QBR tops 66.4");
  assert.equal(results.rtg.winner, "a", "Daniels' 85.9 rating tops 84.8");
  assert.equal(results.td.winner, "push", "both sit on 2 total touchdowns");
  assert.equal(results.ratio.winner, "a", "Daniels is the only one without a pick");
  assert.equal(results.wins.winner, "push", "both teams are 0-1");

  assert.deepEqual(score(results), { daniels: 2, prescott: 1, even: 2 });
});

test("the category leader wins outright; ties do not have to be settled", async () => {
  const { betState } = await loadScoring();
  const tracker = await readFile(TRACKER_URL, "utf8");

  // There is no threshold to clear: 2-1 with two dead even is a win, not a stall.
  assert.equal(betState(2, 1), "daniels");
  assert.equal(betState(1, 2), "prescott");
  assert.equal(betState(1, 0), "daniels");
  // Only a level category count is an actual tie.
  assert.equal(betState(2, 2), "level");
  assert.equal(betState(0, 0), "level");

  assert.doesNotMatch(tracker, /clinch/i, "the bet is not a race to three");
  assert.doesNotMatch(tracker, /score[DP] >= 3/);
});

test("wins count only the games the quarterback actually appeared in", async () => {
  const { recordFromGameLog } = await loadScoring();

  // Daniels' real 2026 log: he played three games (L, L, T) while Washington
  // went 1-3-1. The win came in a game he did not appear in, so it is not his.
  const log = {
    events: {
      e1: { gameResult: "L" },
      e2: { gameResult: "L" },
      e5: { gameResult: "T" },
    },
    seasonTypes: [
      {
        displayName: "2026 Regular Season",
        categories: [
          { events: [{ eventId: "e1" }, { eventId: "e2" }, { eventId: "e5" }] },
        ],
      },
    ],
  };

  assert.deepEqual(recordFromGameLog(log), {
    wins: 0,
    losses: 2,
    ties: 1,
    record: "0-2-1",
    gamesCounted: 3,
  });
});

test("a quarterback who played every game keeps the full record", async () => {
  const { recordFromGameLog } = await loadScoring();

  // Prescott's real 2026 log: six games, L W L W L L.
  const results = ["L", "W", "L", "W", "L", "L"];
  const log = {
    events: Object.fromEntries(results.map((r, i) => [`e${i}`, { gameResult: r }])),
    seasonTypes: [
      {
        displayName: "2026 Regular Season",
        categories: [{ events: results.map((_, i) => ({ eventId: `e${i}` })) }],
      },
    ],
  };

  const record = recordFromGameLog(log);
  assert.equal(record.wins, 2);
  assert.equal(record.record, "2-4", "no ties, so no third number");
  assert.equal(record.gamesCounted, 6);
});

test("preseason games never count toward the record", async () => {
  const { recordFromGameLog } = await loadScoring();

  const log = {
    events: { pre1: { gameResult: "W" }, reg1: { gameResult: "L" } },
    seasonTypes: [
      { displayName: "2026 Preseason", categories: [{ events: [{ eventId: "pre1" }] }] },
      { displayName: "2026 Regular Season", categories: [{ events: [{ eventId: "reg1" }] }] },
    ],
  };

  assert.deepEqual(recordFromGameLog(log), {
    wins: 0,
    losses: 1,
    ties: 0,
    record: "0-1",
    gamesCounted: 1,
  });
});

test("a quarterback who has not played yet has no record at all", async () => {
  const { recordFromGameLog } = await loadScoring();

  const empty = recordFromGameLog({ events: {}, seasonTypes: [] });
  assert.equal(empty.wins, null, "zero wins and never played are different things");
  assert.equal(empty.record, null);
});

test("a category with no data anywhere stays undecided", async () => {
  const scoring = await loadScoring();

  scoring.state.current.daniels = { qbr: null, rtg: null, td: null, passTd: null, int: null, wins: null };
  scoring.state.current.prescott = { qbr: null, rtg: null, td: null, passTd: null, int: null, wins: null };

  const results = scoring.computeResults();
  assert.deepEqual(score(results), { daniels: 0, prescott: 0, even: 0 });
  assert.equal(results.qbr.winner, null);
  assert.equal(results.ratio.winner, null);
});

test("margins are reported so near-ties are visible", async () => {
  const { compareCategory } = await loadScoring();

  assert.equal(compareCategory(85.9, 84.8, 1).marginLabel, "+1.1");
  assert.equal(compareCategory(66.4, 89.0, 1).marginLabel, "+22.6");
  assert.equal(compareCategory(2, 2, 0).marginLabel, "");
});

test("the GitHub Pages copy is identical to the tracker source", async () => {
  const [source, published] = await Promise.all([
    readFile(TRACKER_URL, "utf8"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
  ]);
  assert.equal(
    published,
    source,
    "docs/index.html has drifted; re-run `npm run sync:pages`",
  );
});
