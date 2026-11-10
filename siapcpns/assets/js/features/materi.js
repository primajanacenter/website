/**
 * materi.js — Materi per level (Fase 4 & 6)
 *
 * - Level 1 (konsep dasar) publik, dibaca dari assets/data/materi-level1.json.
 * - Level 2–4 (pendalaman) diambil dari server (getMaterial). Isi lengkap hanya untuk Premium;
 *   pengguna lain menerima cuplikan dan ajakan Premium.
 * URL: materi.html?topik=<id>&level=<1-4>
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, getParam, isSvg, richText, setContext, toast } from "../core/ui.js";
import { LEVEL_NAMES, markRead, readLevel, readMap, topicQueue } from "./plan.js";

const SUB = { twk: "TWK · Tes Wawasan Kebangsaan", tiu: "TIU · Tes Intelegensia Umum", tkp: "TKP · Tes Karakteristik Pribadi" };
const LETTERS = ["A", "B", "C", "D", "E"];
const LEVEL_DESC = { 1: "Konsep dasar", 2: "Konsep lengkap & pola soal", 3: "Analisis kasus HOTS", 4: "Strategi waktu & jebakan lanjut" };

let data = null;
let today = null;
let index = null;

export async function initMateri() {
  try {
    data = await (await fetch("../assets/data/materi-level1.json", { cache: "no-cache" })).json();
  } catch {
    return status("Materi belum bisa dimuat. Muat ulang halaman.", true);
  }
  const [t, idx] = await Promise.all([
    auth.isLoggedIn() ? api.call("getToday") : Promise.resolve(null),
    api.call("getMaterialIndex"),
  ]);
  if (t?.ok) today = t.data;
  index = idx.ok ? idx.data : { premium: false, available: {}, recommended: {} };

  const id = getParam("topik");
  if (id && data.topics.some((x) => x.id === id)) renderDetail(id, Number(getParam("level")) || 1);
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
          .map((t) => {
            const levels = (index.available[t.id] || []).map((x) => x.level);
            const rec = index.recommended?.[t.id];
            const href = `materi.html?topik=${t.id}${rec && rec > 1 && levels.includes(rec) ? `&level=${rec}` : ""}`;
            return `<a class="topic-card ${focus.includes(t.id) ? "focus" : ""}" href="${href}">
              <div class="row"><strong>${esc(t.name)}</strong>${levelChip(t.id)}</div>
              <span class="xsmall muted">Lv1 ± ${t.minutes} menit${levels.length ? ` · Lv${levels.join("/")} ${index.premium ? "terbuka" : "🔒 Premium"}` : ""}</span>
              ${rec && rec > 1 ? `<span class="xsmall" style="color:var(--accent);font-weight:700">Disarankan: Level ${rec} · ${LEVEL_NAMES[rec]}</span>` : read[t.id] ? `<span class="read">✓ Sudah dibaca</span>` : focus.includes(t.id) ? `<span class="xsmall" style="color:var(--accent);font-weight:700">Topik fokus</span>` : ""}
            </a>`;
          })
          .join("")}</div>
      </section>`;
    })
    .join("");
}

async function renderDetail(id, level) {
  const t = data.topics.find((x) => x.id === id);
  const avail = (index.available[id] || []).map((x) => x.level);
  if (level > 1 && !avail.includes(level)) level = 1;
  $("#m-detail").hidden = false;
  $("#m-title").textContent = t.name;
  $("#crumb-topic").textContent = ` / ${t.name}`;
  document.title = `${t.name} (Level ${level}) — Materi Siap CPNS`;
  $("#d-subtest").textContent = t.subtest.toUpperCase();
  $("#d-levelchip").className = `lv lv-${level}`;
  $("#d-levelchip").textContent = `Level ${level} · ${LEVEL_NAMES[level]}`;
  renderTabs(id, level, avail);
  renderSide(id, level, avail);

  if (level === 1) {
    $("#m-lead").textContent = `${LEVEL_DESC[1]} · ${SUB[t.subtest]}`;
    fill(t, 1, id);
    return;
  }

  const name = index.available[id].find((x) => x.level === level);
  $("#m-lead").textContent = `${LEVEL_DESC[level]} · ${SUB[t.subtest]}`;
  $("#d-content").hidden = true;
  $("#d-minutes").textContent = `± ${name.minutes} menit`;
  const res = await api.call("getMaterial", { topicId: id, level });
  if (!res.ok) return status(res.error.message, true);
  if (res.data.locked) return renderLocked(id, level, res.data);
  $("#d-content").hidden = false;
  fill(res.data.material, level, id);
}

function fill(m, level, id) {
  $("#d-content").hidden = false;
  $("#d-locked").hidden = true;
  $("#d-minutes").textContent = `± ${m.minutes} menit`;
  $("#d-summary").textContent = (level > 1 && m.title ? m.title + ". " : "") + m.ringkasan;
  $("#d-points").innerHTML = m.poinKunci.map((p) => `<li>${esc(p)}</li>`).join("");
  $("#d-tips-title").textContent = level > 1 ? "Strategi" : "Tips cepat";
  $("#d-tips").innerHTML = (m.tips || []).map((p) => `<li>${esc(p)}</li>`).join("");
  $("#d-traps").innerHTML = (m.jebakan || []).map((p) => `<li>${esc(p)}</li>`).join("");
  renderExample(m.contoh, id);

  const done = $("#d-done");
  const already = level === 1 ? readMap()[id] : readLevel(id, level);
  done.textContent = already ? "✓ Sudah dibaca" : "Tandai sudah dibaca";
  done.onclick = () => {
    markRead(id, level);
    done.textContent = "✓ Sudah dibaca";
    toast("Materi ditandai sudah dibaca.");
  };
}

function renderExample(c, id) {
  const box = $("#d-opts");
  const sec = box.closest(".example");
  if (!c) { sec.hidden = true; return; }
  sec.hidden = false;
  const isTkp = id.startsWith("tkp-");
  $("#d-q").textContent = c.soal;
  // Soal figural: gambar soal (konteks) dan opsi bergambar
  let ctx = $("#d-ctx");
  if (!ctx) { ctx = document.createElement("div"); ctx.id = "d-ctx"; ctx.className = "question-context"; $("#d-q").closest("p").after(ctx); }
  ctx.hidden = !c.konteks;
  if (c.konteks) setContext(ctx, c.konteks);
  $("#d-expl").hidden = true;
  const fig = c.pilihan.some(isSvg);
  box.classList.toggle("options-fig", fig);
  box.innerHTML = c.pilihan
    .map((o, i) => `<button type="button" class="option" data-i="${i}"><span class="key">${LETTERS[i]}</span><span>${richText(o, `Gambar pilihan ${LETTERS[i]}`)}</span></button>`)
    .join("");
  box.querySelectorAll(".option").forEach((b) =>
    b.addEventListener("click", () => {
      const pick = Number(b.dataset.i);
      box.querySelectorAll(".option").forEach((x) => {
        const i = Number(x.dataset.i);
        x.disabled = true;
        if (i === c.jawaban) x.classList.add("right");
        else if (i === pick) x.classList.add("wrong");
      });
      const ex = $("#d-expl");
      ex.hidden = false;
      const head = pick === c.jawaban ? (isTkp ? "Nilai tertinggi!" : "Tepat!") : isTkp ? "Belum nilai tertinggi." : "Belum tepat.";
      ex.innerHTML = `<strong>${head}</strong> ${esc(c.pembahasan)}`;
    })
  );
}

function renderTabs(id, level, avail) {
  const rec = index.recommended?.[id];
  $("#d-tabs").innerHTML = [1, 2, 3, 4]
    .map((n) => {
      const label = `Lv${n} · ${LEVEL_NAMES[n]}`;
      const lock = n > 1 && !index.premium ? " 🔒" : "";
      const recTag = rec === n ? ` <span class="rec">Disarankan</span>` : "";
      if (n > 1 && !avail.includes(n)) return `<span class="soon" title="Segera tersedia">${label}</span>`;
      return `<a class="${n === level ? "active" : ""}" href="materi.html?topik=${id}&level=${n}" ${n === level ? 'aria-current="page"' : ""}>${label}${lock}${recTag}</a>`;
    })
    .join("");
}

function renderSide(id, level, avail) {
  const lv = today?.topicLevels?.[id];
  $("#d-mylevel").innerHTML = lv
    ? `Levelmu di topik ini: <span class="lv lv-${lv.level}">Lv ${lv.level} · ${LEVEL_NAMES[lv.level]}</span> <span class="xsmall">(${lv.pct}%)</span>`
    : auth.isLoggedIn()
      ? "Levelmu: belum diukur. Kerjakan latihan topik ini."
      : `<a href="masuk.html?next=${encodeURIComponent("materi.html?topik=" + id)}">Masuk</a> untuk melihat levelmu dan berlatih.`;
  $("#d-practice").href = auth.isLoggedIn() ? `latihan.html?topik=${id}` : `masuk.html?next=${encodeURIComponent("latihan.html?topik=" + id)}`;

  const queue = today ? topicQueue(today) : data.topics.map((x) => x.id);
  const nextId = queue[(queue.indexOf(id) + 1) % queue.length];
  const next = data.topics.find((x) => x.id === nextId);
  $("#d-next").href = `materi.html?topik=${nextId}`;
  $("#d-next").textContent = `Berikutnya: ${next.name} →`;

  $("#d-levels").innerHTML = (index.available[id] || [])
    .map((x) => `<a class="${x.level === level ? "current" : ""}" href="materi.html?topik=${id}&level=${x.level}"><span>Lv${x.level} · ${esc(x.title)}</span><span>${index.premium ? (readLevel(id, x.level) ? "✓" : "") : "🔒"}</span></a>`)
    .join("") || `<div><span>Segera tersedia</span><span>🔒</span></div>`;
  $("#d-levelnote").innerHTML = index.premium
    ? "Semua level terbuka untuk akun Premium-mu."
    : `Level 2–4 tersedia di <a href="premium.html"><strong>Premium</strong></a>.`;
}

function renderLocked(id, level, d) {
  const tz = d.teaser;
  const box = $("#d-locked");
  box.hidden = false;
  const login = d.reason === "LOGIN";
  const next = encodeURIComponent(`materi.html?topik=${id}&level=${level}`);
  box.innerHTML = `
    <span class="eyebrow">Materi Premium · Level ${level} · ${LEVEL_NAMES[level]}</span>
    <h2>${esc(tz.title)}</h2>
    <p>${esc(tz.intro)}</p>
    <p class="small muted">Berisi ${tz.pointCount} poin kunci, contoh soal ${LEVEL_DESC[level].toLowerCase()} beserta pembahasan, strategi, dan jebakan yang sering muncul. ± ${tz.minutes} menit.</p>
    <div class="row">
      ${login ? `<a class="btn btn-primary" href="masuk.html?next=${next}">Masuk untuk melanjutkan</a>` : ""}
      <a class="btn btn-accent" href="premium.html">Buka dengan Premium</a>
      <a class="btn btn-secondary" href="materi.html?topik=${id}&level=1">Baca Level 1 (gratis)</a>
    </div>`;
  $("#d-done").hidden = true;
}

function status(msg, isError) {
  const el = $("#m-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
