#!/usr/bin/env node
/* 内容加密打包器：把 data/*.js 明文打包为加密保险库 data/vault.js
 *
 * 用法（在仓库根目录）：
 *   CDMP_PASS=你的访问密码 node tools/encrypt-data.mjs
 *
 * 安全设计：
 *   - AES-256-GCM + PBKDF2(SHA-256, 310000 次) 密钥拉伸
 *   - 密码不写入任何文件；仓库/线上只存在密文
 *   - 浏览器端由 Web Crypto (SubtleCrypto) 用同一参数解密
 *   - 每次打包使用随机 salt/iv，同一密码每次产物不同
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";

const pass = process.env.CDMP_PASS;
if (!pass) {
  console.error("✗ 请先设置环境变量：CDMP_PASS=你的访问密码 node tools/encrypt-data.mjs");
  process.exit(1);
}
if (pass.length < 4) {
  console.error("✗ 密码太短（至少 4 位）。正式使用建议 10 位以上混合密码。");
  process.exit(1);
}

const FILES = [
  "plan", "knowledge", "questions-1", "questions-2", "questions-3",
  "questions-4", "questions-real", "resources", "tips",
];

const parts = [];
for (const f of FILES) {
  const p = `data/${f}.js`;
  if (!existsSync(p)) {
    console.warn(`⚠ 缺少 ${p}，跳过（占位全局保持 undefined 也可运行）`);
    continue;
  }
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
  `/* 🔐 加密数据保险库 — 由 tools/encrypt-data.mjs 生成
   内容为 AES-256-GCM 密文；密钥由访问密码经 PBKDF2 派生，仓库中不含明文与密码 */\n` +
  `window.CDMP_VAULT = { iterations: 310000, salt: "${salt.toString("base64")}", iv: "${iv.toString("base64")}", ct: "${ct.toString("base64")}" };\n`;

writeFileSync("data/vault.js", out);
console.log(`✓ 已生成 data/vault.js：明文 ${bundle.length} 字符 → 密文 ${ct.length} 字节（salt/iv 随机化）`);
console.log("  记得提交更新后的 data/vault.js；明文 data/*.js 始终留在本地，不要入库。");
