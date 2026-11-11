/* ============================================================
   LearnOS · core.js — 纯函数域逻辑（浏览器 / Node 双端可用）
   不依赖 DOM；Node 环境经 module.exports 供 node:test 使用。
   ============================================================ */
(function (global) {
  "use strict";

  /* ---------- 基础工具 ---------- */
  const LET = ["A", "B", "C", "D", "E", "F"];
  const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const DAY = 86400000;
  const fmtDate = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const fmtMMSS = (s) => { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const searchStrip = (s) => String(s || "").replace(/<[^>]+>/g, "");

  /* ---------- 领域：作答与进度 ---------- */
  const gradeOk = (q, pick) => pick === q.ans;

  /* 一次作答对进度的影响：章节统计 + 错题本 + 活动日志（q） */
  const applyAnswer = (progress, q, ok, now) => {
    if (q.ch) {
      const st = progress.chStats[q.ch] || { done: 0, right: 0 };
      st.done++; if (ok) st.right++;
      progress.chStats[q.ch] = st;
    }
    const w = progress.wrong.indexOf(q.id);
    if (!ok && w === -1) progress.wrong.push(q.id);
    if (ok && w > -1) progress.wrong.splice(w, 1);
    const k = fmtDate(now.getTime());
    progress.activity[k] = progress.activity[k] || { q: 0, e: 0, p: 0 };
    progress.activity[k].q += 1;
    return ok;
  };

  /* 一次模考交卷的影响：逐题统计/错题 + 活动日志（e，只记一次） */
  const applyExamAnswers = (progress, qs, answers, byId, now) => {
    const k = fmtDate(now.getTime());
    progress.activity[k] = progress.activity[k] || { q: 0, e: 0, p: 0 };
    progress.activity[k].e += 1;
    qs.forEach((id, i) => {
      const q = byId[id];
      if (!q) return;
      const ok = answers[i] === q.ans;
      if (q.ch) {
        const st = progress.chStats[q.ch] || { done: 0, right: 0 };
        st.done++; if (ok) st.right++;
        progress.chStats[q.ch] = st;
      }
      const w = progress.wrong.indexOf(id);
      if (!ok && w === -1) progress.wrong.push(id);
      if (ok && w > -1) progress.wrong.splice(w, 1);
    });
  };

  const computeScore = (right, total) => pct(right, total);
  const planProgress = (checks, totalDays) => pct(Object.keys(checks || {}).length, totalDays || 0);

  /* ---------- 领域：活动洞察 ---------- */
  const computeStreak = (activity, now) => {
    const has = (d) => { const a = activity[d]; return !!(a && (a.q || a.e || a.p)); };
    const d = new Date(now.getTime());
    if (!has(fmtDate(d.getTime()))) d.setTime(d.getTime() - DAY); // 今天还没学则从昨天起算
    let streak = 0;
    while (has(fmtDate(d.getTime()))) { streak++; d.setTime(d.getTime() - DAY); }
    return streak;
  };

  /* 近 N 周热力格（末列=本周，周一对齐）；返回 [{key,count,level}] */
  const heatmapCells = (activity, now, weeks = 16) => {
    const end = now.getTime();
    const dow = (now.getDay() + 6) % 7;
    const start = end - ((weeks - 1) * 7 + dow) * DAY;
    const cells = [];
    for (let t = start; t <= end; t += DAY) {
      const key = fmtDate(t);
      const a = activity[key] || {};
      const count = (a.q || 0) + (a.e || 0);
      const level = count >= 30 ? 4 : count >= 15 ? 3 : count >= 5 ? 2 : count >= 1 ? 1 : 0;
      cells.push({ key, count, level, q: a.q || 0, e: a.e || 0 });
    }
    return cells;
  };

  /* ---------- 领域：全局搜索 ---------- */
  const searchFilter = (knowledge, bank, real, kwRaw) => {
    const kw = String(kwRaw || "").trim().toLowerCase();
    const empty = { areas: [], terms: [], questions: [] };
    if (!kw) return empty;
    const areas = [], terms = [], questions = [];
    (knowledge || []).forEach((k) => {
      if (String(k.name).toLowerCase().includes(kw) || searchStrip(k.brief).toLowerCase().includes(kw)) areas.push(k);
      (k.terms || []).forEach((t) => {
        if (String(t.term).toLowerCase().includes(kw) || String(t.def).toLowerCase().includes(kw)) terms.push({ term: t.term, def: t.def, area: k });
      });
    });
    [].concat(bank || [], real || []).forEach((item) => {
      if (String(item.q).toLowerCase().includes(kw)) questions.push(item);
    });
    return { areas, terms, questions };
  };

  /* ---------- 领域：闪卡（Leitner 间隔重复） ---------- */
  const FLASH_INTERVALS = [1, 2, 4, 8, 16, 32]; // 天，box 0..5
  const cardsFromKnowledge = (knowledge) => {
    const cards = [];
    (knowledge || []).forEach((k) => {
      (k.terms || []).forEach((t) => cards.push({ id: `${k.id}:t:${t.term}`, ch: k.id, front: t.term, back: t.def }));
      if (k.mustKnow) cards.push({ id: `${k.id}:m`, ch: k.id, front: `★ ${k.name} · 一句话必背`, back: k.mustKnow });
    });
    return cards;
  };
  /* 到期判定：新卡视为到期；date-only 到期日（当日 00:00 起即到期） */
  const dueCards = (flashcards, cards, now, includeAll = false) => {
    const t = now.getTime();
    return cards.filter((c) => {
      if (includeAll) return true;
      const st = flashcards[c.id];
      if (!st) return true;
      return new Date(st.due + "T00:00:00").getTime() <= t;
    });
  };
  /* rating: 0 忘记(归零) / 1 模糊(保持) / 2 记牢(box+1，上限 5) */
  const scheduleCard = (st, rating, now) => {
    const cur = (st && st.box) || 0;
    const box = rating === 2 ? Math.min(cur + 1, 5) : rating === 1 ? cur : 0;
    return { box, due: fmtDate(now.getTime() + FLASH_INTERVALS[box] * DAY), seen: ((st && st.seen) || 0) + 1 };
  };

  /* ---------- 领域：每日目标 / 成就 ---------- */
  const todayCount = (activity, now) => {
    const a = activity[fmtDate(now.getTime())] || {};
    return (a.q || 0) + (a.e || 0) + (a.f || 0);
  };

  const achievementsFor = (pack, progress, now) => {
    const EXM = (pack && pack.meta && pack.meta.exam) || { pass: 60, target: 70, stretch: 80 };
    const planTotal = (pack && pack.plan && pack.plan.totalDays) || 0;
    const doneQ = Object.values(progress.chStats || {}).reduce((s, c) => s + c.done, 0);
    const best = (progress.exams || []).length ? Math.max(...progress.exams.map((e) => e.score)) : 0;
    const streak = computeStreak(progress.activity || {}, now);
    const fcSeen = Object.values(progress.flashcards || {}).reduce((s, c) => s + ((c && c.seen) || 0), 0);
    const chMastery = (pack && pack.knowledge || []).some((k) => {
      const st = (progress.chStats || {})[k.id];
      return st && st.done >= 10 && st.right === st.done;
    });
    const raw = [
      ["first", "🎯", "首战告捷", "完成第 1 道练习题", doneQ >= 1],
      ["hundred", "💯", "百题斩", "累计刷题 100 道", doneQ >= 100],
      ["streak7", "🔥", "七日之约", "连续学习 7 天", streak >= 7],
      ["streak30", "🏆", "三十而立", "连续学习 30 天", streak >= 30],
      ["pass", "✅", "跨过及格线", `模考达到 ${EXM.pass || 60} 分`, best >= (EXM.pass || 60)],
      ["target", "🎖", "目标达成", `模考达到 ${EXM.target || 70} 分`, best >= (EXM.target || 70)],
      ["stretch", "👑", "高分传说", `模考达到 ${EXM.stretch || 80} 分`, best >= (EXM.stretch || 80)],
      ["clean", "🧹", "错题清零", "累计 50 题后错题本清空", doneQ >= 50 && (progress.wrong || []).length === 0],
      ["master", "🏅", "章节宗师", "任一知识域刷满 10 题且全对", chMastery],
      ["plan", "🗺", "计划达人", "完成全部学习计划打卡", planTotal > 0 && Object.keys(progress.checks || {}).length >= planTotal],
      ["fc20", "🃏", "卡片学徒", "复习闪卡 20 张", fcSeen >= 20],
      ["fc100", "🧠", "记忆大师", "复习闪卡 100 张", fcSeen >= 100],
    ];
    return raw.map(([id, icon, name, desc, done]) => ({ id, icon, name, desc, done }));
  };

  /* ---------- 状态：默认 / 修复 / 迁移 ---------- */
  const defaultTrackState = () => ({ checks: {}, chStats: {}, wrong: [], exams: [], resStatus: {}, examDate: "", termsRead: {}, activity: {}, flashcards: {}, favorites: [], notes: {}, achievementsSeen: [] });

  const fixState = (s) => {
    s = s && typeof s === "object" ? s : {};
    if (s.v !== 2) s = { v: 2, current: "cdmp", tracks: {} };
    s.tracks = s.tracks && typeof s.tracks === "object" ? s.tracks : {};
    Object.keys(s.tracks).forEach((k) => { s.tracks[k] = Object.assign(defaultTrackState(), s.tracks[k]); });
    if (!s.current || typeof s.current !== "string") s.current = "cdmp";
    s.settings = Object.assign({ dailyGoal: 20 }, s.settings && typeof s.settings === "object" ? s.settings : {});
    return s;
  };

  /* v1（CDMP 单轨时代）→ v2 自动迁移 */
  const loadFrom = (storage, key, v1key) => {
    try {
      const raw = storage.getItem(key);
      if (raw) return fixState(JSON.parse(raw));
    } catch (e) { /* 损坏数据按无历史处理 */ }
    try {
      const old = JSON.parse(storage.getItem(v1key));
      if (old && (old.checks || old.chStats || old.exams || old.resStatus)) {
        return fixState({ v: 2, current: "cdmp", tracks: { cdmp: old } });
      }
    } catch (e) { /* 无旧数据 */ }
    return fixState({ v: 2, current: "cdmp", tracks: {} });
  };
  const saveTo = (storage, key, s) => storage.setItem(key, JSON.stringify(s));
  const ensureTrack = (s, id) => { if (!s.tracks[id]) s.tracks[id] = defaultTrackState(); return s.tracks[id]; };
  const logActivityOn = (progress, type, n, now) => {
    const k = fmtDate(now.getTime());
    progress.activity[k] = progress.activity[k] || { q: 0, e: 0, p: 0 };
    progress.activity[k][type] += (n || 1);
    return progress;
  };

  const api = {
    LET, esc, pct, shuffle, fmtDate, fmtMMSS, searchStrip,
    gradeOk, applyAnswer, applyExamAnswers, computeScore, planProgress,
    computeStreak, heatmapCells, searchFilter,
    FLASH_INTERVALS, cardsFromKnowledge, dueCards, scheduleCard, todayCount, achievementsFor,
    defaultTrackState, fixState, loadFrom, saveTo, ensureTrack, logActivityOn,
  };
  global.LearnOS = Object.assign({}, global.LearnOS, { core: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
