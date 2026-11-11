/* LearnOS API 服务器集成测试（真实 HTTP 往返，零依赖） */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.mjs";

let server, port, dataDir;
const EMAIL = "tester@learnos.dev";
const PASS = "Passw0rd123";

/* 简易会话客户端：手工管理 Cookie（Node fetch 不自动存 cookie） */
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const kv = c.split(";")[0];
      if (kv.startsWith("learnos_session=")) cookie = kv.startsWith("learnos_session=;") ? "" : kv;
    }
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  };
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "learnos-api-test-"));
  server = createApp({ dataDir, contentPass: "content-pass-123", root: process.cwd(), rateMax: 30 });
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});
after(() => {
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("GET /api/health", async () => {
  const c = client();
  const r = await c("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.service, "learnos-api");
});

test("注册：成功 + 弱密码 400 + 非法邮箱 400 + 重复 409", async () => {
  const c = client();
  const ok = await c("POST", "/api/auth/register", { email: EMAIL, password: PASS });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.email, EMAIL);
  assert.equal(ok.data.contentPass, "content-pass-123"); // 内容自动解锁密钥下发
  assert.ok(ok.data.email.length > 0);

  const weak = await client()("POST", "/api/auth/register", { email: "a@b.dev", password: "short" });
  assert.equal(weak.status, 400);
  const noDigit = await client()("POST", "/api/auth/register", { email: "a@b.dev", password: "onlyletters" });
  assert.equal(noDigit.status, 400);
  const badMail = await client()("POST", "/api/auth/register", { email: "not-an-email", password: PASS });
  assert.equal(badMail.status, 400);
  const dup = await client()("POST", "/api/auth/register", { email: EMAIL, password: PASS });
  assert.equal(dup.status, 409);
});

test("登录：成功下发会话 / 错误密码 401", async () => {
  const bad = await client()("POST", "/api/auth/login", { email: EMAIL, password: "Wrong9999" });
  assert.equal(bad.status, 401);
  const ok = await client()("POST", "/api/auth/login", { email: EMAIL.toUpperCase(), password: PASS });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get("set-cookie").includes("HttpOnly"));
});

test("未登录访问受保护路由 → 401", async () => {
  const r = await client()("GET", "/api/me");
  assert.equal(r.status, 401);
});

test("GET /api/me：会话 + 内容解锁密钥", async () => {
  const c = client();
  await c("POST", "/api/auth/login", { email: EMAIL, password: PASS });
  const r = await c("GET", "/api/me");
  assert.equal(r.status, 200);
  assert.equal(r.data.email, EMAIL);
  assert.equal(r.data.contentPass, "content-pass-123");
});

test("进度同步：PUT → GET 往返；服务端较新时拒绝并返回 newer", async () => {
  const c = client();
  await c("POST", "/api/auth/login", { email: EMAIL, password: PASS });
  const payload = { checks: { 1: true }, wrong: ["q1"], activity: {} };
  const put = await c("PUT", "/api/progress/cdmp", { payload, updatedAt: "2026-11-12T10:00:00.000Z" });
  assert.equal(put.data.ok, true);
  const get = await c("GET", "/api/progress");
  assert.equal(get.data.tracks.cdmp.payload.checks["1"], true);
  // 客户端时间戳较旧 → 服务端拒绝并下发 newer
  const stale = await c("PUT", "/api/progress/cdmp", { payload: { checks: {} }, updatedAt: "2026-11-12T09:00:00.000Z" });
  assert.equal(stale.data.ok, false);
  assert.equal(stale.data.newer.payload.checks["1"], true);
  // 更新时间戳较新 → 覆盖
  const fresh = await c("PUT", "/api/progress/cdmp", { payload: { checks: { 2: true } }, updatedAt: "2026-11-12T11:00:00.000Z" });
  assert.equal(fresh.data.ok, true);
  const get2 = await c("GET", "/api/progress");
  assert.equal(get2.data.tracks.cdmp.payload.checks["2"], true);
});

test("进度路由：非法 tid / 缺字段 / 未登录", async () => {
  const c = client();
  await c("POST", "/api/auth/login", { email: EMAIL, password: PASS });
  assert.equal((await c("PUT", "/api/progress/bad tid!", { payload: {}, updatedAt: "2026-11-12T10:00:00.000Z" })).status, 404);
  assert.equal((await c("PUT", "/api/progress/cdmp", { payload: null, updatedAt: "2026-11-12T10:00:00.000Z" })).status, 400);
  assert.equal((await client()("PUT", "/api/progress/cdmp", { payload: {}, updatedAt: "2026-11-12T10:00:00.000Z" })).status, 401);
});

test("登出后会话失效", async () => {
  const c = client();
  await c("POST", "/api/auth/login", { email: EMAIL, password: PASS });
  assert.equal((await c("GET", "/api/me")).status, 200);
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/me")).status, 401);
});

test("auth 限流：超过阈值返回 429", async () => {
  const dataDir2 = mkdtempSync(join(tmpdir(), "learnos-rate-"));
  const s2 = createApp({ dataDir: dataDir2, rateMax: 2 });
  await new Promise((r) => s2.listen(0, r));
  const p2 = s2.address().port;
  const call = () => fetch(`http://127.0.0.1:${p2}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@y.dev", password: "Wrong1234" }) });
  assert.equal((await call()).status, 401);
  assert.equal((await call()).status, 401);
  assert.equal((await call()).status, 429);
  s2.close();
  rmSync(dataDir2, { recursive: true, force: true });
});

test("静态站点：首页 + 严格 CSP + 敏感目录屏蔽 + SPA 回退", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
  assert.ok((await res.text()).includes("LearnOS"));
  assert.equal((await fetch(`http://127.0.0.1:${port}/server-data/users.json`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/tests/core.test.mjs`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/some/spa/route`)).status, 200); // SPA 回退
  assert.equal((await fetch(`http://127.0.0.1:${port}/data/vault.js`)).status, 200); // 保险库可下发
});

test("服务器数据目录落在配置位置（原子写入可读）", () => {
  assert.ok(existsSync(join(dataDir, "users.json")));
  const users = JSON.parse(readFileSync(join(dataDir, "users.json"), "utf8"));
  assert.ok(users[EMAIL].hash && users[EMAIL].salt);
});
