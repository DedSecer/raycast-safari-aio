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

  if (!useFuzzy) {
    const lowered = query.toLowerCase();
    return entries.filter((entry) => {
      const title = entry.title.toLowerCase();
      const url = entry.url.toLowerCase();
      const domain = entry.domain?.toLowerCase() ?? "";
      const detail = entry.detail?.toLowerCase() ?? "";
      return title.includes(lowered) || url.includes(lowered) || domain.includes(lowered) || detail.includes(lowered);
    });
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

  return fuse.search(query).map((result) => result.item);
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
