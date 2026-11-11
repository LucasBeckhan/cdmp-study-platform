/* ============================================================
   LearnOS · crypto.js — 访问门禁加解密（浏览器 / Node 双端）
   PBKDF2(SHA-256, 310000) 派生密钥 + AES-256-GCM 解密。
   依赖宿主的 Web Crypto（浏览器与 Node ≥ 15 均内置）。
   ============================================================ */
(function (global) {
  "use strict";

  const b64ToBuf = (b64) => {
    const bin = global.atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  };
  const bufToB64 = (buf) => {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return global.btoa(s);
  };
  const subtle = () => global.crypto.subtle;

  async function deriveBitsFromPass(vault, pass) {
    const enc = new TextEncoder();
    const baseKey = await subtle().importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    return subtle().deriveBits(
      { name: "PBKDF2", salt: b64ToBuf(vault.salt), iterations: vault.iterations || 310000, hash: "SHA-256" },
      baseKey, 256
    );
  }

  /* 解密成功返回明文文本；密码错误 → 抛异常（GCM 校验标签失败） */
  async function decryptWithBits(vault, bits) {
    const key = await subtle().importKey("raw", bits, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: b64ToBuf(vault.iv) }, key, b64ToBuf(vault.ct));
    return new TextDecoder().decode(plain);
  }

  const api = { b64ToBuf, bufToB64, deriveBitsFromPass, decryptWithBits };
  global.LearnOS = Object.assign({}, global.LearnOS, { crypto: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
