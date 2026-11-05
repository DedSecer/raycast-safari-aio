import { getPreferenceValues } from "@raycast/api";
import type { SearchSafariAioPreferences } from "./types";
import { normalizeSafariApp } from "./tools/preferenceValues";

export { getMaxResultsPerSource, resolveSourceOrder } from "./tools/preferenceValues";

export function getPreferences(): SearchSafariAioPreferences {
  const preferences = getPreferenceValues<SearchSafariAioPreferences>();
  return {
    ...preferences,
    safariAppIdentifier: normalizeSafariApp(preferences.safariAppIdentifier),
    areRemoteTabsUsed: preferences.areRemoteTabsUsed !== false,
    showFavicons: preferences.showFavicons !== false,
    listDisplayMode: preferences.listDisplayMode === "section" ? "section" : "flat",
  };
}
