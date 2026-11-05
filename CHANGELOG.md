# safari-aio Changelog

## [Reliability and Search Improvements] - 2026-11-05

- Preserve URL path/query case when deduplicating, and apply result limits after deduplication.
- Reuse search indexes while retaining exact-token-first matching and source ordering.
- Select the newest complete history visit deterministically for each URL.
- Isolate missing/denied database sources and allow retrying warnings without blocking other results.
- Replace delimiter-based local tab transport with validated JSON and improve tab action feedback.
- Keep user bookmark folders named Reading List while excluding Safari's system Reading List.
- Add an option to disable third-party favicon requests.
- Add explicit TypeScript checks and synthetic-data regression tests.

## [Initial Implementation] - 2026-04-13

- Added a view command that searches Safari tabs, bookmarks, and history together.
- Added type labels for each result: Tab, Bookmark, History.
- Added configurable priority sorting with Priority 1, Priority 2, and Priority 3.
- Added configurable list display mode: flat mixed list or grouped sections.
- Added optional iCloud remote tabs support.
