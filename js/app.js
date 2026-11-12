/* ============================================================
   LearnOS · app.js — 浏览器壳层：路由 / 视图 / 门禁 / 快捷键
   纯逻辑在 js/core.js，加解密在 js/crypto.js（Node 可测）。
   状态：全局 S × 每轨道进度 ST，localStorage 持久化。
   ============================================================ */
"use strict";

/* ---------------- 模块接线 ---------------- */
const Core = LearnOS.core;
const Crypt = LearnOS.crypto;
const Cloud = LearnOS.cloud;
const { LET, esc, pct, shuffle, fmtDate, fmtMMSS } = Core;

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
let toastTimer = null;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------------- 状态（全局 × 每轨道进度） ---------------- */
const SKEY = "learnos_v2";
const V1KEY = "cdmpMasterV1"; // 旧版（CDMP 单轨时代）数据迁移源
let S = null;        // { v:2, current, tracks:{ id: TrackProgress } }
let CUR = null;      // 当前轨道 id（轨道中心页为 null）
let T = null;        // 当前轨道内容包
let ST = null;       // 当前轨道进度
let BANK = [], REAL = [], REAL_SETS = [], BANK_IDS_BY_CH = {};
const BYID = {};
const CH = {}; // 当前轨道知识域索引
const chName = (id) => (CH[id] ? CH[id].name : id);
const TRACKS = () => window.TRACKS || {};
const PLAT = () => window.PLATFORM || { tracksOrder: Object.keys(TRACKS()), comingSoon: {}, general: {} };

function save(push = true) {
  if (CUR && S.tracks[CUR]) S.tracks[CUR].updatedAt = new Date().toISOString();
  Core.saveTo(localStorage, SKEY, S);
  if (push) Cloud.queuePush(S); // 云模式：防抖推送（本地模式为空操作）
}
function getT(id) { return Core.ensureTrack(S, id || CUR); }
function logActivity(type, n) { if (!ST) return; Core.logActivityOn(ST, type, n || 1, new Date()); save(); }
function daysLeft() {
  if (!ST || !ST.examDate) return null;
  return Math.ceil((new Date(ST.examDate + "T09:00:00") - Date.now()) / 86400000);
}

/* ---------------- 轨道装载 ---------------- */
function loadTrack(tid) {
  const TR = TRACKS();
  if (!TR[tid]) return false;
  if (CUR && CUR !== tid) {
    QZ = null; FC = null;
    if (EX && EX.timer) clearInterval(EX.timer);
    EX = null;
  }
  CUR = tid; T = TR[tid]; ST = getT(tid); S.current = tid; save();
  BANK = T.bank || [];
  REAL = ((window.TRACKS_REAL || {})[tid] || []).filter((q) => q && q.q && Array.isArray(q.opts) && q.opts.length >= 2 && typeof q.ans === "number");
  REAL_SETS = [];
  REAL.forEach((q) => { if (q.set && !REAL_SETS.includes(q.set)) REAL_SETS.push(q.set); });
  Object.keys(BYID).forEach((k) => delete BYID[k]);
  BANK.concat(REAL).forEach((q) => { BYID[q.id] = q; });
  Object.keys(CH).forEach((k) => delete CH[k]);
  (T.knowledge || []).forEach((k) => { CH[k.id] = k; });
  BANK_IDS_BY_CH = {};
  BANK.forEach((q) => { (BANK_IDS_BY_CH[q.ch] = BANK_IDS_BY_CH[q.ch] || []).push(q.id); });
  updateNav();
  return true;
}
function updateNav() {
  $$("#nav a").forEach((a) => {
    const v = a.dataset.view;
    if (v === "hub") { a.href = "#/hub"; return; }
    if (v === "wrongbook") { a.href = "#/wrongbook"; return; }
    if (CUR) a.href = "#/" + CUR + "/" + v;
  });
}

/* ---------------- 路由 ---------------- */
const VIEW_TITLES = LearnOS.navigation.views;
function router() {
  if (window.CDMP_VAULT && $(".gate-card")) return;
  if (S) closeModal();
  const route = LearnOS.navigation.resolve(location.hash, TRACKS(), S && S.current);
  if (route.message) toast(route.message);
  if (route.global === "hub") return renderHub();
  if (route.global === "wrongbook") return renderWrongBook();
  const { track: tid, view, arg } = route;
  if (CUR !== tid || !T) loadTrack(tid);
  ST = getT(tid);
  $("#topbarTitle").textContent = `${T.meta.name} · ${VIEW_TITLES[view]}`;
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  closeSidebar();
  const R = { home: vHome, plan: vPlan, knowledge: vKnowledge, flashcards: vFlashcards, quiz: vQuiz, exam: vExam, resources: vResources, tips: vTips };
  if (view === "knowledge" && arg) vKDetail($("#view"), arg);
  else R[view]($("#view"), arg);
  renderTopbar(); renderFoot();
  window.scrollTo(0, 0);
}

/* ---------------- 顶栏 / 侧栏 / 底部进度 ---------------- */
function renderTopbar() {
  const right = [];
  const d = daysLeft();
  if (d !== null) right.push(`<span class="chip chip-hi mono">⏱ 距考试 ${Math.max(0, d)} 天</span>`);
  if (T) right.push(`<span class="chip mono">题库 ${BANK.length + REAL.length} 题</span>`);
  if (Cloud.session) {
    const stTxt = { syncing: "⟳ 同步中", synced: "☁ 已同步", error: "⚠ 同步异常", idle: "☁ 云端" }[Cloud.status] || "☁";
    right.push(`<span class="chip" title="云端账号">👤 ${esc(Cloud.session)}</span>`);
    right.push(`<span class="chip chip-hi">${stTxt}</span>`);
  }
  if (CUR && TRACKS()[CUR]) {
    const opts = (PLAT().tracksOrder || Object.keys(TRACKS())).map((id) => {
      const tr = TRACKS()[id];
      const m = (tr && tr.meta) || (PLAT().comingSoon || {})[id] || { name: id };
      if (!tr) return `<option value="${esc(id)}" disabled>🚧 ${esc(m.icon || "")} ${esc(m.name || id)}（建设中）</option>`;
      return `<option value="${esc(id)}" ${id === CUR ? "selected" : ""}>${esc(m.icon || "")} ${esc(m.name || id)}</option>`;
    }).join("");
    right.push(`<select class="input" id="trackSel" style="padding:6px 10px;font-size:12.5px" title="切换轨道">${opts}</select>`);
  }
  right.push(`<button class="btn btn-ghost btn-sm" id="searchBtn" title="全局搜索（Ctrl+K）" aria-label="搜索"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg></button>`);
  right.push(`<button class="btn btn-ghost btn-sm" id="dataBtn" title="备份与恢复" aria-label="备份与恢复"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg></button>`);
  right.push(`<button class="btn btn-ghost btn-sm" id="logoutBtn" title="退出登录">退出</button>`);
  $("#topbarRight").innerHTML = right.join(" ");
  const sel = $("#trackSel");
  if (sel) sel.addEventListener("change", () => { location.hash = "#/" + sel.value + "/home"; });
  const sb = $("#searchBtn");
  if (sb) sb.addEventListener("click", () => openSearch());
  const db = $("#dataBtn");
  if (db) db.addEventListener("click", () => openSettings());
  const lo = $("#logoutBtn");
  if (lo) lo.addEventListener("click", () => { localStorage.removeItem(GATE_KEY); location.reload(); });
}
function renderFoot() {
  if (!T || !ST) {
    $("#foot-progress").innerHTML = `<div class="fc-row"><span>LearnOS</span><b>v2.2 · ${Object.keys(TRACKS()).length} 轨道</b></div>`;
    return;
  }
  const total = (T.plan && T.plan.totalDays) || 0;
  const days = Object.keys(ST.checks).length;
  const doneQ = Object.values(ST.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(ST.chStats).reduce((s, c) => s + c.right, 0);
  $("#foot-progress").innerHTML = `
    <div class="fc-row"><span>${esc(T.meta.name)} 计划</span><b>${days}/${total} 天</b></div>
    <div class="bar"><i style="width:${Core.planProgress(ST.checks, total)}%"></i></div>
    <div class="fc-row" style="margin-top:8px"><span>刷题正确率</span><b>${doneQ ? pct(rightQ, doneQ) + "%" : "—"}</b></div>
    <div class="bar"><i style="width:${doneQ ? pct(rightQ, doneQ) : 0}%"></i></div>`;
}
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarMask").classList.remove("show"); }
$("#menuBtn").addEventListener("click", () => { $("#sidebar").classList.toggle("open"); $("#sidebarMask").classList.toggle("show"); });
$("#sidebarMask").addEventListener("click", closeSidebar);
$$("#nav a").forEach((a) => a.addEventListener("click", closeSidebar));

/* ============================================================
   视图：轨道中心（Hub）
   ============================================================ */
function trackStats(tid) {
  const st = S.tracks[tid] || Core.defaultTrackState();
  const pack = TRACKS()[tid];
  const doneQ = Object.values(st.chStats).reduce((s, c) => s + c.done, 0);
  const best = st.exams.length ? Math.max(...st.exams.map((e) => e.score)) : null;
  const totalDays = (pack && pack.plan && pack.plan.totalDays) || 0;
  const bankN = ((pack && pack.bank) || []).length + (((window.TRACKS_REAL || {})[tid]) || []).length;
  return { st, doneQ, best, planPct: Core.planProgress(st.checks, totalDays), bankN, days: Object.keys(st.checks).length };
}
function renderHub() {
  const preferred = S.current && TRACKS()[S.current] ? S.current : Object.keys(TRACKS())[0];
  if (preferred && (!T || CUR !== preferred)) loadTrack(preferred);
  updateNav();
  const TR = TRACKS();
  const order = (PLAT().tracksOrder || Object.keys(TR)).filter((id) => TR[id] || (PLAT().comingSoon || {})[id]);
  const active = order.filter((id) => TR[id]);
  const soon = order.filter((id) => !TR[id] && (PLAT().comingSoon || {})[id]);
  const allDone = active.reduce((s, id) => s + trackStats(id).doneQ, 0);
  const allWrong = active.reduce((s, id) => s + trackStats(id).st.wrong.length, 0);
  const allExams = active.reduce((s, id) => s + trackStats(id).st.exams.length, 0);
  $("#topbarTitle").textContent = "轨道中心";
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === "hub"));
  closeSidebar();
  $("#view").innerHTML = `
  <div class="hero card">
    <span class="hero-kicker">YOUR PERSONAL LEARNING SPACE</span>
    <h1 class="hero-title">专注学习。<em>不断进阶。</em></h1>
    <p class="hero-sub">从计划到掌握，一切井然有序。将知识、练习与进度汇聚一处，专注每一次进步。</p>
    <div class="chip-row">
      <span class="chip">${active.length} 条轨道进行中</span>
      <span class="chip">累计刷题 ${allDone}</span>
      <span class="chip">待回顾错题 ${allWrong}</span>
      <span class="chip">模考 ${allExams} 次</span>
      <a class="chip chip-hi" href="#/wrongbook">错题中心 ${allWrong}</a>
    </div>
  </div>
  <div class="grid-2" style="margin-top:18px">
    ${active.map((id) => {
      const m = TR[id].meta; const s = trackStats(id);
      return `
      <a class="card k-card" style="--kc:${m.color || "#0071e3"}" href="#/${id}/home">
        <span class="k-ico">${m.icon || "🎓"}</span>
        <h3>${esc(m.name)} <span style="font-size:12px;color:var(--dim);font-weight:400">${esc(m.full || "")}</span></h3>
        <p>${esc(m.tagline || "")}</p>
        <div class="bar" style="margin:8px 0 4px"><i style="width:${s.planPct}%"></i></div>
        <div class="k-foot"><span class="badge">计划 ${s.planPct}%</span><span>刷题 ${s.doneQ}/${s.bankN} · 模考 ${s.best === null ? "—" : s.best}</span></div>
        <div style="margin-top:12px"><span class="btn btn-primary btn-sm">继续学习 →</span></div>
      </a>`;
    }).join("")}
    ${soon.map((id) => {
      const m = (PLAT().comingSoon || {})[id];
      return `
      <div class="card k-card" style="--kc:${m.color || "#6e6e73"};cursor:default">
        <span class="k-ico">${m.icon}</span>
        <h3>${esc(m.name)} <span class="badge">建设中</span></h3>
        <p>${esc(m.tagline || "")}</p>
        <div class="k-foot"><span>即将推出 · 敬请期待</span></div>
      </div>`;
    }).join("")}
  </div>`;
  renderTopbar(); renderFoot();
  window.scrollTo(0, 0);
}

/* ============================================================
   视图：轨道学习首页
   ============================================================ */
function vHome(view) {
  const days = Object.keys(ST.checks).length;
  const doneQ = Object.values(ST.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(ST.chStats).reduce((s, c) => s + c.right, 0);
  const best = ST.exams.length ? Math.max(...ST.exams.map((e) => e.score)) : null;
  const resItems = [];
  (T.resources.cats || []).forEach((c) => c.items.forEach((it) => resItems.push(it)));
  const resDone = resItems.filter((it) => (ST.resStatus[it.id] || 0) === 2).length;
  const d = daysLeft();
  const planTotal = (T.plan && T.plan.totalDays) || 30;
  const EXM = T.meta.exam;
  const streakN = Core.computeStreak((ST && ST.activity) || {}, new Date());
  const todayCnt = Core.todayCount((ST && ST.activity) || {}, new Date());
  const goal = (S.settings && S.settings.dailyGoal) || 20;
  const achvAll = Core.achievementsFor(T, ST, new Date());
  const achvEarned = achvAll.filter((a) => a.done);
  const freshAchv = achvEarned.filter((a) => !(ST.achievementsSeen || []).includes(a.id));
  if (freshAchv.length) {
    const last = freshAchv[freshAchv.length - 1];
    toast(`${last.icon} 成就解锁：${last.name}`);
    ST.achievementsSeen = achvEarned.map((a) => a.id);
    save();
  }

  view.innerHTML = `
  <div class="hero card">
    <span class="hero-kicker">${esc((T.meta.full || T.meta.name).toUpperCase())}</span>
    <h1 class="hero-title">${T.meta.heroTitle || `拿下 <em>${esc(T.meta.name)}</em>`}</h1>
    <p class="hero-sub">${esc(T.meta.heroSub || T.meta.tagline || "")}</p>
    <div class="chip-row">
      ${(EXM.chips || []).map((c) => `<span class="chip">${esc(c)}</span>`).join("")}
      ${d !== null ? `<span class="chip chip-hi">🎯 考试日：${esc(ST.examDate)}</span>` : ""}
      ${streakN > 0 ? `<span class="chip">🔥 连续学习 ${streakN} 天</span>` : ""}
    </div>
    <div class="cta-row">
      <a class="btn btn-primary" href="#/${CUR}/plan">⟠ 开始 ${planTotal} 天计划</a>
      <a class="btn btn-ghost" href="#/${CUR}/exam">◎ 进入模拟考</a>
      <a class="btn btn-ghost" href="#/${CUR}/resources">▤ 资料纳管中心</a>
    </div>
  </div>

  <div class="grid-4 stat-grid">
    <div class="card stat-card">
      <div class="stat-head"><div class="stat-ico">⟠</div><span class="stat-sub">计划</span></div>
      <div class="stat-num">${pct(days, planTotal)}%</div>
      <div class="stat-label">${planTotal} 天计划完成度</div>
      <div class="bar"><i style="width:${pct(days, planTotal)}%"></i></div>
    </div>
    <div class="card stat-card">
      <div class="stat-head"><div class="stat-ico">✎</div><span class="stat-sub">刷题</span></div>
      <div class="stat-num">${doneQ}</div>
      <div class="stat-label">已刷题数 · 正确率 ${doneQ ? pct(rightQ, doneQ) + "%" : "—"}</div>
      <div class="bar"><i style="width:${doneQ ? pct(rightQ, doneQ) : 0}%"></i></div>
    </div>
    <div class="card stat-card">
      <div class="stat-head"><div class="stat-ico">◎</div><span class="stat-sub">模考</span></div>
      <div class="stat-num">${best === null ? "—" : best}</div>
      <div class="stat-label">模考最高分（目标 ${EXM.target}+）</div>
      <div class="bar"><i style="width:${best || 0}%"></i></div>
    </div>
    <div class="card stat-card">
      <div class="stat-head"><div class="stat-ico">▤</div><span class="stat-sub">资料</span></div>
      <div class="stat-num">${resDone}<span style="font-size:15px;color:var(--dim)">/${resItems.length}</span></div>
      <div class="stat-label">资料学习进度</div>
      <div class="bar"><i style="width:${pct(resDone, resItems.length)}%"></i></div>
    </div>
  </div>

  <div class="grid-2" style="margin-top:18px">
    <div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div style="text-align:center;flex-shrink:0">
        ${goalRingSVG(todayCnt, goal)}
        <div class="stat-label" style="margin-top:6px">今日 ${todayCnt} / ${goal} 题</div>
      </div>
      <div style="flex:1;min-width:180px">
        <h3 class="card-title" style="margin-bottom:10px">今日目标</h3>
        <p class="summary-text" style="margin-bottom:12px">🔥 连续学习 ${streakN} 天 · ${todayCnt >= goal ? "今日目标已达成，保持节奏！" : `还差 ${goal - todayCnt} 题`}</p>
        <a class="btn btn-primary btn-sm" href="#/${CUR}/flashcards">🃏 闪卡复习</a>
        <a class="btn btn-ghost btn-sm" href="#/${CUR}/quiz">✎ 继续刷题</a>
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">成就 <span class="badge" style="margin-left:6px">${achvEarned.length}/${achvAll.length}</span></h3>
      <div class="achv-strip">${achvEarned.slice(-8).map((a) => `<span class="achv-ico" title="${esc(a.name)}：${esc(a.desc)}">${a.icon}</span>`).join("") || '<span class="summary-text">完成刷题 / 模考 / 打卡 / 闪卡即可解锁成就</span>'}</div>
      <button class="btn btn-ghost btn-sm" id="achvBtn" style="margin-top:12px">查看全部成就 →</button>
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <h3 class="card-title">学习热力图 · 近 16 周</h3>
    ${heatmapHTML()}
    <div class="hm-legend"><span>少</span><i class="hm-cell"></i><i class="hm-cell l1"></i><i class="hm-cell l2"></i><i class="hm-cell l3"></i><i class="hm-cell l4"></i><span>多</span></div>
  </div>
  <div class="grid-2" style="margin-top:18px">
    <div class="card">
      <h3 class="card-title">考试权重分布（参考）</h3>
      <div class="wchart">
        ${(T.knowledge || []).slice(0, 11).map((k) => `
          <div class="wrow"><span class="wname">${esc(k.name)}</span>
          <div class="bar grow"><i style="width:${parseInt(k.weight) || 4}%"></i></div>
          <span class="wval">${esc(k.weight)}</span></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">下一步行动</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${nextActions(doneQ, planTotal)}
      </div>
    </div>
  </div>`;
  const ab = $("#achvBtn");
  if (ab) ab.addEventListener("click", () => openAchievements(achvAll));
}
function goalRingSVG(cnt, goal) {
  const ratio = Math.min(1, goal ? cnt / goal : 0);
  const dash = (ratio * 264).toFixed(1);
  return `<svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label="今日目标 ${cnt}/${goal}">
    <circle cx="55" cy="55" r="42" fill="none" stroke="rgba(120,120,128,.16)" stroke-width="9"/>
    <circle cx="55" cy="55" r="42" fill="none" stroke="#0071e3" stroke-width="9" stroke-linecap="round" stroke-dasharray="${dash} 264" transform="rotate(-90 55 55)"/>

    <text x="55" y="52" text-anchor="middle" fill="#1d1d1f" font-size="20" font-weight="800" font-family="ui-monospace,monospace">${cnt}</text>
    <text x="55" y="72" text-anchor="middle" fill="#6e6e73" font-size="11">/ ${goal} 题</text>
  </svg>`;
}
function heatmapHTML() {
  const cells = Core.heatmapCells((ST && ST.activity) || {}, new Date(), 16);
  const act = (ST && ST.activity) || {};
  return `<div class="heatmap">${cells.map((c) => `<i class="hm-cell l${c.level}" title="${c.key} · 刷题 ${c.q} · 模考 ${c.e}"></i>`).join("")}</div>`;
}
function nextActions(doneQ, planTotal) {
  const acts = [];
  const days = Object.keys(ST.checks).length;
  if (!days) acts.push(["⟠", `从 Day 1 开始 ${planTotal} 天计划`, "#/" + CUR + "/plan"]);
  if (ST.wrong.length) acts.push(["⚡", `错题重练：还有 ${ST.wrong.length} 道错题等你消灭`, "#/" + CUR + "/quiz"]);
  if (doneQ < 60) acts.push(["✎", "完成各章节刷题，目标累计 60 题", "#/" + CUR + "/quiz"]);
  if (ST.exams.length < 1) acts.push(["◎", "安排第一次全真模拟考试", "#/" + CUR + "/exam"]);
  if (!ST.examDate) acts.push(["📅", "设置你的考试日期", "#/" + CUR + "/plan"]);
  if (acts.length === 0) acts.push(["🏆", "保持模考高分手感，稳住！你可以直接去考试了", "#/" + CUR + "/exam"]);
  return acts.slice(0, 4).map(([ico, txt, href]) =>
    `<a class="btn btn-ghost" style="justify-content:flex-start" href="${href}"><span style="color:var(--cyan)">${ico}</span> ${esc(txt)}</a>`).join("");
}

/* ============================================================
   视图：学习计划
   ============================================================ */
function vPlan(view) {
  const P = T.plan || { totalDays: 0, weeks: [] };
  view.innerHTML = `
    <div class="plan-head">
      <div class="card" style="flex:1;min-width:260px;padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:14px;color:var(--muted)">📅 我的考试日期</span>
        <input type="date" class="input" id="examDate" value="${esc(ST.examDate)}">
        <button class="btn btn-primary btn-sm" id="saveDate">保存</button>
        <span class="chip mono" style="margin-left:auto">总进度 ${Object.keys(ST.checks).length}/${P.totalDays} 天</span>
      </div>
    </div>
    <div class="plan-weeks">
      ${P.weeks.map((w) => {
        const checked = w.days.filter((d) => ST.checks[d.day]).length;
        return `
        <div class="card week-card">
          <div class="week-head">
            <span class="week-tag">WEEK ${w.week}</span>
            <h3>${esc(w.theme)}</h3>
            <span class="week-pct">${checked}/${w.days.length} ✓</span>
          </div>
          <div class="day-list">
            ${w.days.map((d) => `
              <label class="day-row">
                <input type="checkbox" data-day="${d.day}" ${ST.checks[d.day] ? "checked" : ""}>
                <span class="day-bubble">D${d.day}</span>
                <div class="day-body">
                  <div class="day-title">${esc(d.title)}${d.ch ? `<span class="day-chip">${esc(d.ch)}</span>` : ""}</div>
                  <div class="day-tasks">${esc(d.tasks)}</div>
                </div>
              </label>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  $("#saveDate").addEventListener("click", () => {
    ST.examDate = $("#examDate").value; save(); renderTopbar(); toast(ST.examDate ? "考试日期已保存" : "已清除考试日期");
  });
  $$(".day-row input").forEach((cb) => cb.addEventListener("change", () => {
    const day = cb.dataset.day;
    if (cb.checked) { ST.checks[day] = true; logActivity("p"); } else { delete ST.checks[day]; save(); }
    renderFoot();
    const card = cb.closest(".week-card");
    const all = $$(".day-row input", card), ok = all.filter((x) => x.checked).length;
    $(".week-pct", card).textContent = `${ok}/${all.length} ✓`;
  }));
}

/* ============================================================
   视图：知识体系
   ============================================================ */
function vKnowledge(view) {
  view.innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <h3 class="card-title">如何使用知识体系</h3>
      <p class="summary-text">${esc(T.meta.name)} 的知识域卡片包含：<b style="color:var(--txt)">核心摘要 · 高频考点 · 必背术语</b>。
      建议顺序：先读卡片 → 对照课程视频 → 立即刷对应章节题。⭐ 为考试权重最高的知识域。</p>
    </div>
    <div class="k-grid">
      ${(T.knowledge || []).map((k) => `
        <a class="card k-card" style="--kc:${k.color}" href="#/${CUR}/knowledge/${k.id}">
          <span class="k-ico">${k.icon}</span>
          <h3>${esc(k.name)} ${k.star ? "⭐" : ""}</h3>
          <p>${esc(k.brief)}</p>
          <div class="k-foot"><span class="badge">权重 ~${esc(k.weight)}</span><span>${k.terms.length} 个术语</span></div>
        </a>`).join("")}
    </div>`;
}
function vKDetail(view, id) {
  const k = CH[id];
  if (!k) { location.hash = "#/" + CUR + "/knowledge"; return; }
  const qn = (BANK_IDS_BY_CH[id] || []).length;
  view.innerHTML = `
    <div class="k-head">
      <a class="btn btn-ghost btn-sm" href="#/${CUR}/knowledge">← 返回</a>
      <span class="k-big">${k.icon}</span>
      <h2>${esc(k.name)}</h2>
      <span class="badge">权重 ~${esc(k.weight)}</span>
      ${qn ? `<a class="btn btn-primary btn-sm" style="margin-left:auto" href="#/${CUR}/quiz">✎ 刷本章 ${qn} 题</a>` : ""}
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3 class="card-title">核心摘要</h3>
      <p class="summary-text">${esc(k.summary)}</p>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">高频考点</h3>
        <ul class="point-list">${k.points.map((p) => `<li>${p}</li>`).join("")}</ul>
      </div>
      <div class="card">
        <h3 class="card-title">必背术语</h3>
        <div class="term-grid">
          ${k.terms.map((t) => `<div class="term-card"><div class="term-name">${esc(t.term)}</div><div class="term-def">${esc(t.def)}</div></div>`).join("")}
        </div>
      </div>
    </div>
    <div class="must-know"><b>★ 一句话必背：</b>${esc(k.mustKnow)}</div>
    <div class="card" style="margin-top:16px">
      <h3 class="card-title">我的笔记</h3>
      <textarea class="input" id="noteArea" style="width:100%;min-height:110px;resize:vertical;line-height:1.8" placeholder="在这里记录本知识域的学习笔记…（自动保存）">${esc((ST.notes || {})[k.id] || "")}</textarea>
      <div class="q-prog" id="noteStat" style="margin-top:8px">·</div>
    </div>`;
  const noteArea = $("#noteArea"), noteStat = $("#noteStat");
  let noteDeb = null;
  noteArea.addEventListener("input", () => {
    clearTimeout(noteDeb);
    noteStat.textContent = "✍ 输入中…";
    noteDeb = setTimeout(() => {
      ST.notes = ST.notes || {};
      ST.notes[k.id] = noteArea.value;
      save();
      noteStat.textContent = "✓ 已自动保存（仅本机" + (Cloud.session ? "，并将同步到云端" : "") + "）";
    }, 700);
  });
}

/* ============================================================
   视图：章节刷题（含真题专区）
   ============================================================ */
let QZ = null;
function vQuiz(view) {
  if (QZ && QZ.running) return renderQuizQ(view);
  if (QZ && QZ.done) return renderQuizEnd(view);
  const doneQ = Object.values(ST.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(ST.chStats).reduce((s, c) => s + c.right, 0);
  view.innerHTML = `
    <div class="grid-3" style="margin-bottom:18px">
      <div class="card stat-card"><div class="stat-num">${doneQ}</div><div class="stat-label">累计刷题</div></div>
      <div class="card stat-card"><div class="stat-num">${doneQ ? pct(rightQ, doneQ) + "%" : "—"}</div><div class="stat-label">总正确率</div></div>
      <div class="card stat-card"><div class="stat-num">${ST.wrong.length}</div><div class="stat-label">错题待消灭</div></div>
    </div>
    <div class="card" style="max-width:640px">
      <h3 class="card-title">开始刷题</h3>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:6px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <select class="input" id="qzCh" style="flex:1;min-width:220px">
            <option value="all">📚 全部知识域混合</option>
            ${(T.knowledge || []).map((k) => {
              const n = (BANK_IDS_BY_CH[k.id] || []).length;
              return `<option value="${k.id}">${k.icon} ${esc(k.name)}（${n} 题）</option>`;
            }).join("")}
          </select>
          <select class="input" id="qzN">
            <option value="10">10 题</option><option value="20" selected>20 题</option>
            <option value="30">30 题</option><option value="0">全部</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="qzStart">▶ 开始练习</button>
          <button class="btn btn-ghost" id="qzRandom">🎲 随机 20 题</button>
          <button class="btn btn-ghost" id="qzWrong" ${ST.wrong.length ? "" : "disabled"}>⚡ 错题重练（${ST.wrong.length}）</button>
          <button class="btn btn-ghost" id="qzFav" ${ST.favorites.length ? "" : "disabled"}>⭐ 收藏重练（${ST.favorites.length}）</button>
        </div>
        <p class="summary-text" style="margin:2px 0 0">⌨ 键盘流：A-D 或 1-4 作答 · Enter 下一题</p>
      </div>
    </div>
    ${REAL.length ? `
    <div class="card" style="max-width:640px;margin-top:16px">
      <h3 class="card-title">🏆 真题实战（${REAL.length} 题 · ${REAL_SETS.length} 套）</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="qzRealAll">▶ 真题混合练习</button>
        ${REAL_SETS.map((s) => `<button class="btn btn-ghost" data-realset="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>
      <p class="summary-text" style="margin-top:10px">真题来自本地私有题库，建议限时 ${Math.ceil((T.meta.exam.questions || 100) * (T.meta.exam.pace || 0.9))} 分钟/套；真题不计入章节统计，错题同样进入错题本。</p>
    </div>` : ""}
    <div class="card" style="max-width:640px;margin-top:16px">
      <h3 class="card-title">章节进度</h3>
      <div class="wchart">
        ${(T.knowledge || []).map((k) => {
          const st = ST.chStats[k.id] || { done: 0, right: 0 };
          const n = (BANK_IDS_BY_CH[k.id] || []).length;
          return `<div class="wrow"><span class="wname" style="width:150px">${esc(k.name)}</span>
            <div class="bar grow"><i style="width:${n ? pct(st.done, n) : 0}%"></i></div>
            <span class="wval">${st.done}/${n}</span></div>`;
        }).join("")}
      </div>
    </div>`;
  $("#qzStart").addEventListener("click", () => startQuiz($("#qzCh").value, parseInt($("#qzN").value)));
  $("#qzRandom").addEventListener("click", () => startQuiz("random", 20));
  $("#qzWrong").addEventListener("click", () => startQuiz("wrong", 0));
  $("#qzFav").addEventListener("click", () => startQuiz("fav", 0));
  const realAllBtn = $("#qzRealAll");
  if (realAllBtn) realAllBtn.addEventListener("click", () => startQuiz("real-all", 0));
  $$("[data-realset]", view).forEach((b) => b.addEventListener("click", () => startQuiz("real:" + b.dataset.realset, 0)));
}
function startQuiz(mode, n) {
  if (EX && EX.timer) clearInterval(EX.timer); // 刷题与模考会话互斥
  EX = null;
  let ids = [];
  if (mode === "all") ids = BANK.map((q) => q.id);
  else if (mode === "random") ids = shuffle(BANK.map((q) => q.id)).slice(0, n);
  else if (mode === "wrong") ids = ST.wrong.filter((id) => BYID[id]);
  else if (mode === "fav") ids = ST.favorites.filter((id) => BYID[id]);
  else if (mode === "real-all") ids = REAL.map((q) => q.id);
  else if (mode.startsWith("real:")) ids = REAL.filter((q) => q.set === mode.slice(5)).map((q) => q.id);
  else ids = (BANK_IDS_BY_CH[mode] || []).slice();
  if (!mode.startsWith("real")) ids = shuffle(ids);
  if (n > 0) ids = ids.slice(0, n);
  if (!ids.length) { toast("没有可用题目"); return; }
  QZ = { running: true, done: false, qs: ids, i: 0, right: 0, results: [] };
  location.hash = "#/" + CUR + "/quiz";
  router();
}
function renderQuizQ(view) {
  const q = BYID[QZ.qs[QZ.i]];
  view.innerHTML = `
    <div class="card" style="max-width:760px;margin:0 auto">
      <div class="q-meta">
        ${q.ch ? `<span class="chip chip-hi">${esc(chName(q.ch))}</span>` : `<span class="chip chip-hi">🏆 ${esc(q.set || "真题")}</span>`}
        <span class="q-prog">第 ${QZ.i + 1} / ${QZ.qs.length} 题</span>
        <span class="q-prog" style="margin-left:auto;color:var(--green)">✓ ${QZ.right}</span>
        <button class="btn btn-ghost btn-sm" id="favBtn" title="收藏本题">${ST.favorites.includes(q.id) ? "⭐" : "☆"}</button>
      </div>
      <div class="q-text">${esc(q.q)}</div>
      <div class="opts">
        ${q.opts.map((o, i) => `
          <button class="opt" data-i="${i}">
            <span class="opt-letter">${LET[i]}</span><span>${esc(o)}</span>
          </button>`).join("")}
      </div>
      <div id="qzExplain"></div>
      <div class="q-foot">
        <button class="btn btn-ghost btn-sm" id="qzQuit">退出练习</button>
        <button class="btn btn-primary" id="qzNext" disabled>下一题 →</button>
      </div>
      <div class="dots">${QZ.qs.map((id, idx) => `<i class="${idx < QZ.i ? (QZ.results[idx] ? "ok" : "bad") : (idx === QZ.i ? "cur" : "")}" style="${idx === QZ.i ? "outline:2px solid var(--cyan);outline-offset:1px" : ""}"></i>`).join("")}</div>
    </div>`;
  $$(".opt", view).forEach((btn) => btn.addEventListener("click", () => answerQuiz(btn, q)));
  const favBtn = $("#favBtn");
  if (favBtn) favBtn.addEventListener("click", () => {
    const w = ST.favorites.indexOf(q.id);
    if (w === -1) { ST.favorites.push(q.id); toast("⭐ 已收藏本题"); } else { ST.favorites.splice(w, 1); toast("已取消收藏"); }
    save();
    favBtn.textContent = ST.favorites.includes(q.id) ? "⭐" : "☆";
  });
  $("#qzQuit").addEventListener("click", () => { QZ = null; router(); });
  $("#qzNext").addEventListener("click", () => {
    QZ.i++;
    if (QZ.i >= QZ.qs.length) { QZ.running = false; QZ.done = true; }
    router();
  });
}
function answerQuiz(btn, q) {
  const pick = parseInt(btn.dataset.i);
  const ok = Core.gradeOk(q, pick);
  $$(".opt", $("#view")).forEach((o) => {
    o.disabled = true;
    if (parseInt(o.dataset.i) === q.ans) o.classList.add("correct");
  });
  if (!ok) btn.classList.add("wrong");
  if (ok) QZ.right++;
  QZ.results[QZ.i] = ok;
  Core.applyAnswer(ST, q, ok, new Date());
  save();
  $("#qzExplain").innerHTML = `<div class="explain"><b>正确答案：${LET[q.ans]} ${esc(q.opts[q.ans])}</b><br>${q.exp ? esc(q.exp) : "本题为真题原卷题目，未附解析。建议回到知识体系，回顾对应知识域的核心考点。"}</div>`;
  $("#qzNext").disabled = false;
  $("#qzNext").textContent = QZ.i + 1 >= QZ.qs.length ? "查看结果 →" : "下一题 →";
  $("#qzNext").focus();
}
function renderQuizEnd(view) {
  const score = pct(QZ.right, QZ.qs.length);
  view.innerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto;text-align:center">
      <h3 class="card-title" style="justify-content:center">练习完成</h3>
      <div class="score-wrap">
        <div class="score-num">${score}%</div>
        <span class="score-tag ${score >= (T.meta.exam.pass || 60) ? "pass" : "fail"}">${score >= (T.meta.exam.pass || 60) ? "达到及格水平" : "低于及格线，继续加油"}</span>
      </div>
      <p style="color:var(--muted);margin:14px 0 22px">共 ${QZ.qs.length} 题 · 答对 ${QZ.right} 题 · 错题已自动加入错题本</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="qzAgain">再来一组</button>
        <button class="btn btn-ghost" id="qzHome">返回刷题中心</button>
      </div>
    </div>`;
  $("#qzAgain").addEventListener("click", () => { QZ = null; router(); });
  $("#qzHome").addEventListener("click", () => { QZ = null; location.hash = "#/" + CUR + "/quiz"; router(); });
}

/* ============================================================
   视图：模拟考试
   ============================================================ */
let EX = null;
function vExam(view) {
  if (EX && EX.running) return renderExamQ(view);
  if (EX && EX.done) return renderExamResult(view);
  const EXM = T.meta.exam;
  const hist = ST.exams.slice(-5).reverse();
  const maxN = Math.min(EXM.questions || 100, BANK.length + REAL.length);
  view.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">开始模拟考试</h3>
        <p class="summary-text" style="margin-bottom:16px">全真模拟：从题库随机抽题，闭卷计时作答，<b style="color:var(--txt)">答完才显示对错</b>。及格线 ${EXM.pass}，目标 ${EXM.target}+，冲刺 ${EXM.stretch}。⌨ 键盘：A-D 作答 · F 标记 · ←/→ 翻题。</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          ${REAL.length ? `<select class="input" id="exSrc">
            <option value="bank">📚 知识域题库（${BANK.length} 题）</option>
            <option value="real">🏆 真题卷（${REAL.length} 题）</option>
          </select>` : ""}
          <select class="input" id="exN">
            <option value="30">30 题 · 约 ${Math.ceil(30 * (EXM.pace || 0.9))} 分钟</option>
            <option value="50">50 题 · 约 ${Math.ceil(50 * (EXM.pace || 0.9))} 分钟</option>
            <option value="${maxN}" selected>${maxN} 题 · ${Math.ceil(maxN * (EXM.pace || 0.9))} 分钟（全真）</option>
          </select>
          <button class="btn btn-primary" id="exStart">▶ 开始考试</button>
        </div>
        <div class="chip-row">
          <span class="chip">计时自动交卷</span><span class="chip">支持标记回顾</span><span class="chip">章节诊断报告</span>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">模考历史</h3>
        ${hist.length ? `<table class="table"><tr><th>日期</th><th>题数</th><th>答对</th><th>得分</th></tr>
          ${hist.map((e) => `<tr><td class="mono">${esc(e.date)}</td><td class="mono">${e.count}</td><td class="mono">${e.right}</td>
          <td class="mono" style="color:${e.score >= (T.meta.exam.pass || 60) ? "var(--green)" : "var(--red)"};font-weight:700">${e.score}</td></tr>`).join("")}</table>`
        : `<p class="summary-text">还没有模考记录。建议进度：前几周刷题打基础，冲刺期每周至少 2 次全真模考。</p>`}
      </div>
    </div>`;
  $("#exStart").addEventListener("click", () => {
    QZ = null; // 刷题与模考会话互斥
    const n = parseInt($("#exN").value);
    const src = $("#exSrc") ? $("#exSrc").value : "bank";
    const pool = (src === "real" && REAL.length) ? REAL : BANK;
    const qs = shuffle(pool.map((q) => q.id)).slice(0, Math.min(n, pool.length));
    const dur = Math.ceil(qs.length * (T.meta.exam.pace || 0.9) * 60);
    EX = { running: true, done: false, qs, i: 0, answers: {}, flags: {}, dur, left: dur, timer: null };
    location.hash = "#/" + CUR + "/exam";
    router();
  });
}
function renderExamQ(view) {
  if (!EX.timer) EX.timer = setInterval(() => {
    EX.left--;
    const t = $("#exTime");
    if (t) {
      t.textContent = fmtMMSS(EX.left);
      if (EX.left <= 300) t.classList.add("danger");
    }
    if (EX.left <= 0) { clearInterval(EX.timer); toast("时间到，自动交卷"); submitExam(); }
  }, 1000);
  const q = BYID[EX.qs[EX.i]];
  const picked = EX.answers[EX.i];
  view.innerHTML = `
    <div class="card" style="max-width:760px;margin:0 auto">
      <div class="q-meta">
        <span class="exam-timer mono" id="exTime">${fmtMMSS(EX.left)}</span>
        <span class="q-prog">第 ${EX.i + 1} / ${EX.qs.length} 题</span>
        <span class="q-prog">已答 ${Object.keys(EX.answers).length}</span>
        <button class="btn btn-ghost btn-sm" id="exFlag" style="margin-left:auto">${EX.flags[EX.i] ? "🚩 已标记" : "🏳 标记回顾"}</button>
      </div>
      <div class="q-text">${esc(q.q)}</div>
      <div class="opts">
        ${q.opts.map((o, i) => `
          <button class="opt ${picked === i ? "correct" : ""}" data-i="${i}" ${picked !== undefined ? "disabled" : ""}>
            <span class="opt-letter">${LET[i]}</span><span>${esc(o)}</span>
          </button>`).join("")}
      </div>
      <div class="q-foot">
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="exPrev" ${EX.i === 0 ? "disabled" : ""}>← 上一题</button>
          <button class="btn btn-ghost btn-sm" id="exNext" ${EX.i === EX.qs.length - 1 ? "disabled" : ""}>下一题 →</button>
        </div>
        <button class="btn btn-primary" id="exSubmit">交卷</button>
      </div>
      <div class="palette">
        ${EX.qs.map((_, n) => `<button class="pal ${n === EX.i ? "cur" : ""} ${EX.answers[n] !== undefined ? "done" : ""} ${EX.flags[n] ? "pal-flag" : ""}" data-n="${n}">${n + 1}</button>`).join("")}
      </div>
    </div>`;
  $$(".opt", view).forEach((btn) => btn.addEventListener("click", () => {
    EX.answers[EX.i] = parseInt(btn.dataset.i); renderExamQ(view);
  }));
  $("#exPrev").addEventListener("click", () => { EX.i--; renderExamQ(view); });
  $("#exNext").addEventListener("click", () => { EX.i++; renderExamQ(view); });
  $("#exFlag").addEventListener("click", () => { EX.flags[EX.i] = !EX.flags[EX.i]; renderExamQ(view); });
  $("#exSubmit").addEventListener("click", () => {
    const un = EX.qs.length - Object.keys(EX.answers).length;
    if (un > 0 && !confirm(`还有 ${un} 题未作答，确定交卷吗？`)) return;
    submitExam();
  });
  $$(".pal", view).forEach((p) => p.addEventListener("click", () => { EX.i = parseInt(p.dataset.n); renderExamQ(view); }));
}
function submitExam() {
  clearInterval(EX.timer);
  const right = EX.qs.reduce((n, id, i) => n + (EX.answers[i] === BYID[id].ans ? 1 : 0), 0);
  EX.score = Core.computeScore(right, EX.qs.length); EX.right = right; EX.running = false; EX.done = true;
  ST.exams.push({ date: fmtDate(Date.now()), count: EX.qs.length, right, score: EX.score });
  Core.applyExamAnswers(ST, EX.qs, EX.answers, BYID, new Date());
  save(); router();
}
function renderExamResult(view) {
  const EXM = T.meta.exam;
  const byCh = {};
  EX.qs.forEach((id, i) => {
    const q = BYID[id];
    const c = (byCh[q.ch || "real"] = byCh[q.ch || "real"] || { t: 0, r: 0 });
    c.t++; if (EX.answers[i] === q.ans) c.r++;
  });
  const s = EX.score;
  const msg = s >= EXM.stretch ? `🎉 ${EXM.stretch}+ 达成！你已经具备冲击高分的实力，保持手感准备赴考。` :
    s >= EXM.target ? `💪 ${EXM.target}+ 目标达成！查漏补缺后可以稳定在这个水平以上。` :
    s >= EXM.pass ? `⚠️ 过及格线但不稳，按章节诊断补弱项，目标 ${EXM.target}+。` :
    "📚 尚未及格，回到知识体系逐章攻克，再战！";
  view.innerHTML = `
    <div class="card" style="max-width:820px;margin:0 auto 18px;text-align:center">
      <h3 class="card-title" style="justify-content:center">模考成绩单</h3>
      <div class="score-wrap">
        <svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="得分 ${s} 分">
          <circle cx="85" cy="85" r="72" fill="none" stroke="rgba(120,120,128,.16)" stroke-width="12"/>
          <circle cx="85" cy="85" r="72" fill="none" stroke="#0071e3" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${(s / 100 * 452.4).toFixed(1)} 452.4" transform="rotate(-90 85 85)"/>

          <text x="85" y="95" text-anchor="middle" fill="#1d1d1f" font-size="40" font-weight="800" font-family="ui-monospace,monospace">${s}</text>
        </svg>
        <span class="score-tag ${s >= EXM.pass ? "pass" : "fail"}">${s >= EXM.pass ? "✓" : "✗"} 及格（${EXM.pass}） · 目标 ${EXM.target} · 冲刺 ${EXM.stretch}</span>
      </div>
      <p style="color:var(--muted);margin:12px 0 4px">${msg}</p>
      <p class="q-prog">${EX.right} / ${EX.qs.length} 正确 · ${fmtDate(Date.now())}</p>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">章节诊断</h3>
        <div class="wchart">
          ${Object.keys(byCh).map((c) => `
            <div class="wrow"><span class="wname" style="width:150px">${esc(c === "real" ? "🏆 真题" : chName(c))}</span>
            <div class="bar grow"><i style="width:${pct(byCh[c].r, byCh[c].t)}%"></i></div>
            <span class="wval">${byCh[c].r}/${byCh[c].t}</span></div>`).join("")}
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">错题回顾（已加入错题本）</h3>
        <div style="display:flex;flex-direction:column;gap:10px;max-height:340px;overflow:auto">
          ${EX.qs.map((id, i) => EX.answers[i] !== BYID[id].ans ? `
            <details style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">
              <summary style="cursor:pointer;font-size:13px">${esc(chName(BYID[id].ch) || (BYID[id].set || "真题"))} · ${esc(BYID[id].q.slice(0, 42))}…</summary>
              <p style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.8">正确答案：${LET[BYID[id].ans]}。${esc(BYID[id].exp || "真题原卷未附解析，建议结合对应知识域卡片回顾考点。")}</p>
            </details>` : "").join("") || '<p class="summary-text">全对，无错题 🎊</p>'}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:20px">
      <button class="btn btn-primary" id="exAgain">再考一次</button>
      <a class="btn btn-ghost" href="#/${CUR}/quiz">去刷错题 →</a>
    </div>`;
  $("#exAgain").addEventListener("click", () => { EX = null; router(); });
}

/* ============================================================
   视图：资料纳管
   ============================================================ */
let curCat = "all";
function vResources(view) {
  const R = T.resources || { cats: [] };
  const all = [];
  (R.cats || []).forEach((c) => c.items.forEach((it) => all.push({ ...it, cat: c.name, catId: c.id })));
  const shown = curCat === "all" ? all : all.filter((it) => it.catId === curCat);
  const stCount = [0, 0, 0];
  all.forEach((it) => stCount[ST.resStatus[it.id] || 0]++);
  view.innerHTML = `
    <div class="disk-card" style="margin-bottom:18px">
      <h3>▤ ${esc(T.meta.name)} 学习资料清单</h3>
      <p style="color:var(--muted);font-size:13.5px;line-height:1.8">${esc(R.privacy || "资料来源为私有渠道，平台不展示、不记录任何来源信息。")}此处仅提供资料目录与学习状态，不提供文件阅读或下载。点击右侧状态按钮可更新进度。按<b style="color:var(--txt)">「备考价值」</b>分级纳管：S 级必学核心 → A 级重要补充 → B/C 级拓展视野，无关文件已自动过滤。</p>
      <div class="disk-meta">
        <span class="chip mono">纳管条目 ${all.length} 项</span>
        <span class="chip mono">总进度 未开始 ${stCount[0]} · 学习中 ${stCount[1]} · 已完成 ${stCount[2]}</span>
      </div>
      <p class="res-path" style="margin-top:8px">🔒 隐私说明：资料清单与学习进度仅存于浏览器本地，不上传任何服务器。</p>
    </div>
    <div class="res-cats">
      <button class="res-cat ${curCat === "all" ? "active" : ""}" data-cat="all">全部（${all.length}）</button>
      ${(R.cats || []).map((c) => `<button class="res-cat ${curCat === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}（${c.items.length}）</button>`).join("")}
    </div>
    <div class="res-list">
      ${shown.map((it) => {
        const st = ST.resStatus[it.id] || 0;
        const stTxt = ["未开始", "学习中", "已完成"][st];
        return `
        <div class="res-row">
          <div class="res-ico">${it.icon || "📄"}</div>
          <div class="res-info">
            <div class="res-name">${esc(it.name)} <span class="res-star">${"★".repeat(it.stars || 0)}</span></div>
            <div class="res-meta"><span>${esc(it.type)}</span><span>${esc(it.size)}</span><span>${esc(it.cat)}</span></div>
            <div class="res-path">📂 ${esc(it.path)}</div>
            ${it.note ? `<div class="res-meta" style="margin-top:5px;color:var(--muted)">💡 ${esc(it.note)}</div>` : ""}
          </div>
          <button class="res-status st${st}" data-id="${esc(it.id)}">${stTxt}</button>
        </div>`;
      }).join("")}
    </div>`;
  $$(".res-cat", view).forEach((b) => b.addEventListener("click", () => { curCat = b.dataset.cat; router(); }));
  $$(".res-status", view).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.id;
    ST.resStatus[id] = ((ST.resStatus[id] || 0) + 1) % 3;
    save(); router();
  }));
}

/* ============================================================
   视图：备考攻略
   ============================================================ */
function vTips(view) {
  const Tt = T.tips || { examFacts: [], strategy: [], memory: [] };
  view.innerHTML = `
    <div class="grid-2" style="margin-bottom:18px">
      <div class="card">
        <h3 class="card-title">考试速览</h3>
        <table class="table">
          ${Tt.examFacts.map((f) => `<tr><td style="color:var(--muted)">${esc(f[0])}</td><td><b>${esc(f[1])}</b></td></tr>`).join("")}
        </table>
      </div>
      <div class="card">
        <h3 class="card-title">答题策略</h3>
        <ul class="point-list">${Tt.strategy.map((s) => `<li>${s}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h3 class="card-title">高分记忆法</h3>
      <div class="tip-grid">
        ${Tt.memory.map((m, i) => `<div class="tip-card"><span class="tip-num">MEMO-${String(i + 1).padStart(2, "0")}</span><h4>${esc(m[0])}</h4><p>${esc(m[1])}</p></div>`).join("")}
      </div>
    </div>
    `;
}

/* ============================================================
   视图：闪卡记忆（Leitner 间隔重复）
   ============================================================ */
let FC = null;
function vFlashcards(view) {
  if (FC && FC.running) return renderFlashcard(view);
  if (FC && FC.done) return renderFlashEnd(view);
  const all = Core.cardsFromKnowledge(T.knowledge || []);
  const due = Core.dueCards(ST.flashcards || {}, all, new Date());
  const learned = Object.keys(ST.flashcards || {}).length;
  const perCh = (T.knowledge || []).map((k) => {
    const cs = all.filter((c) => c.ch === k.id);
    return { k, total: cs.length, due: due.filter((c) => c.ch === k.id).length };
  }).filter((x) => x.total > 0);
  view.innerHTML = `
    <div class="grid-3" style="margin-bottom:18px">
      <div class="card stat-card"><div class="stat-num">${all.length}</div><div class="stat-label">卡片总量（术语 + 必背）</div></div>
      <div class="card stat-card"><div class="stat-num">${due.length}</div><div class="stat-label">今日到期待复习</div></div>
      <div class="card stat-card"><div class="stat-num">${learned}</div><div class="stat-label">已在复习计划中</div></div>
    </div>
    <div class="card" style="max-width:640px">
      <h3 class="card-title">开始复习（Leitner 间隔重复）</h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:8px 0 6px">
        <select class="input" id="fcCh" style="flex:1;min-width:220px">
          <option value="all">📚 全部章节（到期 ${due.length} 张）</option>
          ${perCh.map((x) => `<option value="${x.k.id}">${x.k.icon} ${esc(x.k.name)}（到期 ${x.due}/${x.total}）</option>`).join("")}
        </select>
        <label class="gate-remember" style="margin:0"><input type="checkbox" id="fcAll"> 含未到期</label>
      </div>
      <button class="btn btn-primary" id="fcStart">▶ 开始复习</button>
      <p class="summary-text" style="margin-top:12px">评级规则：😃 记牢 → 间隔翻倍推进；🤔 模糊 → 保持当前间隔；😵 忘记 → 1 天后重见。记忆节奏：<span class="mono">1→2→4→8→16→32 天</span>。</p>
    </div>`;
  $("#fcStart").addEventListener("click", () => {
    const ch = $("#fcCh").value;
    const includeAll = $("#fcAll").checked;
    let cards = ch === "all" ? all : all.filter((c) => c.ch === ch);
    cards = Core.dueCards(ST.flashcards || {}, cards, new Date(), includeAll);
    if (!cards.length) { toast("该范围暂无到期卡片（可勾选「含未到期」提前学习）"); return; }
    if (EX && EX.timer) clearInterval(EX.timer);
    EX = null; QZ = null;
    FC = { running: true, done: false, cards, i: 0, stats: { again: 0, blur: 0, good: 0 } };
    location.hash = "#/" + CUR + "/flashcards";
    router();
  });
}
function renderFlashcard(view) {
  const card = FC.cards[FC.i];
  view.innerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto">
      <div class="q-meta">
        <span class="chip chip-hi">${esc(chName(card.ch))}</span>
        <span class="q-prog">第 ${FC.i + 1} / ${FC.cards.length} 张</span>
        <span class="q-prog" style="margin-left:auto">😃 ${FC.stats.good} · 🤔 ${FC.stats.blur} · 😵 ${FC.stats.again}</span>
      </div>
      <div class="flashcard-scene" id="fcScene" title="点击翻面">
        <div class="flashcard" id="fcCard">
          <div class="flash-face front"><div><div style="font-size:17px;font-weight:700;text-align:center">${esc(card.front)}</div><div class="res-meta" style="margin-top:12px;text-align:center">点击卡片查看背面</div></div></div>
          <div class="flash-face back"><div style="font-size:14.5px;line-height:1.9">${esc(card.back)}</div></div>
        </div>
      </div>
      <div id="fcRate" hidden style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-ghost" style="flex:1;color:var(--red)" data-r="0">😵 忘记</button>
        <button class="btn btn-ghost" style="flex:1;color:var(--amber)" data-r="1">🤔 模糊</button>
        <button class="btn btn-primary" style="flex:1" data-r="2">😃 记牢</button>
      </div>
      <div class="q-foot" style="margin-top:14px">
        <button class="btn btn-ghost btn-sm" id="fcQuit">退出复习</button>
        <span class="q-prog">Leitner 盒：${(ST.flashcards[card.id] && ST.flashcards[card.id].box) || 0} / 5</span>
      </div>
    </div>`;
  $("#fcScene").addEventListener("click", () => {
    $("#fcCard").classList.toggle("flipped");
    $("#fcRate").hidden = false;
  });
  $$("#fcRate .btn").forEach((b) => b.addEventListener("click", () => {
    const rating = parseInt(b.dataset.r);
    if (rating === 2) FC.stats.good++; else if (rating === 1) FC.stats.blur++; else FC.stats.again++;
    ST.flashcards[card.id] = Core.scheduleCard(ST.flashcards[card.id], rating, new Date());
    logActivity("f");
    FC.i++;
    if (FC.i >= FC.cards.length) { FC.running = false; FC.done = true; }
    router();
  }));
  $("#fcQuit").addEventListener("click", () => { FC = null; router(); });
}
function renderFlashEnd(view) {
  view.innerHTML = `
    <div class="card" style="max-width:640px;margin:0 auto;text-align:center">
      <h3 class="card-title" style="justify-content:center">复习完成</h3>
      <div class="score-wrap"><div class="score-num">${FC.cards.length}</div><span class="score-tag pass">张卡片已按记忆节奏排期</span></div>
      <p style="color:var(--muted);margin:14px 0 22px">😃 记牢 ${FC.stats.good} · 🤔 模糊 ${FC.stats.blur} · 😵 忘记 ${FC.stats.again}——忘记的卡片 1 天后自动重见。</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="fcAgain">继续复习到期卡</button>
        <a class="btn btn-ghost" href="#/${CUR}/home">返回轨道首页</a>
      </div>
    </div>`;
  $("#fcAgain").addEventListener("click", () => { FC = null; router(); });
}

/* ============================================================
   视图：全局错题中心（跨轨道）
   ============================================================ */
function renderWrongBook() {
  const preferred = S.current && TRACKS()[S.current] ? S.current : Object.keys(TRACKS())[0];
  if (preferred && (!T || CUR !== preferred)) loadTrack(preferred);
  updateNav();
  $("#topbarTitle").textContent = "错题中心";
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === "wrongbook"));
  closeSidebar();
  const groups = [];
  Object.keys(TRACKS()).forEach((tid) => {
    const st = S.tracks[tid];
    if (!st || !st.wrong.length) return;
    const pack = TRACKS()[tid];
    const pool = (pack.bank || []).concat((window.TRACKS_REAL || {})[tid] || []);
    const chN = (id) => { const k = (pack.knowledge || []).find((x) => x.id === id); return k ? k.name : (id || "真题"); };
    const items = st.wrong.map((id) => pool.find((q) => q.id === id)).filter(Boolean);
    if (items.length) groups.push({ tid, name: pack.meta.name, chN, items });
  });
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  $("#view").innerHTML = `
    <div class="hero card" style="padding:26px">
      <span class="hero-kicker">⚡ WRONG-BOOK · 全局错题中心</span>
      <h1 class="hero-title" style="font-size:28px">错题，是<em>提分最快</em>的地方</h1>
      <p class="summary-text" style="margin-top:10px">跨轨道汇总所有错题：共 <b style="color:var(--txt)">${total}</b> 道。消灭一道，正确率与章节诊断立刻反馈。</p>
    </div>
    ${groups.length ? groups.map((g) => `
      <div class="card" style="margin-top:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
          <h3 class="card-title" style="margin:0">${esc(g.name)}</h3>
          <span class="badge">${g.items.length} 道</span>
          <a class="btn btn-primary btn-sm" style="margin-left:auto" href="#/${g.tid}/quiz">⚡ 去重练本轨道错题</a>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${g.items.map((q) => `
            <details style="border:1px solid var(--border);border-radius:10px;padding:10px 14px">
              <summary style="cursor:pointer;font-size:13px">${esc(g.chN(q.ch))} · ${esc(q.q.slice(0, 46))}…</summary>
              <p style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.8">正确答案：${LET[q.ans]}。${esc(q.exp || "无解析")}</p>
            </details>`).join("")}
        </div>
      </div>`).join("") : `
      <div class="card" style="margin-top:16px;text-align:center;padding:40px">
        <div style="font-size:40px">🎊</div>
        <p class="summary-text" style="margin-top:10px">所有轨道的错题本都是空的——继续保持！</p>
      </div>`}`;
  renderTopbar(); renderFoot();
  window.scrollTo(0, 0);
}
function openAchievements(list) {
  $("#modalRoot").innerHTML = `
  <div class="modal-mask" id="mask">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="成就墙">
      <button class="modal-close" id="mclose" aria-label="关闭">✕</button>
      <h3>🏅 成就墙</h3>
      <div class="achv-grid">
        ${list.map((a) => `
          <div class="achv ${a.done ? "" : "locked"}"><span class="ico">${a.icon}</span>
            <div><div class="sr-title">${esc(a.name)}</div><div class="sr-sub">${esc(a.desc)}</div></div>
          </div>`).join("")}
      </div>
    </div>
  </div>`;
  $("#mask").addEventListener("click", (e) => { if (e.target.id === "mask") closeModal(); });
  $("#mclose").addEventListener("click", closeModal);
}

/* ============================================================
   🔍 全局搜索 / ⚙ 数据管理
   ============================================================ */
function closeModal() { $("#modalRoot").innerHTML = ""; }
function openSearch() {
  if (!T) { toast("请先选择一条可用学习轨道"); return; }
  $("#modalRoot").innerHTML = `
  <div class="modal-mask" id="mask">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="全局搜索">
      <button class="modal-close" id="mclose" aria-label="关闭">✕</button>
      <h3>🔍 全局搜索 <span class="badge" style="margin-left:6px">${esc(T.meta.name)}</span></h3>
      <input class="input" id="searchInput" placeholder="搜索 术语 / 考点 / 题干…" autocomplete="off">
      <div id="searchResults" class="search-results"><p class="summary-text">输入关键词即时出结果：术语、考点、题干（题目可预览答案与解析）。</p></div>
    </div>
  </div>`;
  $("#mask").addEventListener("click", (e) => { if (e.target.id === "mask") closeModal(); });
  $("#mclose").addEventListener("click", closeModal);
  const inp = $("#searchInput");
  inp.focus();
  let deb = null;
  inp.addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(() => renderSearchResults(inp.value.trim()), 140); });
}
function renderSearchResults(q) {
  const box = $("#searchResults");
  if (!box) return;
  const { areas, terms, questions } = Core.searchFilter(T.knowledge, BANK, REAL, q);
  if (!q || (!areas.length && !terms.length && !questions.length)) {
    box.innerHTML = `<p class="summary-text">${q ? `没有匹配「${esc(q)}」的结果。` : "输入关键词即时出结果：术语、考点、题干（题目可预览答案与解析）。"}</p>`;
    return;
  }
  box.innerHTML = `
    ${terms.length ? `<div class="sr-group">📖 术语（${terms.length}）</div>` + terms.slice(0, 8).map((t) => `
      <div class="sr-item"><div class="sr-title">${esc(t.term)} <span class="badge">${esc(t.area.name)}</span></div><div class="sr-sub">${esc(t.def)}</div></div>`).join("") : ""}
    ${areas.length ? `<div class="sr-group">❖ 知识域（${areas.length}）</div>` + areas.slice(0, 6).map((k) => `
      <a class="sr-item" href="#/${CUR}/knowledge/${k.id}" id="srArea-${k.id}"><div class="sr-title">${k.icon} ${esc(k.name)}</div><div class="sr-sub">${esc(Core.searchStrip(k.brief))}</div></a>`).join("") : ""}
    ${questions.length ? `<div class="sr-group">✎ 题目（${questions.length}）</div>` + questions.slice(0, 8).map((item) => `
      <div class="sr-item" data-qid="${esc(item.id)}" style="cursor:pointer"><div class="sr-title">${esc(item.q.slice(0, 60))}${item.q.length > 60 ? "…" : ""}</div><div class="sr-sub">${esc(chName(item.ch) || item.set || "真题")}</div></div>`).join("") : ""}`;
  $$("a.sr-item", box).forEach((a) => a.addEventListener("click", () => closeModal()));
  $$(".sr-item[data-qid]", box).forEach((el) => el.addEventListener("click", () => {
    const item = BYID[el.dataset.qid];
    if (!item) return;
    box.innerHTML = `
      <div class="q-text" style="font-size:14.5px">${esc(item.q)}</div>
      <div class="opts">${item.opts.map((o, i) => `<div class="opt ${i === item.ans ? "correct" : ""}" style="cursor:default"><span class="opt-letter">${LET[i]}</span><span>${esc(o)}</span></div>`).join("")}</div>
      <div class="explain" style="margin-top:12px"><b>正确答案：${LET[item.ans]}</b><br>${esc(item.exp || "无解析")}</div>
      <a class="btn btn-ghost btn-sm" style="margin-top:12px" id="srGoQuiz" href="#/${CUR}/quiz">去刷本章 →</a>`;
    $("#srGoQuiz").addEventListener("click", closeModal);
  }));
}
function openSettings() {
  const sizeKB = (JSON.stringify(S).length / 1024).toFixed(1);
  $("#modalRoot").innerHTML = `
  <div class="modal-mask" id="mask">
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="数据管理">
      <button class="modal-close" id="mclose" aria-label="关闭">✕</button>
      <h3>⚙ 数据管理</h3>
      <div class="modal-body">
        <p>当前进度：<b>${Object.keys(S.tracks).length}</b> 条轨道 · 占用约 <b>${sizeKB} KB</b>（仅存本机浏览器，清除浏览器数据会丢失——建议定期导出备份）。</p>
        <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap">
          <span>🎯 每日目标（题）</span>
          <input type="number" class="input" id="goalInput" min="1" max="200" value="${(S.settings && S.settings.dailyGoal) || 20}" style="width:90px">
          <button class="btn btn-sm btn-primary" id="goalSave">保存</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="expBtn">⬇ 导出全部进度（JSON 备份）</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">⬆ 导入备份（JSON）<input type="file" id="impFile" accept=".json,application/json" style="display:none"></label>
          <button class="btn btn-ghost btn-sm" id="resetBtn" style="color:var(--red)">🗑 重置当前轨道进度（${esc(T ? T.meta.name : "未选择轨道")}）</button>
        </div>
        <p class="gate-hint">导出文件包含全部轨道的学习进度；导入会覆盖现有进度，请谨慎操作。</p>
      </div>
    </div>
  </div>`;
  $("#mask").addEventListener("click", (e) => { if (e.target.id === "mask") closeModal(); });
  $("#mclose").addEventListener("click", closeModal);
  $("#goalSave").addEventListener("click", () => {
    const v = Math.max(1, Math.min(200, parseInt($("#goalInput").value) || 20));
    S.settings = S.settings || { dailyGoal: v };
    S.settings.dailyGoal = v; save(); toast("每日目标已设为 " + v + " 题");
  });
  $("#expBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learnos-backup-${fmtDate(Date.now())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("备份已开始下载");
  });
  $("#impFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const parsed = JSON.parse(rd.result);
        if (!parsed || parsed.v !== 2 || !parsed.tracks) throw new Error("bad");
        if (!confirm("导入将覆盖当前所有进度，确定吗？")) return;
        S = Core.fixState(parsed); save(); location.reload();
      } catch (err) { toast("导入失败：文件格式不正确"); }
    };
    rd.readAsText(f);
  });
  $("#resetBtn").addEventListener("click", () => {
    if (!T) return;
    if (!confirm(`确定清空「${T.meta.name}」的全部学习进度吗？此操作不可恢复。`)) return;
    S.tracks[CUR] = Core.defaultTrackState(); save(); location.reload();
  });
}

/* ---------------- ⌨ 全局快捷键 ---------------- */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
  if (e.key === "Escape") {
    if ($("#gatePwd")) return; // 门禁页不允许 Esc 关闭
    if ($("#modalRoot").childNodes.length) closeModal();
    return;
  }
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (!S || !T) return;
  const low = String(e.key).toLowerCase();
  const pick = ["a", "b", "c", "d"].indexOf(low) > -1 ? ["a", "b", "c", "d"].indexOf(low) : ["1", "2", "3", "4"].indexOf(e.key);
  if (QZ && QZ.running) {
    if (pick > -1) { const o = $$("#view .opt")[pick]; if (o && !o.disabled) o.click(); }
    else if (e.key === "Enter" && e.target.id !== "qzNext") { const n = $("#qzNext"); if (n && !n.disabled) n.click(); }
  } else if (EX && EX.running) {
    if (pick > -1 && EX.answers[EX.i] === undefined) { const o = $$("#view .opt")[pick]; if (o) o.click(); }
    else if (low === "f") { const fl = $("#exFlag"); if (fl) fl.click(); }
    else if (e.key === "ArrowLeft") { const p = $("#exPrev"); if (p && !p.disabled) p.click(); }
    else if (e.key === "ArrowRight") { const n = $("#exNext"); if (n && !n.disabled) n.click(); }
  }
});

/* ============================================================
   🔐 登录门禁（加密保险库）
   ============================================================ */
const GATE_KEY = "learnos_unlock_key"; // 勾选"记住此设备"时保存派生密钥（仅存本机）

/* 解密产物的装载：v3 JSON 保险库（免 eval，支持严格 CSP）/ 旧版 JS 兼容 */
async function applyDecrypted(text) {
  if (text.trimStart().startsWith("{")) {
    const data = JSON.parse(text);
    Object.entries(data.globals || {}).forEach(([k, v]) => { window[k] = v; });
  } else {
    new Function(text)(); // 旧版 JS 保险库兼容
  }
}
/* 云模式：拉取服务端进度并与本地合并（track 粒度 LWW + 集合并集） */
async function pullAndMerge() {
  if (!Cloud.available || !Cloud.session) return;
  try {
    const remote = await Cloud.pullProgress();
    for (const tid of Object.keys(remote)) {
      const r = remote[tid];
      const l = S.tracks[tid];
      if (!l) S.tracks[tid] = Cloud.mergeTrack(Core.defaultTrackState(), r.payload, true, r.updatedAt);
      else if (!l.updatedAt || r.updatedAt >= l.updatedAt) S.tracks[tid] = Cloud.mergeTrack(l, r.payload, true, r.updatedAt);
      else Cloud.queuePush(S); // 本地较新 → 稍后推送覆盖服务端
    }
    Core.saveTo(localStorage, SKEY, S);
  } catch (e) { /* 离线容错：保留本地，待恢复后自动重推 */ }
}
function boot() {
  const TR = TRACKS();
  const target = S.current && TR[S.current] ? S.current : Object.keys(TR)[0] || null;
  if (target) loadTrack(target); else updateNav();
  router();
  renderFoot();
}
function renderGate(errMsg, mode) {
  const cloudOn = Cloud.available;
  mode = mode || (cloudOn ? "account" : "pass");
  const tabBtn = (id, label) => `<button class="auth-tab ${mode === id ? "active" : ""}" data-tab="${id}">${label}</button>`;
  $("#modalRoot").innerHTML = `
  <div class="modal-mask">
    <div class="gate-card ${errMsg ? "shake" : ""}" role="dialog" aria-modal="true" aria-label="访问门禁">
      <div class="gate-logo">
        <img src="icon.svg" width="34" height="34" alt="">
        <strong>LearnOS</strong>
      </div>
      <h2>你的学习，从这里开始。</h2>
      ${cloudOn ? `<div class="auth-tabs">${tabBtn("account", "账号登录")}${tabBtn("pass", "内容密码")}</div>`
                : `<p class="gate-sub">内容已端到端加密，请输入访问密码解锁</p>`}
      <div id="tab-account" ${mode === "account" ? "" : "hidden"}>
        <p class="gate-sub">登录后自动同步多设备进度，并自动解锁内容</p>
        <input type="email" id="authEmail" class="input" placeholder="邮箱" autocomplete="username">
        <input type="password" id="authPass" class="input" placeholder="密码（≥8 位，含字母和数字）" autocomplete="current-password">
        <button class="btn btn-primary" id="authLogin" style="width:100%">登录</button>
        <button class="btn btn-ghost" id="authRegister" style="width:100%;margin-top:10px">创建账号</button>
      </div>
      <div id="tab-pass" ${mode === "pass" ? "" : "hidden"}>
        <input type="password" id="gatePwd" class="input" placeholder="访问密码" autocomplete="current-password">
        <label class="gate-remember"><input type="checkbox" id="gateRemember" checked> 记住此设备，下次免输入</label>
        <button class="btn btn-primary" id="gateBtn">解锁学习空间</button>
      </div>
      <div class="gate-err" id="gateErr" role="alert">${errMsg ? esc(errMsg) : ""}</div>
      <p class="gate-hint">${cloudOn ? "账号用于云端同步；内容在本机解密，学习数据不向第三方泄露" : "密码仅用于在本地解密内容，不会发送到任何服务器"}</p>
    </div>
  </div>`;
  $$(".auth-tab").forEach((b) => b.addEventListener("click", () => renderGate(null, b.dataset.tab)));
  /* 内容密码解锁 */
  const doPass = async () => {
    const pwd = $("#gatePwd") ? $("#gatePwd").value : "";
    if (!pwd) { $("#gateErr").textContent = "请输入访问密码"; return; }
    const btn = $("#gateBtn");
    btn.disabled = true; btn.textContent = "🔓 解锁中…";
    try {
      const bits = await Crypt.deriveBitsFromPass(window.CDMP_VAULT, pwd);
      const text = await Crypt.decryptWithBits(window.CDMP_VAULT, bits);
      await applyDecrypted(text);
      if ($("#gateRemember").checked) localStorage.setItem(GATE_KEY, Crypt.bufToB64(bits));
      $("#modalRoot").innerHTML = "";
      await pullAndMerge();
      boot();
    } catch (e) {
      renderGate("密码不正确，请重试", mode);
    }
  };
  /* 账号登录 / 注册（登录后自动拉取进度；配置内容密码时自动解锁内容） */
  const doAuth = async (register) => {
    const email = ($("#authEmail") && $("#authEmail").value || "").trim();
    const pw = ($("#authPass") && $("#authPass").value) || "";
    if (!email || !pw) { $("#gateErr").textContent = "请输入邮箱与密码"; return; }
    const btn = register ? $("#authRegister") : $("#authLogin");
    btn.disabled = true;
    try {
      const me = register ? await Cloud.register(email, pw) : await Cloud.login(email, pw);
      await pullAndMerge();
      if (me.contentPass) {
        const bits = await Crypt.deriveBitsFromPass(window.CDMP_VAULT, me.contentPass);
        const text = await Crypt.decryptWithBits(window.CDMP_VAULT, bits);
        await applyDecrypted(text);
        localStorage.setItem(GATE_KEY, Crypt.bufToB64(bits));
        $("#modalRoot").innerHTML = "";
        boot();
        return;
      }
      renderGate(null, "pass"); // 服务器未配置内容密码 → 手动输入内容解锁密码
    } catch (e) {
      renderGate(e.message || "登录失败", mode);
    }
  };
  const al = $("#authLogin"), ar = $("#authRegister");
  if (al) al.addEventListener("click", () => doAuth(false));
  if (ar) ar.addEventListener("click", () => doAuth(true));
  const ap = $("#authPass");
  if (ap) ap.addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(false); });
  const gb = $("#gateBtn");
  if (gb) gb.addEventListener("click", doPass);
  const gp = $("#gatePwd");
  if (gp) {
    gp.addEventListener("keydown", (e) => { if (e.key === "Enter") doPass(); });
    gp.focus();
  } else if (al) al.focus();
}

/* ---------------- 启动 ---------------- */
window.addEventListener("hashchange", router);
(async function start() {
  S = Core.loadFrom(localStorage, SKEY, V1KEY);
  /* PWA 离线（https / localhost 环境注册） */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  /* 云模式自动探测 + 会话恢复（Cookie） */
  Cloud.available = await Cloud.detect();
  if (Cloud.available) { try { await Cloud.me(); } catch (e) { /* 未登录 */ } }
  Cloud.onStatus = () => { if (S) renderTopbar(); };
  Cloud.onNewerTrack = (tid, payload, updatedAt) => {
    const l = S.tracks[tid];
    S.tracks[tid] = Cloud.mergeTrack(l || Core.defaultTrackState(), payload, true, updatedAt);
    Core.saveTo(localStorage, SKEY, S);
    if (CUR === tid) ST = S.tracks[tid];
  };
  if (!window.CDMP_VAULT || !window.CDMP_VAULT.ct) { boot(); return; } // 开发模式：无保险库直接启动
  const saved = localStorage.getItem(GATE_KEY);
  if (saved) {
    try {
      const text = await Crypt.decryptWithBits(window.CDMP_VAULT, Crypt.b64ToBuf(saved));
      await applyDecrypted(text);
      await pullAndMerge();
      boot(); return;
    } catch (e) { localStorage.removeItem(GATE_KEY); }
  }
  renderGate();
})();
