import {
  Action,
  ActionPanel,
  closeMainWindow,
  Icon,
  open,
  openCommandPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import type { SafariAppIdentifier, SourceKind, UnifiedEntry } from "../types";
import { normalizeSafariApp } from "../tools/preferenceValues";

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

async function switchToSafariTab(
  windowId: number,
  tabIndex: number,
  url: string,
  appIdentifier: SafariAppIdentifier,
): Promise<void> {
  try {
    const app = normalizeSafariApp(appIdentifier);
    const result = await runAppleScript(
      `
      on run argv
        set targetWindow to (item 1 of argv) as integer
        set targetTab to (item 2 of argv) as integer
        set targetURL to item 3 of argv
        set targetApp to item 4 of argv
        considering case
        using terms from application "Safari"
        tell application targetApp
          set matchedWindow to 0
          set matchedTab to 0
          try
            if (count of windows) >= targetWindow then
              if (count of tabs of window targetWindow) >= targetTab then
                if URL of tab targetTab of window targetWindow is targetURL then
                  set matchedWindow to targetWindow
                  set matchedTab to targetTab
                end if
              end if
            end if
          end try

          if matchedWindow is 0 then
            repeat with w from 1 to count of windows
              try
                set winRef to window w
                repeat with t from 1 to count of tabs of winRef
                  try
                    if URL of tab t of winRef is targetURL then
                      set matchedWindow to w as integer
                      set matchedTab to t as integer
                      exit repeat
                    end if
                  end try
                end repeat
              end try
              if matchedWindow is not 0 then exit repeat
            end repeat
          end if

          if matchedWindow is 0 then return ""
          if URL of tab matchedTab of window matchedWindow is not targetURL then return ""
          activate
          set current tab of window matchedWindow to tab matchedTab of window matchedWindow
          set index of window matchedWindow to 1
          return "switched"
        end tell
        end using terms from
        end considering
      end run
      `,
      [String(windowId), String(tabIndex), url, app],
    );
    if (result.trim() !== "switched") {
      await showToast({ style: Toast.Style.Failure, title: "Safari tab was closed or changed" });
      return;
    }
    await closeMainWindow();
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not switch to Safari tab",
      message: "Check Raycast's Safari automation permission and try again.",
    });
  }
}

async function openInSafari(url: string, appIdentifier: SafariAppIdentifier): Promise<void> {
  try {
    await open(url, normalizeSafariApp(appIdentifier));
  } catch {
    await showToast({ style: Toast.Style.Failure, title: "Could not open URL in Safari" });
  }
}

export function EntryActions(props: {
  entry: UnifiedEntry;
  appIdentifier: SafariAppIdentifier;
  enabledSources: EnabledSources;
  onToggleSource: (source: SourceKind) => void;
}) {
  const { entry, appIdentifier, enabledSources, onToggleSource } = props;
  const { windowId, tabIndex } = entry;
  const localPosition =
    entry.kind === "tab" &&
    typeof windowId === "number" &&
    Number.isInteger(windowId) &&
    windowId > 0 &&
    typeof tabIndex === "number" &&
    Number.isInteger(tabIndex) &&
    tabIndex > 0
      ? { windowId, tabIndex }
      : undefined;

  return (
    <ActionPanel>
      <ActionPanel.Section>
        {localPosition ? (
          <Action
            title="Switch to Existing Tab"
            icon={Icon.Eye}
            onAction={() => switchToSafariTab(localPosition.windowId, localPosition.tabIndex, entry.url, appIdentifier)}
          />
        ) : (
          <Action title="Open in Safari" icon={Icon.Globe} onAction={() => openInSafari(entry.url, appIdentifier)} />
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
