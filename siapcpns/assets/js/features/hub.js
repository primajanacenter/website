/**
 * hub.js — komponen bersama tampilan Fase 13 (menu kotak A–F).
 *
 * - ICON: ikon garis sederhana (SVG) untuk menu & navigasi.
 * - initBottomNav(): navigasi bawah di HP (Beranda · Tryout · Materi · Rapot · Akun).
 * - buy(): beli produk satuan lewat Mayar (harga selalu dari server).
 * - premiumSheet(): pop-up langganan Premium (Paket Materi & Paket Latihan Soal).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store } from "../core/store.js";
import { $, esc, setBusy, toast } from "../core/ui.js";

const sv = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  tryout: sv('<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="m9 12 2 2 4-4"/><path d="M9 17h6"/>'),
  materi: sv('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z"/><path d="M8 7.5h8M8 11h6"/>'),
  latihan: sv('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="m18.5 5.5 2-2M17 3.5h3.5V7"/>'),
  mentoring: sv('<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/>'),
  konsultasi: sv('<path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.5A7.5 7.5 0 1 1 20 12z"/><path d="M9 11h.01M12.5 11h.01M16 11h.01"/>'),
  rapot: sv('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  home: sv('<path d="m3 11 9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>'),
  lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  trophy: sv('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
  play: sv('<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>'),
  star: sv('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
};

const PREFIX = () => (location.pathname.includes("/pages/") ? "" : "pages/");
const HOME = () => (location.pathname.includes("/pages/") ? "../" : "./");

export const rupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
export const fmtDay = (iso) => new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(":", ".");
export const fmtDT = (iso) => `${fmtDay(iso)}, ${fmtTime(iso)} WIB`;

/** Kotak kalender kecil: JUM / 13 */
export function calBox(iso) {
  const d = new Date(iso);
  const wd = d.toLocaleDateString("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" });
  const dd = d.toLocaleDateString("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" });
  const mm = d.toLocaleDateString("id-ID", { month: "short", timeZone: "Asia/Jakarta" });
  return `<div class="cal" aria-hidden="true"><span>${esc(wd)}</span><b>${esc(dd)}</b><span style="background:none;color:var(--muted)">${esc(mm)}</span></div>`;
}

/** Navigasi bawah (hanya tampil di layar kecil). */
export function initBottomNav(active) {
  if (document.querySelector(".bottom-nav")) return;
  const p = PREFIX();
  const items = [
    ["home", HOME(), "Beranda", ICON.home],
    ["tryout", p + "tryout.html", "Tryout", ICON.tryout],
    ["materi", p + "materi.html", "Materi", ICON.materi],
    ["rapot", p + "rapot.html", "Rapot", ICON.rapot],
    ["akun", p + "akun.html", "Akun", ICON.user],
  ];
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Menu utama");
  nav.innerHTML = items.map(([k, href, label, ic]) => `<a href="${href}" ${k === active ? 'aria-current="page"' : ""}>${ic}<span>${label}</span></a>`).join("");
  document.body.appendChild(nav);
  document.body.classList.add("has-bn");
}

/** Arahkan ke halaman masuk lalu kembali ke halaman ini. */
export function goLogin(next) {
  const here = next || location.pathname.split("/").pop() + location.search + location.hash;
  location.href = `${PREFIX()}masuk.html?next=${encodeURIComponent(here || "../")}`;
}

/**
 * Beli produk satuan: kind = tryout | akbar | live | rec | consult.
 * Harga & ketersediaan diperiksa server; browser hanya mengirim jenis & ID produk.
 */
export async function buy(kind, refId, btn) {
  if (!auth.isLoggedIn()) return goLogin();
  if (btn) setBusy(btn, true, "Menyiapkan pembayaran…");
  const res = await api.call("createCheckout", { kind, refId });
  if (btn) setBusy(btn, false);
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return goLogin();
    toast(res.error.message, 4500);
    return null;
  }
  store.set("pay.pending", { trxId: res.data.trxId, at: Date.now() });
  location.href = res.data.paymentUrl;
  return res.data;
}

let plansCache = null;
/** Pop-up langganan Premium. */
export async function premiumSheet(opts = {}) {
  let el = $("#premium-sheet");
  if (!el) {
    el = document.createElement("div");
    el.id = "premium-sheet";
    el.className = "sheet";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "ps-h");
    document.body.appendChild(el);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  }
  const close = () => { el.hidden = true; };
  el.innerHTML = `<div class="box"><div class="row" style="align-items:center"><span class="lock">${ICON.lock}</span><button class="x" type="button" aria-label="Tutup">×</button></div>
    <h3 id="ps-h">${esc(opts.title || "Buka dengan Premium")}</h3>
    <p class="small muted">${esc(opts.text || "Judul ini khusus pelanggan Premium.")} Satu langganan membuka <b>semua materi dan latihan soal TWK, TIU, dan TKP</b> di Paket Materi dan Paket Latihan Soal per Materi.</p>
    <div class="plans3" id="ps-plans"><div class="skeleton" style="height:56px"></div><div class="skeleton" style="height:56px"></div><div class="skeleton" style="height:56px"></div></div>
    <ul class="incl"><li>21 topik materi lengkap + contoh soal mudah, sedang, sulit</li><li>50 soal latihan HOTS per topik dengan pembahasan</li><li>Bayar sekali sesuai durasi, tanpa perpanjangan otomatis</li></ul>
    <button class="btn btn-accent btn-block" type="button" id="ps-buy" disabled>Pilih paket</button>
    <p class="xsmall muted">Harga di atas berlaku untuk semua materi TWK, TIU, dan TKP pada Paket Materi dan Paket Latihan Soal per Materi. Paket Tryout, Mentoring, dan Konsultasi dibeli terpisah.</p></div>`;
  el.hidden = false;
  el.querySelector(".x").addEventListener("click", close);
  if (!plansCache) {
    const r = await api.call("getPlans");
    plansCache = r.ok ? r.data : { plans: [] };
  }
  const plans = plansCache.plans || [];
  let pick = (plans.find((p) => p.badge) || plans[0] || {}).planId;
  const box = el.querySelector("#ps-plans");
  const btn = el.querySelector("#ps-buy");
  const draw = () => {
    box.innerHTML = plans.length
      ? plans.map((p) => {
          const pay = p.refPrice || p.price;
          return `<button type="button" class="plan-opt" data-plan="${esc(p.planId)}" aria-pressed="${p.planId === pick}">
            <span><b>${esc(p.name)}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}</b><small>${p.durationDays} hari akses</small></span>
            <span class="pp">${p.priceBefore && p.priceBefore > pay ? `<s>${rupiah(p.priceBefore)}</s>` : ""}<b>${rupiah(pay)}</b></span></button>`;
        }).join("")
      : `<p class="muted small">Paket belum tersedia. Coba lagi nanti.</p>`;
    box.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => { pick = b.dataset.plan; draw(); }));
    const sel = plans.find((p) => p.planId === pick);
    btn.disabled = !sel || plansCache.env === "off";
    btn.textContent = sel ? `Langganan ${sel.name.replace(/^Premium /, "")} · ${rupiah(sel.refPrice || sel.price)}` : "Pilih paket";
  };
  draw();
  btn.onclick = async () => {
    if (!auth.isLoggedIn()) return goLogin();
    setBusy(btn, true, "Menyiapkan pembayaran…");
    const res = await api.call("createCheckout", { planId: pick });
    setBusy(btn, false);
    if (!res.ok) {
      if (res.error.code === "UNAUTHENTICATED") return goLogin();
      return toast(res.error.message, 4500);
    }
    store.set("pay.pending", { trxId: res.data.trxId, at: Date.now() });
    location.href = res.data.paymentUrl;
  };
}

/** Tampilkan pesan kesalahan standar; kembalikan true bila sudah ditangani (mis. perlu login). */
export function handleCommonError(err, statusEl) {
  if (err.code === "UNAUTHENTICATED") { goLogin(); return true; }
  if (err.code === "PREMIUM_REQUIRED") { premiumSheet({ text: err.message }); return true; }
  if (statusEl) { statusEl.hidden = false; statusEl.classList.add("error"); statusEl.textContent = err.message; }
  else toast(err.message, 4500);
  return false;
}

export function emptyBox(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
