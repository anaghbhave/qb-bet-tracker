import { env } from "cloudflare:workers";

type TrackerRow = {
  value: string;
  updated_at: string;
};

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("The shared scoreboard database is unavailable.");
  return db;
}

async function ensureTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS tracker_state (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
}

export async function GET() {
  try {
    const db = database();
    await ensureTable(db);
    const row = await db
      .prepare("SELECT value, updated_at FROM tracker_state WHERE id = 1")
      .first<TrackerRow>();

    return Response.json({
      state: row ? JSON.parse(row.value) : null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error) {
    console.error("Unable to load tracker state", error);
    return Response.json({ error: "Unable to load the shared scoreboard." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { state?: unknown };
    if (!body.state || typeof body.state !== "object") {
      return Response.json({ error: "A scoreboard state object is required." }, { status: 400 });
    }

    const value = JSON.stringify(body.state);
    if (value.length > 100_000) {
      return Response.json({ error: "The scoreboard state is too large." }, { status: 413 });
    }

    const db = database();
    await ensureTable(db);
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO tracker_state (id, value, updated_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(value, updatedAt)
      .run();

    return Response.json({ ok: true, updatedAt });
  } catch (error) {
    console.error("Unable to save tracker state", error);
    return Response.json({ error: "Unable to save the shared scoreboard." }, { status: 500 });
  }
}
