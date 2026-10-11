export class InstagramAccessError extends Error {
  constructor(message, code, retryAfterMs = null) {
    super(message);
    this.name = "InstagramAccessError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.stopSource = ["rate-limited", "login-required", "challenge-required", "access-denied", "deadline-exceeded"].includes(code);
  }
}

export function checkInstagramNavigation(status, url, retryAfter, now = Date.now()) {
  if (status === 429) {
    const retryAfterMs = /^\d+$/.test(retryAfter ?? "") ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter ?? "") - now) || null;
    throw new InstagramAccessError("Instagram rate limit; source stopped", "rate-limited", retryAfterMs);
  }
  if (status === 401 || status === 403) throw new InstagramAccessError("Instagram denied public access; source stopped", "access-denied");
  if (status >= 400) throw new InstagramAccessError(`Instagram HTTP ${status}`, "http-error");
  const path = new URL(url).pathname;
  if (/^\/(?:challenge|checkpoint)(?:\/|$)/.test(path)) throw new InstagramAccessError("Instagram verification required; source stopped", "challenge-required");
  if (/^\/accounts\/(?:login|onetap)(?:\/|$)/.test(path)) throw new InstagramAccessError("Instagram login required; source stopped", "login-required");
}

// A signed CDN URL refresh is not a change to the underlying photograph.
export function stableImageIdentity(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net")) {
      url.search = "";
      url.hash = "";
    }
    return url.href;
  } catch { return value; }
}
