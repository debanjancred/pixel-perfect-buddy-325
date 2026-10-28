import { ValidationError, type ErrKey } from "@/lib/validation";

interface PostgrestLikeError {
  message?: string;
  code?: string;
}

/**
 * Server errors in the app's terms. Triggers and functions raise the app's own i18n keys
 * (e.g. "err_handoverTooMuch"); row-level-security refusals become err_forbidden.
 */
export function cloudErrorKey(error: PostgrestLikeError | null | undefined): ErrKey | null {
  if (!error) return null;
  const own = error.message?.match(/\berr_[A-Za-z]+\b/)?.[0];
  if (own) return own as ErrKey;
  if (error.code === "42501" || /row-level security/i.test(error.message ?? ""))
    return "err_forbidden";
  // A row it points at (club, household, member) isn't on the server yet.
  if (error.code === "23503") return "err_syncDependency";
  return "err_syncFailed";
}

/** A request that never reached the server (no signal, DNS, a dropped connection). */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ValidationError) return false;
  if (e instanceof TypeError) return true;
  const message = (e as { message?: unknown } | null)?.message;
  return (
    typeof message === "string" &&
    /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)
  );
}

/** Any error thrown while sending a record, as an i18n key. */
export function errorKey(e: unknown): ErrKey {
  if (e instanceof ValidationError) return e.key;
  return cloudErrorKey(e as PostgrestLikeError) ?? "err_syncFailed";
}
