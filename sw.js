/* LearnOS Service Worker — PWA 离线学习
   策略：导航/保险库 → 网络优先（保证更新及时），样式/脚本 → 网络优先，其余同源静态 → 缓存优先；
   /api/* 永不缓存。 */
const VER = "learnos-v3.5-navigation";
const PRECACHE = [
  "./", "./index.html", "./css/style.css?v=apple-20261112",
  "./js/core.js", "./js/navigation.js?v=nav-20261112", "./js/crypto.js", "./js/cloud.js", "./js/app.js?v=nav-20261112",
  "./data/vault.js", "./manifest.webmanifest", "./icon.svg",
  "./icon-180.png", "./icon-192.png", "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VER)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  /* 导航、保险库与界面资源：网络优先，离线回退缓存 */
  if (e.request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("vault.js") || /\.(css|js)$/.test(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VER).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())))
    );
    return;
  }
  /* 其余静态资源：stale-while-revalidate（立即响应缓存，后台刷新，保证下次打开是新版） */
  e.respondWith(
    caches.match(e.request).then((r) => {
      const net = fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VER).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => r);
      return r || net;
    })
  );
});
