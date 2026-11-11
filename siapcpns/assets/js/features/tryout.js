/**
 * tryout.js — Menu A "Paket Tryout" (Fase 13) + lobi SKB (Fase 8).
 *
 * Urutan tampilan: 1) Tryout Akbar mingguan (tiket berbayar, peringkat nasional),
 * 2) Coba Paket Tryout (gratis, 15 soal), 3) paket tryout SKD berbayar (Rp10.000, bebas diulang).
 * Semua ujian memakai cat-engine.js: kerjakan semua soal, kirim, lalu rapor & pembahasan tampil.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, fmtDate, getParam, setBusy } from "../core/ui.js";
import { runExam } from "./cat-engine.js";
import { buy, goLogin, initBottomNav, rupiah, fmtDT, fmtTime, handleCommonError } from "./hub.js";

let packages = [];
let pending = null;
let MODE = { type: "", page: "tryout.html" };

export async function initTryout(opts = {}) {
  MODE = { type: opts.type || "", page: opts.page || "tryout.html" };
  $("#start-cancel").addEventListener("click", closeStart);
  $("#start-ready").addEventListener("change", (e) => ($("#start-ok").disabled = !e.target.checked));
  $("#start-ok").addEventListener("click", confirmStart);
  if (MODE.type === "skb") {
    if (!auth.requireLogin("masuk.html")) return;
    return loadSkb();
  }
  initBottomNav("tryout");
  await loadCatalog();
}

/* ======================= Menu A: katalog ======================= */
async function loadCatalog() {
  const res = await api.call("getTryoutCatalog", {}, { fresh: true });
  if (!res.ok) return handleError(res.error, "#lobby-status");
  const d = res.data;
  packages = [d.demo, ...d.packages].filter(Boolean);
  renderAkbar(d.akbar, d.loggedIn);
  renderDemo(d.demo);
  renderPaid(d.packages);
  const auto = getParam("paket");
  if (auto && packages.some((p) => p.packageId === auto && p.owned)) askStart(auto);
}

function renderAkbar(a) {
  const box = $("#t-akbar");
  if (!a) {
    box.innerHTML = `<div class="pcard"><h3>Jadwal Tryout Akbar berikutnya segera diumumkan</h3><p class="desc">Tryout Akbar diadakan setiap Minggu dengan peringkat nasional. Lihat hasil dan peringkat sebelumnya di halaman Tryout Akbar.</p><div class="foot"><a class="btn btn-secondary" href="akbar.html">Lihat peringkat</a></div></div>`;
    return;
  }
  let action;
  const done = a.my && a.my.status === "submitted";
  if (done) action = `<span class="chip chip-ok">Jawaban terkirim</span><span class="small">Hasil & peringkat terbit ${esc(fmtDT(a.resultsAt))}</span>`;
  else if (a.owned && a.state === "open") action = `<a class="btn btn-accent" href="akbar.html">${a.my ? "Lanjutkan Tryout Akbar" : "Mulai Tryout Akbar"}</a>`;
  else if (a.owned) action = `<span class="chip chip-ok">Tiket aktif</span><span class="small">${a.state === "upcoming" ? `Mulai bisa dikerjakan ${esc(fmtDT(a.opensAt))}` : "Pendaftaran sudah ditutup"}</span>`;
  else if (a.state === "upcoming" || a.state === "open") action = `<span class="price">${rupiah(a.price)} <small>/ tiket</small></span><button class="btn btn-accent" type="button" id="buy-akbar">Beli tiket</button>`;
  else action = `<span class="small">Pendaftaran ditutup · hasil terbit ${esc(fmtDT(a.resultsAt))}</span>`;
  const when = a.state === "open" ? `Sedang berlangsung · batas mulai ${fmtTime(a.lastStartAt)} WIB` : a.state === "upcoming" ? fmtDT(a.opensAt) : "Sedang dinilai";
  box.innerHTML = `<article class="akbar-hero">
    <div class="meta"><span class="chip">Peringkat nasional</span><span class="chip">${a.questionCount} soal</span><span class="chip">${a.durationMin} menit</span></div>
    <h3>${esc(a.title)}</h3>
    <p class="small">${esc(when)}. Satu kali pengerjaan per tiket; skor, rapor, dan peringkat terbit ${esc(fmtDT(a.resultsAt))}.</p>
    <div class="foot" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${action}</div>
  </article>`;
  $("#buy-akbar")?.addEventListener("click", (e) => buy("akbar", a.eventId, e.currentTarget));
}

function historyHtml(p) {
  if (!p.attempts || !p.attempts.length) return "";
  return `<div class="history-mini"><span class="xsmall muted">Hasil terakhir:</span>${p.attempts.slice(0, 3)
    .map((a) => `<a href="rapor.html?id=${encodeURIComponent(a.attemptId)}">Skor ${a.total} · ${a.passedAll ? "lolos ambang batas" : "belum lolos"} · ${esc(fmtDate(a.submittedAt))}</a>`).join("")}</div>`;
}

function renderDemo(p) {
  const box = $("#t-demo");
  if (!p) { box.innerHTML = `<div class="empty">Paket coba belum tersedia.</div>`; return; }
  box.innerHTML = `<article class="pcard hl">
    <div class="meta"><span class="free-tag">Gratis</span><span class="chip">${p.questionCount} soal</span><span class="chip">${p.durationMin} menit</span><span class="chip">5 TWK · 5 TIU · 5 TKP</span></div>
    <h3>${esc(p.title)}</h3>
    <p class="desc">Rasakan sistem CAT: jawab semua soal dulu, lalu kirim. Kunci jawaban dan pembahasan setiap soal langsung tampil.</p>
    ${historyHtml(p)}
    <div class="foot"><span></span>${p.inProgress ? `<button class="btn btn-accent" data-start="${esc(p.packageId)}">Lanjutkan</button>` : `<button class="btn btn-primary" data-start="${esc(p.packageId)}">${p.attempts.length ? "Coba lagi" : "Mulai coba"}</button>`}</div>
  </article>`;
  bindStart(box);
}

function renderPaid(list) {
  const box = $("#pkg-list");
  if (!list.length) { box.innerHTML = `<div class="empty">Paket tryout berbayar segera tersedia.</div>`; return; }
  box.innerHTML = list.map((p) => {
    let foot;
    if (p.inProgress) foot = `<span class="owned">✓ Dimiliki</span><button class="btn btn-accent" data-start="${esc(p.packageId)}">Lanjutkan</button>`;
    else if (p.owned) foot = `<span class="owned">✓ ${p.legacy ? "Termasuk Premium lamamu" : "Dimiliki"}</span><button class="btn btn-primary" data-start="${esc(p.packageId)}">${p.attempts.length ? "Kerjakan lagi" : "Mulai"}</button>`;
    else foot = `<span class="price">${rupiah(p.price)}</span><button class="btn btn-accent" data-buy="${esc(p.packageId)}">Beli paket</button>`;
    return `<article class="pcard">
      <div class="meta"><span class="chip">${p.questionCount} soal</span><span class="chip">${p.durationMin} menit</span>${p.type === "akbar" ? `<span class="chip chip-primary">Eks Tryout Akbar</span>` : ""}</div>
      <h3>${esc(p.title)}</h3>
      <p class="desc">${esc(p.description || "Format SKD terbaru termasuk soal figural. Rapor per topik & pembahasan semua soal.")}</p>
      ${historyHtml(p)}
      <div class="foot">${foot}</div>
    </article>`;
  }).join("");
  bindStart(box);
  box.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy("tryout", b.dataset.buy, b)));
}

function bindStart(root) {
  root.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () => askStart(b.dataset.start, b)));
}

/* ======================= Lobi SKB (Fase 8) ======================= */
async function loadSkb() {
  const res = await api.call("getTryoutInfo", { type: "skb" });
  if (!res.ok) return handleError(res.error, "#lobby-status");
  packages = res.data.packages;
  const list = $("#pkg-list");
  if (!packages.length) {
    list.innerHTML = `<div class="card"><p class="muted">Paket tryout SKB belum dibuka. Sambil menunggu, pelajari panduan di bawah.</p></div>`;
    return;
  }
  list.innerHTML = packages.map((p) => {
    const last = p.attempts[0];
    const history = p.attempts.length ? `<div class="history"><span class="muted">Riwayat:</span>${p.attempts.slice(0, 3).map((a) => `<a href="rapor.html?id=${encodeURIComponent(a.attemptId)}">Skor ${a.total} · ${fmtDate(a.submittedAt)}</a>`).join("")}</div>` : "";
    let action;
    if (p.inProgress) action = `<button class="btn btn-accent" data-start="${esc(p.packageId)}">Lanjutkan ujian</button>`;
    else if (!p.canStart && p.lockReason === "FREE_LIMIT") action = `<span class="chip chip-warn">Kuota sudah dipakai</span>${last ? `<a class="btn btn-secondary" href="rapor.html?id=${encodeURIComponent(last.attemptId)}">Lihat rapor</a>` : ""}`;
    else action = `<button class="btn btn-primary" data-start="${esc(p.packageId)}">${p.attempts.length ? "Kerjakan lagi" : "Mulai tryout"}</button>${last ? `<a class="btn btn-secondary" href="rapor.html?id=${encodeURIComponent(last.attemptId)}">Rapor terakhir</a>` : ""}`;
    return `<article class="pkg"><div class="stack" style="gap:10px"><div class="meta"><span class="chip chip-primary">SKB</span><span class="chip num">${p.questionCount} soal</span><span class="chip num">${p.durationMin} menit</span></div>
      <h2>${esc(p.title)}</h2>${p.description ? `<p class="small muted">${esc(p.description)}</p>` : ""}
      <div class="meta"><span class="xsmall muted">Nilai SKB ditampilkan dalam skala 0–100. Benar 5, salah/kosong 0.</span></div>${history}</div>
      <div class="actions">${action}</div></article>`;
  }).join("");
  bindStart(list);
}

/* ======================= Mulai ujian ======================= */
function askStart(packageId, button) {
  if (!auth.isLoggedIn()) return goLogin();
  const p = packages.find((x) => x.packageId === packageId);
  if (!p) return;
  if (p.inProgress) return begin(packageId, button);
  pending = { packageId, button };
  $("#start-title").textContent = `Mulai ${p.title}?`;
  $("#start-text").textContent = `${p.questionCount} soal dalam ${p.durationMin} menit. Waktu langsung berjalan setelah kamu menekan Mulai dan tidak bisa dijeda. Kunci jawaban & pembahasan tampil setelah jawaban dikirim.`;
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
  if (button) setBusy(button, true, "Menyiapkan soal…");
  const res = await api.call("startAttempt", { packageId });
  if (button) setBusy(button, false);
  if (!res.ok) {
    if (res.error.code === "PAYMENT_REQUIRED") return buy("tryout", packageId, button);
    return handleError(res.error, "#lobby-status");
  }
  $("#view-lobby").hidden = true;
  $("#view-exam").hidden = false;
  document.body.classList.add("exam-on");
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
  handleCommonError(error, $(sel));
}
