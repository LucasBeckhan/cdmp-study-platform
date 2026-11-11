/* LearnOS 核心域逻辑单元测试（node:test，零依赖） */
import { test } from "node:test";
import assert from "node:assert/strict";
import Core from "../js/core.js";

const DAY = 86400000;
const now = new Date();
const key = (offsetDays) => Core.fmtDate(now.getTime() - offsetDays * DAY);
const shim = () => {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
};

/* ---------- 作答与进度 ---------- */
test("gradeOk + applyAnswer：正确作答更新统计、清除错题、记录活动", () => {
  const p = Core.defaultTrackState();
  p.wrong.push("q1");
  const q = { id: "q1", ch: "ch3", ans: 1 };
  const ok = Core.applyAnswer(p, q, Core.gradeOk(q, 1), now);
  assert.equal(ok, true);
  assert.equal(p.chStats.ch3.done, 1);
  assert.equal(p.chStats.ch3.right, 1);
  assert.ok(!p.wrong.includes("q1"));
  assert.equal(p.activity[key(0)].q, 1);
});

test("applyAnswer：错误作答入错题本且去重，统计只加 done", () => {
  const p = Core.defaultTrackState();
  const q = { id: "q2", ch: "ch5", ans: 0 };
  Core.applyAnswer(p, q, false, now);
  Core.applyAnswer(p, q, false, now);
  assert.equal(p.wrong.filter((x) => x === "q2").length, 1);
  assert.equal(p.chStats.ch5.done, 2);
  assert.equal(p.chStats.ch5.right, 0);
});

test("applyAnswer：无章节真题不计入章节统计", () => {
  const p = Core.defaultTrackState();
  Core.applyAnswer(p, { id: "r1", ans: 1 }, true, now);
  assert.deepEqual(p.chStats, {});
  assert.equal(p.activity[key(0)].q, 1);
});

test("applyExamAnswers：活动只记一次 e，错题并入错题本", () => {
  const p = Core.defaultTrackState();
  const byId = { a: { id: "a", ch: "ch1", ans: 0 }, b: { id: "b", ch: "ch1", ans: 2 } };
  Core.applyExamAnswers(p, ["a", "b"], { 0: 0, 1: 0 }, byId, now);
  assert.equal(p.activity[key(0)].e, 1);
  assert.equal(p.chStats.ch1.done, 2);
  assert.equal(p.chStats.ch1.right, 1);
  assert.deepEqual(p.wrong, ["b"]);
});

/* ---------- 活动洞察 ---------- */
test("computeStreak：今天活跃 / 今天缺勤从昨天起算 / 断签归零", () => {
  const mk = (days) => { const m = {}; days.forEach((d) => { m[key(d)] = { q: 1, e: 0, p: 0 }; }); return m; };
  assert.equal(Core.computeStreak(mk([0, 1, 2]), now), 3);
  assert.equal(Core.computeStreak(mk([1, 2]), now), 2);
  assert.equal(Core.computeStreak(mk([1, 3]), now), 1);
  assert.equal(Core.computeStreak(mk([5, 6]), now), 0);
  assert.equal(Core.computeStreak({}, now), 0);
});

test("heatmapCells：16 周对齐周一、层级阈值正确", () => {
  const cells = Core.heatmapCells({}, now, 16);
  const expectedLen = 15 * 7 + ((now.getDay() + 6) % 7) + 1;
  assert.equal(cells.length, expectedLen);
  assert.equal(cells[cells.length - 1].key, key(0));
  const activity = {};
  activity[key(0)] = { q: 3, e: 0, p: 0 };
  activity[key(1)] = { q: 20, e: 1, p: 0 };
  activity[key(2)] = { q: 0, e: 0, p: 1 }; // 只有打卡，热力不计
  const c2 = Core.heatmapCells(activity, now, 16);
  assert.equal(c2[c2.length - 1].level, 1);
  assert.equal(c2[c2.length - 2].level, 3);
  assert.equal(c2[c2.length - 3].level, 0);
  assert.equal(c2[c2.length - 1].q, 3);
});

/* ---------- 全局搜索 ---------- */
test("searchFilter：术语 / 知识域 / 题干命中与空查询", () => {
  const knowledge = [
    { id: "ch3", name: "数据治理", brief: "权力与控制", terms: [{ term: "RACI", def: "职责分配矩阵" }] },
  ];
  const bank = [{ id: "q1", ch: "ch3", q: "数据治理的定义是？" }];
  const real = [{ id: "r1", set: "试卷1", q: "主数据的黄金记录三步是？" }];
  const r = Core.searchFilter(knowledge, bank, real, "raci");
  assert.equal(r.terms.length, 1);
  assert.equal(r.terms[0].area.name, "数据治理");
  const r2 = Core.searchFilter(knowledge, bank, real, "数据治理");
  assert.ok(r2.areas.length >= 1 && r2.questions.length >= 1);
  const r3 = Core.searchFilter(knowledge, bank, real, "黄金记录");
  assert.equal(r3.questions.length, 1);
  assert.deepEqual(Core.searchFilter(knowledge, bank, real, ""), { areas: [], terms: [], questions: [] });
  assert.deepEqual(Core.searchFilter(knowledge, bank, real, "不存在的关键词xyz"), { areas: [], terms: [], questions: [] });
});

/* ---------- 状态迁移与持久化 ---------- */
test("fixState：补齐默认字段、修复非法输入", () => {
  const s = Core.fixState({ v: 2, current: "cdmp", tracks: { cdmp: { checks: { 1: true } } } });
  assert.ok("activity" in s.tracks.cdmp);
  assert.ok(Array.isArray(s.tracks.cdmp.wrong));
  const s2 = Core.fixState(null);
  assert.equal(s2.v, 2);
  assert.equal(s2.current, "cdmp");
});

test("loadFrom：v1 单轨数据自动迁移进 cdmp 轨道位", () => {
  const mem = shim();
  mem.setItem("v1", JSON.stringify({ checks: { 3: true }, chStats: { ch3: { done: 2, right: 1 } }, examDate: "2026-12-01" }));
  const s = Core.loadFrom(mem, "learnos_v2", "v1");
  assert.equal(s.current, "cdmp");
  assert.equal(s.tracks.cdmp.chStats.ch3.done, 2);
  assert.equal(s.tracks.cdmp.examDate, "2026-12-01");
  assert.ok("activity" in s.tracks.cdmp);
});

test("loadFrom：损坏 JSON 兜底为默认状态", () => {
  const mem = shim();
  mem.setItem("learnos_v2", "{corrupt!!!");
  const s = Core.loadFrom(mem, "learnos_v2", "v1");
  assert.equal(s.v, 2);
  assert.deepEqual(Object.keys(s.tracks), []);
});

test("saveTo / loadFrom 往返 + ensureTrack 懒创建", () => {
  const mem = shim();
  const s = Core.loadFrom(mem, "learnos_v2", "v1");
  Core.ensureTrack(s, "cdmp").checks["5"] = true;
  Core.ensureTrack(s, "pmp").wrong.push("x1");
  Core.saveTo(mem, "learnos_v2", s);
  const s2 = Core.loadFrom(mem, "learnos_v2", "v1");
  assert.equal(s2.tracks.cdmp.checks["5"], true);
  assert.deepEqual(s2.tracks.pmp.wrong, ["x1"]);
});

/* ---------- 杂项 ---------- */
test("fmtMMSS / pct / shuffle / esc", () => {
  assert.equal(Core.fmtMMSS(0), "00:00");
  assert.equal(Core.fmtMMSS(5400), "90:00");
  assert.equal(Core.fmtMMSS(-5), "00:00");
  assert.equal(Core.pct(1, 4), 25);
  assert.equal(Core.pct(1, 0), 0);
  const shuffled = Core.shuffle([1, 2, 3, 4, 5]);
  assert.equal(shuffled.length, 5);
  assert.deepEqual(shuffled.slice().sort(), [1, 2, 3, 4, 5]);
  assert.equal(Core.esc(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
});
