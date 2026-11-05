import assert from "node:assert/strict";
import { test } from "node:test";
import { getMaxResultsPerSource, normalizeSafariApp, resolveSourceOrder } from "../src/tools/preferenceValues";
import type { PriorityLabel } from "../src/types";

test("source priorities repair duplicates and ignore invalid stored values", () => {
  assert.deepEqual(resolveSourceOrder({ firstPriority: "History", secondPriority: "History", thirdPriority: "Tabs" }), [
    "history",
    "tab",
    "bookmark",
  ]);
  assert.deepEqual(
    resolveSourceOrder({ firstPriority: "bad" as PriorityLabel, secondPriority: "Bookmarks", thirdPriority: "Tabs" }),
    ["bookmark", "tab", "history"],
  );
  assert.deepEqual(
    resolveSourceOrder({
      firstPriority: undefined as unknown as PriorityLabel,
      secondPriority: "__proto__" as PriorityLabel,
      thirdPriority: "History",
    }),
    ["history", "tab", "bookmark"],
  );
});

test("result limits accept only manifest choices", () => {
  for (const value of ["50", "100", "200"]) {
    assert.equal(getMaxResultsPerSource({ maxResultsPerSource: value }), Number(value));
  }
  for (const value of ["-1", "0", "100junk", "1e9", "999999999", "50.5", "", "Infinity"]) {
    assert.equal(getMaxResultsPerSource({ maxResultsPerSource: value }), 100);
  }
});

test("browser values are constrained before OS operations", () => {
  assert.equal(normalizeSafariApp("Safari Technology Preview"), "Safari Technology Preview");
  for (const value of ["Safari", "Other App", 'Safari" & do shell script', undefined, null, 1]) {
    assert.equal(normalizeSafariApp(value), "Safari");
  }
});
