/**
 * rapor.js — Rapor tryout (Fase 3)
 *
 * Gratis: skor per subtes vs ambang batas, topik terlemah, 5 pembahasan soal.
 * Premium (Fase 6): semua topik & semua pembahasan — server yang menentukan apa yang dikirim.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate, getParam } from "../core/ui.js";

const SHORT = { twk: "TWK", tiu: "TIU", tkp: "TKP", skb: "SKB" };
const LETTERS = { a: "A", b: "B", c: "C", d: "D", e: "E" };

export async function initRapor() {
  if (!auth.requireLogin("masuk.html")) return;
  const id = getParam("id");
  if (!id) return showStatus("Rapor tidak ditemukan. Buka dari daftar tryout.", true);

  showStatus("Memuat rapor…");
  const res = await api.call("getReport", { attemptId: id });
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") {
      location.replace(`masuk.html?next=${encodeURIComponent("rapor.html?id=" + id)}`);
      return;
    }
    return showStatus(res.error.message, true);
  }
  $("#r-status").hidden = true;
  store.remove(KEYS.ME); // segarkan beranda (status tryout terbaru)
  render(res.data);
}

function render(r) {
  $("#r-report").hidden = false;
  $("#r-actions").hidden = false;
  $("#r-title").textContent = r.package.title.toUpperCase();
  const mins = Math.floor(r.durationSec / 60);
  const secs = r.durationSec % 60;
  $("#r-meta").textContent = `${fmtDate(r.submittedAt)} · ${mins}m ${String(secs).padStart(2, "0")}d${r.finishMode === "timeout" || r.finishMode === "auto" ? " · waktu habis" : ""}`;
  $("#r-total").textContent = r.total;
  $("#r-max").textContent = r.maxTotal;

  if (r.package.type === "skb") return renderSkb(r);
  const failed = r.subtests.filter((s) => !s.passed);
  const v = $("#r-verdict");
  v.className = `chip ${r.passedAll ? "chip-ok" : "chip-bad"}`;
  v.textContent = r.passedAll ? "Memenuhi ambang batas" : "Belum memenuhi ambang batas";
  $("#r-headline").textContent = r.passedAll
    ? "Ketiga subtes aman. Saatnya mengejar peringkat."
    : `${failed.map((s) => SHORT[s.id]).join(" dan ")} masih di bawah ambang batas.`;
  $("#r-message").textContent = r.passedAll
    ? "Lolos ambang batas baru syarat pertama. Tingkatkan skor total agar masuk peringkat 3× jumlah formasi."
    : "Di SKD, satu subtes di bawah ambang batas sudah membuat peserta gugur. Prioritaskan subtes yang belum aman.";
  $("#r-answered").textContent = `Dijawab ${r.answered} dari ${r.questionCount} soal.`;

  $("#r-subtests").innerHTML = r.subtests
    .map((s) => {
      const pct = s.max ? Math.min(100, (s.score / s.max) * 100) : 0;
      const pgPct = s.max ? Math.min(100, (s.passingGrade / s.max) * 100) : 0;
      const detail = s.id === "tkp" ? `${s.correct} jawaban bernilai 4–5` : `${s.correct} benar dari ${s.total}`;
      return `<tr>
        <td><strong>${SHORT[s.id]}</strong><br><span class="xsmall muted">${esc(s.label)}</span></td>
        <td class="num"><strong>${s.score}</strong> / ${s.max}<br><span class="xsmall muted">ambang ${s.passingGrade}</span></td>
        <td><div class="pg-bar ${s.passed ? "" : "fail"}" role="img" aria-label="Skor ${s.score}, ambang batas ${s.passingGrade}"><span style="width:${pct}%"></span><i style="left:${pgPct}%"></i></div><span class="xsmall muted">${detail}</span></td>
        <td><span class="chip ${s.passed ? "chip-ok" : "chip-bad"}">${s.passed ? "Lolos" : `Kurang ${s.passingGrade - s.score}`}</span></td>
      </tr>`;
    })
    .join("");

  renderTopics(r);
  renderReview(r);
}

/** Fase 8: rapor paket SKB — tanpa ambang batas SKD, nilai skala 0–100. */
function renderSkb(r) {
  const v = $("#r-verdict");
  const n = r.score100 ?? 0;
  v.className = `chip ${n >= 70 ? "chip-ok" : n >= 50 ? "chip-warn" : "chip-bad"}`;
  v.textContent = `Nilai SKB ${n} / 100`;
  $("#r-headline").textContent = n >= 70 ? "Penguasaan materi bidangmu sudah baik." : "Masih ada topik bidang yang perlu diperkuat.";
  $("#r-message").textContent = "SKB umumnya berbobot 60% dari nilai akhir. Ulangi topik terlemah, lalu kerjakan paket SKB lain bila tersedia.";
  $("#r-answered").textContent = `Dijawab ${r.answered} dari ${r.questionCount} soal.`;
  const s = r.subtests[0];
  const pct = s.max ? Math.min(100, (s.score / s.max) * 100) : 0;
  $("#r-subtests").innerHTML = `<tr>
    <td><strong>SKB</strong><br><span class="xsmall muted">${esc(s.label)}</span></td>
    <td class="num"><strong>${s.score}</strong> / ${s.max}<br><span class="xsmall muted">skala 100: ${n}</span></td>
    <td><div class="pg-bar" role="img" aria-label="Nilai ${n} dari 100"><span style="width:${pct}%"></span></div><span class="xsmall muted">${s.correct} benar dari ${s.total}</span></td>
    <td><a class="chip chip-primary" href="skb.html">Panduan SKB</a></td>
  </tr>`;
  renderTopics(r);
  renderReview(r);
}

function renderTopics(r) {
  if (!r.topics.length) return;
  $("#r-topics-card").hidden = false;
  $("#r-topics").innerHTML = r.topics
    .map((t) => {
      if (t.locked) {
        return `<li><span class="locked"><span class="tag">${SHORT[t.subtest] || ""}</span> ${esc(t.name)}</span><div class="progress locked"><span style="width:50%"></span></div><span class="chip">🔒</span></li>`;
      }
      return `<li><span><span class="tag">${SHORT[t.subtest] || ""}</span> <b>${esc(t.name)}</b></span><div class="progress" role="img" aria-label="${t.pct} persen"><span style="width:${t.pct}%"></span></div><span class="num small"><b>${t.pct}%</b></span></li>`;
    })
    .join("");
  $("#r-topics-lock").hidden = !r.topicsLocked;
}

function renderReview(r) {
  if (!r.review.length) {
    if (r.reviewTotal === 0) {
      $("#r-review-card").hidden = false;
      $("#r-review").innerHTML = `<p class="muted">Semua jawabanmu bernilai maksimal. Luar biasa!</p>`;
    }
    return;
  }
  $("#r-review-card").hidden = false;
  $("#r-review-title").textContent = r.reviewLocked ? `Pembahasan ${r.review.length} soal prioritas` : "Pembahasan semua soal";
  $("#r-review").innerHTML = r.review
    .map((q) => {
      const status =
        q.subtest === "tkp"
          ? `<span class="chip ${q.points >= 4 ? "chip-ok" : "chip-warn"}">Nilai ${q.points} dari 5</span>`
          : !q.yourAnswer
            ? `<span class="chip">Tidak dijawab</span>`
            : `<span class="chip ${q.points === 5 ? "chip-ok" : "chip-bad"}">${q.points === 5 ? "Benar" : "Salah"}</span>`;
      const opts = q.options
        .map((o) => {
          const cls = [o.key === q.bestAnswer ? "best" : "", o.key === q.yourAnswer ? "mine" : ""].join(" ").trim();
          const tag = o.key === q.yourAnswer ? "Jawabanmu" : o.key === q.bestAnswer ? "Terbaik" : "";
          const pts = q.subtest === "tkp" ? `${o.score} poin` : "";
          return `<li class="${cls}"><b>${LETTERS[o.key]}</b><span>${esc(o.text)}</span><span class="pts">${[tag, pts].filter(Boolean).join(" · ")}</span></li>`;
        })
        .join("");
      return `<article class="rv">
        <div class="row" style="justify-content:space-between"><span class="eyebrow">Soal ${q.number} · ${SHORT[q.subtest]} · ${esc(q.topic)}</span>${status}</div>
        <p><strong>${esc(q.text)}</strong></p>
        ${q.context ? `<div class="question-context">${esc(q.context)}</div>` : ""}
        <ul class="rv-opts">${opts}</ul>
        <p class="small muted">${esc(q.explanation)}</p>
      </article>`;
    })
    .join("");
  if (r.reviewLocked && r.reviewTotal > r.review.length) {
    $("#r-review-lock").hidden = false;
    $("#r-review-lock-text").innerHTML = `<b>${r.reviewTotal - r.review.length} pembahasan lainnya</b> untuk soal yang belum tepat tersedia di paket Premium.`;
  }
}

function showStatus(msg, isError) {
  const el = $("#r-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
