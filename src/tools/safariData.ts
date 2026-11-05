import type { BookmarkEntry, LocalTab, SafariAppIdentifier } from "../types";
import { getUrlDomain } from "../utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function isSafariAppIdentifier(value: unknown): value is SafariAppIdentifier {
  return value === "Safari" || value === "Safari Technology Preview";
}

export function assertSafariAppIdentifier(value: unknown): asserts value is SafariAppIdentifier {
  if (!isSafariAppIdentifier(value)) {
    throw new Error("Unsupported Safari application");
  }
}

/** Invalid transport throws; malformed individual records are safely skipped. */
export function parseLocalTabs(value: unknown): LocalTab[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid local tabs response: expected an array");
  }

  const tabs: LocalTab[] = [];
  for (const record of value) {
    if (!isRecord(record)) continue;
    const windowId = record.window_id;
    const tabIndex = record.index;
    const url = nonEmptyString(record.url);
    if (
      typeof windowId !== "number" ||
      !Number.isSafeInteger(windowId) ||
      windowId <= 0 ||
      typeof tabIndex !== "number" ||
      !Number.isSafeInteger(tabIndex) ||
      tabIndex <= 0 ||
      !url
    ) {
      continue;
    }
    tabs.push({
      uuid: `${windowId}-${tabIndex}`,
      title: nonEmptyString(record.title) ?? url,
      url,
      window_id: windowId,
      index: tabIndex,
      is_local: true,
    });
  }
  return tabs;
}

export function normalizeFolderTitle(title: string): string {
  if (title === "com.apple.ReadingList") return "Reading List";
  if (title === "BookmarksBar") return "Favorites";
  if (title === "BookmarksMenu") return "Bookmarks Menu";
  return title;
}

export function flattenBookmarks(node: unknown, folderPath = ""): BookmarkEntry[] {
  if (!isRecord(node) || node.Title === "com.apple.ReadingList") return [];

  if (node.WebBookmarkType === "WebBookmarkTypeLeaf") {
    const url = nonEmptyString(node.URLString);
    if (!url) return [];
    const readingList = isRecord(node.ReadingListNonSync) ? node.ReadingListNonSync : undefined;
    const uriDictionary = isRecord(node.URIDictionary) ? node.URIDictionary : undefined;
    return [
      {
        uuid: nonEmptyString(node.WebBookmarkUUID) ?? url,
        title:
          nonEmptyString(node.Title) ??
          nonEmptyString(readingList?.Title) ??
          nonEmptyString(uriDictionary?.title) ??
          url,
        url,
        folder: folderPath,
        domain: getUrlDomain(url),
      },
    ];
  }

  const title = typeof node.Title === "string" ? normalizeFolderTitle(node.Title) : "";
  const nextPath = title ? (folderPath ? `${folderPath}/${title}` : title) : folderPath;
  const children: unknown[] = Array.isArray(node.Children) ? node.Children : [];
  return children.flatMap((child) => flattenBookmarks(child, nextPath));
}

/** Only internally derived finite positive integers may enter SQL strings. */
export function clampQueryLimit(value: number, maximum: number): number {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : maximum;
}

export function getHistoryQuery(maxResults: number): string {
  const limit = clampQueryLimit(maxResults, 2000);
  return `
    WITH ranked_visits AS (
      SELECT history_items.id AS id,
             history_visits.title AS title,
             history_items.url AS url,
             history_visits.visit_time AS visit_time,
             history_visits.id AS visit_id,
             ROW_NUMBER() OVER (
               PARTITION BY history_items.url
               ORDER BY history_visits.visit_time DESC, history_visits.id DESC
             ) AS visit_rank
        FROM history_items
        INNER JOIN history_visits ON history_visits.history_item = history_items.id
    )
    SELECT id, title, url,
           datetime(visit_time + 978307200, 'unixepoch', 'localtime') AS lastVisited
      FROM ranked_visits
      WHERE visit_rank = 1
      ORDER BY visit_time DESC, visit_id DESC
      LIMIT ${limit}
  `;
}

export function getRemoteTabsQuery(maxResults: number): string {
  const limit = clampQueryLimit(maxResults, 400);
  return `
    SELECT t.tab_uuid AS uuid,
           d.device_uuid,
           d.device_name,
           t.title,
           t.url
      FROM cloud_tabs t
      INNER JOIN cloud_tab_devices d ON t.device_uuid = d.device_uuid
      ORDER BY d.device_name ASC, t.tab_uuid ASC
      LIMIT ${limit}
  `;
}
