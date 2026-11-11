/**
 * latihan-soal.js — Menu C "Paket Latihan Soal per Materi" (Fase 13).
 *
 * Tiga kotak TWK · TIU · TKP → daftar 21 topik. Setiap topik = 50 soal HOTS (mudah → sulit), 45 menit.
 * Jawab semua soal lalu kirim; skor, kunci jawaban, dan pembahasan tampil di rapor.
 * Judul teratas tiap subtes gratis, lainnya Premium (pop-up langganan).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, fmtDate, getParam, setBusy } from "../core/ui.js";
import { runExam } from "./cat-engine.js";
import { ICON, goLogin, initBottomNav, premiumSheet, handleCommonError } from "./hub.js";

let data = null;
let pending = null;
let names = {};

export async function initLatihanSoal() {
  initBottomNav("materi");
  $("#start-cancel").addEventListener("click", () => { $("#start-modal").hidden = true; pending = null; });
  $("#start-ready").addEventListener("change", (e) => ($("#start-ok").disabled = !e.target.checked));
  $("#start-ok").addEventListener("click", () => { const p = pending; $("#start-modal").hidden = true; pending = null; if (p) begin(p.topicId, p.button); });

  try {
    const base = await (await fetch("../assets/data/materi-level1.json", { cache: "no-cache" })).json();
    base.topics.forEach((t) => (names[t.id] = t.name));
  } catch { /* nama dari server */ }
  const res = await api.call("getTopicPractice");
  if (!res.ok) return handleCommonError(res.error, $("#lobby-status"));
  data = res.data;
  const want = getParam("topik");
  const t = data.topics.find((x) => x.topicId === want);
  render(t ? t.subtest : getParam("sub") || "twk");
  if (t) open(t.topicId);
}

function render(sub) {
  document.querySelectorAll(".subtab").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.sub === sub));
    b.onclick = () => { history.replaceState(null, "", `?sub=${b.dataset.sub}`); render(b.dataset.sub); };
  });
  const items = data.topics.filter((t) => t.subtest === sub);
  $("#lt-list").innerHTML = items.map((t, i) => {
    const last = t.last ? `Skor terakhir ${t.last.total}/${t.last.max} · ${fmtDate(t.last.submittedAt)}` : `${data.size} soal · ${data.durationMin} menit · mudah → sulit`;
    const end = t.inProgress ? `<span class="chip chip-warn">Berjalan</span>` : t.free ? `<span class="free-tag">Gratis</span>` : t.locked ? `<span class="lock" title="Khusus Premium">${ICON.lock}</span>` : t.attempts ? `<span class="owned">✓ ${t.attempts}×</span>` : "";
    return `<li><button type="button" class="titem" data-topic="${esc(t.topicId)}"><span class="no">${i + 1}</span>
      <span class="tx"><b>${esc(names[t.topicId] || t.name)}</b><small>${esc(last)}</small></span><span class="end">${end}›</span></button>
      ${t.last ? `<div style="padding:0 16px 12px 60px"><a class="small" href="rapor.html?id=${encodeURIComponent(t.last.attemptId)}">Lihat pembahasan terakhir ›</a></div>` : ""}</li>`;
  }).join("");
  $("#lt-list").querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => open(b.dataset.topic, b)));
  $("#lt-note").textContent = data.premium ? "Premium aktif: semua topik terbuka." : "Premium: 1 bulan Rp30.000 · 3 bulan Rp75.000 · 6 bulan Rp150.000 untuk semua materi & latihan soal TWK, TIU, TKP.";
}

function open(topicId, button) {
  const t = data.topics.find((x) => x.topicId === topicId);
  if (!t) return;
  if (t.locked) return premiumSheet({ title: `Latihan ${names[topicId] || t.name}`, text: "Latihan soal topik ini khusus Premium." });
  if (!auth.isLoggedIn()) return goLogin(`latihan-soal.html?topik=${encodeURIComponent(topicId)}`);
  if (t.inProgress) return begin(topicId, button);
  pending = { topicId, button };
  $("#start-title").textContent = `Mulai latihan ${names[topicId] || t.name}?`;
  $("#start-text").textContent = `${data.size} soal HOTS dari mudah ke sulit dalam ${data.durationMin} menit. Waktu berjalan sejak kamu menekan Mulai. Kerjakan semua soal lalu kirim — kunci jawaban & pembahasan tampil setelah dikirim.`;
  $("#start-ready").checked = false;
  $("#start-ok").disabled = true;
  $("#start-modal").hidden = false;
}

async function begin(topicId, button) {
  if (button) setBusy(button, true, "Menyiapkan soal…");
  const res = await api.call("startAttempt", { packageId: "LTP-" + topicId });
  if (button) setBusy(button, false);
  if (!res.ok) return handleCommonError(res.error, $("#lobby-status"));
  $("#view-lobby").hidden = true;
  $("#view-exam").hidden = false;
  document.body.classList.add("exam-on");
  window.scrollTo(0, 0);
  runExam(res.data, { onSubmitted: (attemptId) => location.replace(`rapor.html?id=${encodeURIComponent(attemptId)}`) });
}
