export type SourceErrorKind = "permission" | "unavailable";

function errorField(error: unknown, field: string): unknown {
  return typeof error === "object" && error !== null && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

/** Normalize rejected values without depending on Raycast's private error classes. */
export function toSourceError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = errorField(error, "message");
  const normalized = new Error(
    typeof message === "string" ? message : typeof error === "string" ? error : "Safari source is unavailable",
  );
  const name = errorField(error, "name");
  if (typeof name === "string") normalized.name = name;
  const code = errorField(error, "code");
  if (typeof code === "string") Object.assign(normalized, { code });
  return normalized;
}

export function classifySourceError(error: unknown): SourceErrorKind {
  const name = errorField(error, "name");
  const code = errorField(error, "code");
  const message = errorField(error, "message");
  if (
    (typeof name === "string" && name.toLowerCase() === "permissionerror") ||
    (typeof code === "string" && /^(eperm|eacces)$/i.test(code)) ||
    /operation not permitted|permission denied|authorization denied|do not have permission|not authorized|\b(?:eperm|eacces)\b/i.test(
      typeof message === "string" ? message : typeof error === "string" ? error : "",
    )
  ) {
    return "permission";
  }
  return "unavailable";
}
