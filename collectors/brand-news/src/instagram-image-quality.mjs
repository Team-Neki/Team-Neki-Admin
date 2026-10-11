export function isCroppedInstagramImage(value) {
  try {
    const url = new URL(value);
    return (url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net"))
      && /(?:^|_)c\d+(?:\.\d+){3}[a-z]?(?:_|$)/.test(url.searchParams.get("stp") ?? "");
  } catch { return false; }
}
