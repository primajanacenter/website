/**
 * assessment.js — Cek Kesiapan CPNS (Fase 1) dengan tampilan bergaya CAT
 *
 * Alur: intro → 10 soal (panel nomor soal, ragu-ragu, penunjuk waktu) → konfirmasi → lembar hasil.
 * Skor dihitung di browser dari assets/data/assessment.json, tanpa login.
 * Hasil disimpan lokal (store) dan dikirim lewat api.call("saveAssessment"),
 * yang di Fase 2 akan tersimpan ke Spreadsheet.
 *
 * Pola CAT (panel nomor, ragu-ragu, timer) sengaja dibuat sama dengan mesin tryout
 * di Fase 3 (cat-engine.js) agar pengguna langsung terbiasa.
 */

import { api } from "../core/api.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, toast, copyText } from "../core/ui.js";

const DATA_URL = "assets/data/assessment.json";
const LETTERS = ["A", "B", "C", "D", "E"];

const state = {
  data: null,
  index: 0,
  answers: {},      // { q1: "a", ... }
  doubt: new Set(), // id soal yang ditandai ragu-ragu
  elapsed: 0,       // detik
  timerId: null,
};

const views = {
  intro: () => $("#view-intro"),
  quiz: () => $("#view-quiz"),
  result: () => $("#view-result"),
};

/* ------------------------------------------------------------------ */
/* Inisialisasi                                                        */
/* ------------------------------------------------------------------ */
export async function initAssessment() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (e) {
    console.error("[assessment] gagal memuat data", e);
    startButtons().forEach((b) => (b.disabled = true));
    toast("Soal belum bisa dimuat. Muat ulang halaman ini.");
    return;
  }

  startButtons().forEach((btn) => btn.addEventListener("click", startQuiz));
  $("#btn-prev").addEventListener("click", prevQuestion);
  $("#btn-next").addEventListener("click", nextQuestion);
  $("#btn-doubt").addEventListener("click", toggleDoubt);
  $("#btn-finish").addEventListener("click", askFinish);
  $("#btn-exit").addEventListener("click", exitQuiz);
  $("#confirm-back").addEventListener("click", closeConfirm);
  $("#confirm-ok").addEventListener("click", () => { closeConfirm(); finish(); });
  document.addEventListener("keydown", onKey);

  const last = store.get(KEYS.ASSESSMENT_RESULT);
  const lastBtn = $("#btn-last-result");
  if (last && lastBtn) {
    lastBtn.hidden = false;
    lastBtn.addEventListener("click", () => renderResult(last, { fromHistory: true }));
  }

  // Lanjutkan draf yang belum selesai
  const draft = store.get(KEYS.ASSESSMENT_DRAFT);
  if (draft && draft.version === state.data.version && Object.keys(draft.answers || {}).length) {
    state.answers = draft.answers;
    state.doubt = new Set(draft.doubt || []);
    state.elapsed = draft.elapsed || 0;
    state.index = Math.min(draft.index || 0, state.data.questions.length - 1);
    const resume = $("#resume-note");
    if (resume) resume.hidden = false;
  }

  if (location.hash === "#cek-kesiapan") startQuiz();
  else if (location.hash === "#hasil-cek" && last) renderResult(last, { fromHistory: true });
}

function startButtons() {
  return Array.from(document.querySelectorAll("[data-start-assessment]"));
}

/* ------------------------------------------------------------------ */
/* Tampilan & timer                                                    */
/* ------------------------------------------------------------------ */
function show(name) {
  Object.entries(views).forEach(([key, get]) => {
    const el = get();
    if (el) el.hidden = key !== name;
  });
  window.scrollTo(0, 0);
}

function startTimer() {
  stopTimer();
  renderTimer();
  state.timerId = setInterval(() => {
    state.elapsed++;
    renderTimer();
    if (state.elapsed % 10 === 0) saveDraft();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderTimer() {
  const el = $("#q-timer");
  if (el) el.textContent = fmtTime(state.elapsed);
}

/* ------------------------------------------------------------------ */
/* Navigasi kuis                                                       */
/* ------------------------------------------------------------------ */
function startQuiz() {
  if (!state.data) return;
  show("quiz");
  renderGrid();
  renderQuestion();
  startTimer();
}

function exitQuiz() {
  stopTimer();
  saveDraft();
  show("intro");
  const resume = $("#resume-note");
  if (resume) resume.hidden = Object.keys(state.answers).length === 0;
}

function goTo(i) {
  state.index = Math.max(0, Math.min(i, state.data.questions.length - 1));
  renderQuestion();
}

function prevQuestion() {
  if (state.index > 0) goTo(state.index - 1);
}

function nextQuestion() {
  if (state.index < state.data.questions.length - 1) goTo(state.index + 1);
  else askFinish();
}

function currentQuestion() {
  return state.data.questions[state.index];
}

function choose(optionId) {
  const q = currentQuestion();
  state.answers[q.id] = optionId;
  saveDraft();
  document.querySelectorAll("#options .option").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.id === optionId));
  });
  renderGrid();
}

function toggleDoubt() {
  const q = currentQuestion();
  if (state.doubt.has(q.id)) state.doubt.delete(q.id);
  else state.doubt.add(q.id);
  saveDraft();
  renderDoubtButton();
  renderGrid();
}

function onKey(e) {
  if (!$("#confirm").hidden) {
    if (e.key === "Escape") closeConfirm();
    return;
  }
  if (views.quiz().hidden) return;
  if (e.target.closest("input, textarea")) return;
  const q = currentQuestion();
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= q.options.length) {
    choose(q.options[n - 1].id);
  } else if (e.key === "Enter" && !e.target.closest("button")) {
    e.preventDefault();
    nextQuestion();
  } else if (e.key === "ArrowRight") {
    nextQuestion();
  } else if (e.key === "ArrowLeft") {
    prevQuestion();
  }
}

function saveDraft() {
  if (!state.data) return;
  store.set(KEYS.ASSESSMENT_DRAFT, {
    version: state.data.version,
    index: state.index,
    answers: state.answers,
    doubt: [...state.doubt],
    elapsed: state.elapsed,
  });
}

/* ------------------------------------------------------------------ */
/* Render soal & panel nomor                                           */
/* ------------------------------------------------------------------ */
function renderQuestion() {
  const { questions } = state.data;
  const q = currentQuestion();
  const total = questions.length;
  const selected = state.answers[q.id];

  $("#q-no").textContent = state.index + 1;
  $("#q-section").textContent = q.section;
  $("#q-text").textContent = q.text;

  const ctx = $("#q-context");
  ctx.hidden = !q.context;
  ctx.textContent = q.context || "";

  const list = $("#options");
  list.innerHTML = q.options
    .map(
      (opt, i) => `
      <button type="button" class="option" role="radio" data-id="${esc(opt.id)}"
              aria-checked="${opt.id === selected}">
        <span class="key" aria-hidden="true">${LETTERS[i]}</span>
        <span>${esc(opt.text)}</span>
      </button>`
    )
    .join("");
  list.querySelectorAll(".option").forEach((el) => el.addEventListener("click", () => choose(el.dataset.id)));

  $("#btn-prev").disabled = state.index === 0;
  $("#btn-next").textContent = state.index === total - 1 ? "Selesai" : "Selanjutnya ›";

  renderDoubtButton();
  renderGrid();
  $("#q-text").focus({ preventScroll: true });
}

function renderDoubtButton() {
  const q = currentQuestion();
  $("#btn-doubt").setAttribute("aria-pressed", String(state.doubt.has(q.id)));
}

function renderGrid() {
  const { questions } = state.data;
  const grid = $("#q-grid");
  grid.innerHTML = questions
    .map((q, i) => {
      const cls = [
        state.doubt.has(q.id) ? "doubt" : state.answers[q.id] ? "answered" : "",
        i === state.index ? "current" : "",
      ].join(" ");
      const status = state.doubt.has(q.id) ? "ragu-ragu" : state.answers[q.id] ? "sudah dijawab" : "belum dijawab";
      return `<button type="button" class="${cls.trim()}" data-i="${i}" aria-label="Soal ${i + 1}, ${status}"${
        i === state.index ? ' aria-current="step"' : ""
      }>${i + 1}</button>`;
    })
    .join("");
  grid.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => goTo(Number(b.dataset.i))));

  const answered = questions.filter((q) => state.answers[q.id]).length;
  $("#q-answered").textContent = `${answered} / ${questions.length}`;
}

/* ------------------------------------------------------------------ */
/* Konfirmasi selesai                                                  */
/* ------------------------------------------------------------------ */
function askFinish() {
  const { questions } = state.data;
  const unanswered = questions.filter((q) => !state.answers[q.id]).length;
  const doubt = state.doubt.size;
  const parts = [];
  if (unanswered) parts.push(`${unanswered} soal belum dijawab dan akan bernilai 0`);
  if (doubt) parts.push(`${doubt} soal masih ditandai ragu-ragu`);
  $("#confirm-text").textContent = parts.length
    ? `Masih ada ${parts.join(", dan ")}. Kamu tetap bisa melihat hasil sekarang.`
    : "Semua soal sudah dijawab. Setelah ini jawaban tidak bisa diubah.";
  $("#confirm").hidden = false;
  $("#confirm-ok").focus();
}

function closeConfirm() {
  $("#confirm").hidden = true;
}

/* ------------------------------------------------------------------ */
/* Penilaian                                                           */
/* ------------------------------------------------------------------ */
export function scoreAssessment(data, answers) {
  const aspectScores = Object.fromEntries(data.aspects.map((a) => [a.id, 0]));

  data.questions.forEach((q) => {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    if (opt) aspectScores[q.aspect] += opt.points;
  });

  const total = Math.round(Object.values(aspectScores).reduce((a, b) => a + b, 0));
  const level = data.levels.find((l) => total >= l.min && total <= l.max) || data.levels[0];

  const aspects = data.aspects.map((a) => ({
    id: a.id,
    label: a.label,
    score: aspectScores[a.id],
    max: a.max,
    pct: a.max ? aspectScores[a.id] / a.max : 0,
  }));

  return { total, levelId: level.id, aspects, recommendations: pickRecommendations(aspects, level.id) };
}

function pickRecommendations(aspects, levelId) {
  const picked = [];
  [...aspects]
    .sort((a, b) => a.pct - b.pct)
    .filter((a) => a.pct < 0.6)
    .forEach((a) => picked.push(a.id));

  const fillers = levelId === "baru-mulai" ? ["alur", "dokumen", "kemampuan", "tryout"] : ["tryout", "peringkat", "waktu"];
  fillers.forEach((id) => {
    if (!picked.includes(id)) picked.push(id);
  });

  return picked.slice(0, 3);
}

async function finish() {
  stopTimer();
  const result = {
    version: state.data.version,
    answers: { ...state.answers },
    durationSec: state.elapsed,
    ...scoreAssessment(state.data, state.answers),
    completedAt: new Date().toISOString(),
  };

  store.set(KEYS.ASSESSMENT_RESULT, result);
  store.remove(KEYS.ASSESSMENT_DRAFT);
  state.answers = {};
  state.doubt = new Set();
  state.elapsed = 0;
  state.index = 0;
  renderResult(result);

  const res = await api.call("saveAssessment", {
    version: result.version,
    total: result.total,
    levelId: result.levelId,
    durationSec: result.durationSec,
    aspects: result.aspects.map(({ id, score }) => ({ id, score })),
    answers: result.answers,
  });
  if (!res.ok) console.warn("[assessment] gagal mengirim hasil:", res.error);
}

/* ------------------------------------------------------------------ */
/* Lembar hasil                                                        */
/* ------------------------------------------------------------------ */
function renderResult(result, { fromHistory = false } = {}) {
  const data = state.data;
  if (!data) return;
  const level = data.levels.find((l) => l.id === result.levelId) || data.levels[0];

  show("result");

  $("#r-score").textContent = result.total;
  const circumference = 2 * Math.PI * 64;
  const bar = $("#r-gauge-bar");
  bar.style.strokeDasharray = String(circumference);
  bar.style.strokeDashoffset = String(circumference);
  requestAnimationFrame(() => {
    bar.style.strokeDashoffset = String(circumference * (1 - result.total / 100));
  });

  const chip = $("#r-level");
  chip.className = `chip ${level.chip}`;
  chip.textContent = `Level: ${level.label}`;
  $("#r-headline").textContent = level.headline;
  $("#r-message").textContent = level.message;

  const date = new Date(result.completedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const dur = result.durationSec ? ` · durasi ${fmtTime(result.durationSec)}` : "";
  $("#r-date").textContent = `${fromHistory ? "Tersimpan " : ""}${date}${dur}`;
  $("#r-disclaimer").textContent = data.disclaimer;

  $("#r-aspects").innerHTML = result.aspects
    .map((a) => {
      const pct = Math.round(a.pct * 100);
      const low = a.pct < 0.6;
      return `
      <tr class="${low ? "low" : ""}">
        <td><strong>${esc(a.label)}</strong></td>
        <td class="num">${a.score} / ${a.max}</td>
        <td><div class="progress" role="img" aria-label="${pct} persen"><span style="width:${pct}%"></span></div></td>
        <td><span class="chip ${low ? "chip-warn" : "chip-ok"}">${low ? "Perlu perhatian" : "Cukup baik"}</span></td>
      </tr>`;
    })
    .join("");

  $("#r-recos").innerHTML = result.recommendations
    .map((id, i) => {
      const r = data.recommendations[id];
      if (!r) return "";
      return `
      <li>
        <span class="n">${i + 1}</span>
        <div class="stack" style="gap:6px">
          <h3>${esc(r.title)}</h3>
          <p class="small muted">${esc(r.text)}</p>
          ${r.link ? `<a class="small" href="${esc(r.link)}"><strong>${esc(r.linkLabel || "Selengkapnya")} →</strong></a>` : ""}
        </div>
      </li>`;
    })
    .join("");

  $("#r-review").innerHTML = data.questions
    .filter((q) => q.explanation)
    .map((q) => {
      const chosen = q.options.find((o) => o.id === result.answers[q.id]);
      let status;
      if (q.scoring === "tkp") {
        const v = chosen?.tkp ?? 0;
        status = `<span class="chip ${v >= 4 ? "chip-ok" : "chip-warn"}">Nilai jawabanmu ${v} dari 5</span>`;
      } else if (!chosen) {
        status = `<span class="chip">Tidak dijawab</span>`;
      } else {
        const ok = Boolean(chosen.correct);
        status = `<span class="chip ${ok ? "chip-ok" : "chip-bad"}">${ok ? "Benar" : "Belum tepat"}</span>`;
      }
      const best = q.options.find((o) => o.correct) || q.options.reduce((a, b) => ((b.tkp || 0) > (a.tkp || 0) ? b : a));
      return `
      <div class="review-item">
        <div class="row" style="justify-content:space-between">
          <span class="eyebrow">${esc(q.section)}</span>
          ${status}
        </div>
        <p><strong>${esc(q.text)}</strong>${q.context ? ` <span class="num">${esc(q.context)}</span>` : ""}</p>
        <p class="small">Jawabanmu: ${esc(chosen?.text || "-")}</p>
        <p class="small">Jawaban terbaik: <strong>${esc(best.text)}</strong></p>
        <p class="small muted">${esc(q.explanation)}</p>
      </div>`;
    })
    .join("");

  $("#btn-retake").onclick = () => {
    state.answers = {};
    state.doubt = new Set();
    state.elapsed = 0;
    state.index = 0;
    startQuiz();
  };
  $("#btn-share").onclick = () => shareResult(result, level);
  $("#btn-save").onclick = () => {
    store.set(KEYS.ASSESSMENT_RESULT, result);
    toast("Hasil tersimpan di perangkat ini.");
  };
}

async function shareResult(result, level) {
  const url = location.origin + location.pathname;
  const text = `Skor kesiapan CPNS saya ${result.total}/100 (${level.label}). Cek kesiapanmu juga:`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Cek Kesiapan CPNS", text, url });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const ok = await copyText(`${text} ${url}`);
  toast(ok ? "Teks hasil disalin. Tempel di WhatsApp atau media sosial." : "Gagal menyalin. Salin tautan halaman ini secara manual.");
}
