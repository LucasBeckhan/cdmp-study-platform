#!/usr/bin/env node
/* ============================================================
   LearnOS 内容加密打包器 v2
   自动发现 data/*.js 分片 → 打包为加密保险库 data/vault.js
   顺序约定：platform.js 最先；track-*.js（轨道组装器）最后；其余按名称排序
   —— 新增轨道分片后无需修改本脚本，直接重跑即可。

   用法：
     CDMP_PASS=密码 node tools/encrypt-data.mjs     # 打包 + 更新清单 data/content.sha256
     node tools/encrypt-data.mjs --check-local      # 校验明文与清单一致（防"改了数据忘重打包"）
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { pbkdf2Sync, randomBytes, createCipheriv, createHash } from "node:crypto";

const DATA = "data";
const VAULT = `${DATA}/vault.js`;
const MANIFEST = `${DATA}/content.sha256`;

/* 自动发现分片（确定性排序） */
function discover() {
  const all = readdirSync(DATA).filter((f) => f.endsWith(".js") && f !== "vault.js");
  const head = all.filter((f) => f === "platform.js");
  const mid = all.filter((f) => f !== "platform.js" && !f.startsWith("track-")).sort();
  const tail = all.filter((f) => f.startsWith("track-")).sort();
  return [...head, ...mid, ...tail];
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const contentHashes = () => discover().map((f) => `${sha256(readFileSync(`${DATA}/${f}`))}  ${f}`).join("\n") + "\n";

/* ---------- --check-local：明文/清单一致性校验 ---------- */
if (process.argv.includes("--check-local")) {
  if (!existsSync(VAULT)) { console.error("✗ 缺少 data/vault.js，请先执行 npm run build"); process.exit(1); }
  if (!existsSync(MANIFEST)) { console.error("✗ 缺少清单 data/content.sha256，请执行 npm run build"); process.exit(1); }
  const expected = readFileSync(MANIFEST, "utf8").trim();
  const actual = contentHashes().trim();
  if (expected !== actual) {
    console.error("✗ 明文数据与清单不一致：data/*.js 有改动但未重新打包保险库。");
    console.error("  请执行：npm run build && git add data/vault.js data/content.sha256");
    process.exit(1);
  }
  console.log("✓ 明文数据与保险库清单一致");
  process.exit(0);
}

/* ---------- 打包 ---------- */
const pass = process.env.CDMP_PASS;
if (!pass) {
  console.error("✗ 请先设置环境变量：CDMP_PASS=你的访问密码 node tools/encrypt-data.mjs");
  process.exit(1);
}
if (pass.length < 4) {
  console.error("✗ 密码太短（至少 4 位）。正式使用建议 10 位以上混合密码。");
  process.exit(1);
}

const files = discover();
if (!files.some((f) => f.startsWith("track-"))) {
  console.error("✗ 未发现任何轨道组装器（data/track-*.js），无法生成有效内容包");
  process.exit(1);
}
const parts = [];
for (const f of files) {
  const p = `${DATA}/${f}`;
  if (!existsSync(p)) { console.warn(`⚠ 缺少 ${p}，跳过`); continue; }
  parts.push(readFileSync(p, "utf8"));
}
const bundle = parts.join("\n");
if (bundle.trim().length < 100) {
  console.error("✗ 明文内容过少，请确认 data/*.js 明文文件在本地存在（它们不入库，仅在维护者本地）");
  process.exit(1);
}

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(pass, salt, 310000, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(bundle, "utf8"), cipher.final(), cipher.getAuthTag()]);

const out =
  `/* 🔐 加密数据保险库 — 由 tools/encrypt-data.mjs 自动发现并打包
   内容为 AES-256-GCM 密文；密钥由访问密码经 PBKDF2 派生，仓库中不含明文与密码 */\n` +
  `window.CDMP_VAULT = { iterations: 310000, salt: "${salt.toString("base64")}", iv: "${iv.toString("base64")}", ct: "${ct.toString("base64")}" };\n`;

writeFileSync(VAULT, out);
writeFileSync(MANIFEST, contentHashes());
console.log(`✓ 已生成 data/vault.js：${files.length} 个分片，明文 ${bundle.length} 字符 → 密文 ${ct.length} 字节（salt/iv 随机化）`);
console.log(`  分片顺序：${files.join(" → ")}`);
console.log("  记得提交 data/vault.js 与 data/content.sha256；明文 data/*.js 始终留在本地，不要入库。");
