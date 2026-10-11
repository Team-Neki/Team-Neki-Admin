const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function sourceHasFailure(source) {
  return ["error", "partial", "deferred"].includes(source?.status) || Number(source?.detailFailures ?? 0) > 0;
}

export function applyCollectionOutcome(current, previous, observedAt) {
  if (!sourceHasFailure(current)) return { ...current, lastAttemptAt: observedAt, consecutiveFailures: 0, nextAttemptAt: null };
  // Individual parse failures have their own bounded queue. They must not prevent
  // discovery of unrelated new posts. Access/rate failures still stop the source.
  if (current.status === "partial" && current.failedPosts?.length && !["rate-limited", "login-required", "challenge-required", "access-denied", "deadline-exceeded"].includes(current.failureCode)) {
    return { ...current, lastAttemptAt: observedAt, lastPartialAt: observedAt,
      lastSuccessAt: previous?.lastSuccessAt ?? null, consecutiveFailures: 0, nextAttemptAt: null };
  }
  const consecutiveFailures = Math.min(32, Math.max(0, Number(previous?.consecutiveFailures) || 0) + 1);
  const baseDelay = current.failureCode === "rate-limited" ? 6 * HOUR
    : ["login-required", "challenge-required", "access-denied"].includes(current.failureCode) ? 12 * HOUR
    : current.failureCode === "layout-changed" ? HOUR
    : current.status === "partial" ? 30 * MINUTE : 15 * MINUTE;
  const delay = Math.max(Math.min(24 * HOUR, baseDelay * 2 ** (consecutiveFailures - 1)), Number(current.retryAfterMs) || 0);
  return { ...current, lastAttemptAt: observedAt, consecutiveFailures,
    lastSuccessAt: previous?.lastSuccessAt ?? null,
    ...(current.status === "partial" ? { lastPartialAt: observedAt } : {}),
    nextAttemptAt: new Date(Date.parse(observedAt) + delay).toISOString() };
}
