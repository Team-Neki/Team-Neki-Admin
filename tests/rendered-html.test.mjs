import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Neki Admin dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Neki Admin<\/title>/i);
  assert.match(html, /안녕하세요, 운영자님/);
  assert.match(html, /최근 운영 요청/);
  assert.match(html, /Design system v0\.1/);
  assert.match(html, /class="ant-menu-item-icon nav-glyph" aria-hidden="true">D/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("keeps the Figma foundation and Ant Design dependencies explicit", async () => {
  const [page, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "antd"/);
  assert.match(page, /colorPrimary:\s*"#ff5647"/);
  assert.match(css, /--primary-400:\s*#ff5647/);
  assert.match(css, /--radius-lg:\s*20px/);
  assert.match(css, /Pretendard/);
  assert.match(layout, /images:\s*\["\/og\.png"\]/);
  assert.match(packageJson, /"antd":/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("public/og.png", templateRoot));
});

test("uses deterministic glyphs for vinext server-client parity", async () => {
  const [page, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="nav-glyph"/);
  assert.doesNotMatch(page, /@ant-design\/icons/);
  assert.doesNotMatch(packageJson, /@ant-design\/icons/);
});

test("uses the current Ant Design progress rail token", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /railColor="#ffeceb"/);
  assert.doesNotMatch(page, /trailColor=/);
});
