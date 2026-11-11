/* LearnOS 门禁加解密往返测试（Node 内置 Web Crypto） */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes, createCipheriv } from "node:crypto";
import Crypt from "../js/crypto.js";

/* 与 tools/encrypt-data.mjs 完全相同的加密参数构造测试保险库 */
function makeVault(pass, plain) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(pass, salt, 310000, 32, "sha256");
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final(), c.getAuthTag()]);
  return {
    iterations: 310000,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
  };
}

test("门禁加解密往返：正确密码解出原文", async () => {
  const vault = makeVault("cdmp-test", "window.TRACKS = {}; // 学习内容");
  const bits = await Crypt.deriveBitsFromPass(vault, "cdmp-test");
  const text = await Crypt.decryptWithBits(vault, bits);
  assert.match(text, /window\.TRACKS/);
});

test("错误密码必须解密失败（GCM 标签校验）", async () => {
  const vault = makeVault("cdmp-test", "secret-content-should-not-leak");
  const bits = await Crypt.deriveBitsFromPass(vault, "wrong-pass");
  await assert.rejects(() => Crypt.decryptWithBits(vault, bits));
});

test("被篡改的密文必须解密失败", async () => {
  const vault = makeVault("cdmp-test", "secret");
  const tampered = { ...vault, ct: vault.ct.slice(0, -8) + "AAAAAAA=" };
  const bits = await Crypt.deriveBitsFromPass(vault, "cdmp-test");
  await assert.rejects(() => Crypt.decryptWithBits(tampered, bits));
});

test("base64 ↔ ArrayBuffer 往返", () => {
  const buf = new Uint8Array([0, 1, 2, 250, 255]).buffer;
  const back = new Uint8Array(Crypt.b64ToBuf(Crypt.bufToB64(buf)));
  assert.deepEqual(back, new Uint8Array(buf));
});
