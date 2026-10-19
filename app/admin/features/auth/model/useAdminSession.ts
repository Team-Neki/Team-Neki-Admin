import { useEffect, useState } from "react";
import { authenticatedFetch, SESSION_REJECTED_EVENT } from "../../../shared/api/authenticated-fetch";
import { AUTH_CHANNEL, loginDestination } from "./auth-navigation";

export function useAdminSession(expiresAt: string) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let leaving = false;
    let checking = false;
    const controller = new AbortController();
    const leave = (status = 401, signedOut = false) => {
      if (leaving) return;
      leaving = true;
      setBlocked(true);
      window.location.replace(signedOut ? "/login" : loginDestination(status));
    };
    const rejected = (event: Event) => leave((event as CustomEvent<number>).detail);
    const check = async () => {
      if (checking || leaving || document.visibilityState === "hidden") return;
      checking = true;
      try {
        await authenticatedFetch("/api/auth/get-session", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
      } catch { /* The next authenticated request also verifies access; offline is not permission denial. */ }
      finally { checking = false; }
    };
    const timer = window.setTimeout(() => leave(), Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(AUTH_CHANNEL);
    if (channel) channel.onmessage = (event) => { if (event.data === "sign-out") leave(401, true); };
    window.addEventListener(SESSION_REJECTED_EVENT, rejected);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    // Back/forward cache must never restore an authenticated screen without checking the session.
    window.addEventListener("pageshow", check);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      channel?.close();
      window.removeEventListener(SESSION_REJECTED_EVENT, rejected);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiresAt]);
  return blocked;
}
