import { Icon, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { EntryActions } from "./EntryActions";
import { getSourceColor, getSourceLabel } from "../utils";
import { UnifiedEntry } from "../types";

function getItemIcon(url: string): List.Item.Props["icon"] {
  if (!/^https?:\/\//i.test(url)) {
    return Icon.Globe;
  }

  return getFavicon(url, { fallback: Icon.Globe });
}

function buildAccessories(entry: UnifiedEntry): List.Item.Accessory[] {
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

  return accessories;
}

export function SearchResultItem(props: { entry: UnifiedEntry; appIdentifier: string }) {
  const { entry, appIdentifier } = props;

  return (
    <List.Item
      key={entry.id}
      title={entry.title}
      subtitle={{ value: entry.domain ?? entry.url, tooltip: entry.url }}
      icon={getItemIcon(entry.url)}
      accessories={buildAccessories(entry)}
      actions={<EntryActions entry={entry} appIdentifier={appIdentifier} />}
    />
  );
}
