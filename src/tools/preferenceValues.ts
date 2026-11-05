import type { PriorityLabel, SafariAppIdentifier, SearchSafariAioPreferences, SourceKind } from "../types";

const priorityMap: Record<PriorityLabel, SourceKind> = {
  Tabs: "tab",
  Bookmarks: "bookmark",
  History: "history",
};

const fallbackOrder: SourceKind[] = ["tab", "bookmark", "history"];

export function normalizeSafariApp(value: unknown): SafariAppIdentifier {
  return value === "Safari Technology Preview" ? value : "Safari";
}

export function resolveSourceOrder(
  preferences: Pick<SearchSafariAioPreferences, "firstPriority" | "secondPriority" | "thirdPriority">,
): SourceKind[] {
  const requested = [preferences.firstPriority, preferences.secondPriority, preferences.thirdPriority];
  const ordered: SourceKind[] = [];
  for (const label of requested) {
    const source = Object.hasOwn(priorityMap, label) ? priorityMap[label] : undefined;
    if (source && !ordered.includes(source)) {
      ordered.push(source);
    }
  }
  return [...ordered, ...fallbackOrder.filter((source) => !ordered.includes(source))];
}

export function getMaxResultsPerSource(preferences: Pick<SearchSafariAioPreferences, "maxResultsPerSource">): number {
  const value = preferences.maxResultsPerSource;
  return value === "50" || value === "100" || value === "200" ? Number(value) : 100;
}
