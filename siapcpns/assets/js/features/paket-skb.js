/**
 * paket-skb.js — Menu G "Paket SKB" (Fase 14).
 *
 * Alur halaman (satu halaman, beberapa tampilan lewat parameter URL):
 *   paket-skb.html                     → pilih instansi (pilihan tersimpan di profil)
 *   paket-skb.html?i=kemenag&tab=…     → kotak Tryout SKB · Materi SKB · Latihan Soal · Wawancara · Info seleksi
 *   paket-skb.html?i=kemenag&materi=…  → materi satu topik + 3 contoh soal
 *   paket-skb.html?i=kemenag&wawancara=1 → latihan wawancara gaya mock test (mode suara / ketik)
 *   paket-skb.html?hasil=<sesi>        → hasil wawancara
 *
 * Premium SKB (Rp85.000 / 30 hari, semua instansi) terpisah dari Premium SKD.
 * Gratis per instansi: topik pertama (materi + latihan) dan 1 sesi wawancara.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store } from "../core/store.js";
import { $, $$, esc, fmtDate, getParam, setBusy, toast, isSvg, richText, setContext } from "../core/ui.js";
import { runExam } from "./cat-engine.js";
import { voiceSupport, createListener, testVoice, startSideRecorder } from "./voice.js";
import { ICON, goLogin, initBottomNav, skbSheet, handleCommonError, emptyBox, rupiah } from "./hub.js";

const LETTERS = ["A", "B", "C", "D", "E"];
const LEVEL_NAME = { 1: "Konsep dasar", 2: "Pemahaman", 3: "Analisis kasus", 4: "Strategi siap tes" };
const TABS = ["tryout", "materi", "latihan", "wawancara", "info"];
let D = null;           // data instansi aktif
let pending = null;     // { packageId, button, title, text }

export async function initPaketSkb() {
  initBottomNav("");
  $$("[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ""));
  $("#start-cancel").addEventListener("click", () => { $("#start-modal").hidden = true; pending = null; });
  $("#start-ready").addEventListener("change", (e) => ($("#start-ok").disabled = !e.target.checked));
  $("#start-ok").addEventListener("click", () => { const p = pending; $("#start-modal").hidden = true; pending = null; if (p) begin(p.packageId, p.button); });

  const hasil = getParam("hasil");
  if (hasil) return showResultPage(hasil);
  const ins = getParam("i");
  if (!ins) return showPicker();
  if (getParam("wawancara")) return startInterviewFlow(ins);
  const topic = getParam("materi");
  await loadInstansi(ins);
  if (!D) return;
  if (topic) return showMateri(topic);
  showInstansi(getParam("tab") || "tryout");
}

function status(msg, isErr) {
  const el = $("#s-status");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.classList.toggle("error", Boolean(isErr));
}

function planBox(skb, price) {
  const el = $("#s-plan");
  if (skb && skb.active) {
    el.innerHTML = `<div class="skb-plan on"><span class="ic">${ICON.star}</span><span><b>Premium SKB aktif</b><small>sampai ${esc(fmtDate(skb.until))} · semua instansi terbuka</small></span><button class="btn btn-ghost btn-sm" type="button" id="sp-extend">Perpanjang</button></div>`;
  } else {
    el.innerHTML = `<div class="skb-plan"><span class="ic">${ICON.lock}</span><span><b>Premium SKB ${rupiah(price)}/bulan</b><small>3 tryout per instansi, semua materi & latihan, wawancara tanpa batas · semua instansi</small></span><button class="btn btn-accent btn-sm" type="button" id="sp-extend">Langganan</button></div>`;
  }
  $("#sp-extend").onclick = () => skbSheet({ price, title: skb && skb.active ? "Perpanjang Premium SKB" : "Premium SKB", text: skb && skb.active ? "Tambah 30 hari dari tanggal berakhir saat ini." : "Satu langganan membuka Paket SKB semua instansi." });
}

/* =================== 1. Pilih instansi =================== */
async function showPicker() {
  $("#v-pick").hidden = false;
  const res = await api.call("getSkbCatalog");
  if (!res.ok) return handleCommonError(res.error, $("#s-status"));
  const c = res.data;
  planBox(c.skb, c.price);
  const list = [...c.instansi].sort((a, b) => (a.id === c.selected ? -1 : b.id === c.selected ? 1 : 0));
  $("#ins-list").innerHTML = list.map((x) => {
    const parts = x.general ? [`${x.topics} topik`, x.tryouts ? `${x.tryouts} tryout` : ""] : [`${x.topics} topik`, x.tryouts ? `${x.tryouts} tryout` : "", x.interview ? "wawancara" : ""];
    return `<a class="ins-card${x.id === c.selected ? " sel" : ""}${x.ready ? "" : " soon"}" href="?i=${encodeURIComponent(x.id)}" data-id="${esc(x.id)}">
      <span class="ins-ic">${x.general ? ICON.materi : ICON.skb}</span>
      <span class="tx"><b>${esc(x.short)}</b><small>${esc(x.name !== x.short ? x.name : "")}</small>
        <small class="meta">${x.ready ? esc(parts.filter(Boolean).join(" · ")) : "Konten segera hadir"}</small></span>
      <span class="end">${x.id === c.selected ? `<span class="free-tag">Pilihanmu</span>` : ""}›</span></a>`;
  }).join("");
  $$("#ins-list [data-id]").forEach((a) => a.addEventListener("click", () => {
    if (auth.isLoggedIn()) api.call("setSkbInstansi", { instansi: a.dataset.id });
  }));
}

/* =================== 2. Satu instansi =================== */
async function loadInstansi(id) {
  const res = await api.call("getSkbInstansi", { instansi: id });
  if (!res.ok) { handleCommonError(res.error, $("#s-status")); return; }
  D = res.data;
  planBox(D.skb, D.price);
  $("#s-title").textContent = `Paket SKB ${D.instansi.short}`;
  $("#s-lead").textContent = D.instansi.name !== D.instansi.short ? D.instansi.name : "Materi umum SKB untuk banyak jabatan";
  $("#s-back").textContent = "‹ Semua instansi";
  $("#s-back").href = "paket-skb.html";
  document.title = `Paket SKB ${D.instansi.short} — Siap CPNS`;
}

function showInstansi(tab) {
  if (!TABS.includes(tab)) tab = "tryout";
  $("#v-ins").hidden = false;
  $("#i-note").textContent = D.instansi.note || "";
  $("#i-note").hidden = !D.instansi.note;
  $$("#i-tabs [data-tab]").forEach((b) => {
    if (b.dataset.tab === "latihan" || b.dataset.tab === "wawancara") b.hidden = D.instansi.general;
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.onclick = () => { history.replaceState(null, "", `?i=${encodeURIComponent(D.instansi.id)}&tab=${b.dataset.tab}`); showInstansi(b.dataset.tab); };
  });
  $$("#v-ins [data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab));
  ({ tryout: renderTryouts, materi: renderMateriList, latihan: renderLatihan, wawancara: renderInterviewBox, info: renderInfo })[tab]();
}

function renderTryouts() {
  const box = $("#i-tryouts");
  if (!D.tryouts.length) { box.innerHTML = emptyBox(`Tryout SKB ${D.instansi.short} sedang disiapkan. Sementara itu, pelajari materi dan kerjakan latihan soal.`); return; }
  box.innerHTML = D.tryouts.map((t) => {
    const meta = `${t.questionCount} soal · ${t.durationMin} menit`;
    const last = t.last ? `<div class="history-mini"><span>Terbaik ${t.best}/${t.max} · ${t.attempts}× dikerjakan</span><a href="rapor.html?id=${encodeURIComponent(t.last.attemptId)}">Rapor terakhir (${esc(fmtDate(t.last.submittedAt))}) ›</a></div>` : "";
    const btn = t.inProgress ? `<button class="btn btn-primary" type="button" data-go="${esc(t.packageId)}" data-run="1">Lanjutkan</button>`
      : t.locked ? `<button class="btn btn-accent" type="button" data-lock="1">${ICON.lock} Buka dengan Premium SKB</button>`
      : t.canStart ? `<button class="btn btn-primary" type="button" data-go="${esc(t.packageId)}">${t.attempts ? "Kerjakan lagi" : "Mulai tryout"}</button>`
      : `<span class="small muted">Kuota gratis sudah dipakai</span>`;
    return `<article class="pcard"><div class="meta"><span class="chip chip-primary">SKB ${esc(D.instansi.short)}</span>${t.inProgress ? `<span class="chip chip-warn">Berjalan</span>` : ""}</div>
      <h3>${esc(t.title)}</h3><p class="desc">${esc(t.description || "")}</p><p class="small muted">${esc(meta)}</p>${last}<div class="foot">${btn}</div></article>`;
  }).join("");
  box.querySelectorAll("[data-lock]").forEach((b) => b.addEventListener("click", () => skbSheet({ price: D.price, text: "Tryout SKB instansi khusus Premium SKB." })));
  box.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    const t = D.tryouts.find((x) => x.packageId === b.dataset.go);
    if (!auth.isLoggedIn()) return goLogin();
    if (b.dataset.run) return begin(t.packageId, b);
    confirmStart(t.packageId, b, `Mulai ${t.title}?`, `${t.questionCount} soal dalam ${t.durationMin} menit. Waktu berjalan sejak kamu menekan Mulai. Kerjakan semua soal lalu kirim — skor, kunci, dan pembahasan tampil di rapor.`);
  }));
}

function lockEnd(t) {
  return t.free ? `<span class="free-tag">Gratis</span>` : t.locked ? `<span class="lock" title="Khusus Premium SKB">${ICON.lock}</span>` : `<span class="owned">✓</span>`;
}

function renderMateriList() {
  const ul = $("#i-materi");
  ul.innerHTML = D.topics.map((t, i) => `<li><a class="titem" href="?i=${encodeURIComponent(D.instansi.id)}&materi=${encodeURIComponent(t.topicId)}" data-topic="${esc(t.topicId)}" data-locked="${t.locked}" data-empty="${!t.materi}">
      <span class="no">${i + 1}</span><span class="tx"><b>${esc(t.name)}</b><small>${t.materi ? `${t.materiTitles.length} bagian + contoh soal mudah, sedang, sulit` : "Segera hadir"}</small></span>
      <span class="end">${t.materi ? lockEnd(t) : ""}›</span></a></li>`).join("");
  ul.querySelectorAll("[data-topic]").forEach((a) => a.addEventListener("click", (e) => {
    if (a.dataset.empty === "true") { e.preventDefault(); return toast("Materi topik ini sedang disiapkan."); }
    if (a.dataset.locked === "true") { e.preventDefault(); skbSheet({ price: D.price, title: a.querySelector("b").textContent, text: "Materi ini khusus Premium SKB." }); }
  }));
}

function renderLatihan() {
  $("#i-lt-sub").textContent = `${D.topicSize} soal per topik · ${D.topicMin} menit`;
  const ul = $("#i-latihan");
  ul.innerHTML = D.topics.map((t, i) => {
    const sub = !t.questions ? "Segera hadir" : t.last ? `Skor terakhir ${t.last.total}/${t.questions * 5} · ${fmtDate(t.last.submittedAt)}` : `${t.questions} soal · ${D.topicMin} menit · mudah → sulit`;
    const end = t.inProgress ? `<span class="chip chip-warn">Berjalan</span>` : t.questions ? lockEnd(t) : "";
    return `<li><button type="button" class="titem" data-topic="${esc(t.topicId)}"><span class="no">${i + 1}</span><span class="tx"><b>${esc(t.name)}</b><small>${esc(sub)}</small></span><span class="end">${end}›</span></button>
      ${t.last ? `<div style="padding:0 16px 12px 60px"><a class="small" href="rapor.html?id=${encodeURIComponent(t.last.attemptId)}">Lihat pembahasan terakhir ›</a></div>` : ""}</li>`;
  }).join("");
  ul.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => {
    const t = D.topics.find((x) => x.topicId === b.dataset.topic);
    if (!t.questions) return toast("Latihan topik ini sedang disiapkan.");
    if (t.locked) return skbSheet({ price: D.price, title: `Latihan ${t.name}`, text: "Latihan soal topik ini khusus Premium SKB." });
    if (!auth.isLoggedIn()) return goLogin();
    if (t.inProgress) return begin(t.packageId, b);
    confirmStart(t.packageId, b, `Mulai latihan ${t.name}?`, `${t.questions} soal dari mudah ke sulit dalam ${D.topicMin} menit. Kerjakan semua soal lalu kirim — kunci & pembahasan tampil setelah dikirim.`);
  }));
}

function renderInterviewBox() {
  const iv = D.interview;
  const box = $("#i-iv");
  if (!iv.available) { box.innerHTML = emptyBox(`Bank pertanyaan wawancara ${D.instansi.short} sedang disiapkan.`); $("#i-iv-hist").innerHTML = ""; return; }
  const quota = iv.freeLeft === null ? "Premium SKB: latihan tanpa batas" : iv.freeLeft > 0 ? `Gratis ${iv.freeLeft}× untuk instansi ini` : "Sesi gratis sudah dipakai";
  box.innerHTML = `<div class="row" style="align-items:center;gap:12px"><span class="ins-ic">${ICON.mic}</span><div><h3>Latihan wawancara ${esc(D.instansi.short)}</h3><span class="small muted">${esc(quota)}</span></div></div>
    <p class="small">Simulasi wawancara gaya mock test: 7 pertanyaan dalam 3 bagian, dibacakan oleh pewawancara. Jawab dengan suara (atau ketik), lalu dapatkan skor rubrik, band 1–9, saran perbaikan, dan jawaban model.</p>
    <ul class="incl"><li>Bagian 1 · perkenalan & motivasi (3 pertanyaan, ±1 menit)</li><li>Bagian 2 · presentasi singkat (1 menit persiapan, 2 menit bicara)</li><li>Bagian 3 · wawasan ${esc(D.instansi.short)} & situasi kerja (3 pertanyaan)</li></ul>
    <div class="foot">${iv.canStart ? `<a class="btn btn-primary" href="?i=${encodeURIComponent(D.instansi.id)}&wawancara=1">${ICON.mic} Mulai latihan wawancara</a>` : `<button class="btn btn-accent" type="button" id="iv-lock">${ICON.lock} Buka dengan Premium SKB</button>`}<span class="xsmall muted">± 15 menit</span></div>`;
  $("#iv-lock")?.addEventListener("click", () => skbSheet({ price: D.price, text: "Sesi wawancara gratis sudah dipakai. Premium SKB membuka latihan wawancara tanpa batas." }));
  $("#i-iv-hist").innerHTML = iv.history.length ? `<div class="sec-title" style="margin:0"><h2 style="font-size:var(--fs-md)">Riwayat wawancara</h2></div>
    <div class="mini-list">${iv.history.map((h) => `<a class="ticket" href="?hasil=${encodeURIComponent(h.sessionId)}" style="text-decoration:none;color:var(--fg)"><span class="tx"><b>Band ${fmtBand(h.band)} · ${h.score}/100</b><small>${esc(fmtDate(h.submittedAt))}</small></span><span class="muted">›</span></a>`).join("")}</div>` : "";
}

function renderInfo() {
  $("#i-info").innerHTML = D.info.map((x) => `<li>${esc(x)}</li>`).join("");
  const skd = $("#calc-skd"), skb = $("#calc-skb");
  const f = (n) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const upd = () => {
    const a = Math.min(550, Math.max(0, Number(skd.value) || 0)), b = Math.min(100, Math.max(0, Number(skb.value) || 0));
    const pa = Math.round((a / 550) * 40 * 100) / 100, pb = Math.round(b * 0.6 * 100) / 100;
    $("#calc-out").textContent = f(pa + pb);
    $("#calc-detail").textContent = `SKD ${f(pa)} + SKB ${f(pb)}`;
  };
  skd.oninput = upd; skb.oninput = upd; $("#skb-calc").onsubmit = (e) => e.preventDefault();
  upd();
}

function confirmStart(packageId, button, title, text) {
  pending = { packageId, button };
  $("#start-title").textContent = title;
  $("#start-text").textContent = text;
  $("#start-ready").checked = false;
  $("#start-ok").disabled = true;
  $("#start-modal").hidden = false;
}

async function begin(packageId, button) {
  if (button) setBusy(button, true, "Menyiapkan soal…");
  const res = await api.call("startAttempt", { packageId });
  if (button) setBusy(button, false);
  if (!res.ok) return handleCommonError(res.error, $("#s-status"));
  $("#view-hub").hidden = true;
  $("#view-exam").hidden = false;
  document.body.classList.add("exam-on");
  window.scrollTo(0, 0);
  runExam(res.data, { onSubmitted: (attemptId) => location.replace(`rapor.html?id=${encodeURIComponent(attemptId)}`) });
}

/* =================== 3. Materi =================== */
const para = (s) => String(s || "").split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("");
const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");

async function showMateri(topicId) {
  $("#v-materi").hidden = false;
  const back = `?i=${encodeURIComponent(D.instansi.id)}&tab=materi`;
  $("#s-back").textContent = `‹ Materi SKB ${D.instansi.short}`;
  $("#s-back").href = back;
  $("#m-back2").href = back;
  $("#m-doc").innerHTML = `<div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div>`;
  const res = await api.call("getSkbMateri", { topicId });
  if (!res.ok) return handleCommonError(res.error, $("#s-status"));
  const m = res.data;
  $("#s-title").textContent = m.name;
  $("#s-lead").textContent = `Materi SKB ${D.instansi.short} · dari konsep dasar sampai strategi tes, lalu 3 contoh soal.`;
  document.title = `${m.name} — Paket SKB ${D.instansi.short} — Siap CPNS`;
  const t = D.topics.find((x) => x.topicId === topicId);
  $("#m-practice").href = `?i=${encodeURIComponent(D.instansi.id)}&tab=latihan`;
  $("#m-next").hidden = D.instansi.general || !(t && t.questions);
  if (m.empty) { $("#m-doc").innerHTML = emptyBox("Materi topik ini sedang disiapkan."); $("#m-ex-wrap").hidden = true; return; }
  if (m.locked) {
    $("#m-doc").innerHTML = `<div class="stack" style="align-items:flex-start"><span class="lock" style="width:44px;height:44px">${ICON.lock}</span><h2>${esc(m.name)}</h2>
      <p class="muted small">Materi lengkap berisi ${m.teaser.titles.length} bagian (${m.teaser.titles.map(esc).join(" · ")}), ${m.teaser.pointCount} poin kunci, dan 3 contoh soal dengan pembahasan.</p>
      <button class="btn btn-accent" type="button" id="m-unlock">Buka dengan Premium SKB</button></div>`;
    $("#m-examples").innerHTML = emptyBox("Contoh soal terbuka bersama materi Premium SKB.");
    $("#m-next").hidden = true;
    const open = () => skbSheet({ price: m.price || D.price, title: m.name, text: "Materi ini khusus Premium SKB." });
    $("#m-unlock").onclick = open;
    return open();
  }
  const lv = m.levels;
  const tips = lv.flatMap((x) => x.tips || []), traps = lv.flatMap((x) => x.jebakan || []);
  $("#m-doc").innerHTML = lv.map((x, i) => `<div class="sect"><span class="lvl">Bagian ${i + 1} · ${esc(LEVEL_NAME[x.level] || "Pendalaman")}</span>${i ? `<h3>${esc(x.title)}</h3>` : `<h2>${esc(x.title)}</h2>`}${para(x.ringkasan)}${list(x.poinKunci)}</div>`).join("")
    + (tips.length || traps.length ? `<div class="sect"><span class="lvl">Bagian ${lv.length + 1} · Strategi & jebakan</span><h3>Cara cepat dan hal yang perlu diwaspadai</h3>
      ${tips.length ? `<div class="note"><b>Strategi</b>${list(tips)}</div>` : ""}${traps.length ? `<div class="note"><b>Jebakan yang sering muncul</b>${list(traps)}</div>` : ""}</div>` : "");
  renderExamples(lv);
}

function renderExamples(levels) {
  const ex = levels.filter((x) => x.contoh).slice(0, 3).map((x, i) => [x.contoh, ["Mudah", "Sedang", "Sulit"][i], "d" + (i + 1)]);
  const box = $("#m-examples");
  $("#m-ex-wrap").hidden = false;
  if (!ex.length) { box.innerHTML = emptyBox("Contoh soal untuk topik ini segera ditambahkan."); return; }
  box.innerHTML = ex.map(([c, label, cls], n) => `<article class="ex" data-n="${n}">
      <div class="ex-head"><b>Soal ${n + 1}</b><span class="diff ${cls}">${label}</span></div>
      <p class="question-text" style="margin:0">${esc(c.soal)}</p>
      <div class="question-context" data-ctx hidden></div>
      <div class="options${c.pilihan.some(isSvg) ? " options-fig" : ""}">${c.pilihan.map((o, i) => `<button type="button" class="option" data-i="${i}"><span class="key">${LETTERS[i]}</span><span>${richText(o, `Gambar pilihan ${LETTERS[i]}`)}</span></button>`).join("")}</div>
      <div class="expl" hidden></div></article>`).join("");
  box.querySelectorAll(".ex").forEach((card) => {
    const c = ex[Number(card.dataset.n)][0];
    if (c.konteks) setContext(card.querySelector("[data-ctx]"), c.konteks);
    card.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => {
      const pick = Number(b.dataset.i);
      card.querySelectorAll(".option").forEach((x) => { const i = Number(x.dataset.i); x.disabled = true; if (i === c.jawaban) x.classList.add("right"); else if (i === pick) x.classList.add("wrong"); });
      const ok = pick === c.jawaban, e = card.querySelector(".expl");
      e.hidden = false; e.classList.add(ok ? "ok" : "no");
      e.innerHTML = `<b>${ok ? "Tepat!" : `Belum tepat — jawaban benar: ${LETTERS[c.jawaban]}`}</b><br>${esc(c.pembahasan)}`;
    }));
  });
}

/* =================== 4. Latihan wawancara =================== */
// Fase 14.1: mesin suara dipisah ke voice.js (tanpa getUserMedia bersamaan di HP, mulai ulang otomatis, pesan galat jelas).
const IV = { s: null, idx: 0, answers: [], mode: "voice", tts: true, timer: null, listener: null, side: null, audioUrl: "", phase: "", t0: 0,
  ansMode: "voice", tested: false, q: null };
const fmtClock = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, "0")}`;
const fmtBand = (b) => String(b).replace(".", ",");
const ivKey = (sid) => "iv.progress." + sid;
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

async function startInterviewFlow(insId) {
  if (!auth.isLoggedIn()) return goLogin();
  $("#view-hub").hidden = true;
  $("#view-iv").hidden = false;
  document.body.classList.add("exam-on");
  const sup = voiceSupport();
  if (!sup.ok) {
    $("#iv-voice-note").textContent = sup.reason;
    $("input[name=iv-mode][value=voice]").disabled = true;
    $("input[name=iv-mode][value=text]").checked = true;
  } else if (sup.warn) $("#iv-voice-note").textContent = "Jawab dengan berbicara. " + sup.warn;
  const syncMode = () => { $("#iv-test-box").hidden = $("input[name=iv-mode]:checked").value !== "voice"; };
  $$("input[name=iv-mode]").forEach((r) => r.addEventListener("change", syncMode));
  syncMode();
  $("#iv-title").textContent = "Latihan wawancara";
  $("#iv-part").textContent = "Persiapan";
  $("#iv-step").textContent = "";
  $("#iv-cancel").onclick = () => location.replace(`paket-skb.html?i=${encodeURIComponent(insId)}&tab=wawancara`);
  $("#iv-mic-test").onclick = micTest;
  $("#iv-begin").onclick = async () => {
    const btn = $("#iv-begin");
    IV.mode = $("input[name=iv-mode]:checked").value;
    IV.tts = $("#iv-tts").checked;
    if (IV.mode === "voice" && !IV.tested) {
      setupMsg("Jalankan tes mikrofon dulu sampai keempat tanda ✓ hijau. Bila tes gagal, pilih Mode ketik.");
      $("#iv-test-box").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(btn, true, "Menyiapkan sesi…");
    const res = await api.call("startInterview", { instansi: insId });
    setBusy(btn, false);
    if (!res.ok) { if (!handleCommonError(res.error)) setupMsg(res.error.message); return; }
    IV.s = res.data;
    const saved = safeGet(ivKey(IV.s.sessionId));
    IV.answers = saved && Array.isArray(saved.answers) ? saved.answers : [];
    IV.idx = IV.answers.length;
    $("#iv-title").textContent = `Wawancara ${IV.s.instansi.short}`;
    $("#iv-setup").hidden = true;
    $("#iv-run").hidden = false;
    if (IV.idx >= IV.s.questions.length) return submitInterview();
    askQuestion();
  };
}

function setupMsg(m) { const el = $("#iv-setup-msg"); el.hidden = !m; el.classList.add("error"); el.textContent = m || ""; }
function safeGet(k) { try { return store.get(k, null); } catch { return null; } }
function safeSet(k, v) { try { store.set(k, v); } catch { /* abaikan */ } }

/** Tes 4 langkah: dukungan browser → izin → suara masuk → ucapan dikenali. */
async function micTest() {
  const btn = $("#iv-mic-test");
  setupMsg("");
  $$("#iv-check li").forEach((li) => { li.dataset.s = "wait"; li.querySelector("i").textContent = ""; li.querySelector("span").title = ""; });
  $("#iv-check [data-k=support]").dataset.s = "run";
  $("#iv-test-text").hidden = true;
  $("#iv-test-msg").textContent = "Mendengarkan… ucapkan: \"Saya siap mengikuti wawancara.\"";
  $("#iv-test-msg").className = "xsmall";
  setBusy(btn, true, "🔴 Mendengarkan…");
  const mark = (k, ok, detail) => {
    const li = $(`#iv-check [data-k=${k}]`);
    if (!li) return;
    li.dataset.s = ok ? "ok" : "bad";
    li.querySelector("i").textContent = ok ? "✓" : "✕";
    const next = li.nextElementSibling;
    if (ok && next && next.dataset.s === "wait") next.dataset.s = "run";
    if (!ok && detail) { $("#iv-test-msg").textContent = detail; $("#iv-test-msg").className = "xsmall iv-bad"; }
    if (ok && k === "support" && detail) $("#iv-test-msg").textContent = detail;
  };
  const r = await testVoice({
    step: mark,
    text: (f, i) => { const el = $("#iv-test-text"); el.hidden = false; el.innerHTML = `“${esc(f)}<span class="int"> ${esc(i)}</span>”`; },
  });
  setBusy(btn, false);
  btn.textContent = r.ok ? "Tes ulang" : "🎙 Coba tes lagi";
  IV.tested = r.ok;
  if (r.ok) {
    ["perm", "sound", "text"].forEach((k) => { const li = $(`#iv-check [data-k=${k}]`); if (li.dataset.s !== "ok") { li.dataset.s = "ok"; li.querySelector("i").textContent = "✓"; } });
    $("#iv-test-msg").textContent = "✓ Mikrofon dan pengenalan suara berfungsi. Kamu siap memulai.";
    $("#iv-test-msg").className = "xsmall iv-good";
  } else {
    $$("#iv-check li").forEach((li) => { if (li.dataset.s === "run") li.dataset.s = "wait"; });
    if (!$("#iv-test-msg").textContent || /Mendengarkan/.test($("#iv-test-msg").textContent)) $("#iv-test-msg").textContent = r.error || "Tes belum berhasil.";
    $("#iv-test-msg").className = "xsmall iv-bad";
  }
}

function speak(text) {
  return new Promise((resolve) => {
    if (!IV.tts || !window.speechSynthesis) return resolve();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "id-ID"; u.rate = 0.98;
      const v = speechSynthesis.getVoices().find((x) => /^id(-|_)/i.test(x.lang));
      if (v) u.voice = v;
      const guard = setTimeout(resolve, Math.min(30000, 1500 + text.length * 90));
      u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
      speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

function setPhase(name, label) {
  IV.phase = name;
  $("#iv-phase").textContent = label;
  $("#iv-dot").className = "iv-dot " + name;
  $("#iv-answer").dataset.phase = name;
}

function countdown(sec, onEnd) {
  clearInterval(IV.timer);
  const start = Date.now(), end = start + sec * 1000;
  const draw = () => {
    const left = (end - Date.now()) / 1000;
    $("#iv-clock").textContent = fmtClock(left);
    $("#iv-progress").style.width = Math.max(0, Math.min(100, ((Date.now() - start) / (sec * 1000)) * 100)) + "%";
    $("#iv-clock").classList.toggle("low", IV.phase === "rec" && left <= 10);
    if (left <= 0) { clearInterval(IV.timer); onEnd(); }
  };
  IV.timer = setInterval(draw, 250);
  draw();
}

function pill(id, s, text) { const el = $(id); el.dataset.s = s; el.textContent = text; }
function showAlert(msg) { $("#iv-alert").hidden = !msg; $("#iv-alert-text").textContent = msg || ""; }
function renderLive(f, i) {
  const el = $("#iv-live");
  el.innerHTML = f || i ? `${esc(f)}<span class="int"> ${esc(i)}</span>` : `<span class="ph">Mulai bicara… ucapanmu akan muncul di sini sebagai teks.</span>`;
  const n = words(`${f} ${i}`);
  $("#iv-words").textContent = `${n} kata`;
  el.scrollTop = el.scrollHeight;
}

async function askQuestion() {
  const q = IV.s.questions[IV.idx];
  IV.q = q;
  $("#iv-part").textContent = q.partLabel;
  $("#iv-step").textContent = `${IV.idx + 1} / ${IV.s.questions.length}`;
  $("#iv-cat").textContent = q.category || "";
  $("#iv-q").textContent = q.text;
  $("#iv-review").hidden = true;
  $("#iv-answer").hidden = false;
  $("#iv-status").hidden = true;
  $("#iv-wave").hidden = true;
  $("#iv-live").hidden = true;
  showAlert("");
  $("#iv-text").hidden = true;
  $("#iv-text").value = "";
  $("#iv-stop").hidden = true;
  $("#iv-skip-prep").hidden = false;
  $("#iv-progress").style.width = "0%";
  $("#iv-q").focus();
  $("#iv-repeat").onclick = () => { const t = IV.tts; IV.tts = true; speak(q.text); IV.tts = t; };
  setPhase("listen", "Dengarkan pertanyaan");
  $("#iv-clock").textContent = fmtClock(q.prepSec);
  let started = false;
  const go = () => { if (started) return; started = true; window.speechSynthesis && speechSynthesis.cancel(); startAnswer(q); };
  $("#iv-skip-prep").onclick = go;
  await speak(q.text);
  if (started) return;
  setPhase("prep", `Persiapan · ${q.prepSec} detik — susun poin jawabanmu`);
  countdown(q.prepSec, go);
}

function startAnswer(q) {
  clearInterval(IV.timer);
  $("#iv-skip-prep").hidden = true;
  $("#iv-stop").hidden = false;
  $("#iv-review").hidden = true;
  showAlert("");
  IV.t0 = Date.now();
  IV.ansMode = IV.mode;
  if (IV.mode === "voice") {
    setPhase("rec", "Merekam jawaban");
    startVoice();
  } else {
    setPhase("rec", "Waktu menjawab — ketik jawabanmu");
    const ta = $("#iv-text"); ta.hidden = false; ta.focus();
  }
  $("#iv-stop").onclick = () => finishAnswer(q);
  countdown(q.answerSec, () => finishAnswer(q));
}

function startVoice() {
  $("#iv-status").hidden = false;
  $("#iv-wave").hidden = false;
  $("#iv-wave").dataset.on = "0";
  $("#iv-live").hidden = false;
  renderLive("", "");
  pill("#iv-mic", "wait", "🎙 Menyalakan mikrofon…");
  pill("#iv-voice", "wait", "Menunggu suara");
  let quietTimer = 0;
  const l = createListener({
    state: (st) => {
      if (st === "listening") { pill("#iv-mic", "ok", "🎙 Mikrofon aktif"); showAlert(""); }
      if (st === "sound" || st === "speech") {
        pill("#iv-voice", "ok", st === "speech" ? "🗣 Suara terdengar" : "🔊 Ada suara");
        $("#iv-wave").dataset.on = "1";
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => { $("#iv-wave").dataset.on = "0"; }, 1200);
      }
      if (st === "quiet") { $("#iv-wave").dataset.on = "0"; pill("#iv-voice", "wait", "Hening… lanjutkan bicara"); }
    },
    text: (f, i) => renderLive(f, i),
    error: (code, msg, fatal) => {
      if (fatal || code === "no-audio") pill("#iv-mic", "bad", "🎙 Mikrofon bermasalah");
      showAlert(msg);
    },
  });
  IV.listener = l;
  l.start();
  // Rekaman putar-ulang & meter level hanya di komputer (di HP mikrofon tidak bisa dipakai dua fitur sekaligus)
  IV.side = null;
  startSideRecorder((lv) => { $("#iv-wave").style.setProperty("--lv", lv.toFixed(2)); if (lv > 0.08) $("#iv-wave").dataset.on = "1"; }).then((s) => {
    if (IV.phase === "rec" && IV.ansMode === "voice") IV.side = s; else s && s.stop();
  });
  $("#iv-retry-mic").onclick = () => { showAlert(""); pill("#iv-mic", "wait", "🎙 Menyalakan mikrofon…"); l.abort(); l.start(); };
  $("#iv-to-text").onclick = () => switchToText();
}

/** Ganti jawaban ini ke mode ketik (teks yang sudah dikenali tetap dipakai). */
async function switchToText() {
  const got = IV.listener ? await IV.listener.stop() : "";
  if (IV.side) { IV.side.stop(); IV.side = null; }
  IV.ansMode = "text";
  $("#iv-status").hidden = true; $("#iv-wave").hidden = true; $("#iv-live").hidden = true; showAlert("");
  setPhase("rec", "Waktu menjawab — ketik jawabanmu");
  const ta = $("#iv-text"); ta.hidden = false; ta.value = got; ta.focus();
}

async function finishAnswer(q) {
  if (IV.phase !== "rec") return;
  clearInterval(IV.timer);
  setPhase("done", "Menyimpan jawaban…");
  $("#iv-stop").hidden = true;
  const dur = Math.round((Date.now() - IV.t0) / 1000);
  let text;
  if (IV.ansMode === "voice" && IV.listener) {
    text = await IV.listener.stop();
    if (IV.audioUrl) URL.revokeObjectURL(IV.audioUrl);
    IV.audioUrl = IV.side ? await IV.side.stop() : "";
    IV.side = null;
  } else text = $("#iv-text").value.trim();
  IV.listener = null;
  setPhase("done", "Jawaban selesai");
  $("#iv-answer").hidden = true;
  review(q, text, dur);
}

function review(q, text, dur) {
  const box = $("#iv-review");
  box.hidden = false;
  const audio = $("#iv-audio");
  audio.hidden = !IV.audioUrl;
  if (IV.audioUrl) audio.src = IV.audioUrl;
  $("#iv-review-note").textContent = IV.ansMode === "voice"
    ? (text ? "Ini teks dari ucapanmu. Perbaiki kata yang salah dikenali mesin bila perlu (bukan menambah isi)." + (IV.audioUrl ? " Rekaman bisa didengar ulang di bawah dan tidak dikirim ke server." : "")
      : "⚠ Tidak ada ucapan yang dikenali. Ketuk Ulangi jawaban untuk merekam lagi, atau ketik jawabanmu di kotak ini.")
    : "Periksa jawabanmu sebelum lanjut.";
  $("#iv-review-note").className = "xsmall " + (IV.ansMode === "voice" && !text ? "iv-bad" : "muted");
  const ta = $("#iv-edit");
  ta.value = text;
  ta.placeholder = "Ketik jawabanmu di sini…";
  $("#iv-self").innerHTML = IV.s.selfChecks.map((c, i) => `<label class="check"><input type="checkbox" data-self="${i}"> <span>${esc(c)}</span></label>`).join("");
  const last = IV.idx === IV.s.questions.length - 1;
  $("#iv-next").textContent = last ? "Selesai & lihat hasil" : "Pertanyaan berikutnya ›";
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#iv-redo").onclick = () => { box.hidden = true; $("#iv-answer").hidden = false; startAnswer(q); };
  $("#iv-next").onclick = () => {
    const final = ta.value.trim();
    IV.answers[IV.idx] = { qId: q.qId, transcript: final, durationSec: dur, mode: IV.ansMode === "voice" && text ? "voice" : "text", edited: final !== text, self: $$("#iv-self [data-self]").map((x) => x.checked) };
    safeSet(ivKey(IV.s.sessionId), { answers: IV.answers });
    IV.idx++;
    if (IV.idx >= IV.s.questions.length) return submitInterview();
    window.scrollTo(0, 0);
    askQuestion();
  };
}

async function submitInterview() {
  $("#iv-run").hidden = true;
  const out = $("#iv-result");
  out.hidden = false;
  out.innerHTML = `<div class="pcard"><div class="skeleton" style="width:60%"></div><p class="small muted">Menilai jawabanmu…</p></div>`;
  const res = await api.call("submitInterview", { sessionId: IV.s.sessionId, answers: IV.answers });
  if (!res.ok) {
    out.innerHTML = `<p class="status-msg error">${esc(res.error.message)}</p><button class="btn btn-primary" type="button" id="iv-retry">Kirim ulang</button>`;
    $("#iv-retry").onclick = submitInterview;
    return;
  }
  try { store.remove(ivKey(IV.s.sessionId)); } catch { /* abaikan */ }
  history.replaceState(null, "", `?hasil=${encodeURIComponent(res.data.sessionId)}`);
  renderResult(res.data);
}

async function showResultPage(sid) {
  if (!auth.isLoggedIn()) return goLogin();
  $("#view-hub").hidden = true;
  $("#view-iv").hidden = false;
  $("#iv-setup").hidden = true;
  $("#iv-result").hidden = false;
  $("#iv-title").textContent = "Hasil wawancara";
  $("#iv-part").textContent = "";
  $("#iv-result").innerHTML = `<div class="pcard"><div class="skeleton" style="width:60%"></div></div>`;
  const res = await api.call("getInterviewResult", { sessionId: sid });
  if (!res.ok) { $("#iv-result").innerHTML = `<p class="status-msg error">${esc(res.error.message)}</p><a class="btn btn-secondary" href="paket-skb.html">Paket SKB</a>`; return; }
  renderResult(res.data);
}

const ASPECT = { isi: "Isi & kata kunci", struktur: "Struktur jawaban", kelancaran: "Kelancaran & bahasa", waktu: "Ketepatan waktu/panjang", diri: "Penilaian diri" };

function renderResult(r) {
  $("#iv-title").textContent = `Hasil wawancara ${r.instansi.short}`;
  $("#iv-part").textContent = fmtDate(r.submittedAt);
  $("#iv-step").textContent = "";
  const bars = Object.keys(ASPECT).map((k) => {
    const pct = r.aspectMax[k] ? Math.round((r.aspects[k] / r.aspectMax[k]) * 100) : 0;
    return `<div class="iv-asp"><span>${ASPECT[k]}</span><div class="progress"><span style="width:${pct}%"></span></div><b class="num">${r.aspects[k]}/${r.aspectMax[k]}</b></div>`;
  }).join("");
  const items = r.answers.map((a) => `<details class="iv-ans"${a.number === 1 ? " open" : ""}>
      <summary><span class="sc ${a.score >= 70 ? "ok" : a.score >= 55 ? "mid" : "low"}">${a.score}</span><span><b>${a.number}. ${esc(a.question)}</b><small>${esc(a.partLabel)} · ${a.mode === "voice" ? "suara" : "ketik"}${a.durationSec ? ` · ${a.durationSec} detik` : ""} · ${a.words} kata${a.wpm ? ` · ${a.wpm} kata/menit` : ""}</small></span></summary>
      <div class="stack">
        <div><span class="lvl">Jawabanmu${a.edited ? " (diedit)" : ""}</span><p class="iv-tr">${esc(a.transcript) || "<i>(kosong)</i>"}</p></div>
        <div class="iv-kw">${a.hit.map((k) => `<span class="kw ok">✓ ${esc(k)}</span>`).join("")}${a.missing.map((k) => `<span class="kw no">+ ${esc(k)}</span>`).join("")}</div>
        <p class="xsmall muted">Isi ${a.aspects.isi}/40 · Struktur ${a.aspects.struktur}/15 · Kelancaran ${a.aspects.kelancaran}/20 · Waktu ${a.aspects.waktu}/15 · Penilaian diri ${a.aspects.diri}/10${a.fillers ? ` · kata pengisi ${a.fillers}×` : ""}</p>
        <div class="note"><b>Saran</b><ul>${a.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>
        ${a.model ? `<div class="note model"><b>Contoh jawaban model</b><p>${esc(a.model)}</p>${a.modelTips ? `<p class="xsmall muted">${esc(a.modelTips)}</p>` : ""}</div>` : ""}
      </div></details>`).join("");
  $("#iv-result").innerHTML = `<section class="pcard iv-score">
      <div class="iv-band"><span>Band</span><b>${fmtBand(r.band)}</b><small>dari 9</small></div>
      <div class="stack" style="gap:6px;flex:1;min-width:0"><span class="chip ${r.score >= 70 ? "chip-ok" : r.score >= 55 ? "chip-warn" : "chip-bad"}" style="align-self:flex-start">${esc(r.level)} · ${r.score}/100</span>
        <p class="small">Skor dihitung otomatis dari rubrik (tanpa AI): kata kunci yang muncul, alur jawaban, kata pengisi, tempo, durasi, dan penilaian dirimu. Gunakan sebagai latihan, bukan prediksi nilai resmi.</p></div>
    </section>
    <section class="pcard stack"><h2 style="font-size:var(--fs-lg)">Rata-rata per aspek</h2>${bars}</section>
    <section class="stack"><div class="sec-title" style="margin:0"><h2>Umpan balik per pertanyaan</h2><span class="muted">+ = poin yang belum muncul</span></div>${items}</section>
    <div class="row" style="gap:8px"><a class="btn btn-primary" href="paket-skb.html?i=${encodeURIComponent(r.instansi.id)}&tab=wawancara">Kembali ke Paket SKB ${esc(r.instansi.short)}</a><a class="btn btn-secondary" href="rapot.html">Rapot</a></div>`;
  window.scrollTo(0, 0);
}
