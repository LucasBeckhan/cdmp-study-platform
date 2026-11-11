/* ============================================================
   LearnOS · cloud.js — 云模式客户端（账号认证 + 进度云同步）
   可用性自动探测：GET /api/health（GitHub Pages 上 404 → 本地模式）。
   同步策略（PRD §8）：track 粒度 last-write-wins；错题/模考记录双向并集。
   ============================================================ */
(function (global) {
  "use strict";

  const cloud = {
    available: false,   // /api/health 探测结果
    base: "",           // API 前缀（同源部署为空串）
    session: null,      // 已登录邮箱
    status: "idle",     // idle | syncing | synced | error
    onStatus: null,     // 状态回调（用于顶栏指示器）

    setStatus(s) { this.status = s; if (typeof this.onStatus === "function") this.onStatus(s); },

    async detect(timeoutMs = 1500) {
      try {
        this.base = global.LEARNOS_API || "";
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(this.base + "/api/health", { signal: ctrl.signal, credentials: "include" });
        clearTimeout(t);
        const j = await res.json().catch(() => ({}));
        this.available = !!(res.ok && j && j.service === "learnos-api");
        return this.available;
      } catch (e) {
        this.available = false;
        return false;
      }
    },

    async json(method, path, body) {
      const res = await fetch(this.base + path, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "HTTP " + res.status);
        err.status = res.status; err.data = data;
        throw err;
      }
      return data;
    },

    async register(email, password) {
      const r = await this.json("POST", "/api/auth/register", { email, password });
      this.session = r.email;
      return r; // { email, contentPass }
    },
    async login(email, password) {
      const r = await this.json("POST", "/api/auth/login", { email, password });
      this.session = r.email;
      return r;
    },
    async me() {
      const r = await this.json("GET", "/api/me");
      this.session = r.email;
      return r;
    },
    async logout() {
      try { await this.json("POST", "/api/auth/logout"); } catch (e) { /* 忽略 */ }
      this.session = null;
      this.setStatus("idle");
    },

    async pullProgress() {
      const r = await this.json("GET", "/api/progress");
      return r.tracks || {};
    },

    /* 单轨推送：服务端较新时返回 { ok:false, newer }，由调用方合并 */
    async pushTrack(tid, payload, updatedAt) {
      return this.json("PUT", "/api/progress/" + encodeURIComponent(tid), { payload, updatedAt });
    },

    /* 全轨防抖推送（save() 触发） */
    _pt: null,
    queuePush(S) {
      if (!this.available || !this.session) return;
      clearTimeout(this._pt);
      this._pt = setTimeout(() => this.pushAll(S), 2500);
    },
    async pushAll(S) {
      if (!this.available || !this.session) return;
      this.setStatus("syncing");
      try {
        const tracks = (S && S.tracks) || {};
        for (const tid of Object.keys(tracks)) {
          const t = tracks[tid];
          if (!t.updatedAt) continue;
          const r = await this.pushTrack(tid, t, t.updatedAt);
          if (r && r.ok === false && r.newer && typeof this.onNewerTrack === "function") {
            this.onNewerTrack(tid, r.newer.payload, r.newer.updatedAt);
          }
        }
        this.setStatus("synced");
      } catch (e) {
        this.setStatus("error");
      }
    },

    /* 双向并集合并：胜者出标量，双方错题/模考记录取并集 */
    mergeTrack(local, remote, remoteWins, updatedAt) {
      const win = remoteWins ? remote : local;
      const other = remoteWins ? local : remote;
      const merged = Object.assign({}, win);
      merged.wrong = Array.from(new Set([].concat(local && local.wrong || [], remote && remote.wrong || [])));
      const seen = new Set();
      merged.exams = [];
      [].concat(local && local.exams || [], remote && remote.exams || []).forEach((e) => {
        const k = [e.date, e.count, e.right, e.score].join("|");
        if (!seen.has(k)) { seen.add(k); merged.exams.push(e); }
      });
      merged.updatedAt = updatedAt;
      return merged;
    },
  };

  global.LearnOS = Object.assign({}, global.LearnOS, { cloud });
  if (typeof module !== "undefined" && module.exports) module.exports = cloud;
})(typeof window !== "undefined" ? window : globalThis);
