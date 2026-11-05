import Fuse from "fuse.js";
import type { UnifiedEntry } from "./types";

export function getUrlDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.pathname = parsed.pathname.replace(/\/$/, "") || "/";
    }
    return parsed.href;
  } catch {
    return url.trim();
  }
}

export type EntrySearch = (searchText: string, useFuzzy?: boolean) => UnifiedEntry[];

export function createEntrySearch(entries: UnifiedEntry[]): EntrySearch {
  const haystacks = entries.map((entry) =>
    `${entry.title} ${entry.url} ${entry.domain ?? ""} ${entry.detail ?? ""}`.toLowerCase(),
  );
  const fuse = new Fuse(entries, {
    keys: [
      { name: "title", weight: 3 },
      { name: "domain", weight: 1.5 },
      { name: "url", weight: 1 },
      { name: "detail", weight: 0.75 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });

  return (searchText, useFuzzy = true) => {
    const query = searchText.trim();
    if (!query) {
      return [...entries];
    }
    const tokens = query.toLowerCase().split(/\s+/);
    const tokenMatched = entries.filter((_, index) => tokens.every((token) => haystacks[index].includes(token)));
    if (!useFuzzy || query.length < 2) {
      return tokenMatched;
    }

    // Exact all-token containment takes precedence over fuzzy-only matches.
    const seen = new Set(tokenMatched.map((entry) => entry.id));
    const merged = [...tokenMatched];
    for (const { item } of fuse.search(query)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  };
}

export function searchEntries(entries: UnifiedEntry[], searchText: string, useFuzzy: boolean): UnifiedEntry[] {
  return createEntrySearch(entries)(searchText, useFuzzy);
}

export function limitSourceResults(entries: UnifiedEntry[], limit: number, newestFirst = false): UnifiedEntry[] {
  const ordered = newestFirst ? [...entries].sort((a, b) => (b.sortDate ?? 0) - (a.sortDate ?? 0)) : entries;
  return dedupeEntriesByUrl(ordered).slice(0, limit);
}

export function dedupeEntriesByUrl(entries: UnifiedEntry[]): UnifiedEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.kind}:${normalizeUrl(entry.url)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function parseVisitedDate(lastVisited?: string): number | undefined {
  if (!lastVisited) {
    return undefined;
  }
  const timestamp = Date.parse(lastVisited);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
