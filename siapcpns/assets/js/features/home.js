/**
 * home.js — Beranda (menu kotak A–H) untuk semua pengunjung (Fase 13–14).
 * Pengunjung tanpa login tetap melihat menu; login baru diminta saat membeli atau mengerjakan.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc } from "../core/ui.js";
import { ICON, initBottomNav, rupiah, fmtDT, fmtTime } from "./hub.js";

export async function initHome() {
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ""));
  initBottomNav("home");
  const user = auth.isLoggedIn() ? auth.getUser() : null;
  if (user) {
    const first = String(user.name || "").split(" ")[0] || "Pejuang NIP";
    $("#h-title").textContent = `Halo, ${first}!`;
    $("#h-sub").textContent = "Mau belajar apa hari ini?";
    const chip = $("#h-plan");
    chip.hidden = false;
    const skbOn = user.skbUntil && user.skbUntil >= new Date().toISOString().slice(0, 10);
    chip.textContent = user.plan === "premium" ? (skbOn ? "Premium + SKB aktif" : "Premium aktif") : skbOn ? "Premium SKB aktif" : "Akun gratis";
    if (user.plan === "premium" || skbOn) chip.classList.add("chip-accent");
  }

  const calls = [{ action: "getTryoutCatalog" }];
  if (user) calls.push({ action: "getMyItems" });
  const [cat, mine] = await api.batch(calls);
  if (cat && cat.ok) renderAkbar(cat.data.akbar);
  if (mine && mine.ok) renderTicket(mine.data);
}

function renderAkbar(a) {
  if (!a) return;
  const el = $("#h-akbar");
  el.hidden = false;
  const st = { upcoming: "dibuka", open: "sedang berlangsung, mulai sebelum", closing: "ditutup", scoring: "sedang dinilai" }[a.state] || "";
  $("#h-akbar-title").textContent = a.owned ? `${a.title} · tiketmu sudah aktif` : `${a.title} · tiket ${rupiah(a.price)}`;
  $("#h-akbar-sub").textContent =
    a.state === "upcoming" ? `${st} ${fmtDT(a.opensAt)} · peringkat nasional` :
    a.state === "open" ? `${st} ${fmtTime(a.lastStartAt)} WIB · ${a.questionCount} soal` : `Hasil & peringkat terbit ${fmtDT(a.resultsAt)}`;
}

function renderTicket(d) {
  const live = (d.live || []).find((x) => x.state !== "ended" && x.state !== "cancelled");
  const cons = (d.consults || []).find((x) => x.state !== "ended" && x.state !== "cancelled");
  const next = [live && { t: live.startsAt, title: `Live Mentoring: ${live.title}`, sub: live.canJoin ? "Tombol Gabung sudah aktif di menu Akun" : fmtDT(live.startsAt), href: "pages/akun.html#live" },
    cons && { t: cons.startsAt, title: "Konsultasi CPNS", sub: cons.chatOpen ? "Ruang chat sudah dibuka" : fmtDT(cons.startsAt), href: `pages/konsultasi.html?slot=${encodeURIComponent(cons.slotId)}` }]
    .filter(Boolean).sort((a, b) => (a.t < b.t ? -1 : 1))[0];
  if (!next) return;
  const el = $("#h-ticket");
  el.hidden = false;
  el.href = next.href;
  $("#h-ticket-title").textContent = next.title;
  $("#h-ticket-sub").textContent = next.sub;
  el.querySelector(".ic").innerHTML = next.title.startsWith("Konsul") ? ICON.konsultasi : ICON.mentoring;
}

export { esc };
