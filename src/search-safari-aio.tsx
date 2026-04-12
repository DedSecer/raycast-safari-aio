import { Action, ActionPanel, Icon, List, open, openCommandPreferences } from "@raycast/api";
import { getFavicon, runAppleScript } from "@raycast/utils";
import { useMemo, useState } from "react";
import {
  useLocalSafariTabs,
  useRemoteSafariTabs,
  useSafariBookmarks,
  useSafariHistory,
} from "./hooks/useSafariSources";
import { getMaxResultsPerSource, getPreferences, resolveSourceOrder } from "./preferences";
import { LocalTab, RemoteTab, SourceKind, UnifiedEntry } from "./types";
import {
  dedupeEntriesByUrl,
  getSourceColor,
  getSourceLabel,
  getUrlDomain,
  parseVisitedDate,
  searchEntries,
} from "./utils";

const sourceSectionTitle: Record<SourceKind, string> = {
  tab: "Tabs",
  bookmark: "Bookmarks",
  history: "History",
};

function toTabEntries(localTabs: LocalTab[], remoteTabs: RemoteTab[], includeRemote: boolean): UnifiedEntry[] {
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

function getItemIcon(url: string): List.Item.Props["icon"] {
  if (!/^https?:\/\//i.test(url)) {
    return Icon.Globe;
  }

  return getFavicon(url, { fallback: Icon.Globe });
}

async function switchToSafariTab(windowId: number, tabIndex: number, appIdentifier: string) {
  await runAppleScript(`
    tell application "${appIdentifier}"
      activate
      if (count of windows) >= ${windowId} then
        set current tab of window ${windowId} to tab ${tabIndex} of window ${windowId}
        set index of window ${windowId} to 1
      end if
    end tell
  `);
}

function EntryActions(props: { entry: UnifiedEntry; appIdentifier: string }) {
  const { entry, appIdentifier } = props;

  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action title="Open in Safari" icon={Icon.Safari} onAction={() => open(entry.url, appIdentifier)} />
        <Action.OpenInBrowser url={entry.url} />
        {entry.kind === "tab" && typeof entry.windowId === "number" && typeof entry.tabIndex === "number" ? (
          <Action
            title="Switch to Existing Tab"
            icon={Icon.Eye}
            onAction={() => switchToSafariTab(entry.windowId as number, entry.tabIndex as number, appIdentifier)}
          />
        ) : null}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy URL" content={entry.url} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action
          title="Configure Command"
          icon={Icon.Gear}
          shortcut={{ modifiers: ["shift", "cmd"], key: "," }}
          onAction={openCommandPreferences}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

function hasPermissionIssue(result: unknown): boolean {
  const maybeResult = result as { permissionView?: unknown; error?: unknown };
  if (maybeResult.permissionView) {
    return true;
  }

  if (maybeResult.error instanceof Error) {
    return maybeResult.error.message.includes("operation not permitted");
  }

  if (typeof maybeResult.error === "string") {
    return maybeResult.error.includes("operation not permitted");
  }

  return false;
}

export default function Command() {
  const preferences = getPreferences();
  const maxResultsPerSource = getMaxResultsPerSource(preferences);
  const sourceOrder = resolveSourceOrder(preferences);

  const [searchText, setSearchText] = useState("");

  const localTabs = useLocalSafariTabs(preferences.safariAppIdentifier);
  const remoteTabs = useRemoteSafariTabs(preferences.areRemoteTabsUsed, maxResultsPerSource * 2);
  const bookmarks = useSafariBookmarks();
  const history = useSafariHistory(preferences.safariAppIdentifier, searchText, maxResultsPerSource * 2);

  const tabEntries = useMemo(
    () => toTabEntries(localTabs.data ?? [], remoteTabs.data ?? [], preferences.areRemoteTabsUsed),
    [localTabs.data, remoteTabs.data, preferences.areRemoteTabsUsed],
  );

  const bookmarkEntries = useMemo<UnifiedEntry[]>(
    () =>
      (bookmarks.data ?? []).map((bookmark) => ({
        id: `bookmark-${bookmark.uuid}`,
        kind: "bookmark",
        title: bookmark.title || bookmark.url,
        url: bookmark.url,
        domain: bookmark.domain,
        detail: bookmark.folder || "Top Level",
      })),
    [bookmarks.data],
  );

  const historyEntries = useMemo<UnifiedEntry[]>(
    () =>
      (history.data ?? []).map((item) => ({
        id: `history-${item.id}`,
        kind: "history",
        title: item.title || item.url,
        url: item.url,
        domain: getUrlDomain(item.url),
        sortDate: parseVisitedDate(item.lastVisited),
      })),
    [history.data],
  );

  const filteredBySource = useMemo<Record<SourceKind, UnifiedEntry[]>>(() => {
    const tabs = searchEntries(tabEntries, searchText, preferences.enableFuzzySearch).slice(0, maxResultsPerSource);
    const bookmark = searchEntries(bookmarkEntries, searchText, preferences.enableFuzzySearch).slice(
      0,
      maxResultsPerSource,
    );
    const historyItems = searchEntries(historyEntries, searchText, preferences.enableFuzzySearch)
      .sort((a, b) => (b.sortDate ?? 0) - (a.sortDate ?? 0))
      .slice(0, maxResultsPerSource);

    return {
      tab: tabs,
      bookmark,
      history: historyItems,
    };
  }, [tabEntries, searchText, preferences.enableFuzzySearch, maxResultsPerSource, bookmarkEntries, historyEntries]);

  const flatResults = useMemo(() => {
    const ordered: UnifiedEntry[] = [];
    for (const source of sourceOrder) {
      ordered.push(...filteredBySource[source]);
    }
    return dedupeEntriesByUrl(ordered);
  }, [filteredBySource, sourceOrder]);

  const sectionResults = useMemo<Record<SourceKind, UnifiedEntry[]>>(() => {
    const initial: Record<SourceKind, UnifiedEntry[]> = {
      tab: [],
      bookmark: [],
      history: [],
    };

    for (const entry of flatResults) {
      initial[entry.kind].push(entry);
    }

    return initial;
  }, [flatResults]);

  const warnings = useMemo(() => {
    const messages: string[] = [];

    if (bookmarks.permissionError) {
      messages.push("Bookmarks are unavailable. Grant Full Disk Access to Raycast.");
    }

    if (hasPermissionIssue(history)) {
      messages.push("History is unavailable. Grant Full Disk Access to Raycast.");
    }

    if (preferences.areRemoteTabsUsed && hasPermissionIssue(remoteTabs)) {
      messages.push("Remote iCloud tabs are unavailable. Check Safari iCloud permissions.");
    }

    return messages;
  }, [bookmarks.permissionError, history, preferences.areRemoteTabsUsed, remoteTabs]);

  const isLoading =
    localTabs.isLoading ||
    bookmarks.isLoading ||
    history.isLoading ||
    (preferences.areRemoteTabsUsed && Boolean(remoteTabs.isLoading));

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search Safari tabs, bookmarks, and history"
      filtering={false}
      throttle={true}
    >
      {warnings.length > 0 ? (
        <List.Section title="Warnings">
          {warnings.map((warning, index) => (
            <List.Item key={`warning-${index}`} title={warning} icon={Icon.ExclamationMark} />
          ))}
        </List.Section>
      ) : null}

      {preferences.listDisplayMode === "flat" ? (
        <List.Section title="Results" subtitle={`${flatResults.length}`}>
          {flatResults.map((entry) => {
            const accessories: List.Item.Accessory[] = [
              {
                tag: {
                  value: getSourceLabel(entry.kind),
                  color: getSourceColor(entry.kind),
                },
              },
            ];

            if (entry.detail) {
              accessories.push({ text: entry.detail });
            }

            if (entry.kind === "history" && entry.sortDate) {
              accessories.push({ text: new Date(entry.sortDate).toLocaleString() });
            }

            return (
              <List.Item
                key={entry.id}
                title={entry.title}
                subtitle={{ value: entry.domain ?? entry.url, tooltip: entry.url }}
                icon={getItemIcon(entry.url)}
                accessories={accessories}
                actions={<EntryActions entry={entry} appIdentifier={preferences.safariAppIdentifier} />}
              />
            );
          })}
        </List.Section>
      ) : (
        sourceOrder.map((source) => {
          const entries = sectionResults[source];
          if (entries.length === 0) {
            return null;
          }

          return (
            <List.Section key={source} title={sourceSectionTitle[source]} subtitle={`${entries.length}`}>
              {entries.map((entry) => {
                const accessories: List.Item.Accessory[] = [
                  {
                    tag: {
                      value: getSourceLabel(entry.kind),
                      color: getSourceColor(entry.kind),
                    },
                  },
                ];

                if (entry.detail) {
                  accessories.push({ text: entry.detail });
                }

                if (entry.kind === "history" && entry.sortDate) {
                  accessories.push({ text: new Date(entry.sortDate).toLocaleString() });
                }

                return (
                  <List.Item
                    key={entry.id}
                    title={entry.title}
                    subtitle={{ value: entry.domain ?? entry.url, tooltip: entry.url }}
                    icon={getItemIcon(entry.url)}
                    accessories={accessories}
                    actions={<EntryActions entry={entry} appIdentifier={preferences.safariAppIdentifier} />}
                  />
                );
              })}
            </List.Section>
          );
        })
      )}

      {!isLoading && flatResults.length === 0 ? (
        <List.EmptyView
          title="No matching results"
          description="Try another keyword or open command preferences"
          icon={Icon.MagnifyingGlass}
          actions={
            <ActionPanel>
              <Action
                title="Configure Command"
                icon={Icon.Gear}
                shortcut={{ modifiers: ["shift", "cmd"], key: "," }}
                onAction={openCommandPreferences}
              />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
