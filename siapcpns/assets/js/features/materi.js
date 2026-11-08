/**
 * materi.js — Materi level 1 (Fase 4)
 *
 * Daftar topik dan detail materi bisa dibuka tanpa login (konten publik & gratis).
 * Jika login, ditampilkan level per topik, topik fokus, dan tombol latihan per topik.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, getParam, toast } from "../core/ui.js";
import { LEVEL_NAMES, markRead, readMap, topicQueue } from "./plan.js";

const SUB = { twk: "TWK · Tes Wawasan Kebangsaan", tiu: "TIU · Tes Intelegensia Umum", tkp: "TKP · Tes Karakteristik Pribadi" };
const LETTERS = ["A", "B", "C", "D", "E"];

let data = null;
let today = null;

export async function initMateri() {
  try {
    data = await (await fetch("../assets/data/materi-level1.json", { cache: "no-cache" })).json();
  } catch {
    return status("Materi belum bisa dimuat. Muat ulang halaman.", true);
  }
  if (auth.isLoggedIn()) {
    const res = await api.call("getToday");
    if (res.ok) today = res.data;
  }
  const id = getParam("topik");
  if (id && data.topics.some((t) => t.id === id)) renderDetail(id);
  else renderList();
}

function levelChip(id) {
  const lv = today?.topicLevels?.[id];
  if (!lv) return `<span class="lv">Belum diukur</span>`;
  return `<span class="lv lv-${lv.level}">Lv ${lv.level} · ${LEVEL_NAMES[lv.level]}</span>`;
}

function renderList() {
  $("#m-list").hidden = false;
  const read = readMap();
  const focus = (today?.focusTopics || []).map((t) => t.topicId);
  if (focus.length) {
    $("#m-focus-note").hidden = false;
    $("#m-focus-text").textContent = ` Berdasarkan hasil tryout dan latihanmu, prioritaskan: ${today.focusTopics.map((t) => t.name).join(", ")}.`;
  }
  $("#m-groups").innerHTML = ["twk", "tiu", "tkp"]
    .map((sub) => {
      const items = data.topics.filter((t) => t.subtest === sub);
      return `<section class="subtest-block">
        <h2>${SUB[sub]}</h2>
        <div class="topic-grid">${items
          .map(
            (t) => `<a class="topic-card ${focus.includes(t.id) ? "focus" : ""}" href="materi.html?topik=${t.id}">
              <div class="row"><strong>${esc(t.name)}</strong>${levelChip(t.id)}</div>
              <span class="xsmall muted">± ${t.minutes} menit · ${t.poinKunci.length} poin kunci</span>
              ${read[t.id] ? `<span class="read">✓ Sudah dibaca</span>` : focus.includes(t.id) ? `<span class="xsmall" style="color:var(--accent);font-weight:700">Topik fokus</span>` : ""}
            </a>`
          )
          .join("")}</div>
      </section>`;
    })
    .join("");
}

function renderDetail(id) {
  const t = data.topics.find((x) => x.id === id);
  $("#m-detail").hidden = false;
  $("#m-title").textContent = t.name;
  $("#m-lead").textContent = `Konsep dasar · ${SUB[t.subtest]}`;
  $("#crumb-topic").textContent = ` / ${t.name}`;
  document.title = `${t.name} — Materi Siap CPNS`;
  $("#d-subtest").textContent = t.subtest.toUpperCase();
  $("#d-minutes").textContent = `± ${t.minutes} menit`;
  $("#d-summary").textContent = t.ringkasan;
  $("#d-points").innerHTML = t.poinKunci.map((p) => `<li>${esc(p)}</li>`).join("");
  $("#d-tips").innerHTML = t.tips.map((p) => `<li>${esc(p)}</li>`).join("");
  $("#d-traps").innerHTML = t.jebakan.map((p) => `<li>${esc(p)}</li>`).join("");

  // Contoh soal interaktif
  $("#d-q").textContent = t.contoh.soal;
  const box = $("#d-opts");
  box.innerHTML = t.contoh.pilihan
    .map((o, i) => `<button type="button" class="option" data-i="${i}"><span class="key">${LETTERS[i]}</span><span>${esc(o)}</span></button>`)
    .join("");
  box.querySelectorAll(".option").forEach((b) =>
    b.addEventListener("click", () => {
      const pick = Number(b.dataset.i);
      box.querySelectorAll(".option").forEach((x) => {
        const i = Number(x.dataset.i);
        x.disabled = true;
        if (i === t.contoh.jawaban) x.classList.add("right");
        else if (i === pick) x.classList.add("wrong");
      });
      const ex = $("#d-expl");
      ex.hidden = false;
      ex.innerHTML = `<strong>${pick === t.contoh.jawaban ? "Tepat!" : "Belum tepat."}</strong> ${esc(t.contoh.pembahasan)}`;
    })
  );

  // Samping
  const lv = today?.topicLevels?.[id];
  $("#d-mylevel").innerHTML = lv
    ? `Levelmu di topik ini: <span class="lv lv-${lv.level}">Lv ${lv.level} · ${LEVEL_NAMES[lv.level]}</span> <span class="xsmall">(${lv.pct}%)</span>`
    : auth.isLoggedIn()
      ? "Levelmu: belum diukur. Kerjakan latihan topik ini."
      : `<a href="masuk.html?next=${encodeURIComponent("materi.html?topik=" + id)}">Masuk</a> untuk melihat levelmu dan berlatih.`;
  const practice = $("#d-practice");
  practice.href = auth.isLoggedIn() ? `latihan.html?topik=${id}` : `masuk.html?next=${encodeURIComponent("latihan.html?topik=" + id)}`;

  const queue = today ? topicQueue(today) : data.topics.map((x) => x.id);
  const nextId = queue[(queue.indexOf(id) + 1) % queue.length];
  const next = data.topics.find((x) => x.id === nextId);
  $("#d-next").href = `materi.html?topik=${nextId}`;
  $("#d-next").textContent = `Berikutnya: ${next.name} →`;

  const done = $("#d-done");
  if (readMap()[id]) done.textContent = "✓ Sudah dibaca";
  done.addEventListener("click", () => {
    markRead(id);
    done.textContent = "✓ Sudah dibaca";
    toast("Materi ditandai sudah dibaca.");
  });
}

function status(msg, isError) {
  const el = $("#m-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
