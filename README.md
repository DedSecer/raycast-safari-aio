# Safari-AIO

Search Safari tabs, bookmarks, and history in a single Raycast command.

## Features

- Search local tabs, optional iCloud tabs, bookmarks, and recent history together.
- Results are labeled as Tab, Bookmark, or History.
- Choose source priority and a flat list or grouped sections.
- Temporarily show or hide sources from any result's action menu. These filters reset when the command is reopened; they do not stop background acquisition.
- Switch to an existing local tab, open a URL, or copy it.
- Unavailable protected sources show a non-blocking warning with a retry action; other sources remain usable.

## Preferences

In Raycast command preferences for Safari-AIO:

- **Local Safari Browser:** Safari or Safari Technology Preview. This controls local tabs and history. Bookmarks and iCloud tabs still use the standard Safari data paths.
- **Devices:** include iCloud tabs. Disabling this preference stops iCloud database queries, unlike the temporary source filter.
- **Website Icons:** show favicons (enabled by default). Icons are requested from Google's favicon service using the website hostname, not the full path or query. Disable this option to use local generic icons without favicon requests.
- **List Mode:** flat or grouped sections.
- **Priority 1 / 2 / 3:** source order; repeated choices are repaired automatically.
- **Max Results Per Source:** 50 / 100 / 200 unique results of each kind.

## Search behavior

All query tokens are matched across title, URL, domain, and details before fuzzy-only matches are appended. Each source is searched separately, and history matches are then ordered newest-first. Source priority takes precedence over cross-source relevance.

Search uses a bounded candidate set, not the entire history database: history fetches up to 10 times the display limit, and iCloud tabs up to twice the display limit. Older history or additional remote tabs outside that set cannot match a query. Bookmarks and local tabs are loaded without that candidate cap.

Deduplication removes URL fragments and HTTP(S) trailing slashes, but preserves path/query case and query strings. Identical URLs in different source kinds remain visible. System Reading List items are intentionally excluded; ordinary bookmark folders named “Reading List” are not.

## Permissions and privacy

- This extension is macOS-only and never writes Safari's original plist or SQLite files.
- Safari history and bookmarks may require **Full Disk Access for Raycast**. Safari automation permission is needed for local tabs and switching; iCloud data can have separate access restrictions.
- A local-tab automation failure continues to degrade silently to no local tabs. Other unavailable sources show warnings; retry after correcting access.
- SQL uses Raycast's read-only execution helper. That helper may copy a locked/unavailable database to a temporary location before retrying; this extension does not add persistent history/iCloud result caching.
- Cached local tabs and bookmarks retain Raycast's existing cache behavior. Website icon requests can be disabled independently as described above.

## Development

Use Node.js 22.14 or later (SQLite fixture tests use `node:sqlite`).

```sh
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run dev
```

Tests use synthetic data only, including an in-memory SQLite database; no personal Safari files are opened. Tests are separate from the Raycast command entry point. Build and lint are not substitutes for the explicit type check.

For runtime changes, launch Safari-AIO in Raycast development mode and check Safari and Safari Technology Preview, flat/section modes, empty and fuzzy queries, limits, local tab switching after moving/closing a tab, remote opening, source filters, permission failure/recovery, and favicon settings. Actual automation and macOS permissions require manual validation.

Publish only through `npm run publish` for the Raycast Store; never use `npm publish`.
