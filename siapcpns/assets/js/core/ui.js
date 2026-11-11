/**
 * ui.js — helper tampilan kecil yang dipakai semua halaman.
 */

import { CONFIG } from "./config.js";
import { auth } from "./auth.js";
import { store, KEYS } from "./store.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape teks sebelum dimasukkan ke innerHTML. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Notifikasi singkat di bawah layar. */
export function toast(message, ms = 2600) {
  let root = $(".toast-root");
  if (!root) {
    root = document.createElement("div");
    root.className = "toast-root";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/** Salin teks ke clipboard, dengan cadangan untuk browser lama. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Isi nama aplikasi dan tahun di elemen dengan atribut data-app-name / data-year. */
export function hydrateCommon() {
  captureReferral();
  installErrorReporter();
  registerServiceWorker();
  watchConnection();
  startLocalReminders();
  $$("[data-app-name]").forEach((el) => (el.textContent = CONFIG.APP_NAME));
  $$("[data-org-name]").forEach((el) => (el.textContent = CONFIG.ORG_NAME));
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  $$("[data-link]").forEach((el) => {
    const url = CONFIG.OFFICIAL_LINKS[el.dataset.link];
    if (url) el.href = url;
  });
  // Tombol "Masuk" berubah menjadi "Beranda" untuk pengguna yang pernah login di perangkat ini.
  $$("[data-nav-auth]").forEach((el) => {
    if (auth.hasPreviousSession()) {
      el.textContent = el.dataset.navLabel || "Beranda";
      el.href = el.dataset.navAuth;
    }
  });
}

/** Tampilkan status memuat pada tombol. */
export function setBusy(button, busy, busyText = "Memproses…") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    if (button.dataset.label) button.textContent = button.dataset.label;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

/** Ambil parameter dari URL. */
export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

/** Hanya izinkan redirect ke halaman di dalam situs ini (cegah open redirect). */
export function safeNext(value, fallback) {
  if (!value) return fallback;
  return /^[a-z0-9-]+\.html(\?[\w=&%-]*)?$/i.test(value) ? value : fallback;
}

/** Format tanggal Indonesia, contoh: 7 November 2026 */
export function fmtDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Fase 8: simpan kode ajakan dari tautan ?ref=KODE (dipakai saat login, berlaku 30 hari). */
export function captureReferral() {
  try {
    const raw = new URLSearchParams(location.search).get("ref");
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6,12}$/.test(code)) store.set(KEYS.REF_CODE, { code, at: Date.now() });
  } catch { /* abaikan */ }
}

/** Kode ajakan tersimpan yang masih berlaku (≤ 30 hari), atau "". */
export function pendingReferral() {
  const r = store.get(KEYS.REF_CODE);
  if (!r || !r.code || Date.now() - (r.at || 0) > 30 * 864e5) return "";
  return r.code;
}

/**
 * Fase 9: kirim galat JavaScript halaman ke backend (sheet error_log) agar masalah di HP pengguna terlihat.
 * Hanya aktif saat terhubung ke backend sungguhan; maksimal 3 laporan per halaman; tanpa data pribadi.
 */
let reporterOn = false;
export function installErrorReporter() {
  if (reporterOn || CONFIG.USE_MOCK || !CONFIG.APPS_SCRIPT_URL) return;
  reporterOn = true;
  let sent = 0;
  const seen = new Set();
  const report = (message, source, line) => {
    const msg = String(message || "").slice(0, 300);
    if (!msg || sent >= 3 || seen.has(msg)) return;
    // abaikan galat dari ekstensi browser/skrip pihak ketiga & galat jaringan yang sudah ditangani
    if (source && !String(source).startsWith(location.origin)) return;
    if (/ResizeObserver loop|Script error\.?$|NetworkError|Failed to fetch|Load failed/i.test(msg)) return;
    seen.add(msg);
    sent++;
    import("./api.js")
      .then(({ api }) => api.call("logClientError", { message: msg, source: String(source || ""), line: line || 0, page: location.pathname, ua: navigator.userAgent.slice(0, 160), action: "" }))
      .catch(() => {});
  };
  window.addEventListener("error", (e) => report(e.message, e.filename, e.lineno));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    if (r && r.code) return; // galat API yang sudah berbentuk {code,message} ditangani halaman
    report(r && (r.stack || r.message) ? String(r.message || r) : String(r), location.href.split(/[?#]/)[0], 0);
  });
}

/* ------------------------------------------------------------------ */
/* Fase 10: aplikasi terpasang (PWA) & mode offline                     */
/* ------------------------------------------------------------------ */
const SITE_ROOT = new URL("../../../", import.meta.url);
let deferredInstall = null;
let swStarted = false;

/** Daftarkan service worker (hanya di https atau localhost). */
export function registerServiceWorker() {
  if (swStarted || !("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  swStarted = true;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", SITE_ROOT), { scope: SITE_ROOT.pathname }).catch(() => {});
  });
}

// Chrome/Edge/Android: simpan prompt pemasangan agar bisa dipicu dari tombol kita sendiri.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    document.dispatchEvent(new CustomEvent("sc:installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    store.set("pwa.installed", true);
    document.dispatchEvent(new CustomEvent("sc:installed"));
  });
}

export const pwa = {
  /** Sedang dibuka sebagai aplikasi terpasang? */
  isStandalone() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  },
  /** iPhone/iPad (Safari tidak punya tombol pasang otomatis; pakai Bagikan › Tambahkan ke Layar Utama). */
  isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  },
  canPrompt() {
    return Boolean(deferredInstall);
  },
  async prompt() {
    if (!deferredInstall) return "unavailable";
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferredInstall = null;
    return choice.outcome; // "accepted" | "dismissed"
  },
};

/** Tampilkan pita kecil saat koneksi terputus. */
export function watchConnection() {
  const show = () => {
    let bar = document.getElementById("offline-bar");
    if (navigator.onLine) { if (bar) bar.hidden = true; return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "offline-bar";
      bar.className = "offline-bar";
      bar.setAttribute("role", "status");
      bar.textContent = "Kamu sedang offline. Halaman yang pernah dibuka tetap bisa dilihat; latihan, tryout, dan pembayaran butuh internet.";
      document.body.prepend(bar);
    }
    bar.hidden = false;
  };
  window.addEventListener("online", show);
  window.addEventListener("offline", show);
  show();
}

/** Fase 10.1: pengingat di perangkat — modul dimuat hanya bila pengguna mengaktifkannya. */
export function startLocalReminders() {
  try {
    const p = store.get("reminder.local");
    if (!p || !(p.daily || p.akbar)) return;
    import("../features/reminder-local.js").then((m) => m.runLocalReminders()).catch(() => {});
  } catch { /* abaikan */ }
}

/* ------------------------------------------------------------------ */
/* Fase 11: soal bergambar (figural)                                    */
/* ------------------------------------------------------------------ */
/** Teks soal/opsi yang berupa gambar SVG (diawali "<svg"). */
export function isSvg(s) {
  return /^\s*<svg[\s>]/i.test(String(s || ""));
}

/**
 * Tampilkan SVG sebagai <img> data-URI. Di dalam <img>, browser TIDAK menjalankan skrip/tautan
 * apa pun di SVG, jadi aman walau isinya berasal dari sheet.
 */
export function svgImg(svg, alt = "Gambar soal", cls = "fig") {
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(String(svg).trim());
  return `<img class="${cls}" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

/** Teks biasa di-escape; SVG ditampilkan sebagai gambar. */
export function richText(s, alt) {
  return isSvg(s) ? svgImg(s, alt) : esc(s);
}

/** Isi elemen konteks soal: gambar (SVG) atau teks. */
export function setContext(el, ctx) {
  el.hidden = !ctx;
  el.classList.toggle("has-fig", isSvg(ctx));
  if (isSvg(ctx)) el.innerHTML = svgImg(ctx, "Gambar soal", "fig fig-ctx");
  else el.textContent = ctx || "";
}
