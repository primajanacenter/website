/**
 * cat-engine.js — mesin ujian CAT (Fase 3)
 *
 * - Hitung mundur berdasarkan ends_at dari server (dikoreksi selisih jam perangkat).
 * - Panel nomor soal per subtes, tanda ragu-ragu, navigasi keyboard.
 * - Jawaban disimpan lokal setiap kali dipilih, dan ke server berkala (saveProgress):
 *   setiap 10 perubahan, setiap 2 menit bila ada perubahan, dan saat tab disembunyikan.
 * - Waktu habis → jawaban dikirim otomatis (finishMode "timeout").
 * - Kunci jawaban tidak pernah ada di frontend; penilaian dilakukan server.
 */

import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { $, esc, toast, isSvg, richText, setContext } from "../core/ui.js";

const LETTERS = ["A", "B", "C", "D", "E"];
const SUB_LABEL = { twk: "TWK", tiu: "TIU", tkp: "TKP" };
const SAVE_EVERY_CHANGES = 10;
const SAVE_EVERY_MS = 120000;

let S = null; // state ujian

export function runExam(data, { onSubmitted }) {
  const localKey = `tryout.${data.attemptId}`;
  const local = store.get(localKey, {});
  S = {
    data,
    localKey,
    onSubmitted,
    questions: data.questions,
    answers: { ...(data.answers || {}), ...(local.answers || {}) },
    doubt: new Set(local.doubt || []),
    index: Math.min(local.index || 0, data.questions.length - 1),
    offset: Date.parse(data.serverNow) - Date.now(), // koreksi jam perangkat
    endsAt: Date.parse(data.endsAt),
    dirty: 0,
    lastSave: Date.now(),
    submitting: false,
    finished: false,
    warned5: false,
    timer: null,
  };

  $("#ex-title").textContent = data.title;
  $("#q-total").textContent = S.questions.length;

  $("#btn-prev").onclick = () => go(S.index - 1);
  $("#btn-next").onclick = () => (S.index < S.questions.length - 1 ? go(S.index + 1) : askFinish());
  $("#btn-doubt").onclick = toggleDoubt;
  $("#btn-finish").onclick = askFinish;
  $("#finish-cancel").onclick = () => ($("#finish-modal").hidden = true);
  $("#finish-ok").onclick = () => submit("manual");
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("beforeunload", onBeforeUnload);

  // Di layar kecil panel nomor soal dilipat agar soal langsung terlihat
  if (window.matchMedia("(max-width: 900px)").matches) $("#nav-details").open = false;

  renderGrid();
  render();
  tick();
  S.timer = setInterval(tick, 1000);
}

/* ---------------- Waktu ---------------- */

function now() {
  return Date.now() + S.offset;
}

function tick() {
  const ms = S.endsAt - now();
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  $("#ex-timer").textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  $("#ex-timer-box").classList.toggle("warn", sec <= 300);

  if (sec <= 300 && !S.warned5 && sec > 0) {
    S.warned5 = true;
    toast("Sisa waktu 5 menit. Periksa soal yang belum dijawab.", 5000);
  }
  if (sec <= 0 && !S.finished && !S.submitting) {
    clearInterval(S.timer);
    $("#finish-modal").hidden = true;
    toast("Waktu habis. Jawaban dikirim otomatis.", 4000);
    submit("timeout");
    return;
  }
  if (S.dirty && Date.now() - S.lastSave > SAVE_EVERY_MS) flush();
}

/* ---------------- Navigasi & jawaban ---------------- */

function go(i) {
  S.index = Math.max(0, Math.min(i, S.questions.length - 1));
  persistLocal();
  render();
}

function choose(key) {
  const q = S.questions[S.index];
  S.answers[q.id] = key;
  markDirty();
  document.querySelectorAll("#options .option").forEach((el) => el.setAttribute("aria-checked", String(el.dataset.id === key)));
  updateGridItem(S.index);
  renderCounts();
}

function toggleDoubt() {
  const q = S.questions[S.index];
  if (S.doubt.has(q.id)) S.doubt.delete(q.id);
  else S.doubt.add(q.id);
  persistLocal();
  $("#btn-doubt").setAttribute("aria-pressed", String(S.doubt.has(q.id)));
  updateGridItem(S.index);
}

function onKey(e) {
  if ($("#view-exam").hidden || S.finished) return;
  if (!$("#finish-modal").hidden) {
    if (e.key === "Escape") $("#finish-modal").hidden = true;
    return;
  }
  if (e.target.closest("input, textarea, select")) return;
  const q = S.questions[S.index];
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= q.options.length) choose(q.options[n - 1].key);
  else if (e.key === "ArrowRight") go(S.index + 1);
  else if (e.key === "ArrowLeft") go(S.index - 1);
}

function onBeforeUnload(e) {
  if (S && !S.finished) {
    flush();
    e.preventDefault();
    e.returnValue = "";
  }
}

/* ---------------- Simpan ---------------- */

function persistLocal() {
  store.set(S.localKey, { answers: S.answers, doubt: [...S.doubt], index: S.index });
}

function markDirty() {
  S.dirty++;
  persistLocal();
  setSaveState("Belum tersinkron");
  if (S.dirty >= SAVE_EVERY_CHANGES) flush();
}

async function flush() {
  if (!S.dirty || S.finished) return;
  const count = S.dirty;
  S.dirty = 0;
  S.lastSave = Date.now();
  setSaveState("Menyimpan…");
  const res = await api.call("saveProgress", { attemptId: S.data.attemptId, answers: S.answers });
  if (res.ok) {
    setSaveState("Tersimpan");
  } else {
    S.dirty += count; // coba lagi nanti
    setSaveState("Tersimpan di perangkat");
  }
}

function setSaveState(text) {
  $("#ex-save").textContent = text;
}

/* ---------------- Render ---------------- */

function render() {
  const q = S.questions[S.index];
  const selected = S.answers[q.id];
  $("#q-no").textContent = S.index + 1;
  $("#q-badge").textContent = SUB_LABEL[q.subtest] || q.subtest.toUpperCase();
  $("#ex-subtest").textContent = SUB_LABEL[q.subtest] || "";
  $("#q-text").textContent = q.text;
  setContext($("#q-context"), q.context);

  const list = $("#options");
  const figOpts = q.options.some((o) => isSvg(o.text));
  list.classList.toggle("options-fig", figOpts);
  list.innerHTML = q.options
    .map(
      (o, i) => `<button type="button" class="option" role="radio" data-id="${esc(o.key)}" aria-checked="${o.key === selected}">
        <span class="key" aria-hidden="true">${LETTERS[i]}</span><span>${richText(o.text, `Gambar pilihan ${LETTERS[i]}`)}</span></button>`
    )
    .join("");
  list.querySelectorAll(".option").forEach((el) => el.addEventListener("click", () => choose(el.dataset.id)));

  $("#btn-prev").disabled = S.index === 0;
  $("#btn-next").textContent = S.index === S.questions.length - 1 ? "Selesai" : "Selanjutnya ›";
  $("#btn-doubt").setAttribute("aria-pressed", String(S.doubt.has(q.id)));

  document.querySelectorAll("#q-grid button.current").forEach((b) => b.classList.remove("current"));
  const cur = document.querySelector(`#q-grid button[data-i="${S.index}"]`);
  if (cur) {
    cur.classList.add("current");
    cur.scrollIntoView({ block: "nearest" });
  }
  renderCounts();
  $("#q-text").focus({ preventScroll: true });
  if (window.scrollY > 200) window.scrollTo(0, 0);
}

function renderGrid() {
  let lastSub = "";
  let html = "";
  S.questions.forEach((q, i) => {
    if (q.subtest !== lastSub) {
      html += `<span class="qsub">${SUB_LABEL[q.subtest] || q.subtest}</span>`;
      lastSub = q.subtest;
    }
    html += `<button type="button" data-i="${i}">${i + 1}</button>`;
  });
  const grid = $("#q-grid");
  grid.innerHTML = html;
  grid.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.i))));
  S.questions.forEach((_, i) => updateGridItem(i));
}

function updateGridItem(i) {
  const b = document.querySelector(`#q-grid button[data-i="${i}"]`);
  if (!b) return;
  const q = S.questions[i];
  const doubt = S.doubt.has(q.id);
  const answered = Boolean(S.answers[q.id]);
  b.classList.toggle("doubt", doubt);
  b.classList.toggle("answered", answered && !doubt);
  b.setAttribute("aria-label", `Soal ${i + 1}, ${doubt ? "ragu-ragu" : answered ? "sudah dijawab" : "belum dijawab"}`);
}

function renderCounts() {
  const total = S.questions.length;
  const answered = S.questions.filter((q) => S.answers[q.id]).length;
  $("#q-answered").textContent = `${answered} / ${total}`;
  const by = {};
  S.questions.forEach((q) => {
    by[q.subtest] ||= { a: 0, t: 0 };
    by[q.subtest].t++;
    if (S.answers[q.id]) by[q.subtest].a++;
  });
  $("#sub-count").innerHTML = Object.entries(by)
    .map(([k, v]) => `<div><b class="num">${v.a}/${v.t}</b>${SUB_LABEL[k] || k}</div>`)
    .join("");
}

/* ---------------- Selesai ---------------- */

function askFinish() {
  const unanswered = S.questions.filter((q) => !S.answers[q.id]);
  const doubt = S.questions.filter((q) => S.doubt.has(q.id)).length;
  const perSub = {};
  unanswered.forEach((q) => (perSub[q.subtest] = (perSub[q.subtest] || 0) + 1));
  const parts = [];
  if (unanswered.length) {
    parts.push(
      `<b>${unanswered.length} soal belum dijawab</b> (${Object.entries(perSub)
        .map(([k, v]) => `${SUB_LABEL[k]} ${v}`)
        .join(", ")}) dan akan bernilai 0.`
    );
  }
  if (doubt) parts.push(`${doubt} soal masih ditandai ragu-ragu.`);
  parts.push("Setelah dikirim, jawaban tidak bisa diubah.");
  $("#finish-text").innerHTML = parts.join(" ");
  $("#finish-error").hidden = true;
  $("#finish-modal").hidden = false;
  $("#finish-ok").focus();
}

async function submit(mode) {
  if (S.submitting || S.finished) return;
  S.submitting = true;
  const btn = $("#finish-ok");
  btn.disabled = true;
  btn.textContent = "Mengirim…";

  const res = await api.call("submitAttempt", { attemptId: S.data.attemptId, answers: S.answers, finishMode: mode });
  if (res.ok) {
    S.finished = true;
    clearInterval(S.timer);
    window.removeEventListener("beforeunload", onBeforeUnload);
    store.remove(S.localKey);
    S.onSubmitted(S.data.attemptId);
    return;
  }

  S.submitting = false;
  btn.disabled = false;
  btn.textContent = "Coba kirim lagi";
  $("#finish-modal").hidden = false;
  const err = $("#finish-error");
  err.hidden = false;
  err.textContent = `${res.error.message} Jawabanmu aman tersimpan di perangkat ini.`;
}
