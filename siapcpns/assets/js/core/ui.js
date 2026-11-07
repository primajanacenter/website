/**
 * ui.js — helper tampilan kecil yang dipakai semua halaman.
 */

import { CONFIG } from "./config.js";

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
}
