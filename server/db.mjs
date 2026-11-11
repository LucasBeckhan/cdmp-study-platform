/* ============================================================
   LearnOS API · db.mjs — 原子化 JSON 数据存储（零依赖）
   每个集合一个 .json 文件；写入采用 临时文件 + rename 原子替换。
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

export function createDb(dir) {
  let ensured = false;
  const ensure = () => {
    if (!ensured) { mkdirSync(dir, { recursive: true }); ensured = true; }
  };
  const path = (name) => join(dir, name + ".json");

  return {
    load(name, fallback = {}) {
      try {
        return JSON.parse(readFileSync(path(name), "utf8"));
      } catch (e) {
        return structuredClone(fallback);
      }
    },
    save(name, obj) {
      ensure();
      const tmp = path(name) + "." + process.pid + ".tmp";
      writeFileSync(tmp, JSON.stringify(obj));
      renameSync(tmp, path(name));
    },
  };
}
