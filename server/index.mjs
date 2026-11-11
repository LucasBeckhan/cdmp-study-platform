/* ============================================================
   LearnOS API · index.mjs — HTTP 入口（静态站点 + REST API）
   零依赖（仅 Node 内置模块）。同时服务前端静态文件与 /api/*。
   直接运行：PORT=8787 node server/index.mjs
   测试引入：createApp({ dataDir, contentPass, root })
   ============================================================ */
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createDb } from "./db.mjs";
import { createApi } from "./api.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
/* 禁止通过 HTTP 访问的目录（服务器数据 / 测试 / 原始素材） */
const DENY = ["server-data", "/.git", "/tests/", "/_import/", "node_modules"];

export function createApp(opts = {}) {
  const dataDir = opts.dataDir ?? process.env.LEARNOS_DATA_DIR ?? "server-data";
  const contentPass = opts.contentPass ?? process.env.LEARNOS_CONTENT_PASS ?? null;
  const root = resolve(opts.root ?? process.cwd());
  const rateMax = opts.rateMax ?? 30;
  const db = createDb(dataDir);
  const api = createApi({ db, contentPass, rateMax });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      if (url.pathname.startsWith("/api/")) {
        const body = await readBody(req);
        return api.handle(req, res, url, body);
      }
      return serveStatic(res, url.pathname, root);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "服务器内部错误" }));
    }
  });
  server.dataDir = dataDir;
  return server;
}

function readBody(req, cap = 1024 * 1024) {
  return new Promise((resolveP, rejectP) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > cap) { rejectP(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolveP({});
      try { resolveP(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { resolveP({}); }
    });
    req.on("error", rejectP);
  });
}

function serveStatic(res, pathname, root) {
  let p = decodeURIComponent(pathname);
  if (p.endsWith("/")) p += "index.html";
  const resolved = resolve(join(root, p));
  if (resolved !== root && !resolved.startsWith(root + "/")) { res.writeHead(403, { "Content-Type": "text/plain" }); return res.end("Forbidden"); }
  if (DENY.some((d) => resolved.includes(d))) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not Found"); }
  let file = resolved;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(p)) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Not Found"); }
    file = join(root, "index.html"); // SPA 回退
  }
  const ext = extname(file).toLowerCase();
  const isIndex = file.endsWith("index.html");
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": isIndex ? "no-cache" : "public, max-age=3600",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  });
  res.end(readFileSync(file));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, () => {
    console.log(`✓ LearnOS 服务已启动：http://localhost:${port}`);
    console.log(`  数据目录：${process.env.LEARNOS_DATA_DIR || "server-data"}（记得纳入备份）`);
    console.log(`  内容自动解锁：${process.env.LEARNOS_CONTENT_PASS ? "已配置（登录后免输内容密码）" : "未配置（登录后需输入内容解锁密码）"}`);
  });
}
