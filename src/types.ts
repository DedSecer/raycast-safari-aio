export type SourceKind = "tab" | "bookmark" | "history";

export type PriorityLabel = "Tabs" | "Bookmarks" | "History";

export type ListDisplayMode = "flat" | "section";

export interface SearchSafariAioPreferences {
  safariAppIdentifier: "Safari" | "Safari Technology Preview";
  areRemoteTabsUsed: boolean;
  listDisplayMode: ListDisplayMode;
  firstPriority: PriorityLabel;
  secondPriority: PriorityLabel;
  thirdPriority: PriorityLabel;
  enableFuzzySearch: boolean;
  maxResultsPerSource: string;
}

export interface LocalTab {
  uuid: string;
  title: string;
  url: string;
  window_id: number;
  index: number;
  is_local: boolean;
}

export interface RemoteTab {
  uuid: string;
  title: string;
  url: string;
  device_uuid: string;
  device_name: string;
}

export interface HistoryItem {
  id: number | string;
  title?: string;
  url: string;
  lastVisited: string;
}

export interface BookmarkLeaf {
  WebBookmarkUUID?: string;
  WebBookmarkType?: string;
  URLString?: string;
  URIDictionary?: {
    title?: string;
  };
  Title?: string;
  ReadingListNonSync?: {
    Title?: string;
  };
}

export interface BookmarkNode {
  WebBookmarkUUID?: string;
  WebBookmarkType?: string;
  Title?: string;
  Children?: BookmarkTreeNode[];
}

export type BookmarkTreeNode = BookmarkNode | BookmarkLeaf;

export interface BookmarkEntry {
  uuid: string;
  title: string;
  url: string;
  folder: string;
  domain?: string;
}

export interface UnifiedEntry {
  id: string;
  kind: SourceKind;
  title: string;
  url: string;
  domain?: string;
  detail?: string;
  windowId?: number;
  tabIndex?: number;
  sortDate?: number;
}
