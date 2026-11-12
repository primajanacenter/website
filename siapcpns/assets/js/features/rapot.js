/**
 * rapot.js — Menu F "Cek Kesiapan & Rapot" (Fase 13): semua hasil di satu tempat.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate } from "../core/ui.js";
import { emptyBox, initBottomNav } from "./hub.js";

const LEVEL_LABEL = { "baru-mulai": "Baru mulai", "sedang-bersiap": "Sedang bersiap", "hampir-siap": "Hampir siap" };
const TYPE = { diagnostic: "Tryout", premium: "Tryout", tryout: "Tryout", demo: "Coba paket", akbar: "Tryout Akbar", topik: "Latihan per materi", skb: "Tryout SKB", skbtopik: "Latihan SKB" };
const SUB = { twk: "TWK", tiu: "TIU", tkp: "TKP" };
let all = [];

export async function initRapot() {
  initBottomNav("rapot");
  const local = store.get(KEYS.ASSESSMENT_RESULT);
  renderCek(local);
  if (!auth.isLoggedIn()) { $("#rp-login").hidden = false; return; }
  const res = await api.call("getRaporHub");
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") { $("#rp-login").hidden = false; return; }
    const el = $("#rp-status"); el.hidden = false; el.classList.add("error"); el.textContent = res.error.message; return;
  }
  const d = res.data;
  if (!local && d.assessment) renderCek(d.assessment);
  $("#rp-main").hidden = false;
  const s = d.summary;
  $("#rp-stats").innerHTML = [
    ["Tryout selesai", s.tryouts], ["Skor tryout terbaik", s.best ?? "–"], ["Lolos ambang batas", s.passed], ["Latihan per materi", s.topicPractice],
    ["Tryout & latihan SKB", s.skbAttempts ?? 0], ["Latihan wawancara", s.interviews ?? 0],
  ].map(([k, v]) => `<div><span>${k}</span><b>${esc(String(v))}</b></div>`).join("");
  all = d.attempts;
  document.querySelectorAll("#rp-fil [data-f]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#rp-fil [data-f]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderList(b.dataset.f);
  }));
  renderList("all");
  const iv = d.interviews || [];
  $("#rp-iv-wrap").hidden = !iv.length;
  $("#rp-iv").innerHTML = iv.map((x) => `<li><a href="paket-skb.html?hasil=${encodeURIComponent(x.sessionId)}"><span class="tx"><b>Wawancara ${esc(x.instansiShort)}</b><small>Latihan wawancara · ${esc(fmtDate(x.submittedAt))}</small></span><span class="sc"><b>${String(x.band).replace(".", ",")}</b><small>band · ${x.score}/100</small></span></a></li>`).join("");
  $("#rp-levels").innerHTML = d.levels.map((l) => `<div class="lv"><span><span class="xsmall muted">${SUB[l.subtest]}</span> ${esc(l.name)}</span>
      <span class="dots" title="${l.level ? `Level ${l.level}` : "Belum diukur"}">${[1, 2, 3, 4].map((n) => `<i class="${l.level && n <= l.level ? "on" : ""}"></i>`).join("")}</span></div>`).join("");
}

function renderCek(r) {
  const box = $("#rp-cek-body");
  if (!r) {
    box.innerHTML = `<p class="small muted">10 pertanyaan tentang alur seleksi, dokumen, kemampuan dasar, dan waktu persiapan. Dapatkan skor kesiapan dan 3 rekomendasi langkah berikutnya.</p>
      <a class="btn btn-accent" href="../#cek-kesiapan" style="align-self:flex-start">Mulai cek kesiapan</a>`;
    return;
  }
  box.innerHTML = `<div class="row" style="align-items:center;gap:14px"><div><span class="xsmall muted">Skor kesiapan terakhir</span><div style="font-size:1.8rem;font-weight:800">${esc(String(r.total))}<small class="muted" style="font-size:1rem"> / 100</small></div></div>
    <div><span class="chip chip-primary">${esc(LEVEL_LABEL[r.levelId] || r.levelId || "")}</span><div class="xsmall muted" style="margin-top:4px">${esc(fmtDate(r.completedAt))}</div></div></div>
    <div class="row" style="gap:8px"><a class="btn btn-primary" href="../#hasil-cek">Lihat hasil lengkap</a><a class="btn btn-secondary" href="../#cek-kesiapan">Ulangi cek kesiapan</a></div>`;
}

function renderList(f) {
  const pick = all.filter((a) => f === "all" || (f === "tryout" ? ["diagnostic", "premium", "tryout", "demo"].includes(a.type) : f === "skb" ? ["skb", "skbtopik"].includes(a.type) : a.type === f));
  $("#rp-list").innerHTML = pick.length ? pick.map((a) => {
    let score;
    if (a.type === "akbar" && !a.published) score = `<b>Menunggu</b><small>hasil belum terbit</small>`;
    else if (a.type === "topik") score = `<b>${Math.round((a.total / a.max) * 100)}</b><small>nilai / 100</small>`;
    else if (a.type === "skbtopik" || (a.type === "skb" && a.max)) score = `<b>${Math.round((a.total / a.max) * 100)}</b><small>nilai SKB / 100</small>`;
    else if (a.type === "skb") score = `<b>${a.total}</b><small>skor SKB</small>`;
    else score = `<b>${a.total}</b><small>${a.passedAll ? "lolos ambang batas" : "belum lolos"}${a.rank ? ` · peringkat ${a.rank}` : ""}</small>`;
    return `<li><a href="rapor.html?id=${encodeURIComponent(a.attemptId)}"><span class="tx"><b>${esc(a.title)}</b><small>${esc(TYPE[a.type] || "Tryout")}${a.subtest ? ` · ${SUB[a.subtest]}` : ""} · ${esc(fmtDate(a.submittedAt))}</small></span><span class="sc">${score}</span></a></li>`;
  }).join("") : `<li>${emptyBox(f === "all" ? "Belum ada hasil. Mulai dari Coba Paket Tryout atau Latihan Soal per Materi." : "Belum ada hasil di kategori ini.")}</li>`;
}
