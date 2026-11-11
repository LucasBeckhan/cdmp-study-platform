/* ============================================================
   LearnOS API · auth.mjs — 密码散列 / 会话令牌 / 输入校验
   scrypt 加盐散列（防彩虹表）；令牌仅存 SHA-256 哈希（防库泄露撞库）。
   ============================================================ */
import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return { hash: hash.toString("hex"), salt: salt.toString("hex") };
}

export function verifyPassword(password, rec) {
  try {
    const calc = scryptSync(password, Buffer.from(rec.salt, "hex"), 64);
    return timingSafeEqual(calc, Buffer.from(rec.hash, "hex"));
  } catch (e) {
    return false;
  }
}

export const newToken = () => randomBytes(32).toString("hex");
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export const validEmail = (e) =>
  typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 8) return "密码至少 8 位";
  if (pw.length > 128) return "密码过长";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "密码需同时包含字母和数字";
  return null;
}
