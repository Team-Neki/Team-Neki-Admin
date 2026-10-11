const BRANCH = "data/brand-news";
const API = "https://api.github.com";
const MAX_BYTES = 5_000_000;

export function createDataStore({ repository, token, fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !token) throw new Error("GitHub repository and token required");
  async function request(path, method = "GET", body, allowMissing = false) {
    const response = await fetchImpl(`${API}/repos/${repository}/${path}`, { method,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub data ${method} failed (${response.status})`);
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_BYTES * 2) throw new Error("GitHub data response exceeds size limit");
    return JSON.parse(text);
  }
  return {
    async restore() {
      const reference = await request(`git/ref/heads/${BRANCH}`, "GET", null, true);
      if (!reference) return { sha: null, state: null };
      const sha = reference.object.sha;
      // Use the exact commit, not a moving branch, so publication can compare parents.
      const commit = await request(`git/commits/${sha}`);
      const tree = await request(`git/trees/${commit.tree.sha}`);
      const stateEntry = tree.tree.find((entry) => entry.path === "state.json" && entry.type === "blob");
      if (!stateEntry) throw new Error("Saved collector state is missing");
      const file = await request(`git/blobs/${stateEntry.sha}`);
      if (file.encoding !== "base64" || file.size > MAX_BYTES || !file.content) throw new Error("Invalid saved collector state");
      const state = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
      if (state.schemaVersion !== 1 || !Array.isArray(state.records) || !Array.isArray(state.diagnostics)) throw new Error("Invalid saved collector state");
      return { sha, state };
    },
    async publish({ sha, state, snapshot }) {
      const tree = [];
      for (const [path, value] of [["state.json", state], ["brand-news.json", snapshot]]) {
        const content = `${JSON.stringify(value)}\n`;
        if (Buffer.byteLength(content) > MAX_BYTES) throw new Error("Data file exceeds size limit");
        const blob = await request("git/blobs", "POST", { content, encoding: "utf-8" });
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const createdTree = await request("git/trees", "POST", { tree });
      const commit = await request("git/commits", "POST", { message: `chore(data): collect brand news ${snapshot.generatedAt}`, tree: createdTree.sha, parents: sha ? [sha] : [] });
      if (sha) await request(`git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha, force: false });
      else await request("git/refs", "POST", { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
      return commit.sha;
    },
  };
}
