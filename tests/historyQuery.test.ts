import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getHistoryQuery, getRemoteTabsQuery } from "../src/tools/safariData";

function sqlRow(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

const historyFixture = `
  CREATE TABLE history_items (id INTEGER PRIMARY KEY, url TEXT NOT NULL);
  CREATE TABLE history_visits (id INTEGER PRIMARY KEY, history_item INTEGER, title TEXT, visit_time REAL);
  INSERT INTO history_items VALUES
    (1, 'https://same.example'),
    (2, 'https://same.example'),
    (3, 'https://newest.example'),
    (4, 'https://older.example'),
    (5, 'https://unvisited.example'),
    (6, 'https://equal.example');
  INSERT INTO history_visits VALUES
    (10, 1, 'Old title', 100),
    (11, 1, 'Newer title', 300),
    (12, 2, 'Latest tied title', 300),
    (13, 2, 'Later inserted older visit', 200),
    (14, 3, 'Global newest', 400),
    (15, 4, 'Older', 50),
    (16, 6, 'Equal timestamp, greater visit ID', 300);
`;

test("history selects a deterministic latest complete visit per URL before global sort and limit", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(historyFixture);
    const rows = db.prepare(getHistoryQuery(100)).all().map(sqlRow);
    assert.deepEqual(
      rows.map(({ id, title, url }) => ({ id, title, url })),
      [
        { id: 3, title: "Global newest", url: "https://newest.example" },
        { id: 6, title: "Equal timestamp, greater visit ID", url: "https://equal.example" },
        { id: 2, title: "Latest tied title", url: "https://same.example" },
        { id: 4, title: "Older", url: "https://older.example" },
      ],
    );
    const expectedDate = sqlRow(
      db.prepare("SELECT datetime(300 + 978307200, 'unixepoch', 'localtime') AS value").get(),
    ).value;
    assert.equal(rows[2].lastVisited, expectedDate);
    assert.deepEqual(db.prepare(getHistoryQuery(2)).all(), rows.slice(0, 2));
    // Date modifiers are SQL string literals, not legacy double-quoted identifiers.
    assert.ok(getHistoryQuery(100).includes("'unixepoch', 'localtime'"));
    assert.doesNotMatch(getHistoryQuery(100), /GROUP BY/);
  } finally {
    db.close();
  }
});

test("history empty database yields an empty result and query bounds are enforced", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE history_items (id INTEGER, url TEXT); CREATE TABLE history_visits (id INTEGER, history_item INTEGER, title TEXT, visit_time REAL);",
    );
    assert.deepEqual(db.prepare(getHistoryQuery(10)).all(), []);
    for (const limit of [NaN, Infinity, -1, 0, 2.5, 2001, "1; DROP TABLE history_items" as unknown as number]) {
      const query = getHistoryQuery(limit);
      assert.match(query, /LIMIT 2000\s*$/);
      assert.deepEqual(db.prepare(query).all(), []);
    }
  } finally {
    db.close();
  }
});

test("remote query joins devices, orders deterministically and clamps the independent source cap", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE cloud_tabs (tab_uuid TEXT, device_uuid TEXT, title TEXT, url TEXT);
      CREATE TABLE cloud_tab_devices (device_uuid TEXT, device_name TEXT);
      INSERT INTO cloud_tab_devices VALUES ('phone', 'Phone'), ('laptop', 'Laptop');
      INSERT INTO cloud_tabs VALUES
        ('p-1', 'phone', 'Phone tab', 'https://phone.example'),
        ('l-2', 'laptop', 'Laptop second', 'https://second.example'),
        ('l-1', 'laptop', 'Laptop first', 'https://first.example'),
        ('missing', 'unknown', 'Unjoined', 'https://missing.example');
    `);
    const rows = db.prepare(getRemoteTabsQuery(2)).all().map(sqlRow);
    assert.deepEqual(
      rows.map((row) => row.uuid),
      ["l-1", "l-2"],
    );
    assert.deepEqual(Object.keys(rows[0]).sort(), ["device_name", "device_uuid", "title", "url", "uuid"]);
    assert.match(getRemoteTabsQuery(401), /LIMIT 400\s*$/);
    assert.match(getRemoteTabsQuery(NaN), /LIMIT 400\s*$/);
    assert.equal(db.prepare(getRemoteTabsQuery(400)).all().length, 3);
  } finally {
    db.close();
  }
});

test(
  "history query also runs on macOS system SQLite with synthetic in-memory data",
  { skip: process.platform !== "darwin" },
  () => {
    const output = execFileSync("/usr/bin/sqlite3", ["-json", ":memory:", `${historyFixture}\n${getHistoryQuery(3)}`], {
      encoding: "utf8",
    });
    const rows: unknown = JSON.parse(output);
    assert.ok(Array.isArray(rows));
    assert.deepEqual(
      rows.map((row: unknown) => sqlRow(row).title),
      ["Global newest", "Equal timestamp, greater visit ID", "Latest tied title"],
    );
  },
);
