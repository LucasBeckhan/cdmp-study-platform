/* ============================================================
   CDMP MASTER · app.js — SPA 路由 + 学习状态管理
   状态持久化：localStorage
   ============================================================ */
"use strict";

/* ---------------- 状态 ---------------- */
const SKEY = "cdmpMasterV1";
const DEFAULT_STATE = {
  checks: {},        // 30天计划勾选 { "1": true, ... }
  chStats: {},       // 章节刷题统计 { ch3: { done: 5, right: 4 } }
  wrong: [],         // 错题 id 列表
  exams: [],         // 模考历史 { date, count, right, score }
  resStatus: {},     // 资源状态 { resId: 0|1|2 }
  examDate: "",      // 考试日期 YYYY-MM-DD
  termsRead: {}      // 已读术语
};
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY));
    return s ? Object.assign({}, DEFAULT_STATE, s) : { ...DEFAULT_STATE };
  } catch (e) { return { ...DEFAULT_STATE }; }
}
let S = loadState();
function save() { localStorage.setItem(SKEY, JSON.stringify(S)); }

/* ---------------- 工具 ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const LET = ["A", "B", "C", "D", "E", "F"];
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fmtDate(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
let toastTimer = null;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function copyText(text, tip) {
  const done = () => toast(tip || "已复制到剪贴板");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea"); ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta);
  ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败，请手动复制"); }
  document.body.removeChild(ta);
}
function daysLeft() {
  if (!S.examDate) return null;
  const d = Math.ceil((new Date(S.examDate + "T09:00:00") - Date.now()) / 86400000);
  return d;
}
function modal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-mask" id="mask"><div class="modal-card"><button class="modal-close" id="mclose">✕</button>${html}</div></div>`;
  $("#mask").addEventListener("click", (e) => { if (e.target.id === "mask") closeModal(); });
  $("#mclose").addEventListener("click", closeModal);
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

/* ---------------- 题库与知识域索引（解锁保险库后由 initData 装载） ---------------- */
let BANK = [], REAL = [], REAL_SETS = [], BANK_IDS_BY_CH = {};
const BYID = {};
const CH = {}; // 知识域索引
const chName = (id) => (CH[id] ? CH[id].name : id);
function initData() {
  BANK = [].concat(
    window.QUESTIONS_P1 || [], window.QUESTIONS_P2 || [],
    window.QUESTIONS_P3 || [], window.QUESTIONS_P4 || []
  );
  /* 真题题库（由 tools/parse_real_xlsx.py 从本地导入文件解析生成后填充） */
  REAL = (window.QUESTIONS_REAL || []).filter((q) => q && q.q && Array.isArray(q.opts) && q.opts.length >= 2 && typeof q.ans === "number");
  REAL_SETS = [];
  REAL.forEach((q) => { if (q.set && !REAL_SETS.includes(q.set)) REAL_SETS.push(q.set); });
  Object.keys(BYID).forEach((k) => delete BYID[k]);
  BANK.concat(REAL).forEach((q) => { BYID[q.id] = q; });
  Object.keys(CH).forEach((k) => delete CH[k]);
  (window.KNOWLEDGE || []).forEach((k) => { CH[k.id] = k; });
  BANK_IDS_BY_CH = {};
  BANK.forEach((q) => { (BANK_IDS_BY_CH[q.ch] = BANK_IDS_BY_CH[q.ch] || []).push(q.id); });
}

/* ---------------- 路由 ---------------- */
const TITLES = { home: "学习首页", plan: "30 天冲刺计划", knowledge: "DMBOK2 知识体系", quiz: "章节刷题", exam: "模拟考试", resources: "资料纳管中心", tips: "备考攻略" };
const ROUTES = ["home", "plan", "knowledge", "quiz", "exam", "resources", "tips"];

function router() {
  let h = location.hash.replace(/^#\//, "") || "home";
  let sub = "";
  const i = h.indexOf("/");
  if (i > -1) { sub = h.slice(i + 1); h = h.slice(0, i); }
  if (!ROUTES.includes(h)) h = "home";
  $("#topbarTitle").textContent = TITLES[h] || "学习首页";
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === h));
  closeSidebar();
  const view = $("#view");
  const R = { home: vHome, plan: vPlan, knowledge: vKnowledge, quiz: vQuiz, exam: vExam, resources: vResources, tips: vTips };
  if (h === "knowledge" && sub) return vKDetail(view, sub);
  R[h](view, sub);
  renderTopbar(); renderFoot();
  window.scrollTo(0, 0);
}

/* ---------------- 顶栏 / 侧栏 ---------------- */
function renderTopbar() {
  const d = daysLeft();
  $("#topbarRight").innerHTML =
    (d !== null ? `<span class="chip chip-hi mono">⏱ 距考试 ${d > 0 ? d : 0} 天</span>` : "") +
    (BANK.length + REAL.length ? `<span class="chip mono">题库 ${BANK.length + REAL.length} 题</span>` : "") +
    (window.CDMP_VAULT ? `<button class="btn btn-ghost btn-sm" id="logoutBtn" title="退出登录">🔒 退出</button>` : "");
  const lo = $("#logoutBtn");
  if (lo) lo.addEventListener("click", () => { localStorage.removeItem(GATE_KEY); location.reload(); });
}
function renderFoot() {
  const days = Object.keys(S.checks).length;
  const total = (window.PLAN_DATA && PLAN_DATA.totalDays) || 30;
  const doneQ = Object.values(S.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(S.chStats).reduce((s, c) => s + c.right, 0);
  $("#foot-progress").innerHTML = `
    <div class="fc-row"><span>30天计划</span><b>${days}/${total} 天</b></div>
    <div class="bar"><i style="width:${pct(days, total)}%"></i></div>
    <div class="fc-row" style="margin-top:8px"><span>刷题正确率</span><b>${doneQ ? pct(rightQ, doneQ) + "%" : "—"}</b></div>
    <div class="bar"><i style="width:${doneQ ? pct(rightQ, doneQ) : 0}%"></i></div>`;
}
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarMask").classList.remove("show"); }
$("#menuBtn").addEventListener("click", () => { $("#sidebar").classList.toggle("open"); $("#sidebarMask").classList.toggle("show"); });
$("#sidebarMask").addEventListener("click", closeSidebar);
$$("#nav a").forEach((a) => a.addEventListener("click", closeSidebar));

/* ============================================================
   视图：首页
   ============================================================ */
function vHome(view) {
  const days = Object.keys(S.checks).length;
  const doneQ = Object.values(S.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(S.chStats).reduce((s, c) => s + c.right, 0);
  const best = S.exams.length ? Math.max(...S.exams.map((e) => e.score)) : null;
  const resItems = [];
  (window.RESOURCES.cats || []).forEach((c) => c.items.forEach((it) => resItems.push(it)));
  const resDone = resItems.filter((it) => (S.resStatus[it.id] || 0) === 2).length;
  const d = daysLeft();
  const planTotal = (window.PLAN_DATA && PLAN_DATA.totalDays) || 30;

  view.innerHTML = `
  <div class="hero card">
    <span class="hero-kicker">DAMA · DMBOK2 · CERTIFIED DATA MANAGEMENT PROFESSIONAL</span>
    <h1 class="hero-title">一个月，成为<em>数据治理</em>精通者</h1>
    <p class="hero-sub">基于 DAMA-DMBOK2 知识体系与精选学习资料构建：30 天冲刺计划 → 知识域精讲 → 章节刷题 → 全真模考。
    官方及格线 <b>60 分</b>，本平台目标 <b style="color:var(--cyan)">70 分</b>，冲刺 <b style="color:var(--violet)">80 分</b>。</p>
    <div class="chip-row">
      <span class="chip">📝 100 道选择题</span><span class="chip">⏱ 90 分钟</span>
      <span class="chip">✅ 60 分及格</span><span class="chip">🎓 证书 3 年有效</span>
      ${d !== null ? `<span class="chip chip-hi">🎯 考试日：${esc(S.examDate)}</span>` : ""}
    </div>
    <div class="cta-row">
      <a class="btn btn-primary" href="#/plan">⟠ 开始 30 天计划</a>
      <a class="btn btn-ghost" href="#/exam">◎ 进入模拟考</a>
      <a class="btn btn-ghost" href="#/resources">▤ 资料纳管中心</a>
    </div>
  </div>

  <div class="grid-4 stat-grid">
    <div class="card stat-card">
      <div class="stat-head"><div class="stat-ico">⟠</div><span class="stat-sub">计划</span></div>
      <div class="stat-num">${pct(days, planTotal)}%</div>
      <div class="stat-label">30 天计划完成度</div>
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
      <div class="stat-label">模考最高分（目标 70+）</div>
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
    <div class="card">
      <h3 class="card-title">考试权重分布（参考）</h3>
      <div class="wchart">
        ${(window.KNOWLEDGE || []).slice(0, 11).map((k) => `
          <div class="wrow"><span class="wname">${esc(k.name)}</span>
          <div class="bar grow"><i style="width:${parseInt(k.weight) || 4}%"></i></div>
          <span class="wval">${esc(k.weight)}</span></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">下一步行动</h3>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${nextActions()}
      </div>
    </div>
  </div>`;
}

function nextActions() {
  const acts = [];
  const days = Object.keys(S.checks).length;
  const doneQ = Object.values(S.chStats).reduce((s, c) => s + c.done, 0);
  if (!days) acts.push(["⟠", "从 Day 1 开始你的 30 天计划", "#/plan"]);
  if (S.wrong.length) acts.push(["⚡", `错题重练：还有 ${S.wrong.length} 道错题等你消灭`, "#/quiz"]);
  if (doneQ < 60) acts.push(["✎", "完成各章节刷题，目标累计 60 题", "#/quiz"]);
  if (S.exams.length < 1) acts.push(["◎", "安排第一次全真模拟考试", "#/exam"]);
  if (!S.examDate) acts.push(["📅", "设置你的 CDMP 考试日期", "#/plan"]);
  if (acts.length === 0) acts.push(["🏆", "保持模考 80+ 手感，稳住！你可以直接去考试了", "#/exam"]);
  return acts.slice(0, 4).map(([ico, txt, href]) =>
    `<a class="btn btn-ghost" style="justify-content:flex-start" href="${href}"><span style="color:var(--cyan)">${ico}</span> ${esc(txt)}</a>`).join("");
}

/* ============================================================
   视图：30 天计划
   ============================================================ */
function vPlan(view) {
  const P = window.PLAN_DATA;
  view.innerHTML = `
    <div class="plan-head">
      <div class="card" style="flex:1;min-width:260px;padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="font-size:14px;color:var(--muted)">📅 我的考试日期</span>
        <input type="date" class="input" id="examDate" value="${esc(S.examDate)}">
        <button class="btn btn-primary btn-sm" id="saveDate">保存</button>
        <span class="chip mono" style="margin-left:auto">总进度 ${Object.keys(S.checks).length}/${P.totalDays} 天</span>
      </div>
    </div>
    <div class="plan-weeks">
      ${P.weeks.map((w) => {
        const checked = w.days.filter((d) => S.checks[d.day]).length;
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
                <input type="checkbox" data-day="${d.day}" ${S.checks[d.day] ? "checked" : ""}>
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
    S.examDate = $("#examDate").value; save(); renderTopbar(); toast(S.examDate ? "考试日期已保存" : "已清除考试日期");
  });
  $$(".day-row input").forEach((cb) => cb.addEventListener("change", () => {
    const day = cb.dataset.day;
    if (cb.checked) S.checks[day] = true; else delete S.checks[day];
    save(); renderFoot();
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
      <p class="summary-text">DMBOK2 共 17 章，核心是「1 个治理中枢 + 11 大知识域」。每个知识域卡片包含：<b style="color:var(--txt)">核心摘要 · 高频考点 · 必背术语</b>。
      建议顺序：先读卡片 → 对照课程视频 → 立即刷对应章节题。⭐ 为考试权重最高的四大金刚：治理、建模、质量、架构。</p>
    </div>
    <div class="k-grid">
      ${(window.KNOWLEDGE || []).map((k) => `
        <a class="card k-card" style="--kc:${k.color}" href="#/knowledge/${k.id}">
          <span class="k-ico">${k.icon}</span>
          <h3>${esc(k.name)} ${k.star ? "⭐" : ""}</h3>
          <p>${esc(k.brief)}</p>
          <div class="k-foot"><span class="badge">权重 ~${esc(k.weight)}</span><span>${k.terms.length} 个术语</span></div>
        </a>`).join("")}
    </div>`;
}

function vKDetail(view, id) {
  const k = CH[id];
  if (!k) { location.hash = "#/knowledge"; return; }
  const qn = (BANK_IDS_BY_CH[id] || []).length;
  view.innerHTML = `
    <div class="k-head">
      <a class="btn btn-ghost btn-sm" href="#/knowledge">← 返回</a>
      <span class="k-big">${k.icon}</span>
      <h2>${esc(k.name)}</h2>
      <span class="badge">权重 ~${esc(k.weight)}</span>
      ${qn ? `<a class="btn btn-primary btn-sm" style="margin-left:auto" href="#/quiz">✎ 刷本章 ${qn} 题</a>` : ""}
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
    <div class="must-know"><b>★ 一句话必背：</b>${esc(k.mustKnow)}</div>`;
}

/* ============================================================
   视图：章节刷题
   ============================================================ */
let QZ = null;
function vQuiz(view) {
  if (QZ && QZ.running) return renderQuizQ(view);
  if (QZ && QZ.done) return renderQuizEnd(view);
  const doneQ = Object.values(S.chStats).reduce((s, c) => s + c.done, 0);
  const rightQ = Object.values(S.chStats).reduce((s, c) => s + c.right, 0);
  view.innerHTML = `
    <div class="grid-3" style="margin-bottom:18px">
      <div class="card stat-card"><div class="stat-num">${doneQ}</div><div class="stat-label">累计刷题</div></div>
      <div class="card stat-card"><div class="stat-num">${doneQ ? pct(rightQ, doneQ) + "%" : "—"}</div><div class="stat-label">总正确率</div></div>
      <div class="card stat-card"><div class="stat-num">${S.wrong.length}</div><div class="stat-label">错题待消灭</div></div>
    </div>
    <div class="card" style="max-width:640px">
      <h3 class="card-title">开始刷题</h3>
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:6px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <select class="input" id="qzCh" style="flex:1;min-width:220px">
            <option value="all">📚 全部知识域混合</option>
            ${(window.KNOWLEDGE || []).map((k) => {
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
          <button class="btn btn-ghost" id="qzWrong" ${S.wrong.length ? "" : "disabled"}>⚡ 错题重练（${S.wrong.length}）</button>
        </div>
      </div>
    </div>
    ${REAL.length ? `
    <div class="card" style="max-width:640px;margin-top:16px">
      <h3 class="card-title">🏆 CDMP 真题实战（${REAL.length} 题 · ${REAL_SETS.length} 套）</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="qzRealAll">▶ 真题混合练习</button>
        ${REAL_SETS.map((s) => `<button class="btn btn-ghost" data-realset="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>
      <p class="summary-text" style="margin-top:10px">真题来自本地私有题库，建议限时 90 分钟/套；真题不计入章节统计，错题同样进入错题本。</p>
    </div>` : ""}
    <div class="card" style="max-width:640px;margin-top:16px">
      <h3 class="card-title">章节进度</h3>
      <div class="wchart">
        ${(window.KNOWLEDGE || []).map((k) => {
          const st = S.chStats[k.id] || { done: 0, right: 0 };
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
  const realAllBtn = $("#qzRealAll");
  if (realAllBtn) realAllBtn.addEventListener("click", () => startQuiz("real-all", 0));
  $$("[data-realset]", view).forEach((b) => b.addEventListener("click", () => startQuiz("real:" + b.dataset.realset, 0)));
}
function startQuiz(mode, n) {
  let ids = [];
  if (mode === "all") ids = BANK.map((q) => q.id);
  else if (mode === "random") ids = shuffle(BANK.map((q) => q.id)).slice(0, n);
  else if (mode === "wrong") ids = S.wrong.filter((id) => BYID[id]);
  else if (mode === "real-all") ids = REAL.map((q) => q.id);
  else if (mode.startsWith("real:")) ids = REAL.filter((q) => q.set === mode.slice(5)).map((q) => q.id);
  else ids = (BANK_IDS_BY_CH[mode] || []).slice();
  if (!mode.startsWith("real")) ids = shuffle(ids);
  if (n > 0) ids = ids.slice(0, n);
  if (!ids.length) { toast("没有可用题目"); return; }
  QZ = { running: true, done: false, qs: ids, i: 0, right: 0, results: [] };
  location.hash = "#/quiz";
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
  $("#qzQuit").addEventListener("click", () => { QZ = null; router(); });
  $("#qzNext").addEventListener("click", () => {
    QZ.i++;
    if (QZ.i >= QZ.qs.length) { QZ.running = false; QZ.done = true; }
    router();
  });
}
function answerQuiz(btn, q) {
  const pick = parseInt(btn.dataset.i);
  const ok = pick === q.ans;
  $$(".opt", $("#view")).forEach((o) => {
    o.disabled = true;
    if (parseInt(o.dataset.i) === q.ans) o.classList.add("correct");
  });
  if (!ok) btn.classList.add("wrong");
  if (ok) QZ.right++;
  QZ.results[QZ.i] = ok;
  if (q.ch) {
    const st = S.chStats[q.ch] || { done: 0, right: 0 };
    st.done++; if (ok) st.right++; S.chStats[q.ch] = st;
  }
  const w = S.wrong.indexOf(q.id);
  if (!ok && w === -1) S.wrong.push(q.id);
  if (ok && w > -1) S.wrong.splice(w, 1);
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
        <span class="score-tag ${score >= 60 ? "pass" : "fail"}">${score >= 60 ? "达到及格水平" : "低于及格线，继续加油"}</span>
      </div>
      <p style="color:var(--muted);margin:14px 0 22px">共 ${QZ.qs.length} 题 · 答对 ${QZ.right} 题 · 错题已自动加入错题本</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="qzAgain">再来一组</button>
        <button class="btn btn-ghost" id="qzHome">返回刷题中心</button>
      </div>
    </div>`;
  $("#qzAgain").addEventListener("click", () => { QZ = null; router(); });
  $("#qzHome").addEventListener("click", () => { QZ = null; location.hash = "#/quiz"; router(); });
}

/* ============================================================
   视图：模拟考试
   ============================================================ */
let EX = null;
function vExam(view) {
  if (EX && EX.running) return renderExamQ(view);
  if (EX && EX.done) return renderExamResult(view);
  const hist = S.exams.slice(-5).reverse();
  view.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">开始模拟考试</h3>
        <p class="summary-text" style="margin-bottom:16px">全真模拟：从 ${BANK.length} 题题库随机抽题，闭卷计时作答，<b style="color:var(--txt)">答完才显示对错</b>。及格线 60，目标 70+，冲刺 80。</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          ${REAL.length ? `<select class="input" id="exSrc">
            <option value="bank">📚 知识域题库（${BANK.length} 题）</option>
            <option value="real">🏆 CDMP 真题（${REAL.length} 题）</option>
          </select>` : ""}
          <select class="input" id="exN">
            <option value="30">30 题 · 约 27 分钟</option>
            <option value="50">50 题 · 约 45 分钟</option>
            <option value="100" selected>100 题 · 90 分钟（全真）</option>
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
          <td class="mono" style="color:${e.score >= 60 ? "var(--green)" : "var(--red)"};font-weight:700">${e.score}</td></tr>`).join("")}</table>`
        : `<p class="summary-text">还没有模考记录。建议进度：第 1-3 周刷题打基础，第 4 周每周至少 2 次全真模考。</p>`}
      </div>
    </div>`;
  $("#exStart").addEventListener("click", () => {
    const n = parseInt($("#exN").value);
    const src = $("#exSrc") ? $("#exSrc").value : "bank";
    const pool = (src === "real" && REAL.length) ? REAL : BANK;
    const qs = shuffle(pool.map((q) => q.id)).slice(0, Math.min(n, pool.length));
    EX = { running: true, done: false, qs, i: 0, answers: {}, flags: {}, dur: Math.ceil(qs.length * 0.9 * 60), left: Math.ceil(qs.length * 0.9 * 60), timer: null };
    location.hash = "#/exam"; router();
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
function fmtMMSS(s) { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function submitExam() {
  clearInterval(EX.timer);
  const right = EX.qs.reduce((n, id, i) => n + (EX.answers[i] === BYID[id].ans ? 1 : 0), 0);
  EX.score = pct(right, EX.qs.length); EX.right = right; EX.running = false; EX.done = true;
  S.exams.push({ date: fmtDate(Date.now()), count: EX.qs.length, right, score: EX.score });
  EX.qs.forEach((id, i) => {
    const q = BYID[id], ok = EX.answers[i] === q.ans;
    if (q.ch) {
      const st = S.chStats[q.ch] || { done: 0, right: 0 };
      st.done++; if (ok) st.right++; S.chStats[q.ch] = st;
    }
    const w = S.wrong.indexOf(id);
    if (!ok && w === -1) S.wrong.push(id);
    if (ok && w > -1) S.wrong.splice(w, 1);
  });
  save(); router();
}
function renderExamResult(view) {
  const byCh = {};
  EX.qs.forEach((id, i) => {
    const q = BYID[id];
    const c = (byCh[q.ch || "real"] = byCh[q.ch || "real"] || { t: 0, r: 0 });
    c.t++; if (EX.answers[i] === q.ans) c.r++;
  });
  const s = EX.score;
  const msg = s >= 80 ? "🎉 80+ 达成！你已经具备冲击高分的实力，保持手感准备赴考。" :
    s >= 70 ? "💪 70+ 目标达成！查漏补缺后可以稳定在这个水平以上。" :
    s >= 60 ? "⚠️ 过及格线但不稳，按章节诊断补弱项，目标 70+。" :
    "📚 尚未及格，回到知识体系逐章攻克，再战！";
  view.innerHTML = `
    <div class="card" style="max-width:820px;margin:0 auto 18px;text-align:center">
      <h3 class="card-title" style="justify-content:center">模考成绩单</h3>
      <div class="score-wrap">
        <svg width="170" height="170" viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="72" fill="none" stroke="rgba(148,163,184,.15)" stroke-width="12"/>
          <circle cx="85" cy="85" r="72" fill="none" stroke="url(#sg)" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${(s / 100 * 452.4).toFixed(1)} 452.4" transform="rotate(-90 85 85)"/>
          <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
          <text x="85" y="95" text-anchor="middle" fill="#e2e8f0" font-size="40" font-weight="800" font-family="ui-monospace,monospace">${s}</text>
        </svg>
        <span class="score-tag ${s >= 60 ? "pass" : "fail"}">${s >= 60 ? "✓ 及格（60）" : "✗ 未及格（60）"} · 目标 70 · 冲刺 80</span>
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
              <summary style="cursor:pointer;font-size:13px">${esc(chName(BYID[id].ch))} · ${esc(BYID[id].q.slice(0, 42))}…</summary>
              <p style="font-size:12.5px;color:var(--muted);margin-top:8px;line-height:1.8">正确答案：${LET[BYID[id].ans]}。${esc(BYID[id].exp)}</p>
            </details>` : "").join("") || '<p class="summary-text">全对，无错题 🎊</p>'}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin-top:20px">
      <button class="btn btn-primary" id="exAgain">再考一次</button>
      <a class="btn btn-ghost" href="#/quiz">去刷错题 →</a>
    </div>`;
  $("#exAgain").addEventListener("click", () => { EX = null; router(); });
}

/* ============================================================
   视图：资源库
   ============================================================ */
let curCat = "all";
function vResources(view) {
  const R = window.RESOURCES;
  const all = [];
  R.cats.forEach((c) => c.items.forEach((it) => all.push({ ...it, cat: c.name })));
  const shown = curCat === "all" ? all : all.filter((it) => it.catId === curCat);
  const stCount = [0, 0, 0];
  all.forEach((it) => stCount[S.resStatus[it.id] || 0]++);
  view.innerHTML = `
    <div class="disk-card" style="margin-bottom:18px">
      <h3>▤ 私有资料库 · 学习进度纳管</h3>
      <p style="color:var(--muted);font-size:13.5px;line-height:1.8">本页对学习资料进行分级纳管与进度跟踪：<b style="color:var(--txt)">S 级必学核心 → A 级重要补充 → B/C 级拓展视野</b>，无关文件已自动过滤。
      资料来源为私有渠道，为保护数据隐私，平台不展示、不记录任何来源信息。</p>
      <div class="disk-meta">
        <span class="chip mono">纳管条目 ${all.length} 项</span>
        <span class="chip mono">总进度 未开始 ${stCount[0]} · 学习中 ${stCount[1]} · 已完成 ${stCount[2]}</span>
      </div>
      <p class="res-path" style="margin-top:8px">🔒 隐私说明：资料清单与学习进度仅存于浏览器本地，不上传任何服务器。</p>
    </div>
    <div class="res-cats">
      <button class="res-cat ${curCat === "all" ? "active" : ""}" data-cat="all">全部（${all.length}）</button>
      ${R.cats.map((c) => `<button class="res-cat ${curCat === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}（${c.items.length}）</button>`).join("")}
    </div>
    <div class="res-list">
      ${shown.map((it) => {
        const st = S.resStatus[it.id] || 0;
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
    S.resStatus[id] = ((S.resStatus[id] || 0) + 1) % 3;
    save(); router();
  }));
}

/* ============================================================
   视图：备考攻略
   ============================================================ */
function vTips(view) {
  const T = window.TIPS;
  view.innerHTML = `
    <div class="grid-2" style="margin-bottom:18px">
      <div class="card">
        <h3 class="card-title">考试速览</h3>
        <table class="table">
          ${T.examFacts.map((f) => `<tr><td style="color:var(--muted)">${esc(f[0])}</td><td><b>${esc(f[1])}</b></td></tr>`).join("")}
        </table>
      </div>
      <div class="card">
        <h3 class="card-title">答题策略</h3>
        <ul class="point-list">${T.strategy.map((s) => `<li>${s}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <h3 class="card-title">高分记忆法</h3>
      <div class="tip-grid">
        ${T.memory.map((m, i) => `<div class="tip-card"><span class="tip-num">MEMO-${String(i + 1).padStart(2, "0")}</span><h4>${esc(m[0])}</h4><p>${esc(m[1])}</p></div>`).join("")}
      </div>
    </div>
    <div class="card">
      <h3 class="card-title">平台形态选型：网页版 vs 小程序（费用对比）</h3>
      <p class="summary-text" style="margin-bottom:14px">很多人关心"做成小程序要花多少钱"，直接给你结论：<b style="color:var(--txt)">当前网页版（本平台）部署在 GitHub Pages 完全 0 成本</b>；若未来要做微信小程序，费用如下：</p>
      <table class="table">
        <tr><th>项目</th><th>网页版（本平台）</th><th>微信小程序</th></tr>
        ${T.miniappCost.map((r) => `<tr><td>${esc(r[0])}</td><td style="color:var(--green)">${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}
      </table>
      <div class="callout good" style="margin-top:14px"><span class="co-ico">💡</span><span><b>建议：</b>先用网页版跑通全部学习闭环（0 成本）。若确有小程序需求，个人主体可免费注册（刷题/展示类功能够用）；如需企业认证（¥300/年）+ 备案域名服务器（约 ¥100-300/年），可基于本平台代码用 uni-app/Taro 低成本改造。</span></div>
    </div>`;
}

/* ---------------- 🔐 登录门禁（加密保险库） ---------------- */
const GATE_KEY = "cdmp_unlock_key"; // 勾选"记住此设备"时保存派生密钥（仅存本机）
function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function bufToB64(buf) { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
async function deriveBitsFromPass(pass) {
  const V = window.CDMP_VAULT;
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64ToBuf(V.salt), iterations: V.iterations || 310000, hash: "SHA-256" }, baseKey, 256);
}
async function decryptWithBits(bits) {
  const V = window.CDMP_VAULT;
  const key = await crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(V.iv) }, key, b64ToBuf(V.ct));
  const text = new TextDecoder().decode(plain);
  new Function(text)(); // 解密结果即各 data/*.js 的全局定义（同源自有内容）
}
function boot() {
  initData();
  window.addEventListener("hashchange", router);
  router();
  renderFoot();
}
function renderGate(errMsg) {
  $("#modalRoot").innerHTML = `
  <div class="modal-mask">
    <div class="gate-card ${errMsg ? "shake" : ""}">
      <div class="gate-logo">
        <svg viewBox="0 0 64 64" width="30" height="30"><defs><linearGradient id="glg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="32" cy="32" r="27" fill="none" stroke="url(#glg)" stroke-width="5"/><circle cx="32" cy="32" r="7" fill="url(#glg)"/><path d="M32 9v11M32 44v11M9 32h11M44 32h11" stroke="url(#glg)" stroke-width="5" stroke-linecap="round"/></svg>
        <strong>CDMP MASTER</strong>
      </div>
      <h2>私有学习平台</h2>
      <p class="gate-sub">内容已端到端加密，请输入访问密码解锁</p>
      <input type="password" id="gatePwd" class="input" placeholder="访 问 密 码" autocomplete="current-password">
      <label class="gate-remember"><input type="checkbox" id="gateRemember" checked> 记住此设备，下次免输入</label>
      <button class="btn btn-primary" id="gateBtn">🔓 解锁平台</button>
      <div class="gate-err" id="gateErr">${errMsg ? esc(errMsg) : ""}</div>
      <p class="gate-hint">🔒 密码仅用于在本地解密内容，不会发送到任何服务器</p>
    </div>
  </div>`;
  const doUnlock = async () => {
    const pwd = $("#gatePwd").value;
    if (!pwd) { $("#gateErr").textContent = "请输入访问密码"; return; }
    const btn = $("#gateBtn");
    btn.disabled = true; btn.textContent = "🔓 解锁中…";
    try {
      const bits = await deriveBitsFromPass(pwd);
      await decryptWithBits(bits);
      if ($("#gateRemember").checked) localStorage.setItem(GATE_KEY, bufToB64(bits));
      $("#modalRoot").innerHTML = "";
      boot();
    } catch (e) {
      renderGate("密码不正确，请重试");
    }
  };
  $("#gateBtn").addEventListener("click", doUnlock);
  $("#gatePwd").addEventListener("keydown", (e) => { if (e.key === "Enter") doUnlock(); });
  $("#gatePwd").focus();
}
(async function start() {
  if (!window.CDMP_VAULT || !window.CDMP_VAULT.ct) { boot(); return; } // 开发模式：无保险库直接启动
  const saved = localStorage.getItem(GATE_KEY);
  if (saved) {
    try { await decryptWithBits(b64ToBuf(saved)); boot(); return; }
    catch (e) { localStorage.removeItem(GATE_KEY); }
  }
  renderGate();
})();
