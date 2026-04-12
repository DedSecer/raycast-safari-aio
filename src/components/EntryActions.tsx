import { Action, ActionPanel, Icon, open, openCommandPreferences } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { UnifiedEntry } from "../types";

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

export function EntryActions(props: { entry: UnifiedEntry; appIdentifier: string }) {
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
