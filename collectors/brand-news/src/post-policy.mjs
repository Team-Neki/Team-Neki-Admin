const HOUR = 3_600_000;
export const MAX_POST_ATTEMPTS = 3;

export function recordPostFailure(url, stage, error, previous, observedAt) {
  const attempts = (previous?.attempts ?? 0) + 1;
  return { url, stage, code: error.code ?? "layout-changed", attempts,
    lastAttemptAt: observedAt, status: attempts >= MAX_POST_ATTEMPTS ? "needs-review" : "retry-pending",
    nextAttemptAt: attempts >= MAX_POST_ATTEMPTS ? null : new Date(Date.parse(observedAt) + HOUR * 2 ** (attempts - 1)).toISOString() };
}

export function selectPosts(posts, { knownRecords = [], failedPosts = [], observedAt, limit = 12 } = {}) {
  const timestamp = Date.parse(observedAt);
  const known = new Map(knownRecords.map((record) => [record.sourceUrl, record]));
  const failures = new Map(failedPosts.map((failure) => [failure.url, failure]));
  const allowed = (url) => !failures.has(url) || (failures.get(url).status !== "needs-review" && Date.parse(failures.get(url).nextAttemptAt) <= timestamp);
  const fresh = posts.filter((url) => !known.has(url) && !failures.has(url));
  const retry = failedPosts.filter((failure) => allowed(failure.url)).map((failure) => failure.url);
  // Refresh known captions/media at most daily; ordinary scans only discover new IDs.
  const refresh = posts.filter((url) => known.has(url) && allowed(url) && (!Array.isArray(known.get(url).imageUrls) || timestamp - Date.parse(known.get(url).observedAt ?? known.get(url).lastSeenAt ?? "") >= 24 * HOUR));
  return [...new Set([...fresh, ...retry, ...refresh])].slice(0, limit);
}
