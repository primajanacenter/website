/**
 * sw.js — Service worker Siap CPNS (Fase 10).
 *
 * Strategi (aman untuk repo statis yang sering diperbarui):
 *  - Halaman, CSS, JS, JSON milik situs : NETWORK-FIRST → bila gagal (offline) pakai salinan cache.
 *    Jadi pengguna selalu mendapat versi terbaru saat online, dan tetap bisa membuka halaman saat sinyal putus.
 *  - Gambar & font (termasuk Google Fonts) : CACHE-FIRST, diperbarui di latar belakang.
 *  - Permintaan ke backend (Apps Script), login Google, Mayar, dan semua POST : TIDAK disentuh.
 *  - Navigasi offline yang belum pernah dibuka → offline.html.
 *
 * Saat merilis perubahan besar, naikkan CACHE_VERSION agar cache lama dibersihkan.
 */
const CACHE_VERSION = "sc-v10.2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const NETWORK_TIMEOUT_MS = 6000;

// Dipra-muat saat instal: kerangka aplikasi + bahan baca yang berguna saat offline.
const PRECACHE = [
  "./", "index.html", "offline.html", "manifest.webmanifest",
  "assets/css/base.css", "assets/css/components.css", "assets/css/cat.css",
  "assets/css/pages/app.css", "assets/css/pages/landing.css", "assets/css/pages/belajar.css",
  "assets/js/core/config.js", "assets/js/core/api.js", "assets/js/core/auth.js", "assets/js/core/store.js", "assets/js/core/ui.js",
  "assets/js/features/plan.js", "assets/js/features/materi.js", "assets/js/features/panduan.js", "assets/js/features/dashboard.js",
  "assets/js/features/rencana.js", "assets/js/features/reminder-local.js", "assets/js/features/pengaturan.js",
  "assets/data/materi-level1.json",
  "assets/img/primajana-mark-96.png", "assets/img/primajana-logo-112.png", "assets/img/icon-192.png", "assets/img/favicon-32.png",
  "pages/dashboard.html", "pages/materi.html", "pages/panduan.html", "pages/pengaturan.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // satu berkas gagal tidak boleh menggagalkan instalasi
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("sc-") && !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isFont = (url) => url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !isFont(url)) return; // backend, login Google, Mayar, CDN lain: lewati

  if (isFont(url) || /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, true));
    return;
  }
  event.respondWith(networkFirst(req, false));
});

async function networkFirst(req, isPage) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res && res.ok && res.type === "basic") cache.put(stripQuery(req), res.clone());
    return res;
  } catch (e) {
    const hit = (await caches.match(req)) || (await caches.match(stripQuery(req)));
    if (hit) return hit;
    if (isPage) return (await caches.match("offline.html")) || new Response("Offline", { status: 503 });
    return new Response("", { status: 504, statusText: "offline" });
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  const refresh = fetch(req).then(async (res) => {
    if (res && (res.ok || res.type === "opaque")) (await caches.open(RUNTIME_CACHE)).put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || new Response("", { status: 504 });
}

/** Simpan halaman tanpa query (?ref=, ?source=pwa) agar salinan offline tetap ketemu. Query halaman materi/rapor dipertahankan. */
function stripQuery(req) {
  const url = new URL(req.url);
  if (!url.search || /materi\.html|rapor\.html|status-bayar\.html/.test(url.pathname)) return req;
  url.search = "";
  return new Request(url.toString());
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/* ------------------------------------------------------------------ */
/* Fase 10.1: pengingat di perangkat (tanpa server, tanpa email)        */
/* Pengaturan dibaca dari Cache Storage "scl-prefs" yang ditulis        */
/* assets/js/features/reminder-local.js. Logika = dueReminder() di sana. */
/* ------------------------------------------------------------------ */
const PREFS_CACHE = "scl-prefs";
const PREFS_PATH = "__reminder-prefs.json";

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "sc-reminder") event.waitUntil(checkLocalReminder());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && "focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});

async function checkLocalReminder() {
  const cache = await caches.open(PREFS_CACHE);
  const key = new URL(PREFS_PATH, self.registration.scope).href;
  const res = await cache.match(key);
  if (!res) return;
  const p = await res.json();
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const today = local.toISOString().slice(0, 10);
  const hm = local.toISOString().slice(11, 16);
  const shown = p.shown || {};
  let r = null;
  if (p.daily && p.time && hm >= p.time && p.lastPractice !== today && shown.daily !== today) {
    r = { kind: "daily", key: today, title: "Waktunya latihan hari ini", body: "Cukup 10 soal dan satu materi. Latihan kecil setiap hari lebih efektif.", url: "pages/latihan.html" };
  } else if (p.akbar && p.akbarEvent && shown.akbar !== p.akbarEvent.eventId) {
    const open = Date.parse(p.akbarEvent.opensAt), last = Date.parse(p.akbarEvent.lastStartAt), t = now.getTime();
    if (t >= open - 11 * 3600e3 && t < last) {
      r = { kind: "akbar", key: p.akbarEvent.eventId, title: t < open ? `${p.akbarEvent.title} dibuka besok pagi` : `${p.akbarEvent.title} sedang berlangsung`,
        body: "Gratis, 110 soal, peringkat nasional terbit Senin pagi.", url: "pages/akbar.html" };
    }
  }
  if (!r) return;
  const scope = self.registration.scope;
  await self.registration.showNotification(r.title, { body: r.body, icon: scope + "assets/img/icon-192.png", badge: scope + "assets/img/favicon-64.png", tag: "sc-" + r.kind, data: { url: scope + r.url } });
  p.shown = { ...shown, [r.kind]: r.key };
  await cache.put(key, new Response(JSON.stringify(p), { headers: { "content-type": "application/json" } }));
}
