/**
 * materi.js — Menu B "Paket Materi" (Fase 13).
 *
 * Daftar: tiga kotak TWK · TIU · TKP, lalu daftar judul (21 topik). Judul teratas tiap subtes gratis,
 * judul lain bertanda kunci → pop-up langganan Premium.
 * Rincian: satu halaman lengkap per topik (konsep dasar level 1 dari repo + pendalaman level 2–4 dari server),
 * lalu 3 contoh soal (mudah, sedang, sulit) yang dijawab satu per satu dengan kunci & pembahasan langsung.
 */

import { api } from "../core/api.js";
import { $, esc, getParam, toast, isSvg, richText, setContext } from "../core/ui.js";
import { markRead } from "./plan.js";
import { ICON, initBottomNav, premiumSheet, emptyBox } from "./hub.js";

const LETTERS = ["A", "B", "C", "D", "E"];
const SUB = { twk: "TWK", tiu: "TIU", tkp: "TKP" };
const LEVEL_NAME = { 2: "Pemahaman", 3: "Analisis soal HOTS", 4: "Strategi siap tes" };
let base = null;     // materi level 1 (publik)
let index = null;    // status kunci dari server

export async function initMateri() {
  initBottomNav("materi");
  try {
    base = await (await fetch("../assets/data/materi-level1.json", { cache: "no-cache" })).json();
  } catch {
    return status("Materi belum bisa dimuat. Periksa koneksi lalu muat ulang.", true);
  }
  const res = await api.call("getMateriIndex");
  index = res.ok ? res.data : { premium: false, topics: base.topics.map((t, i) => ({ topicId: t.id, subtest: t.subtest, free: false, locked: true })) };
  const topic = getParam("topik");
  if (topic && base.topics.some((t) => t.id === topic)) return showDetail(topic);
  showList(getParam("sub") || "twk");
}

function nameOf(id) {
  return base.topics.find((t) => t.id === id)?.name || id;
}

/* ---------------- daftar ---------------- */
function showList(sub) {
  $("#m-list").hidden = false;
  $("#m-detail").hidden = true;
  document.querySelectorAll(".subtab").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.sub === sub));
    b.onclick = () => { history.replaceState(null, "", `?sub=${b.dataset.sub}`); showList(b.dataset.sub); };
  });
  const items = index.topics.filter((t) => t.subtest === sub);
  $("#m-titles").innerHTML = items.length
    ? items.map((t, i) => `<li><a class="titem" href="?topik=${encodeURIComponent(t.topicId)}" data-topic="${esc(t.topicId)}" data-locked="${t.locked}">
        <span class="no">${i + 1}</span>
        <span class="tx"><b>${esc(nameOf(t.topicId))}</b><small>${t.free ? "Contoh gratis · materi lengkap + 3 contoh soal" : "Materi lengkap + 3 contoh soal (mudah, sedang, sulit)"}</small></span>
        <span class="end">${t.free ? `<span class="free-tag">Gratis</span>` : t.locked ? `<span class="lock" title="Khusus Premium">${ICON.lock}</span>` : `<span class="owned">✓</span>`}›</span></a></li>`).join("")
    : `<li>${emptyBox("Belum ada materi.")}</li>`;
  $("#m-titles").querySelectorAll("[data-locked='true']").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); premiumSheet({ title: nameOf(a.dataset.topic), text: "Materi ini khusus Premium." }); })
  );
  $("#m-premium-note").textContent = index.premium ? "Premium aktif: semua judul terbuka." : "Premium: 1 bulan Rp30.000 · 3 bulan Rp75.000 · 6 bulan Rp150.000 untuk semua materi & latihan soal TWK, TIU, TKP.";
}

/* ---------------- rincian ---------------- */
async function showDetail(id) {
  const t = base.topics.find((x) => x.id === id);
  $("#m-list").hidden = true;
  $("#m-detail").hidden = false;
  $("#m-back").textContent = `‹ Materi ${SUB[t.subtest]}`;
  $("#m-back").href = `?sub=${t.subtest}`;
  $("#m-title").textContent = t.name;
  $("#m-lead").textContent = `${SUB[t.subtest]} · materi lengkap dari konsep dasar sampai strategi tes, lalu 3 contoh soal.`;
  document.title = `${t.name} — Paket Materi — Siap CPNS`;
  $("#d-doc").innerHTML = `<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div>`;

  const res = await api.call("getMateriTopic", { topicId: id });
  if (!res.ok) return status(res.error.message, true);
  if (res.data.locked) return renderLocked(t, res.data);
  renderDoc(t, res.data.levels || []);
  renderExamples(t, res.data.levels || []);
  $("#d-practice").href = `latihan-soal.html?topik=${encodeURIComponent(id)}`;
  $("#d-done").onclick = () => { markRead(id, 1); [2, 3, 4].forEach((l) => markRead(id, l)); toast("Materi ditandai sudah dibaca."); };
}

function renderLocked(t, d) {
  $("#d-doc").innerHTML = `<div class="stack" style="align-items:flex-start">
    <span class="lock" style="width:44px;height:44px">${ICON.lock}</span>
    <h2>${esc(t.name)}</h2>
    <p>${esc(t.ringkasan)}</p>
    <p class="muted small">Materi lengkap berisi ${d.teaser?.titles?.length || 3} bagian pendalaman${d.teaser?.titles?.length ? ` (${d.teaser.titles.map(esc).join(" · ")})` : ""}, ${d.teaser?.pointCount || ""} poin kunci, dan 3 contoh soal dengan pembahasan.</p>
    <button class="btn btn-accent" type="button" id="d-unlock">Buka dengan Premium</button></div>`;
  $("#d-examples").innerHTML = emptyBox("Contoh soal terbuka bersama materi Premium.");
  $("#d-next").hidden = true;
  $("#d-unlock").onclick = () => premiumSheet({ title: t.name, text: "Materi ini khusus Premium." });
  premiumSheet({ title: t.name, text: "Materi ini khusus Premium." });
}

const para = (s) => String(s || "").split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

function renderDoc(t, levels) {
  const tips = [...(t.tips || []), ...levels.flatMap((m) => m.tips || [])];
  const traps = [...(t.jebakan || []), ...levels.flatMap((m) => m.jebakan || [])];
  $("#d-doc").innerHTML = `
    <div class="sect"><span class="lvl">Bagian 1 · Konsep dasar</span><h2>${esc(t.name)}</h2>${para(t.ringkasan)}${list(t.poinKunci)}</div>
    ${levels.map((m, i) => `<div class="sect"><span class="lvl">Bagian ${i + 2} · ${esc(LEVEL_NAME[m.level] || "Pendalaman")}</span><h3>${esc(m.title)}</h3>${para(m.ringkasan)}${list(m.poinKunci)}</div>`).join("")}
    ${tips.length || traps.length ? `<div class="sect"><span class="lvl">Bagian ${levels.length + 2} · Strategi & jebakan</span><h3>Cara cepat dan hal yang perlu diwaspadai</h3>
      ${tips.length ? `<div class="note"><b>Strategi</b>${list(tips)}</div>` : ""}${traps.length ? `<div class="note"><b>Jebakan yang sering muncul</b>${list(traps)}</div>` : ""}</div>` : ""}`;
}

function renderExamples(t, levels) {
  const byLv = (l) => levels.find((m) => m.level === l)?.contoh;
  const easy = t.contoh, mid = byLv(2) || byLv(3), hard = byLv(4) || byLv(3);
  const ex = [[easy, "Mudah", "d1"], [mid, "Sedang", "d2"], [hard, "Sulit", "d3"]].filter((x) => x[0]);
  const box = $("#d-examples");
  if (!ex.length) { box.innerHTML = emptyBox("Contoh soal untuk topik ini segera ditambahkan."); return; }
  const isTkp = t.subtest === "tkp";
  box.innerHTML = ex.map(([c, label, cls], n) => `<article class="ex" data-n="${n}">
      <div class="ex-head"><b>Soal ${n + 1}</b><span class="diff ${cls}">${label}</span></div>
      <p class="question-text" style="margin:0">${esc(c.soal)}</p>
      <div class="question-context" data-ctx hidden></div>
      <div class="options${c.pilihan.some(isSvg) ? " options-fig" : ""}">${c.pilihan.map((o, i) => `<button type="button" class="option" data-i="${i}"><span class="key">${LETTERS[i]}</span><span>${richText(o, `Gambar pilihan ${LETTERS[i]}`)}</span></button>`).join("")}</div>
      <div class="expl" hidden></div>
    </article>`).join("");
  box.querySelectorAll(".ex").forEach((card) => {
    const c = ex[Number(card.dataset.n)][0];
    if (c.konteks) setContext(card.querySelector("[data-ctx]"), c.konteks);
    card.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => {
      const pick = Number(b.dataset.i);
      card.querySelectorAll(".option").forEach((x) => {
        const i = Number(x.dataset.i);
        x.disabled = true;
        if (i === c.jawaban) x.classList.add("right");
        else if (i === pick) x.classList.add("wrong");
      });
      const ok = pick === c.jawaban;
      const e = card.querySelector(".expl");
      e.hidden = false;
      e.classList.add(ok ? "ok" : "no");
      e.innerHTML = `<b>${ok ? (isTkp ? "Nilai tertinggi!" : "Tepat!") : `${isTkp ? "Belum nilai tertinggi" : "Belum tepat"} — jawaban terbaik: ${LETTERS[c.jawaban]}`}</b><br>${esc(c.pembahasan)}`;
    }));
  });
}

function status(msg, isErr) {
  const el = $("#m-status");
  el.hidden = !msg;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isErr));
}
