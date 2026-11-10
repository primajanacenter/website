/**
 * ajak.js — Ajak teman / referral (Fase 8)
 *
 * Pengajak: +7 hari Premium per teman yang membeli. Teman: diskon 10% pembelian pertama.
 * Semua aturan diterapkan di server; halaman ini hanya menampilkan dan membagikan kode.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { CONFIG } from "../core/config.js";
import { $, esc, fmtDate, copyText, toast, setBusy } from "../core/ui.js";

const STATUS = { joined: "Bergabung, belum membeli", rewarded: "Membeli · bonus +7 hari diterima", capped: "Membeli · batas bonus bulan ini tercapai", void: "Tidak memenuhi syarat" };

export async function initAjak() {
  if (!auth.requireLogin("masuk.html")) return;
  $("#rf-copy").addEventListener("click", copyLink);
  $("#rf-claim").addEventListener("submit", claim);
  await load();
}

async function load() {
  const res = await api.call("getReferral");
  if (!res.ok) return fail(res.error);
  render(res.data);
}

function shareLink(code) {
  const root = new URL("../", location.href).href; // root situs (index.html)
  return `${root}?ref=${encodeURIComponent(code)}`;
}

function render(d) {
  $("#rf-code").textContent = d.code;
  const link = shareLink(d.code);
  $("#rf-link").value = link;
  const msg = `Aku belajar persiapan CPNS di ${CONFIG.APP_NAME}. Pakai kode ${d.code} untuk diskon ${d.discountPct}% Premium pertamamu: ${link}`;
  $("#rf-wa").href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  $("#rf-invited").textContent = d.invited;
  $("#rf-purchased").textContent = d.purchased;
  $("#rf-bonus").textContent = `${d.bonusDaysEarned} hari`;
  $("#rf-recent").innerHTML = d.recent.length
    ? d.recent.map((r) => `<li><span>Teman · ${esc(fmtDate(r.joinedAt))}</span><span class="chip ${r.status === "rewarded" ? "chip-ok" : r.status === "joined" ? "" : "chip-warn"}">${esc(STATUS[r.status] || r.status)}</span></li>`).join("")
    : `<li class="muted small">Belum ada teman yang memakai kodemu.</li>`;
  $("#rf-claim-card").hidden = !d.canClaim;
  const mine = $("#rf-mine");
  if (d.myReferral) {
    mine.hidden = false;
    mine.innerHTML = d.myReferral.discountActive
      ? `<div><strong>Kode teman ${esc(d.myReferral.code)} aktif.</strong> Diskon ${d.discountPct}% otomatis berlaku saat kamu membeli Premium pertama. <a href="premium.html">Lihat harga →</a></div>`
      : `<div>Kamu bergabung lewat kode <strong>${esc(d.myReferral.code)}</strong>.</div>`;
  } else {
    mine.hidden = true;
  }
}

async function copyLink() {
  const ok = await copyText($("#rf-link").value);
  toast(ok ? "Tautan ajakan disalin." : "Gagal menyalin. Salin manual dari kolom tautan.");
}

async function claim(e) {
  e.preventDefault();
  const btn = $("#rf-claim-btn");
  const code = $("#rf-claim-code").value.trim();
  if (!code) return status("Isi kode ajakan.", true);
  setBusy(btn, true, "Memeriksa…");
  const res = await api.call("claimReferral", { code });
  setBusy(btn, false);
  if (!res.ok) return fail(res.error);
  status(`Kode dipakai. Diskon ${res.data.discountPct}% berlaku untuk pembelian Premium pertamamu.`);
  await load();
}

function fail(error) {
  if (error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("ajak.html")}`);
  status(error.message, true);
}

function status(msg, isError = false) {
  const el = $("#rf-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}
