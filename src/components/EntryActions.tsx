import { Action, ActionPanel, Icon, open, openCommandPreferences } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { SourceKind, UnifiedEntry } from "../types";

export type EnabledSources = Record<SourceKind, boolean>;

const sourceTitles: Record<SourceKind, string> = {
  tab: "Tabs",
  bookmark: "Bookmarks",
  history: "History",
};

export function SourceToggleActions(props: {
  enabledSources: EnabledSources;
  onToggleSource: (source: SourceKind) => void;
}) {
  const { enabledSources, onToggleSource } = props;

  return (
    <ActionPanel.Section title="Sources">
      {(Object.keys(sourceTitles) as SourceKind[]).map((source) => (
        <Action
          key={source}
          title={sourceTitles[source]}
          icon={enabledSources[source] ? Icon.CheckCircle : Icon.Circle}
          onAction={() => onToggleSource(source)}
        />
      ))}
    </ActionPanel.Section>
  );
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

export function EntryActions(props: {
  entry: UnifiedEntry;
  appIdentifier: string;
  enabledSources: EnabledSources;
  onToggleSource: (source: SourceKind) => void;
}) {
  const { entry, appIdentifier, enabledSources, onToggleSource } = props;
  const isLocalTab = entry.kind === "tab" && typeof entry.windowId === "number" && typeof entry.tabIndex === "number";

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {isLocalTab ? (
          <Action
            title="Switch to Existing Tab"
            icon={Icon.Eye}
            onAction={() => switchToSafariTab(entry.windowId, entry.tabIndex, appIdentifier)}
          />
        ) : (
          <Action title="Open in Safari" icon={Icon.Safari} onAction={() => open(entry.url, appIdentifier)} />
        )}
        <Action.OpenInBrowser url={entry.url} />
      </ActionPanel.Section>
      <SourceToggleActions enabledSources={enabledSources} onToggleSource={onToggleSource} />
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
