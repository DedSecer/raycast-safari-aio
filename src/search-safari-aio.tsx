import { Action, ActionPanel, Icon, List, openCommandPreferences } from "@raycast/api";
import { useMemo, useState } from "react";
import {
  useLocalSafariTabs,
  useRemoteSafariTabs,
  useSafariBookmarks,
  useSafariHistory,
} from "./hooks/useSafariSources";
import { getMaxResultsPerSource, getPreferences, resolveSourceOrder } from "./preferences";
import { SourceKind, UnifiedEntry } from "./types";
import { dedupeEntriesByUrl, searchEntries } from "./utils";
import { SearchResultItem } from "./components/SearchResultItem";
import { toBookmarkEntries, toHistoryEntries, toSectionResults, toTabEntries } from "./tools/unifiedEntries";

const sourceSectionTitle: Record<SourceKind, string> = {
  tab: "Tabs",
  bookmark: "Bookmarks",
  history: "History",
};

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
  const history = useSafariHistory(preferences.safariAppIdentifier, maxResultsPerSource * 10);

  const tabEntries = useMemo(
    () => toTabEntries(localTabs.data ?? [], remoteTabs.data ?? [], preferences.areRemoteTabsUsed),
    [localTabs.data, remoteTabs.data, preferences.areRemoteTabsUsed],
  );

  const bookmarkEntries = useMemo<UnifiedEntry[]>(() => toBookmarkEntries(bookmarks.data ?? []), [bookmarks.data]);

  const historyEntries = useMemo<UnifiedEntry[]>(() => toHistoryEntries(history.data ?? []), [history.data]);

  const filteredBySource = useMemo<Record<SourceKind, UnifiedEntry[]>>(() => {
    const tabs = searchEntries(tabEntries, searchText, true).slice(0, maxResultsPerSource);
    const bookmark = searchEntries(bookmarkEntries, searchText, true).slice(0, maxResultsPerSource);
    const historyItems = searchEntries(historyEntries, searchText, true)
      .sort((a, b) => (b.sortDate ?? 0) - (a.sortDate ?? 0))
      .slice(0, maxResultsPerSource);

    return {
      tab: tabs,
      bookmark,
      history: historyItems,
    };
  }, [tabEntries, searchText, maxResultsPerSource, bookmarkEntries, historyEntries]);

  const flatResults = useMemo(() => {
    const ordered: UnifiedEntry[] = [];
    for (const source of sourceOrder) {
      ordered.push(...filteredBySource[source]);
    }
    return dedupeEntriesByUrl(ordered);
  }, [filteredBySource, sourceOrder]);

  const sectionResults = useMemo<Record<SourceKind, UnifiedEntry[]>>(
    () => toSectionResults(flatResults),
    [flatResults],
  );

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
      throttle={false}
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
          {flatResults.map((entry) => (
            <SearchResultItem key={entry.id} entry={entry} appIdentifier={preferences.safariAppIdentifier} />
          ))}
        </List.Section>
      ) : (
        sourceOrder.map((source) => {
          const entries = sectionResults[source];
          if (entries.length === 0) {
            return null;
          }

          return (
            <List.Section key={source} title={sourceSectionTitle[source]} subtitle={`${entries.length}`}>
              {entries.map((entry) => (
                <SearchResultItem key={entry.id} entry={entry} appIdentifier={preferences.safariAppIdentifier} />
              ))}
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
