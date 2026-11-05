import { Color, Icon, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { EntryActions, EnabledSources } from "./EntryActions";
import type { SafariAppIdentifier, SourceKind, UnifiedEntry } from "../types";

const sourceLabels: Record<SourceKind, string> = { tab: "Tab", bookmark: "Bookmark", history: "History" };
const sourceColors: Record<SourceKind, Color> = { tab: Color.Blue, bookmark: Color.Green, history: Color.Orange };

function getItemIcon(url: string, showFavicons: boolean): List.Item.Props["icon"] {
  if (!showFavicons || !/^https?:\/\//i.test(url)) {
    return Icon.Globe;
  }

  return getFavicon(url, { fallback: Icon.Globe });
}

function buildAccessories(entry: UnifiedEntry): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [
    {
      tag: {
        value: sourceLabels[entry.kind],
        color: sourceColors[entry.kind],
      },
    },
  ];

  if (entry.detail) {
    accessories.push({ text: entry.detail });
  }

  if (entry.kind === "history" && entry.sortDate) {
    accessories.push({ text: new Date(entry.sortDate).toLocaleString() });
  }

  return accessories;
}

export function SearchResultItem(props: {
  entry: UnifiedEntry;
  appIdentifier: SafariAppIdentifier;
  showFavicons: boolean;
  enabledSources: EnabledSources;
  onToggleSource: (source: SourceKind) => void;
}) {
  const { entry, appIdentifier, showFavicons, enabledSources, onToggleSource } = props;

  return (
    <List.Item
      key={entry.id}
      title={entry.title}
      subtitle={{ value: entry.domain ?? entry.url, tooltip: entry.url }}
      icon={getItemIcon(entry.url, showFavicons)}
      accessories={buildAccessories(entry)}
      actions={
        <EntryActions
          entry={entry}
          appIdentifier={appIdentifier}
          enabledSources={enabledSources}
          onToggleSource={onToggleSource}
        />
      }
    />
  );
}
