/**
 * latihan.js — Latihan harian dengan pembahasan langsung (Fase 4)
 *
 * startPractice → (per soal) answerPractice → feedback → ringkasan.
 * Gratis: 10 soal per hari. Soal dipilih server: soal yang pernah salah, lalu topik fokus.
 * ?topik=<id> untuk latihan satu topik.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, getParam, isSvg, richText, setContext } from "../core/ui.js";
import { topicName } from "./plan.js";

const LETTERS = { a: "A", b: "B", c: "C", d: "D", e: "E" };
const SUB = { twk: "TWK", tiu: "TIU", tkp: "TKP" };

let S = null;

export async function initLatihan() {
  if (!auth.requireLogin("masuk.html")) return;
  await start(getParam("topik"));
}

async function start(topicId) {
  showState("Menyiapkan latihan…", "Soal dipilih dari topik yang paling perlu kamu latih.");
  const res = await api.call("startPractice", topicId ? { topicId } : {});
  if (!res.ok) return handleError(res.error, topicId);
  S = { ...res.data, index: 0, results: [] };
  $("#l-state").hidden = true;
  $("#l-summary").hidden = true;
  $("#l-session").hidden = false;
  $("#l-total").textContent = S.questions.length;
  $("#l-topic").textContent = topicId ? `Latihan topik · ${topicName(topicId)}` : "Latihan harian";
  $("#l-next").onclick = next;
  renderQuestion();
}

function renderQuestion() {
  const q = S.questions[S.index];
  $("#l-no").textContent = S.index + 1;
  $("#l-sub").textContent = `${SUB[q.subtest] || ""} · ${topicName(q.topicId)}`;
  $("#l-q").textContent = q.text;
  setContext($("#l-ctx"), q.context);
  $("#l-fb").hidden = true;
  $("#l-next").hidden = true;
  renderDots();

  const box = $("#l-opts");
  box.classList.toggle("options-fig", q.options.some((o) => isSvg(o.text)));
  box.innerHTML = q.options
    .map((o) => `<button type="button" class="option" role="radio" aria-checked="false" data-k="${o.key}"><span class="key">${LETTERS[o.key]}</span><span>${richText(o.text, `Gambar pilihan ${LETTERS[o.key]}`)}</span><span class="pts"></span></button>`)
    .join("");
  box.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => answer(b.dataset.k)));
  $("#l-q").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function answer(key) {
  const q = S.questions[S.index];
  const box = $("#l-opts");
  box.querySelectorAll(".option").forEach((b) => {
    b.disabled = true;
    b.setAttribute("aria-checked", String(b.dataset.k === key));
  });
  const res = await api.call("answerPractice", { sessionId: S.sessionId, questionId: q.id, answer: key });
  if (!res.ok) {
    box.querySelectorAll(".option").forEach((b) => (b.disabled = false));
    return handleError(res.error);
  }
  const r = res.data;
  import("./reminder-local.js").then((m) => m.markPracticed()).catch(() => {});
  S.results.push({ topicId: q.topicId, correct: r.correct, points: r.points });

  box.querySelectorAll(".option").forEach((b) => {
    if (b.dataset.k === r.bestAnswer) b.classList.add("right");
    else if (b.dataset.k === key && !r.correct) b.classList.add("wrong");
    if (r.optionScores) {
      const sc = r.optionScores.find((o) => o.key === b.dataset.k);
      b.querySelector(".pts").textContent = sc ? `${sc.score} poin` : "";
    }
  });
  const fb = $("#l-fb");
  fb.hidden = false;
  fb.className = `feedback ${r.correct ? "ok" : "no"}`;
  const head =
    q.subtest === "tkp"
      ? `${r.correct ? "Bagus!" : "Masih bisa lebih baik."} Jawabanmu bernilai ${r.points} dari 5.`
      : r.correct
        ? "Benar! +5"
        : `Belum tepat. Jawaban yang benar: ${LETTERS[r.bestAnswer]}.`;
  fb.innerHTML = `<strong>${head}</strong><span class="small">${esc(r.explanation)}</span>`;
  const btn = $("#l-next");
  btn.hidden = false;
  btn.textContent = S.index === S.questions.length - 1 ? "Lihat ringkasan" : "Soal berikutnya ›";
  btn.focus();
  renderDots();
}

function next() {
  if (S.index < S.questions.length - 1) {
    S.index++;
    renderQuestion();
  } else {
    summary();
  }
}

function renderDots() {
  $("#l-dots").innerHTML = S.questions
    .map((_, i) => {
      const r = S.results[i];
      return `<i class="${r ? (r.correct ? "ok" : "no") : i === S.index ? "cur" : ""}"></i>`;
    })
    .join("");
}

function summary() {
  store.remove(KEYS.ME); // beranda menyegarkan data
  $("#l-session").hidden = true;
  const sec = $("#l-summary");
  sec.hidden = false;
  const ok = S.results.filter((r) => r.correct).length;
  $("#s-ok").textContent = ok;
  $("#s-n").textContent = S.results.length;
  const pct = S.results.length ? ok / S.results.length : 0;
  $("#s-head").textContent = pct >= 0.8 ? "Luar biasa!" : pct >= 0.5 ? "Kerja bagus, terus tingkatkan!" : "Tidak apa-apa, ini bagian dari belajar.";
  $("#s-sub").textContent = "Soal yang belum tepat akan muncul lagi di latihan berikutnya agar kamu benar-benar menguasainya.";

  const byTopic = {};
  S.results.forEach((r) => {
    const t = (byTopic[r.topicId] ||= { ok: 0, n: 0 });
    t.n++;
    if (r.correct) t.ok++;
  });
  const sorted = Object.entries(byTopic).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
  $("#s-topics").innerHTML = sorted
    .map(([id, t]) => `<div class="row" style="justify-content:space-between"><span class="small">${esc(topicName(id))}</span><span class="small num"><b>${t.ok}/${t.n}</b> tepat</span></div>`)
    .join("");
  if (sorted.length) {
    $("#s-materi").href = `materi.html?topik=${sorted[0][0]}`;
    $("#s-materi").textContent = `Pelajari materi: ${topicName(sorted[0][0])}`;
  }
  if (S.dailyLimit === null) {
    const again = $("#s-again");
    again.hidden = false;
    again.onclick = () => start(getParam("topik"));
  }
}

function showState(title, text, actions = "") {
  $("#l-session").hidden = true;
  $("#l-state").hidden = false;
  $("#l-state-title").textContent = title;
  $("#l-state-text").textContent = text;
  $("#l-state-actions").innerHTML = actions;
}

function handleError(error, topicId) {
  if (error.code === "UNAUTHENTICATED") {
    location.replace(`masuk.html?next=${encodeURIComponent("latihan.html" + location.search)}`);
    return;
  }
  if (error.code === "DAILY_LIMIT") {
    return showState(
      "Latihan hari ini sudah selesai 🎉",
      "Kamu sudah menyelesaikan 10 soal latihan gratis hari ini. Kuota akan pulih besok. Sambil menunggu, pelajari materi topik fokusmu.",
      `<a class="btn btn-primary" href="materi.html">Buka materi</a><a class="btn btn-secondary" href="dashboard.html">Ke beranda</a><a class="btn btn-ghost" href="premium.html">Latihan tanpa batas dengan Premium</a>`
    );
  }
  if (error.code === "SESSION_EXPIRED") {
    showState("Sesi latihan berakhir", error.message, `<button class="btn btn-primary" id="l-restart" type="button">Mulai lagi</button>`);
    $("#l-restart").addEventListener("click", () => start(topicId));
    return;
  }
  showState("Latihan belum bisa dimulai", error.message, `<a class="btn btn-secondary" href="dashboard.html">Ke beranda</a>`);
}
