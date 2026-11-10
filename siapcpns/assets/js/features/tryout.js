/**
 * tryout.js — Lobi tryout (Fase 3)
 *
 * Menampilkan paket tryout, status percobaan (sedang berjalan / selesai / kuota habis),
 * lalu menyerahkan ujian ke cat-engine.js.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, fmtDate, setBusy } from "../core/ui.js";
import { runExam } from "./cat-engine.js";

let packages = [];
let pending = null; // paket yang akan dimulai
let MODE = { type: "", page: "tryout.html" }; // Fase 8: skb.html memakai lobi yang sama dengan type "skb"

export async function initTryout(opts = {}) {
  MODE = { type: opts.type || "", page: opts.page || "tryout.html" };
  if (!auth.requireLogin("masuk.html")) return;

  $("#start-cancel").addEventListener("click", closeStart);
  $("#start-ready").addEventListener("change", (e) => ($("#start-ok").disabled = !e.target.checked));
  $("#start-ok").addEventListener("click", confirmStart);

  await loadInfo();
}

async function loadInfo() {
  const res = await api.call("getTryoutInfo", MODE.type ? { type: MODE.type } : {});
  if (!res.ok) return handleError(res.error, "#lobby-status");
  packages = res.data.packages;
  renderPackages(res.data);
}

function renderPackages(data) {
  const list = $("#pkg-list");
  if (!packages.length) {
    list.innerHTML = MODE.type === "skb"
      ? `<div class="card"><p class="muted">Paket tryout SKB belum dibuka. Sambil menunggu, pelajari panduan di bawah.</p></div>`
      : `<div class="card"><p class="muted">Belum ada paket tryout yang dibuka. Coba lagi nanti.</p></div>`;
    return;
  }
  list.innerHTML = packages
    .map((p) => {
      const last = p.attempts[0];
      const history = p.attempts.length
        ? `<div class="history"><span class="muted">Riwayat:</span>${p.attempts
            .slice(0, 3)
            .map((a) => `<a href="rapor.html?id=${encodeURIComponent(a.attemptId)}">Skor ${a.total}${p.type === "skb" ? "" : ` · ${a.passedAll ? "Lolos ambang batas" : "Belum lolos"}`} · ${fmtDate(a.submittedAt)}</a>`)
            .join("")}</div>`
        : "";
      let action;
      if (p.inProgress) {
        action = `<button class="btn btn-accent" data-start="${esc(p.packageId)}">Lanjutkan ujian</button>
                  <span class="xsmall muted" data-remaining="${esc(p.inProgress.endsAt)}"></span>`;
      } else if (!p.canStart && p.lockReason === "FREE_LIMIT") {
        action = `<span class="chip chip-warn">Kuota gratis sudah dipakai</span>
                  ${last ? `<a class="btn btn-secondary" href="rapor.html?id=${encodeURIComponent(last.attemptId)}">Lihat rapor</a>` : ""}
                  <a class="small" href="premium.html">Ulangi dengan Premium →</a>`;
      } else {
        action = `<button class="btn btn-primary" data-start="${esc(p.packageId)}">${p.attempts.length ? "Kerjakan lagi" : "Mulai tryout"}</button>
                  ${last ? `<a class="btn btn-secondary" href="rapor.html?id=${encodeURIComponent(last.attemptId)}">Rapor terakhir</a>` : ""}`;
      }
      const typeChip = p.type === "demo" ? `<span class="chip chip-accent">Demo</span>` : p.type === "diagnostic" ? `<span class="chip chip-primary">Diagnostik</span>` : p.type === "skb" ? `<span class="chip chip-primary">SKB</span>` : "";
      const pgRow = p.type === "skb" ? `<div class="meta"><span class="xsmall muted">Nilai SKB ditampilkan dalam skala 0–100. Benar 5, salah/kosong 0.</span></div>`
        : `<div class="meta"><span class="xsmall muted">Ambang batas:</span><span class="chip num">TWK ${p.pg.twk}</span><span class="chip num">TIU ${p.pg.tiu}</span><span class="chip num">TKP ${p.pg.tkp}</span></div>`;
      return `
      <article class="pkg ${p.inProgress ? "running" : ""}">
        <div class="stack" style="gap:10px">
          <div class="meta">${typeChip}<span class="chip num">${p.questionCount} soal</span><span class="chip num">${p.durationMin} menit</span></div>
          <h2>${esc(p.title)}</h2>
          ${p.description ? `<p class="small muted">${esc(p.description)}</p>` : ""}
          ${pgRow}
          ${history}
        </div>
        <div class="actions">${action}</div>
      </article>`;
    })
    .join("");

  list.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => askStart(b.dataset.start, b)));
  tickRemaining();
}

function tickRemaining() {
  const els = document.querySelectorAll("[data-remaining]");
  if (!els.length) return;
  els.forEach((el) => {
    const ms = Date.parse(el.dataset.remaining) - Date.now();
    el.textContent = ms > 0 ? `Sisa waktu ± ${Math.ceil(ms / 60000)} menit` : "Waktu habis, jawaban akan dinilai otomatis";
  });
  setTimeout(tickRemaining, 30000);
}

function askStart(packageId, button) {
  const p = packages.find((x) => x.packageId === packageId);
  if (!p) return;
  if (p.inProgress) return begin(packageId, button); // lanjutkan tanpa konfirmasi
  pending = { packageId, button };
  $("#start-title").textContent = `Mulai ${p.title}?`;
  $("#start-text").textContent = `${p.questionCount} soal dalam ${p.durationMin} menit. Waktu langsung berjalan setelah kamu menekan Mulai dan tidak bisa dijeda.`;
  $("#start-ready").checked = false;
  $("#start-ok").disabled = true;
  $("#start-modal").hidden = false;
}

function closeStart() {
  $("#start-modal").hidden = true;
  pending = null;
}

function confirmStart() {
  if (!pending) return;
  const { packageId, button } = pending;
  closeStart();
  begin(packageId, button);
}

async function begin(packageId, button) {
  setBusy(button, true, "Menyiapkan soal…");
  const res = await api.call("startAttempt", { packageId });
  setBusy(button, false);
  if (!res.ok) return handleError(res.error, "#lobby-status");

  $("#view-lobby").hidden = true;
  $("#view-exam").hidden = false;
  window.scrollTo(0, 0);
  runExam(res.data, {
    onSubmitted: (attemptId) => location.replace(`rapor.html?id=${encodeURIComponent(attemptId)}`),
  });
}

function handleError(error, sel) {
  if (error.code === "UNAUTHENTICATED") {
    location.replace(`masuk.html?next=${encodeURIComponent(MODE.page)}`);
    return;
  }
  const el = $(sel);
  el.hidden = false;
  el.classList.add("error");
  el.textContent = error.message;
}
