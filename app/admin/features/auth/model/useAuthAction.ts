import { useEffect, useRef, useState } from "react";
import { broadcastSignOut } from "./auth-navigation";

export function useAuthAction(action: "sign-in" | "sign-out", returnTo = "/") {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(action === "sign-in" ? "/api/auth/sign-in/social" : "/api/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "sign-in" ? { provider: "google", callbackURL: returnTo } : {}),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error("auth_failed");
      if (action === "sign-out") {
        broadcastSignOut();
        window.location.replace("/login");
      } else {
        const payload: { url?: string } = await response.json();
        const url = new URL(payload.url ?? "");
        if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") throw new Error("invalid_provider");
        window.location.assign(url.href);
      }
    } catch {
      if (!abort.signal.aborted) setError(action === "sign-in" ? "로그인하지 못했습니다. 다시 시도해 주세요." : "로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return { run, busy, error };
}
