import assert from "node:assert/strict";
import { test } from "node:test";
import { createEntrySearch, dedupeEntriesByUrl, limitSourceResults, normalizeUrl, searchEntries } from "../src/utils";
import { toBookmarkEntries, toHistoryEntries, toSectionResults, toTabEntries } from "../src/tools/unifiedEntries";
import type { UnifiedEntry } from "../src/types";

function entry(id: string, title: string, url = `https://example.com/${id}`): UnifiedEntry {
  return { id, title, url, kind: "tab" };
}

test("URL keys normalize hosts and fragments but preserve path/query case", () => {
  assert.equal(normalizeUrl("HTTPS://EXAMPLE.COM/a/#part"), normalizeUrl("https://example.com/a"));
  assert.notEqual(normalizeUrl("https://example.com/Doc"), normalizeUrl("https://example.com/doc"));
  assert.notEqual(normalizeUrl("https://example.com/?key=A"), normalizeUrl("https://example.com/?key=a"));
  assert.equal(normalizeUrl("mailto:User@example.com"), "mailto:User@example.com");
  assert.equal(normalizeUrl("about:blank"), "about:blank");
  assert.equal(normalizeUrl("file:///Users/Name/Doc"), "file:///Users/Name/Doc");
  assert.equal(normalizeUrl(" Invalid URL "), "Invalid URL");
});

test("token containment precedes fuzzy-only results without duplicate IDs", () => {
  const entries = [entry("typo", "Safrai"), entry("exact", "Safari"), entry("other", "Unrelated")];
  const search = createEntrySearch(entries);
  assert.deepEqual(
    search("safari").map((item) => item.id),
    ["exact", "typo"],
  );
  assert.deepEqual(search("safari"), searchEntries(entries, "safari", true));
  assert.deepEqual(
    search("safari", false).map((item) => item.id),
    ["exact"],
  );
  assert.deepEqual(search("z"), []);
  assert.deepEqual(search("  "), entries);
  assert.notEqual(search(""), entries);
});

test("all tokens can match different fields and repeated queries reuse the same searcher", () => {
  const entries = [{ ...entry("one", "Developer"), detail: "My Mac", domain: "example.com" }];
  const search = createEntrySearch(entries);
  assert.deepEqual(search("developer mac example", false), entries);
  assert.deepEqual(search("DEVELOPER MAC", false), entries);
  assert.deepEqual(search("missing token", false), []);
});

test("deduplicate after searching and before capping, retaining cross-kind URLs", () => {
  const items = [
    entry("local", "Original", "https://example.com/a"),
    entry("remote", "Remote unique title", "https://example.com/a#part"),
    entry("next", "Other"),
  ];
  assert.equal(limitSourceResults(items, 2).length, 2);
  assert.equal(createEntrySearch(items)("remote unique", false)[0].id, "remote");
  const bookmark = { ...items[0], id: "bookmark", kind: "bookmark" as const };
  assert.equal(dedupeEntriesByUrl([...items, bookmark]).length, 3);
  const grouped = toSectionResults(dedupeEntriesByUrl([...items, bookmark]));
  assert.deepEqual(
    grouped.tab.map((item) => item.id),
    ["local", "next"],
  );
  assert.deepEqual(
    grouped.bookmark.map((item) => item.id),
    ["bookmark"],
  );
});

test("history sorting uses a copy and chooses newest duplicate before cap", () => {
  const older = { ...entry("older", "Older"), kind: "history" as const, sortDate: 1 };
  const newer = { ...older, id: "newer", sortDate: 3 };
  const middle = { ...older, id: "middle", url: "https://example.com/other", sortDate: 2 };
  const items = [older, middle, newer];
  assert.deepEqual(
    limitSourceResults(items, 2, true).map((item) => item.id),
    ["newer", "middle"],
  );
  assert.deepEqual(items, [older, middle, newer]);
});

test("source adapters preserve locality, remote inclusion and empty title fallbacks", () => {
  const local = { uuid: "1", title: "", url: "https://example.com", window_id: 1, index: 2, is_local: true };
  const remote = { uuid: "2", title: "", url: "https://remote.test", device_uuid: "d", device_name: "Phone" };
  const tabs = toTabEntries([local], [remote], true);
  assert.equal(tabs[0].title, local.url);
  assert.equal(tabs[0].tabIndex, 2);
  assert.equal(tabs[1].tabIndex, undefined);
  assert.equal(toTabEntries([local], [remote], false).length, 1);
  assert.equal(toBookmarkEntries([{ uuid: "b", title: "", url: local.url, folder: "" }])[0].title, local.url);
  assert.equal(toHistoryEntries([{ id: 1, url: local.url, lastVisited: "invalid" }])[0].sortDate, undefined);
});
