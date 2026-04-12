import { useCachedPromise, useSQL } from "@raycast/utils";
import { useState } from "react";
import { homedir } from "os";
import { resolve } from "path";
import { promisify } from "util";
import { runAppleScript } from "@raycast/utils";
import { execFile } from "child_process";
import { parse as parsePlist } from "plist";
import { BookmarkEntry, BookmarkLeaf, BookmarkTreeNode, HistoryItem, LocalTab, RemoteTab } from "../types";
import { escapeSqlLike, getUrlDomain } from "../utils";

const execFileAsync = promisify(execFile);

const BOOKMARKS_PLIST_PATH = `${homedir()}/Library/Safari/Bookmarks.plist`;
const CLOUD_TABS_DB = `${resolve(homedir(), "Library/Containers/com.apple.Safari/Data/Library/Safari")}/CloudTabs.db`;

function normalizeFolderTitle(title: string): string {
  if (title === "com.apple.ReadingList") {
    return "Reading List";
  }
  if (title === "BookmarksBar") {
    return "Favorites";
  }
  if (title === "BookmarksMenu") {
    return "Bookmarks Menu";
  }

  return title;
}

function flattenBookmarks(node: BookmarkTreeNode, folderPath = ""): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];

  const isLeaf = node.WebBookmarkType === "WebBookmarkTypeLeaf";
  if (isLeaf) {
    const leaf = node as BookmarkLeaf;
    if (typeof leaf.URLString === "string" && leaf.URLString.length > 0) {
      const title = leaf.Title ?? leaf.ReadingListNonSync?.Title ?? leaf.URIDictionary?.title ?? leaf.URLString;
      entries.push({
        uuid: leaf.WebBookmarkUUID ?? leaf.URLString,
        title,
        url: leaf.URLString,
        folder: folderPath,
        domain: getUrlDomain(leaf.URLString),
      });
    }
    return entries;
  }

  const children = Array.isArray(node.Children) ? node.Children : [];
  const rawTitle = typeof node.Title === "string" ? normalizeFolderTitle(node.Title) : "";

  // Reading List is not part of bookmark search for this command.
  if (rawTitle === "Reading List") {
    return entries;
  }

  const nextFolderPath = rawTitle ? (folderPath ? `${folderPath}/${rawTitle}` : rawTitle) : folderPath;

  for (const child of children) {
    entries.push(...flattenBookmarks(child, nextFolderPath));
  }

  return entries;
}

async function fetchBookmarks(): Promise<BookmarkEntry[]> {
  const { stdout } = await execFileAsync("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", BOOKMARKS_PLIST_PATH], {
    maxBuffer: 1024 * 1024 * 100,
  });
  const root = parsePlist(stdout) as BookmarkTreeNode;
  return flattenBookmarks(root).filter((entry) => Boolean(entry.url));
}

async function fetchLocalTabs(appIdentifier: string): Promise<LocalTab[]> {
  try {
    const script = `
      tell application "${appIdentifier}"
        if (count of windows) is 0 then
          return ""
        end if

        set output to ""
        repeat with w from 1 to count of windows
          set winRef to window w
          repeat with t from 1 to count of tabs of winRef
            set tabTitle to name of tab t of winRef
            set tabURL to URL of tab t of winRef
            if output is not "" then
              set output to output & "::REC::"
            end if
            set output to output & w & "::COL::" & t & "::COL::" & tabTitle & "::COL::" & tabURL
          end repeat
        end repeat

        return output
      end tell
    `;

    const rawOutput = await runAppleScript(script);
    if (!rawOutput || typeof rawOutput !== "string") {
      return [];
    }

    const entries = rawOutput
      .split("::REC::")
      .map((record) => record.split("::COL::"))
      .filter((parts) => parts.length >= 4)
      .map((parts) => {
        const windowId = Number.parseInt(parts[0], 10);
        const tabIndex = Number.parseInt(parts[1], 10);
        const title = parts[2] || parts[3];
        const url = parts[3] || "";

        return {
          uuid: `${windowId}-${tabIndex}`,
          title,
          url,
          window_id: windowId,
          index: tabIndex,
          is_local: true,
        } satisfies LocalTab;
      })
      .filter((tab) => Number.isFinite(tab.window_id) && Number.isFinite(tab.index) && tab.url.length > 0);

    return entries;
  } catch {
    return [];
  }
}

function getHistoryDbPath(appIdentifier: string): string {
  return `${resolve(homedir(), `Library/${appIdentifier.replace(/ /g, "")}/`)}/History.db`;
}

function getHistoryQuery(searchText: string, maxResults: number): string {
  const terms = searchText
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => escapeSqlLike(term));

  const whereClause = terms.length
    ? `WHERE ${terms
        .map(
          (term) =>
            `(history_items.url LIKE "%${term}%" ESCAPE "\\" OR history_visits.title LIKE "%${term}%" ESCAPE "\\")`,
        )
        .join(" AND ")}`
    : "";

  return `
    SELECT history_items.id as id,
           history_visits.title as title,
           history_items.url as url,
           datetime(history_visits.visit_time + 978307200, "unixepoch", "localtime") as lastVisited
      FROM history_items
      INNER JOIN history_visits ON history_visits.history_item = history_items.id
      ${whereClause}
      GROUP BY history_items.url
      ORDER BY history_visits.visit_time DESC
      LIMIT ${maxResults}
  `;
}

function getRemoteTabsQuery(enabled: boolean, maxResults: number): string {
  if (!enabled) {
    return `
      SELECT "" as uuid,
             "" as device_uuid,
             "" as device_name,
             "" as title,
             "" as url
      WHERE 1 = 0
    `;
  }

  return `
    SELECT t.tab_uuid as uuid,
           d.device_uuid,
           d.device_name,
           t.title,
           t.url
      FROM cloud_tabs t
      INNER JOIN cloud_tab_devices d ON t.device_uuid = d.device_uuid
      ORDER BY d.device_name ASC
      LIMIT ${maxResults}
  `;
}

export function useLocalSafariTabs(appIdentifier: string) {
  return useCachedPromise(fetchLocalTabs, [appIdentifier], { keepPreviousData: true });
}

export function useRemoteSafariTabs(enabled: boolean, maxResults: number) {
  const query = getRemoteTabsQuery(enabled, maxResults);
  return useSQL<RemoteTab>(CLOUD_TABS_DB, query);
}

export function useSafariBookmarks() {
  const [permissionError, setPermissionError] = useState(false);
  const result = useCachedPromise(fetchBookmarks, [], {
    keepPreviousData: true,
    onError(error) {
      if (error instanceof Error && error.message.includes("operation not permitted")) {
        setPermissionError(true);
      }
    },
  });

  return {
    ...result,
    permissionError,
  };
}

export function useSafariHistory(appIdentifier: string, searchText: string, maxResults: number) {
  const query = getHistoryQuery(searchText, maxResults);
  return useSQL<HistoryItem>(getHistoryDbPath(appIdentifier), query);
}
