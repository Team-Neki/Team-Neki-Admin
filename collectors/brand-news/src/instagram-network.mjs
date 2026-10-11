import { checkInstagramNavigation } from "./instagram-access.mjs";

// Observe documents AND application requests. Images/telemetry must not stop a scan.
export function watchInstagramNetwork(tab, now = Date.now) {
  let blocked = null;
  let notify;
  const stopped = new Promise((resolve) => { notify = resolve; });
  const listener = (response) => {
    const url = new URL(response.url());
    if (!(url.hostname === "instagram.com" || url.hostname.endsWith(".instagram.com"))) return;
    if (!["document", "xhr", "fetch"].includes(response.request().resourceType())) return;
    try {
      checkInstagramNavigation(response.status(), url.href, response.headers()["retry-after"], now());
    } catch (error) {
      if (!error.stopSource || blocked) return;
      blocked = error;
      notify(error);
    }
  };
  tab.on("response", listener);
  return {
    get blocked() { return blocked; },
    async run(operation) {
      if (blocked) throw blocked;
      const result = await Promise.race([operation(), stopped.then((error) => { throw error; })]);
      if (blocked) throw blocked;
      return result;
    },
    dispose() { tab.off("response", listener); },
  };
}
