export const AUTH_CHANNEL = "neki-admin-auth";

export function loginDestination(status = 401): string {
  const params = new URLSearchParams({ returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}` });
  params.set("error", status === 403 ? "admin_access_denied" : "session_expired");
  return `/login?${params}`;
}

export function broadcastSignOut() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.postMessage("sign-out");
  channel.close();
}
