import { Color } from "@raycast/api";
import Fuse from "fuse.js";
import { SourceKind, UnifiedEntry } from "./types";

export function getUrlDomain(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function searchEntries(entries: UnifiedEntry[], searchText: string, useFuzzy: boolean): UnifiedEntry[] {
  const query = searchText.trim();
  if (!query) {
    return entries;
  }

  const lowered = query.toLowerCase();
  const tokens = lowered.split(/\s+/).filter((token) => token.length > 0);

  const tokenMatched = entries.filter((entry) => {
    const title = entry.title.toLowerCase();
    const url = entry.url.toLowerCase();
    const domain = entry.domain?.toLowerCase() ?? "";
    const detail = entry.detail?.toLowerCase() ?? "";
    const haystack = `${title} ${url} ${domain} ${detail}`;
    return tokens.every((token) => haystack.includes(token));
  });

  // For very short queries, plain includes is faster and avoids Fuse overhead.
  if (!useFuzzy || query.length < 2) {
    return tokenMatched;
  }

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

  const fuzzyMatched = fuse.search(query).map((result) => result.item);
  if (tokenMatched.length === 0) {
    return fuzzyMatched;
  }

  // Prioritize exact token containment and append fuzzy-only matches.
  const seen = new Set(tokenMatched.map((entry) => entry.id));
  const merged = [...tokenMatched];
  for (const entry of fuzzyMatched) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      merged.push(entry);
    }
  }

  return merged;
}

export function getSourceLabel(source: SourceKind): string {
  switch (source) {
    case "tab":
      return "Tab";
    case "bookmark":
      return "Bookmark";
    case "history":
      return "History";
  }
}

export function getSourceColor(source: SourceKind): Color {
  switch (source) {
    case "tab":
      return Color.Blue;
    case "bookmark":
      return Color.Green;
    case "history":
      return Color.Orange;
  }
}

export function dedupeEntriesByUrl(entries: UnifiedEntry[]): UnifiedEntry[] {
  const seen = new Set<string>();
  const result: UnifiedEntry[] = [];

  for (const entry of entries) {
    const source = "kind" in entry && typeof entry.kind === "string" ? entry.kind : "entry";
    const key = `${source}:${normalizeUrl(entry.url)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }

  return result;
}

export function parseVisitedDate(lastVisited?: string): number | undefined {
  if (!lastVisited) {
    return undefined;
  }

  const timestamp = Date.parse(lastVisited);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return timestamp;
}

export function escapeSqlLike(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/"/g, '""').replace(/%/g, "\\%").replace(/_/g, "\\_");
}
