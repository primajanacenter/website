/**
 * akbar.js — Tryout Akbar mingguan (Fase 7)
 *
 * Lobi: event berjalan/berikutnya + hitung mundur, status peserta, peringkat event terakhir, riwayat.
 * Ujian memakai mesin CAT yang sama (cat-engine.js); data ujian dari action joinAkbar.
 * Skor & rapor dikunci server sampai hasil terbit (Senin 06.00 WIB).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, getParam, setBusy } from "../core/ui.js";
import { runExam } from "./cat-engine.js";

const STATE_LABEL = { upcoming: "Segera dibuka", open: "Sedang dibuka", closing: "Batas mulai lewat", scoring: "Menunggu hasil", published: "Hasil terbit" };
const SUB = { twk: "TWK", tiu: "TIU", tkp: "TKP" };
let info = null;
let offset = 0;          // selisih jam server − jam perangkat
let tick = null;
let rankEvent = null;
let scope = "national";

const fmt = (iso, opt = { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) =>
  new Date(iso).toLocaleString("id-ID", { ...opt, timeZone: "Asia/Jakarta" }) + " WIB";
const now = () => Date.now() + offset;

export async function initAkbar() {
  const res = await api.call("getAkbarInfo");
  if (!res.ok) return status(res.error.message, true);
  info = res.data;
  import("./reminder-local.js").then((m) => m.rememberAkbar(info)).catch(() => {});
  offset = Date.parse(info.serverNow) - Date.now();
  renderCurrent();
  renderPast();
  const want = getParam("event");
  const target = info.past.find((e) => e.eventId === want) || info.past[0];
  if (target) loadRanking(target.eventId);
  if (getParam("done")) status("Jawabanmu sudah terkirim. Skor dan peringkat terbit Senin 06.00 WIB.", false);

  $("#rk-scope").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-scope]");
    if (!b || !rankEvent) return;
    scope = b.dataset.scope;
    document.querySelectorAll("#rk-scope button").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", x === b); });
    loadRanking(rankEvent);
  });
  $("#start-ready").addEventListener("change", (e) => ($("#start-ok").disabled = !e.target.checked));
  $("#start-cancel").addEventListener("click", () => ($("#start-modal").hidden = true));
}

/* ---------------- Event berjalan / berikutnya ---------------- */
function renderCurrent() {
  const box = $("#ak-current");
  const ev = info.current;
  if (!ev) {
    const nx = info.next[0];
    box.innerHTML = `<div class="stack"><span class="eyebrow">Tryout Akbar</span><h2>Belum ada jadwal terdekat</h2>
      <p class="muted">${nx ? `Berikutnya: ${esc(nx.title)} · ${fmt(nx.opensAt)}` : "Jadwal berikutnya akan diumumkan di halaman ini."}</p></div>`;
    return;
  }
  const my = ev.my;
  const meta = `<div class="ak-meta">
      <span>Dibuka <b>${fmt(ev.opensAt)}</b></span>
      <span>Batas mulai <b>${fmt(ev.lastStartAt, { hour: "2-digit", minute: "2-digit" })}</b></span>
      <span><b>${ev.questionCount || 110}</b> soal · <b>${ev.durationMin}</b> menit</span>
      <span>Hasil <b>${fmt(ev.resultsAt)}</b></span></div>`;
  box.innerHTML = `<div class="stack">
      <span class="row" style="gap:8px"><span class="eyebrow">Tryout Akbar</span><span class="chip ${ev.state === "open" ? "chip-ok" : "chip-accent"}">${STATE_LABEL[ev.state]}</span></span>
      <h2>${esc(ev.title)}</h2>${meta}
      <p class="small muted" id="ak-mynote">${myNote(ev)}</p>
    </div>
    <div class="ak-count"><small id="ak-count-label"></small><span class="t" id="ak-count">--:--:--</span><span id="ak-cta"></span></div>`;
  clearInterval(tick);
  const update = () => {
    const t = now();
    let target, label;
    if (ev.state === "upcoming") { target = Date.parse(ev.opensAt); label = "Dibuka dalam"; }
    else if (ev.state === "open") { target = Date.parse(ev.lastStartAt); label = "Batas mulai dalam"; }
    else { target = Date.parse(ev.resultsAt); label = "Hasil terbit dalam"; }
    const left = Math.max(0, target - t);
    if (left === 0 && ev.state !== "scoring") return location.reload();
    const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
    $("#ak-count-label").textContent = label;
    $("#ak-count").textContent = `${d ? d + "h " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };
  update();
  tick = setInterval(update, 1000);
  renderCta(ev);
}

function myNote(ev) {
  const my = ev.my;
  if (!info.loggedIn) return "Masuk untuk ikut. Gratis untuk semua pengguna.";
  if (!my) return ev.state === "open" ? "Kamu belum ikut minggu ini." : ev.state === "upcoming" ? "Siapkan waktu 100 menit tanpa gangguan." : "Kamu tidak mengikuti event ini.";
  if (my.status === "in_progress") return `Ujianmu sedang berjalan, berakhir ${fmt(my.endsAt, { hour: "2-digit", minute: "2-digit" })}.`;
  return "Jawabanmu sudah terkirim. Skor dan peringkat terbit sesuai jadwal hasil.";
}

function renderCta(ev) {
  const el = $("#ak-cta");
  const my = ev.my;
  if (!info.loggedIn) {
    el.innerHTML = `<a class="btn btn-accent" href="masuk.html?next=${encodeURIComponent("akbar.html")}">Masuk untuk ikut</a>`;
    return;
  }
  if (my && my.status === "in_progress") {
    el.innerHTML = `<button class="btn btn-accent" type="button" id="ak-join">Lanjutkan ujian</button>`;
  } else if (!my && ev.state === "open") {
    el.innerHTML = `<button class="btn btn-accent" type="button" id="ak-join">Ikut sekarang</button>`;
  } else {
    el.innerHTML = my ? `<span class="chip chip-ok">Sudah ikut</span>` : "";
    return;
  }
  $("#ak-join").addEventListener("click", (e) => (my ? begin(ev.eventId, e.currentTarget) : confirmStart(ev, e.currentTarget)));
}

function confirmStart(ev, button) {
  $("#start-text").textContent = `${ev.questionCount || 110} soal dalam ${ev.durationMin} menit. Hanya satu kali kesempatan. Waktu langsung berjalan setelah kamu menekan Mulai dan tidak bisa dijeda.`;
  $("#start-ready").checked = false;
  $("#start-ok").disabled = true;
  $("#start-modal").hidden = false;
  $("#start-ok").onclick = () => { $("#start-modal").hidden = true; begin(ev.eventId, button); };
}

async function begin(eventId, button) {
  setBusy(button, true, "Menyiapkan soal…");
  const res = await api.call("joinAkbar", { eventId });
  setBusy(button, false);
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("akbar.html")}`);
    return status(res.error.message, true);
  }
  clearInterval(tick);
  $("#view-lobby").hidden = true;
  $("#view-exam").hidden = false;
  window.scrollTo(0, 0);
  runExam(res.data, { onSubmitted: () => location.replace("akbar.html?done=1") });
}

/* ---------------- Peringkat ---------------- */
async function loadRanking(eventId) {
  rankEvent = eventId;
  const res = await api.call("getAkbarRanking", { eventId, scope });
  const sec = $("#ak-rank");
  sec.hidden = false;
  document.querySelectorAll("#ak-past a").forEach((a) => a.classList.toggle("active", a.dataset.ev === eventId));
  if (!res.ok) {
    if (scope === "province" && res.error.code === "FORBIDDEN") {
      $("#rk-body").innerHTML = `<tr><td colspan="7"><span class="small">${esc(res.error.message)} <a href="premium.html"><strong>Lihat Premium →</strong></a></span></td></tr>`;
      return;
    }
    $("#rk-body").innerHTML = `<tr><td colspan="7" class="small muted">${esc(res.error.message)}</td></tr>`;
    return;
  }
  const d = res.data;
  const ev = info.past.find((e) => e.eventId === eventId);
  $("#rk-title").textContent = `Peringkat · ${ev ? ev.title : d.event.title}`;
  const st = d.stats;
  $("#rk-stats").innerHTML = `
    <div><span class="xsmall muted">Peserta</span><b>${st.n.toLocaleString("id-ID")}</b></div>
    <div><span class="xsmall muted">Lolos ambang batas</span><b>${st.passRate}%</b></div>
    <div><span class="xsmall muted">Median skor</span><b>${st.median.total}</b></div>
    <div><span class="xsmall muted">Rata-rata 10% teratas</span><b>${st.top10.total}</b></div>`;
  const me = d.me;
  $("#rk-me").innerHTML = me
    ? `<div class="ak-me"><div><span class="xsmall muted">Peringkat nasionalmu</span><div class="rank">#${me.rank.toLocaleString("id-ID")}</div>
        <span class="small">Lebih baik dari ${me.percentile}% peserta${me.provinceRank ? ` · #${me.provinceRank} dari ${me.provinceTotal} di ${esc(me.province)}` : ""}</span></div>
        <div class="stack" style="gap:4px;text-align:right"><b>Skor ${me.total}</b><span class="small">TWK ${me.twk} · TIU ${me.tiu} · TKP ${me.tkp}</span>
        <span class="chip ${me.passedAll ? "chip-ok" : "chip-warn"}">${me.passedAll ? "Lolos ambang batas" : "Belum lolos ambang batas"}</span>
        <a class="small" href="rapor.html?id=${encodeURIComponent(me.attemptId)}"><strong>Lihat rapor & pembahasan →</strong></a></div></div>`
    : info.loggedIn ? `<p class="small muted">Kamu tidak mengikuti event ini.</p>` : `<p class="small muted"><a href="masuk.html?next=akbar.html">Masuk</a> untuk melihat posisimu.</p>`;
  $("#rk-analysis").innerHTML = d.analysis
    ? `<table class="ak-anl"><thead><tr><th>Subtes</th><th>Skormu</th><th>Ambang</th><th>Median</th><th>Rata-rata 10% teratas</th></tr></thead><tbody>
        ${d.analysis.map((a) => `<tr><td><b>${SUB[a.subtest]}</b></td><td>${a.mine}</td><td>${a.pg}</td><td>${a.median}</td><td>${a.top10} <span class="xsmall muted">(${a.mine >= a.top10 ? "sudah setara" : "kurang " + (a.top10 - a.mine)})</span></td></tr>`).join("")}
       </tbody></table>`
    : me && !d.premium ? `<p class="xsmall muted">Analisis per subtes dibanding 10% teratas dan peringkat provinsi tersedia di <a href="premium.html"><strong>Premium</strong></a>.</p>` : "";
  $("#rk-body").innerHTML = d.top.length
    ? d.top.map((r, i) => {
        const rank = scope === "province" ? r.provinceRank || i + 1 : r.rank;
        const mine = me && r.rank === me.rank;
        return `<tr class="${mine ? "me" : ""}"><td class="${rank <= 3 ? "medal" : ""}">${rank}</td><td>${esc(r.name)}${mine ? " (kamu)" : ""}</td><td class="hide-sm">${esc(r.province || "-")}</td>
          <td class="num">${r.twk}</td><td class="num">${r.tiu}</td><td class="num">${r.tkp}</td><td class="num"><b>${r.total}</b></td></tr>`;
      }).join("")
    : `<tr><td colspan="7" class="small muted">Belum ada peserta.</td></tr>`;
  $("#rk-note").textContent = scope === "province"
    ? `Provinsi berdasarkan lokasi incaran di profil (${d.province || "belum diisi"}) · ${d.provinceCount || 0} peserta.`
    : `Menampilkan ${d.top.length} peringkat teratas. Urutan: skor total, TKP, TIU, TWK, lalu waktu tercepat.`;
}

/* ---------------- Riwayat ---------------- */
function renderPast() {
  if (!info.past.length) return;
  $("#ak-past-wrap").hidden = false;
  $("#ak-past").innerHTML = info.past
    .map((e) => `<a href="akbar.html?event=${encodeURIComponent(e.eventId)}" data-ev="${esc(e.eventId)}">
      <span><b>${esc(e.title)}</b> <span class="xsmall muted">${fmt(e.opensAt, { day: "numeric", month: "short", year: "numeric" })}</span></span>
      <span class="small">${e.my && e.my.rank ? `#${e.my.rank} · skor ${e.my.total}` : "Tidak ikut"} · ${(e.participants || 0).toLocaleString("id-ID")} peserta</span></a>`)
    .join("");
  document.querySelectorAll("#ak-past a").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); history.replaceState(null, "", a.href); loadRanking(a.dataset.ev); $("#ak-rank").scrollIntoView({ behavior: "smooth" }); }));
}

function status(msg, isError) {
  const el = $("#ak-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
