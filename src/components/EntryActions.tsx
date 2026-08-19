import { Action, ActionPanel, closeMainWindow, Icon, open, openCommandPreferences, showHUD } from "@raycast/api";
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

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

async function switchToSafariTab(
  windowId: number,
  tabIndex: number,
  url: string,
  appIdentifier: string,
): Promise<void> {
  const targetURL = escapeAppleScriptString(url);
  const result = await runAppleScript(`
    tell application "${appIdentifier}"
      set targetURL to "${targetURL}"
      set matchedWindow to 0
      set matchedTab to 0

      if (count of windows) >= ${windowId} then
        if (count of tabs of window ${windowId}) >= ${tabIndex} then
          if URL of tab ${tabIndex} of window ${windowId} is targetURL then
            set matchedWindow to ${windowId}
            set matchedTab to ${tabIndex}
          end if
        end if
      end if

      if matchedWindow is 0 then
        repeat with currentWindow from 1 to count of windows
          set currentWindowRef to window currentWindow
          repeat with currentTab from 1 to count of tabs of currentWindowRef
            if URL of tab currentTab of currentWindowRef is targetURL then
              set matchedWindow to currentWindow
              set matchedTab to currentTab
              exit repeat
            end if
          end repeat
          if matchedWindow is not 0 then
            exit repeat
          end if
        end repeat
      end if

      if matchedWindow is not 0 then
        activate
        set current tab of window matchedWindow to tab matchedTab of window matchedWindow
        set index of window matchedWindow to 1
        return (matchedWindow as text) & "::" & (matchedTab as text)
      end if

      return ""
    end tell
  `);

  if (!result || typeof result !== "string") {
    await showHUD("Safari 标签页已关闭或已发生变化");
    return;
  }

  await closeMainWindow();
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
            onAction={() => switchToSafariTab(entry.windowId, entry.tabIndex, entry.url, appIdentifier)}
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
