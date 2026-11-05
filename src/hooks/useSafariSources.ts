import { executeSQL, runAppleScript, useCachedPromise, usePromise } from "@raycast/utils";
import { homedir } from "os";
import { resolve } from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import { parse as parsePlist } from "plist";
import type { BookmarkEntry, HistoryItem, LocalTab, RemoteTab, SafariAppIdentifier } from "../types";
import {
  assertSafariAppIdentifier,
  flattenBookmarks,
  getHistoryQuery,
  getRemoteTabsQuery,
  parseLocalTabs,
} from "../tools/safariData";
import { toSourceError } from "../tools/sourceErrors";

const execFileAsync = promisify(execFile);

const BOOKMARKS_PLIST_PATH = `${homedir()}/Library/Safari/Bookmarks.plist`;
const CLOUD_TABS_DB = resolve(homedir(), "Library/Containers/com.apple.Safari/Data/Library/Safari/CloudTabs.db");

// Positions remain one-based indexes, even if an individual window/tab disappears.
const LOCAL_TABS_SCRIPT = `
  function run(argv) {
    var records = [];
    try {
      var appName = argv[0];
      if (appName !== "Safari" && appName !== "Safari Technology Preview") return "[]";
      var app = Application(appName);
      var windows = app.windows();
      for (var w = 0; w < windows.length; w++) {
        try {
          var win = windows[w];
          var tabs = win.tabs();
          for (var t = 0; t < tabs.length; t++) {
            try {
              var tab = tabs[t];
              var url = tab.url();
              var title = "";
              try { title = tab.name(); } catch (_) {}
              records.push({ window_id: w + 1, index: t + 1, title: title, url: url });
            } catch (_) {}
          }
        } catch (_) {}
      }
      return JSON.stringify(records);
    } catch (_) {
      return "[]";
    }
  }
`;

async function fetchBookmarks(): Promise<BookmarkEntry[]> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", BOOKMARKS_PLIST_PATH], {
      maxBuffer: 1024 * 1024 * 100,
    });
    const root: unknown = parsePlist(stdout);
    if (typeof root !== "object" || root === null || Array.isArray(root)) {
      throw new Error("Invalid Safari bookmarks response");
    }
    return flattenBookmarks(root);
  } catch (error) {
    throw toSourceError(error);
  }
}

async function fetchLocalTabs(appIdentifier: SafariAppIdentifier): Promise<{
  appIdentifier: SafariAppIdentifier;
  tabs: LocalTab[];
}> {
  try {
    assertSafariAppIdentifier(appIdentifier);
    const rawOutput = await runAppleScript(LOCAL_TABS_SCRIPT, [appIdentifier], { language: "JavaScript" });
    const decoded: unknown = JSON.parse(rawOutput);
    return { appIdentifier, tabs: parseLocalTabs(decoded) };
  } catch {
    // Preserve the existing silent degradation for local automation failures.
    return { appIdentifier, tabs: [] };
  }
}

function getHistoryDbPath(appIdentifier: SafariAppIdentifier): string {
  assertSafariAppIdentifier(appIdentifier);
  const directory = appIdentifier === "Safari" ? "Safari" : "SafariTechnologyPreview";
  return resolve(homedir(), "Library", directory, "History.db");
}

async function fetchRemoteTabs(enabled: boolean, maxResults: number): Promise<RemoteTab[]> {
  // revalidate is public and can be called even while execute is false.
  if (!enabled) return [];
  try {
    return await executeSQL<RemoteTab>(CLOUD_TABS_DB, getRemoteTabsQuery(maxResults));
  } catch (error) {
    throw toSourceError(error);
  }
}

async function fetchHistory(
  appIdentifier: SafariAppIdentifier,
  maxResults: number,
): Promise<{ appIdentifier: SafariAppIdentifier; items: HistoryItem[]; error?: Error }> {
  try {
    const items = await executeSQL<HistoryItem>(getHistoryDbPath(appIdentifier), getHistoryQuery(maxResults));
    return { appIdentifier, items };
  } catch (error) {
    // Carry request ownership on failures as well as successful (including empty) results.
    return { appIdentifier, items: [], error: toSourceError(error) };
  }
}

// The command renders source-specific warnings/retry actions rather than generic failure toasts.
function handleSourceError() {}

export function useLocalSafariTabs(appIdentifier: SafariAppIdentifier) {
  const result = useCachedPromise(fetchLocalTabs, [appIdentifier], {
    keepPreviousData: true,
    onError: handleSourceError,
  });
  const belongsToApp = result.data?.appIdentifier === appIdentifier;
  return {
    data: belongsToApp ? result.data?.tabs : undefined,
    isLoading: result.isLoading || !belongsToApp,
    error: undefined,
    revalidate: result.revalidate,
  };
}

export function useRemoteSafariTabs(enabled: boolean, maxResults: number) {
  const result = usePromise(fetchRemoteTabs, [enabled, maxResults], {
    execute: enabled,
    onError: handleSourceError,
  });
  return {
    data: enabled ? result.data : undefined,
    isLoading: enabled && result.isLoading,
    error: enabled ? result.error : undefined,
    revalidate: result.revalidate,
  };
}

export function useSafariBookmarks() {
  const result = useCachedPromise(fetchBookmarks, [], {
    keepPreviousData: true,
    onError: handleSourceError,
  });
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    revalidate: result.revalidate,
  };
}

export function useSafariHistory(appIdentifier: SafariAppIdentifier, maxResults: number) {
  const result = usePromise(fetchHistory, [appIdentifier, maxResults], { onError: handleSourceError });
  const belongsToApp = result.data?.appIdentifier === appIdentifier;
  return {
    data: belongsToApp ? result.data?.items : undefined,
    isLoading: result.isLoading || !belongsToApp,
    error: belongsToApp ? result.data?.error : undefined,
    revalidate: result.revalidate,
  };
}
