import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafariAppIdentifier,
  clampQueryLimit,
  flattenBookmarks,
  isSafariAppIdentifier,
  normalizeFolderTitle,
  parseLocalTabs,
} from "../src/tools/safariData";
import { classifySourceError, toSourceError } from "../src/tools/sourceErrors";

test("local JSON transport preserves delimiters, quotes, slashes, newlines and Unicode", () => {
  const title = '::REC::::COL:: "quoted" \\ path\n中文 Ω';
  const url = 'https://example.com/::COL::?value="hello"&path=\\root#::REC::';
  const decoded: unknown = JSON.parse(JSON.stringify([{ window_id: 3, index: 7, title, url }]));
  assert.deepEqual(parseLocalTabs(decoded), [{ uuid: "3-7", window_id: 3, index: 7, title, url, is_local: true }]);
});

test("local parser distinguishes valid empty output from malformed transport", () => {
  assert.deepEqual(parseLocalTabs([]), []);
  for (const value of [null, undefined, {}, "[]", 42]) {
    assert.throws(() => parseLocalTabs(value), /expected an array/);
  }
});

test("local parser skips invalid records without renumbering surviving positions", () => {
  const valid = { window_id: 2, index: 5, title: "", url: "https://example.com" };
  const invalidPositions = [0, -1, 1.5, NaN, Infinity, "1", Number.MAX_SAFE_INTEGER + 1, null];
  const records: unknown[] = [
    null,
    "bad",
    [],
    ...invalidPositions.map((window_id) => ({ ...valid, window_id })),
    ...invalidPositions.map((index) => ({ ...valid, index })),
    ...["", "   ", null, 12].map((url) => ({ ...valid, url })),
    valid,
    { ...valid, index: 9, title: { invalid: true } },
  ];
  const tabs = parseLocalTabs(records);
  assert.deepEqual(
    tabs.map(({ uuid, title }) => ({ uuid, title })),
    [
      { uuid: "2-5", title: valid.url },
      { uuid: "2-9", title: valid.url },
    ],
  );
});

test("only whitelisted Safari applications are accepted", () => {
  for (const app of ["Safari", "Safari Technology Preview"]) {
    assert.equal(isSafariAppIdentifier(app), true);
    assert.doesNotThrow(() => assertSafariAppIdentifier(app));
  }
  for (const app of ["SafariTechnologyPreview", "safari", "Finder", 'Safari"; evil()', null, 1]) {
    assert.equal(isSafariAppIdentifier(app), false);
    assert.throws(() => assertSafariAppIdentifier(app), /Unsupported/);
  }
});

const leaf = (url: string, extra: Record<string, unknown> = {}) => ({
  WebBookmarkType: "WebBookmarkTypeLeaf",
  URLString: url,
  ...extra,
});

test("bookmarks exclude the system Reading List, but preserve user folders of that name", () => {
  const results = flattenBookmarks({
    Children: [
      { Title: "com.apple.ReadingList", Children: [leaf("https://excluded.example")] },
      { Title: "Reading List", Children: [leaf("https://included.example")] },
      { Title: "BookmarksBar", Children: [{ Title: "Nested", Children: [leaf("https://favorite.example")] }] },
      { Title: "BookmarksMenu", Children: [leaf("https://menu.example")] },
    ],
  });
  assert.deepEqual(
    results.map(({ url, folder }) => ({ url, folder })),
    [
      { url: "https://included.example", folder: "Reading List" },
      { url: "https://favorite.example", folder: "Favorites/Nested" },
      { url: "https://menu.example", folder: "Bookmarks Menu" },
    ],
  );
  assert.equal(normalizeFolderTitle("com.apple.ReadingList"), "Reading List");
  assert.equal(normalizeFolderTitle("Custom"), "Custom");
});

test("bookmarks tolerate unknown node shapes and use nonempty title fallbacks in original order", () => {
  for (const node of [null, undefined, 1, "bad", [], { Children: "bad" }]) {
    assert.deepEqual(flattenBookmarks(node), []);
  }
  const results = flattenBookmarks({
    Title: 4,
    Children: [
      null,
      3,
      leaf(""),
      leaf("   "),
      leaf("https://example.com/a", { Title: "Primary", ReadingListNonSync: { Title: "Secondary" } }),
      leaf("https://example.com/b", { Title: "", ReadingListNonSync: { Title: "Reading" } }),
      leaf("https://example.com/c", { Title: {}, ReadingListNonSync: null, URIDictionary: { title: "URI" } }),
      leaf("https://example.com/d", { Title: " ", URIDictionary: "invalid", WebBookmarkUUID: 2 }),
      leaf("https://example.com/e", { Title: "UUID title", WebBookmarkUUID: "stable-uuid" }),
    ],
  });
  assert.deepEqual(
    results.map((entry) => entry.title),
    ["Primary", "Reading", "URI", "https://example.com/d", "UUID title"],
  );
  assert.equal(results[3].uuid, results[3].url);
  assert.equal(results[4].uuid, "stable-uuid");
  assert.ok(results.every((entry) => entry.folder === "" && entry.domain === "example.com"));
});

test("SQL limits accept only positive integers and clamp to source caps", () => {
  for (const maximum of [400, 2000]) {
    assert.equal(clampQueryLimit(1, maximum), 1);
    assert.equal(clampQueryLimit(100, maximum), 100);
    assert.equal(clampQueryLimit(maximum + 1, maximum), maximum);
    for (const invalid of [NaN, Infinity, -Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(clampQueryLimit(invalid, maximum), maximum);
    }
    assert.equal(clampQueryLimit("1; DROP TABLE history_items" as unknown as number, maximum), maximum);
  }
});

test("source errors classify permission variants without claiming all failures are permissions", () => {
  const permissionErrors: unknown[] = [
    new Error("Operation Not Permitted"),
    new Error("PERMISSION DENIED"),
    new Error("Authorization Denied"),
    new Error("You do not have permission to access the database."),
    { name: "PermissionError", message: "Protected" },
    { name: "permissionerror" },
    { code: "EPERM" },
    { code: "eacces" },
    "error: EACCES",
    new Error("Not Authorized"),
  ];
  for (const error of permissionErrors) {
    assert.equal(classifySourceError(error), "permission");
    assert.equal(classifySourceError(toSourceError(error)), "permission");
  }
  for (const error of [
    new Error("no such table: cloud_tabs"),
    { code: "ENOENT" },
    new SyntaxError("Invalid JSON"),
    null,
  ]) {
    assert.equal(classifySourceError(error), "unavailable");
    assert.equal(classifySourceError(toSourceError(error)), "unavailable");
  }
  const original = new Error("Original");
  assert.equal(toSourceError(original), original);
  assert.equal(toSourceError("Failure").message, "Failure");
});
