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
import { createEntrySearch, limitSourceResults } from "./utils";
import { classifySourceError } from "./tools/sourceErrors";
import { SearchResultItem } from "./components/SearchResultItem";
import { EnabledSources, SourceToggleActions } from "./components/EntryActions";
import { toBookmarkEntries, toHistoryEntries, toSectionResults, toTabEntries } from "./tools/unifiedEntries";

const sourceSectionTitle: Record<SourceKind, string> = {
  tab: "Tabs",
  bookmark: "Bookmarks",
  history: "History",
};

export default function Command() {
  const preferences = getPreferences();
  const maxResultsPerSource = getMaxResultsPerSource(preferences);
  const { firstPriority, secondPriority, thirdPriority } = preferences;
  const sourceOrder = useMemo(
    () => resolveSourceOrder({ firstPriority, secondPriority, thirdPriority }),
    [firstPriority, secondPriority, thirdPriority],
  );

  const [searchText, setSearchText] = useState("");
  const [enabledSources, setEnabledSources] = useState<EnabledSources>({
    tab: true,
    bookmark: true,
    history: true,
  });

  const toggleSource = (source: SourceKind) => {
    setEnabledSources((current) => ({ ...current, [source]: !current[source] }));
  };

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

  const searchTabs = useMemo(() => createEntrySearch(tabEntries), [tabEntries]);
  const searchBookmarks = useMemo(() => createEntrySearch(bookmarkEntries), [bookmarkEntries]);
  const searchHistory = useMemo(() => createEntrySearch(historyEntries), [historyEntries]);

  const filteredBySource = useMemo<Record<SourceKind, UnifiedEntry[]>>(
    () => ({
      tab: enabledSources.tab ? limitSourceResults(searchTabs(searchText), maxResultsPerSource) : [],
      bookmark: enabledSources.bookmark ? limitSourceResults(searchBookmarks(searchText), maxResultsPerSource) : [],
      history: enabledSources.history ? limitSourceResults(searchHistory(searchText), maxResultsPerSource, true) : [],
    }),
    [enabledSources, searchTabs, searchBookmarks, searchHistory, searchText, maxResultsPerSource],
  );

  const flatResults = useMemo(() => {
    const ordered: UnifiedEntry[] = [];
    for (const source of sourceOrder) {
      if (enabledSources[source]) {
        ordered.push(...filteredBySource[source]);
      }
    }
    return ordered;
  }, [enabledSources, filteredBySource, sourceOrder]);

  const sectionResults = useMemo<Record<SourceKind, UnifiedEntry[]>>(
    () => toSectionResults(flatResults),
    [flatResults],
  );

  const warnings = [
    { id: "bookmarks", title: "Bookmarks", result: bookmarks },
    { id: "history", title: "History", result: history },
    ...(preferences.areRemoteTabsUsed ? [{ id: "remote", title: "iCloud tabs", result: remoteTabs }] : []),
  ]
    .filter(({ result }) => Boolean(result.error))
    .map(({ id, title, result }) => ({
      id,
      isPermission: classifySourceError(result.error) === "permission",
      title:
        classifySourceError(result.error) === "permission"
          ? `${title} unavailable. Check Raycast's Full Disk Access and Safari permissions.`
          : `${title} could not be refreshed. Check Safari data availability and retry.`,
      retry: async () => {
        await result.revalidate();
      },
    }));

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
          {warnings.map((warning) => (
            <List.Item
              key={warning.id}
              title={warning.title}
              icon={Icon.ExclamationMark}
              actions={
                <ActionPanel>
                  <Action title="Retry Source" icon={Icon.ArrowClockwise} onAction={warning.retry} />
                  {warning.isPermission ? (
                    <Action.Open
                      title="Open Full Disk Access Settings"
                      icon={Icon.Lock}
                      target="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
                    />
                  ) : null}
                  <Action title="Configure Command" icon={Icon.Gear} onAction={openCommandPreferences} />
                  <SourceToggleActions enabledSources={enabledSources} onToggleSource={toggleSource} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}

      {preferences.listDisplayMode === "flat" ? (
        <List.Section title="Results" subtitle={`${flatResults.length}`}>
          {flatResults.map((entry) => (
            <SearchResultItem
              key={entry.id}
              entry={entry}
              appIdentifier={preferences.safariAppIdentifier}
              showFavicons={preferences.showFavicons}
              enabledSources={enabledSources}
              onToggleSource={toggleSource}
            />
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
                <SearchResultItem
                  key={entry.id}
                  entry={entry}
                  appIdentifier={preferences.safariAppIdentifier}
                  showFavicons={preferences.showFavicons}
                  enabledSources={enabledSources}
                  onToggleSource={toggleSource}
                />
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
              <SourceToggleActions enabledSources={enabledSources} onToggleSource={toggleSource} />
              <ActionPanel.Section>
                <Action
                  title="Configure Command"
                  icon={Icon.Gear}
                  shortcut={{ modifiers: ["shift", "cmd"], key: "," }}
                  onAction={openCommandPreferences}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
