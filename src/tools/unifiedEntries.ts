import { BookmarkEntry, HistoryItem, LocalTab, RemoteTab, SourceKind, UnifiedEntry } from "../types";
import { getUrlDomain, parseVisitedDate } from "../utils";

export function toTabEntries(localTabs: LocalTab[], remoteTabs: RemoteTab[], includeRemote: boolean): UnifiedEntry[] {
  const localEntries: UnifiedEntry[] = localTabs.map((tab) => ({
    id: `tab-local-${tab.uuid}`,
    kind: "tab",
    title: tab.title || tab.url,
    url: tab.url,
    domain: getUrlDomain(tab.url),
    detail: `Window ${tab.window_id} · Tab ${tab.index}`,
    windowId: tab.window_id,
    tabIndex: tab.index,
  }));

  if (!includeRemote) {
    return localEntries;
  }

  const remoteEntries: UnifiedEntry[] = remoteTabs
    .filter((tab) => typeof tab.url === "string" && tab.url.length > 0)
    .map((tab) => ({
      id: `tab-remote-${tab.uuid}`,
      kind: "tab",
      title: tab.title || tab.url,
      url: tab.url,
      domain: getUrlDomain(tab.url),
      detail: tab.device_name,
    }));

  return [...localEntries, ...remoteEntries];
}

export function toBookmarkEntries(bookmarks: BookmarkEntry[]): UnifiedEntry[] {
  return bookmarks.map((bookmark) => ({
    id: `bookmark-${bookmark.uuid}`,
    kind: "bookmark",
    title: bookmark.title || bookmark.url,
    url: bookmark.url,
    domain: bookmark.domain,
    detail: bookmark.folder || "Top Level",
  }));
}

export function toHistoryEntries(historyItems: HistoryItem[]): UnifiedEntry[] {
  return historyItems.map((item) => ({
    id: `history-${item.id}`,
    kind: "history",
    title: item.title || item.url,
    url: item.url,
    domain: getUrlDomain(item.url),
    sortDate: parseVisitedDate(item.lastVisited),
  }));
}

export function toSectionResults(entries: UnifiedEntry[]): Record<SourceKind, UnifiedEntry[]> {
  const grouped: Record<SourceKind, UnifiedEntry[]> = {
    tab: [],
    bookmark: [],
    history: [],
  };

  for (const entry of entries) {
    grouped[entry.kind].push(entry);
  }

  return grouped;
}
