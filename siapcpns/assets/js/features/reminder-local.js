/**
 * reminder-local.js — Pengingat di perangkat (Fase 10.1), GRATIS untuk semua pengguna.
 *
 * Semua pengaturan & status disimpan di perangkat pengguna (localStorage), TIDAK dikirim ke server
 * dan tidak memakai email. Salinannya juga ditaruh di Cache Storage ("scl-prefs") agar service worker
 * bisa membacanya untuk notifikasi saat aplikasi tertutup.
 *
 * Cara pengingat muncul (dari yang paling andal):
 *  1. Kartu pengingat di dalam aplikasi saat dibuka setelah jam pengingat (semua browser, termasuk iPhone).
 *  2. Notifikasi sistem saat aplikasi/tab masih terbuka di latar belakang (butuh izin notifikasi).
 *  3. Notifikasi saat aplikasi tertutup lewat Periodic Background Sync — hanya Chrome/Edge di Android/desktop
 *     untuk aplikasi yang sudah dipasang; jadwalnya ditentukan browser (bisa terlambat beberapa jam).
 */

import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { $, esc } from "../core/ui.js";

const KEY = "reminder.local";
const PREFS_CACHE = "scl-prefs";
const PREFS_URL = new URL("../../../__reminder-prefs.json", import.meta.url).href;
const ROOT = new URL("../../../", import.meta.url).href;
const SYNC_TAG = "sc-reminder";

const DEFAULTS = { daily: false, time: "19:30", akbar: false, lastPractice: "", shown: { daily: "", akbar: "" }, akbarEvent: null };

export function todayLocal(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function getPrefs() {
  const p = store.get(KEY, {}) || {};
  return { ...DEFAULTS, ...p, shown: { ...DEFAULTS.shown, ...(p.shown || {}) } };
}

/** Simpan & salin ke Cache Storage untuk service worker. */
export async function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  store.set(KEY, next);
  await mirror(next);
  return next;
}

async function mirror(p) {
  try {
    if (!("caches" in window)) return;
    const c = await caches.open(PREFS_CACHE);
    await c.put(PREFS_URL, new Response(JSON.stringify({ ...p, root: ROOT }), { headers: { "content-type": "application/json" } }));
  } catch { /* abaikan */ }
}

/** Gabungkan status "sudah ditampilkan" yang mungkin ditulis service worker. */
async function mergeFromWorker() {
  try {
    if (!("caches" in window)) return getPrefs();
    const res = await (await caches.open(PREFS_CACHE)).match(PREFS_URL);
    if (!res) return getPrefs();
    const w = await res.json();
    const p = getPrefs();
    const newer = (a, b) => (String(a || "") > String(b || "") ? a : b);
    p.shown = { daily: newer(p.shown.daily, w.shown?.daily), akbar: p.shown.akbar || w.shown?.akbar || "" };
    store.set(KEY, p);
    return p;
  } catch {
    return getPrefs();
  }
}

/** Dipanggil saat pengguna menjawab soal latihan / beranda melihat sudah latihan hari ini. */
export function markPracticed() {
  const p = getPrefs();
  const t = todayLocal();
  if (p.lastPractice === t) return;
  setPrefs({ lastPractice: t });
}

/** Simpan jadwal Tryout Akbar terdekat (dari getAkbarInfo). */
export function rememberAkbar(info) {
  const ev = info && (info.current && info.current.state !== "published" ? info.current : (info.next || [])[0]);
  if (!ev) return;
  const p = getPrefs();
  const lastStart = ev.lastStartAt || new Date(Date.parse(ev.closesAt) - 100 * 60000).toISOString();
  setPrefs({ akbarEvent: { eventId: ev.eventId, title: ev.title || "Tryout Akbar", opensAt: ev.opensAt, lastStartAt: lastStart, fetchedAt: Date.now() }, shown: p.shown });
}

/** Pengingat yang jatuh tempo sekarang (null bila tidak ada). Logika sama dengan sw.js. */
export function dueReminder(p, now = new Date()) {
  const today = todayLocal(now);
  if (p.daily && p.time && hhmm(now) >= p.time && p.lastPractice !== today && p.shown.daily !== today) {
    return { kind: "daily", key: today, title: "Waktunya latihan hari ini", body: "Cukup 10 soal dan satu materi. Latihan kecil setiap hari lebih efektif.", url: "pages/latihan.html", cta: "Mulai latihan" };
  }
  const ev = p.akbarEvent;
  if (p.akbar && ev && p.shown.akbar !== ev.eventId) {
    const open = Date.parse(ev.opensAt), last = Date.parse(ev.lastStartAt), t = now.getTime();
    if (t >= open - 11 * 3600e3 && t < last) {
      const jam = new Date(open).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
      const before = t < open;
      return { kind: "akbar", key: ev.eventId, title: before ? `${ev.title} dibuka besok ${jam} WIB` : `${ev.title} sedang berlangsung`,
        body: before ? "Gratis, 110 soal, peringkat nasional terbit Senin pagi." : `Batas mulai pukul ${new Date(last).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.`,
        url: "pages/akbar.html", cta: before ? "Lihat jadwal" : "Ikut sekarang" };
    }
  }
  return null;
}

async function markShown(r) {
  const p = getPrefs();
  p.shown = { ...p.shown, [r.kind]: r.key };
  await setPrefs({ shown: p.shown });
}

/* ---------------- Tampilan ---------------- */
const SKIP_PAGES = { daily: /\/(latihan|masuk|onboarding)\.html$/, akbar: /\/(akbar|masuk|onboarding)\.html$/ };

function showBanner(r) {
  if (document.getElementById("rm-banner")) return;
  const el = document.createElement("div");
  el.id = "rm-banner";
  el.className = "rm-banner";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="txt"><b>🔔 ${esc(r.title)}</b><span>${esc(r.body)}</span></div>
    <div class="act"><a class="btn btn-accent" href="${esc(ROOT + r.url)}">${esc(r.cta)}</a><button class="btn btn-ghost" type="button" aria-label="Tutup pengingat">Nanti</button></div>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}

async function systemNotify(r) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: r.body, icon: ROOT + "assets/img/icon-192.png", badge: ROOT + "assets/img/favicon-64.png", tag: "sc-" + r.kind, data: { url: ROOT + r.url } };
    if (reg) await reg.showNotification(r.title, opts); else new Notification(r.title, opts);
    return true;
  } catch {
    return false;
  }
}

let timer = null;

/** Jalankan di setiap halaman (dipanggil dari hydrateCommon). */
export async function runLocalReminders() {
  let p = await mergeFromWorker();
  if (!p.daily && !p.akbar) return;
  await refreshAkbarIfStale(p);
  p = getPrefs();
  const r = dueReminder(p);
  if (r && !SKIP_PAGES[r.kind].test(location.pathname) && !document.querySelector("#view-exam:not([hidden])")) {
    if (document.visibilityState === "hidden") await systemNotify(r); else showBanner(r);
    await markShown(r);
  }
  scheduleWhileOpen();
}

/** Selama halaman terbuka: cek lagi tepat di jam pengingat (dan tiap 15 menit). */
function scheduleWhileOpen() {
  clearTimeout(timer);
  const p = getPrefs();
  let wait = 15 * 60000;
  if (p.daily && p.time) {
    const [h, m] = p.time.split(":").map(Number);
    const at = new Date(); at.setHours(h, m, 5, 0);
    const ms = at.getTime() - Date.now();
    if (ms > 0 && ms < wait) wait = ms;
  }
  timer = setTimeout(async () => {
    const r = dueReminder(getPrefs());
    if (r) {
      const sent = document.visibilityState === "hidden" ? await systemNotify(r) : false;
      if (!sent) showBanner(r);
      await markShown(r);
    }
    scheduleWhileOpen();
  }, wait);
}

async function refreshAkbarIfStale(p) {
  if (!p.akbar) return;
  const ev = p.akbarEvent;
  const stale = !ev || Date.now() - (ev.fetchedAt || 0) > 12 * 3600e3 || Date.now() > Date.parse(ev.lastStartAt);
  if (!stale) return;
  const res = await api.call("getAkbarInfo");
  if (res.ok) rememberAkbar(res.data);
}

/* ---------------- Izin & sinkron latar belakang ---------------- */
export function notificationStatus() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // default | granted | denied
}

export async function requestNotifications() {
  if (!("Notification" in window)) return "unsupported";
  const r = await Notification.requestPermission();
  if (r === "granted") await enableBackgroundSync();
  return r;
}

/** Daftarkan Periodic Background Sync bila didukung. Mengembalikan true/false. */
export async function enableBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !("periodicSync" in reg)) return false;
    const st = await navigator.permissions.query({ name: "periodic-background-sync" }).catch(() => ({ state: "denied" }));
    if (st.state !== "granted") return false;
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function backgroundSyncSupported() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg || !("periodicSync" in reg)) return false;
    const tags = await reg.periodicSync.getTags();
    return tags.includes(SYNC_TAG);
  } catch {
    return false;
  }
}

/** Uji: tampilkan contoh pengingat sekarang. */
export async function testReminder() {
  const r = { kind: "test", title: "Contoh pengingat Siap CPNS", body: "Pengingat akan tampil seperti ini.", url: "pages/latihan.html", cta: "Mulai latihan" };
  if (!(await systemNotify(r))) showBanner(r);
}
