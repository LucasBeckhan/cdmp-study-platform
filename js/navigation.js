/* Pure navigation policy, shared by browser routing and regression tests. */
(function (global) {
  "use strict";
  const views = { home: "学习首页", plan: "学习计划", knowledge: "知识体系", flashcards: "闪卡记忆", quiz: "章节刷题", exam: "模拟考试", resources: "学习资料清单", tips: "备考攻略" };
  function resolve(hash, tracks, preferred) {
    const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const first = parts[0];
    if (!first || first === "hub") return { global: "hub" };
    if (first === "wrongbook") return { global: "wrongbook" };
    const fallback = tracks[preferred] ? preferred : Object.keys(tracks)[0];
    if (views[first]) return fallback ? { track: fallback, view: first, arg: parts[1] || "" } : { global: "hub", message: "暂无可用学习轨道" };
    if (!tracks[first]) return { global: "hub", message: "该学习轨道不存在，请重新选择" };
    if (parts[1] && !views[parts[1]]) return { track: first, view: "home", arg: "", message: "该页面不存在，已返回学习首页" };
    return { track: first, view: parts[1] || "home", arg: parts[2] || "" };
  }
  const api = { views, resolve };
  global.LearnOS = Object.assign({}, global.LearnOS, { navigation: api });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
