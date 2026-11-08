/**
 * ui.js — helper tampilan kecil yang dipakai semua halaman.
 */

import { CONFIG } from "./config.js";
import { auth } from "./auth.js";

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
      el.textContent = "Beranda";
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
