/* ============================================================
   LearnOS API · api.mjs — REST 路由（认证 / 进度同步）
   路由：
     GET  /api/health
     POST /api/auth/register  {email, password}
     POST /api/auth/login     {email, password}
     POST /api/auth/logout
     GET  /api/me
     GET  /api/progress
     PUT  /api/progress/:tid  {payload, updatedAt}   ← LWW：服务端较新时返回 newer
   安全：auth 路由按 IP 限流；会话令牌仅存哈希；HttpOnly Cookie。
   ============================================================ */
import { hashPassword, verifyPassword, newToken, hashToken, validEmail, passwordProblem } from "./auth.mjs";

const TID_RE = /^[a-z0-9_-]{1,40}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const SESSION_MS = 30 * 86400000;

export function createApi({ db, contentPass = null, rateMax = 30, rateWindowMs = 300000 }) {
  const users = db.load("users", {});
  const sessions = db.load("sessions", {});
  const progress = db.load("progress", {});
  const saveUsers = () => db.save("users", users);
  const saveSessions = () => db.save("sessions", sessions);
  const saveProgress = () => db.save("progress", progress);

  /* auth 路由限流（按 IP 滑动窗口） */
  const rate = new Map();
  const limited = (ip) => {
    const now = Date.now();
    const rec = rate.get(ip) || { n: 0, until: now + rateWindowMs };
    if (now > rec.until) { rec.n = 0; rec.until = now + rateWindowMs; }
    rec.n++; rate.set(ip, rec);
    return rec.n > rateMax;
  };

  const json = (res, code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };
  const parseCookies = (header) => {
    const out = {};
    String(header || "").split(";").forEach((kv) => {
      const i = kv.indexOf("=");
      if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    });
    return out;
  };
  const sessionOf = (req) => {
    const token = parseCookies(req.headers.cookie).learnos_session;
    if (!token) return null;
    const h = hashToken(token);
    const rec = sessions[h];
    if (!rec) return null;
    if (rec.exp < Date.now()) { delete sessions[h]; saveSessions(); return null; }
    return { email: rec.email, hash: h };
  };
  const setSession = (res, email) => {
    const token = newToken();
    sessions[hashToken(token)] = { email, exp: Date.now() + SESSION_MS };
    saveSessions();
    res.setHeader("Set-Cookie", `learnos_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`);
  };

  async function handle(req, res, url, body) {
    const p = url.pathname;
    const ip = req.socket.remoteAddress || "unknown";
    if (p === "/api/health") return json(res, 200, { ok: true, service: "learnos-api", version: "3.0.0" });

    if (p.startsWith("/api/auth/") && limited(ip)) {
      return json(res, 429, { error: "请求过于频繁，请稍后再试" });
    }

    /* ---------- 注册 ---------- */
    if (p === "/api/auth/register" && req.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!validEmail(email)) return json(res, 400, { error: "邮箱格式不正确" });
      const problem = passwordProblem(body.password);
      if (problem) return json(res, 400, { error: problem });
      if (users[email]) return json(res, 409, { error: "该邮箱已注册" });
      users[email] = { ...hashPassword(body.password), createdAt: new Date().toISOString() };
      saveUsers();
      setSession(res, email);
      return json(res, 200, { ok: true, email, contentPass });
    }

    /* ---------- 登录 ---------- */
    if (p === "/api/auth/login" && req.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      const rec = users[email];
      if (!rec || !verifyPassword(body.password, rec)) return json(res, 401, { error: "邮箱或密码不正确" });
      setSession(res, email);
      return json(res, 200, { ok: true, email, contentPass });
    }

    /* ---------- 登出 ---------- */
    if (p === "/api/auth/logout" && req.method === "POST") {
      const sess = sessionOf(req);
      if (sess) { delete sessions[sess.hash]; saveSessions(); }
      res.setHeader("Set-Cookie", "learnos_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
      return json(res, 200, { ok: true });
    }

    /* ---------- 需登录的路由 ---------- */
    const sess = sessionOf(req);
    if (!sess) return json(res, 401, { error: "未登录" });

    if (p === "/api/me" && req.method === "GET") {
      return json(res, 200, { email: sess.email, contentPass });
    }

    if (p === "/api/progress" && req.method === "GET") {
      return json(res, 200, { tracks: (progress[sess.email] || { tracks: {} }).tracks });
    }

    const mPut = p.match(/^\/api\/progress\/([a-z0-9_-]{1,40})$/i);
    if (mPut && req.method === "PUT") {
      const tid = mPut[1];
      const { payload, updatedAt } = body || {};
      if (!payload || typeof payload !== "object") return json(res, 400, { error: "payload 缺失" });
      if (typeof updatedAt !== "string" || !ISO_RE.test(updatedAt)) return json(res, 400, { error: "updatedAt 格式错误" });
      progress[sess.email] = progress[sess.email] || { tracks: {} };
      const rec = progress[sess.email].tracks[tid];
      if (rec && rec.updatedAt > updatedAt) {
        return json(res, 200, { ok: false, newer: rec }); // 服务端较新 → 客户端应采纳
      }
      progress[sess.email].tracks[tid] = { payload, updatedAt };
      saveProgress();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not found" });
  }

  return { handle };
}
