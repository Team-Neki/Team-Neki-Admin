import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const getFreePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      reject(new Error("테스트 서버 포트를 할당하지 못했습니다."));
      return;
    }
    server.close((error) => error ? reject(error) : resolve(address.port));
  });
});

const waitForReady = async (baseUrl, child, readLogs) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next 테스트 서버가 종료되었습니다.\n${readLogs()}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // 서버가 포트를 열 때까지 짧게 재시도합니다.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next 테스트 서버 시작 시간이 초과되었습니다.\n${readLogs()}`);
};

export const startTestServer = async (environment = {}) => {
  const port = await getFreePort();
  const logs = [];
  const child = spawn(process.execPath, [".next/standalone/server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      ...environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForReady(baseUrl, child, () => logs.join(""));

  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
};
