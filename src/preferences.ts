import { getPreferenceValues } from "@raycast/api";
import { PriorityLabel, SearchSafariAioPreferences, SourceKind } from "./types";

const priorityMap: Record<PriorityLabel, SourceKind> = {
  Tabs: "tab",
  Bookmarks: "bookmark",
  History: "history",
};

const fallbackOrder: SourceKind[] = ["tab", "bookmark", "history"];

export function getPreferences(): SearchSafariAioPreferences {
  return getPreferenceValues<SearchSafariAioPreferences>();
}

export function resolveSourceOrder(preferences: SearchSafariAioPreferences): SourceKind[] {
  const requested: SourceKind[] = [
    priorityMap[preferences.firstPriority],
    priorityMap[preferences.secondPriority],
    priorityMap[preferences.thirdPriority],
  ];

  const seen = new Set<SourceKind>();
  const ordered: SourceKind[] = [];

  for (const source of requested) {
    if (!seen.has(source)) {
      seen.add(source);
      ordered.push(source);
    }
  }

  for (const source of fallbackOrder) {
    if (!seen.has(source)) {
      seen.add(source);
      ordered.push(source);
    }
  }

  return ordered;
}

export function getMaxResultsPerSource(preferences: SearchSafariAioPreferences): number {
  const parsed = Number.parseInt(preferences.maxResultsPerSource, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return parsed;
}
