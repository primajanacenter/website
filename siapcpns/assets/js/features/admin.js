/**
 * admin.js — Super User Dashboard (Fase 12)
 *
 * Hanya untuk email di Script Property ADMIN_EMAILS. Server menolak akun lain (FORBIDDEN),
 * jadi halaman ini aman walau berkasnya publik: tanpa izin, tidak ada data yang dikirim.
 * Angka bisnis berasal dari sheet transactions (webhook + rekonsiliasi Mayar).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { CONFIG } from "../core/config.js";
import { $, esc, setBusy } from "../core/ui.js";

const S = { days: 30, data: null, trx: null };
const TYPE_LABEL = { diagnostic: "Diagnostik", akbar: "Tryout Akbar", premium: "Premium", demo: "Demo", skb: "SKB" };
const STATUS_LABEL = { paid: "Lunas", pending: "Menunggu", expired: "Kedaluwarsa", failed: "Gagal", amount_mismatch: "Nominal beda", unknown: "?" };
const STATUS_CHIP = { paid: "chip-ok", pending: "chip-warn", expired: "", failed: "chip-bad", amount_mismatch: "chip-bad" };
const AKBAR_STATE = { upcoming: "Terjadwal", open: "Berlangsung", closing: "Ditutup", scoring: "Menilai", published: "Terbit" };
const PG = { twk: 65, tiu: 80, tkp: 166 };

/* ---------------- format ---------------- */
const nf = new Intl.NumberFormat("id-ID");
const rp = (n) => "Rp" + nf.format(Math.round(n || 0));
function rpShort(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return "Rp" + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M";
  if (n >= 1e6) return "Rp" + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  if (n >= 1e3) return "Rp" + Math.round(n / 1e3) + " rb";
  return "Rp" + n;
}
const pct = (v) => (v === null || v === undefined ? "–" : `${String(v).replace(".", ",")}%`);
const num = (v) => (v === null || v === undefined ? "–" : nf.format(v));
function dShort(iso) {
  if (!iso) return "–";
  const d = new Date(String(iso).length === 10 ? iso + "T00:00:00" : iso);
  return isNaN(d) ? String(iso) : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
function dTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return isNaN(d) ? String(iso) : d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function delta(cur, prev) {
  if (!prev && !cur) return "";
  if (!prev) return `<span class="delta up">baru</span>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  const cls = p > 0 ? "up" : p < 0 ? "down" : "flat";
  const arrow = p > 0 ? "▲" : p < 0 ? "▼" : "■";
  return `<span class="delta ${cls}">${arrow} ${Math.abs(p)}%</span>`;
}

/* ---------------- init ---------------- */
export async function initAdmin() {
  if (!auth.requireLogin("masuk.html")) return;
  $("#btn-logout")?.addEventListener("click", (e) => { e.preventDefault(); auth.logout(); location.replace("../"); });

  document.querySelectorAll(".seg [data-days]").forEach((b) =>
    b.addEventListener("click", () => {
      S.days = Number(b.dataset.days);
      document.querySelectorAll(".seg [data-days]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      load(false);
    })
  );
  $("#a-refresh").addEventListener("click", () => load(true));
  window.addEventListener("hashchange", showTab);
  $("#t-form").addEventListener("submit", (e) => { e.preventDefault(); loadTrx(); });
  $("#t-csv").addEventListener("click", downloadCsv);
  $("#s-form").addEventListener("submit", (e) => { e.preventDefault(); lookup($("#s-q").value); });
  initTooltip();
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(redrawCharts, 150); });
  await load(false);
}

async function load(force) {
  status("Memuat data…");
  const btn = $("#a-refresh");
  setBusy(btn, true, "Memuat…");
  const res = await api.call("getAdminDashboard", { days: S.days, force: Boolean(force) });
  setBusy(btn, false);
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("admin.html")}`);
    if (res.error.code === "FORBIDDEN") {
      $("#a-app").hidden = true;
      $("#a-controls").hidden = true;
      return status("Akses ditolak. Halaman ini hanya untuk akun admin yang terdaftar di Script Property ADMIN_EMAILS.", true);
    }
    return status(res.error.message, true);
  }
  status("");
  S.data = res.data;
  $("#a-app").hidden = false;
  $("#a-controls").hidden = false;
  render();
  showTab();
  if (!S.trx) {
    $("#t-from").value = res.data.range.from;
    $("#t-to").value = res.data.range.to;
  }
}

function status(msg, isErr) {
  const el = $("#a-status");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.classList.toggle("error", Boolean(isErr));
}

function showTab() {
  const tab = (location.hash || "#ringkasan").slice(1);
  const valid = [...document.querySelectorAll("[data-panel]")].some((p) => p.dataset.panel === tab) ? tab : "ringkasan";
  document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== valid));
  requestAnimationFrame(redrawCharts);
  document.querySelectorAll("#a-tabs a").forEach((a) => {
    const on = a.dataset.tab === valid;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

/* ---------------- render ---------------- */
function render() {
  const d = S.data;
  const envChip = d.env === "production" ? "" : ` · <span class="chip chip-warn">Pembayaran: ${esc(d.env)}</span>`;
  const mock = CONFIG.USE_MOCK ? ` · <span class="chip chip-warn">Data contoh (mode uji)</span>` : "";
  $("#a-meta").innerHTML = `Periode ${dShort(d.range.from)} – ${dShort(d.range.to)} (dibanding ${dShort(d.range.prevFrom)} – ${dShort(d.range.prevTo)}) · diperbarui ${dTime(d.generatedAt)}${d.cached ? " (cache ≤ 5 menit)" : ""}${envChip}${mock}`;
  renderSummary(d);
  renderBusiness(d);
  renderUsers(d);
  renderLearning(d);
  renderOps(d);
}

function kpi(label, value, sub = "", extra = "") {
  return `<div class="kpi"><span class="kpi-label">${label}</span><b class="kpi-value">${value}</b><span class="kpi-sub">${sub}</span>${extra}</div>`;
}

function renderSummary(d) {
  const k = d.kpi;
  const n = d.range.days;
  $("#k-main").innerHTML = [
    kpi(`Pendapatan ${n} hari`, rp(k.revenue), `${delta(k.revenue, k.revenuePrev)} vs periode sebelumnya`),
    kpi("Transaksi lunas", num(k.paid), `${delta(k.paid, k.paidPrev)} · rata-rata ${rp(k.aov)}`),
    kpi("Pengguna baru", num(k.newUsers), `${delta(k.newUsers, k.newUsersPrev)} · total ${num(k.usersTotal)}`),
    kpi("Pengguna aktif belajar", num(k.learners), `${delta(k.learners, k.learnersPrev)} · latihan/tryout`),
    kpi("Premium aktif", num(k.premiumActive), `${d.business.expiringCount} berakhir ≤ 7 hari`),
    kpi("Konversi ke pembeli", pct(k.conversionPct), `${num(d.business.payers)} pembeli dari ${num(k.usersTotal)} pengguna`),
  ].join("");

  const alerts = [];
  if (d.business.pending.count) alerts.push(["warn", `${d.business.pending.count} pembayaran menunggu (${rp(d.business.pending.amount)})`, "#bisnis"]);
  if (d.business.expiringCount) alerts.push(["info", `${d.business.expiringCount} pengguna Premium berakhir dalam 7 hari — peluang perpanjangan`, "#bisnis"]);
  if (d.ops.errors24h.server) alerts.push(["bad", `${d.ops.errors24h.server} galat server dalam 24 jam`, "#operasional"]);
  if (d.ops.health && d.ops.health.warnings) alerts.push(["warn", `${d.ops.health.warnings} pemeriksaan sistem perlu dicek`, "#operasional"]);
  if (d.ops.webhook.problems7) alerts.push(["warn", `${d.ops.webhook.problems7} webhook Mayar bermasalah (7 hari)`, "#operasional"]);
  if (d.env !== "production") alerts.push(["warn", `Pembayaran masih mode ${d.env}`, "#operasional"]);
  $("#k-alerts").innerHTML = alerts.length
    ? alerts.map(([t, m, href]) => `<a class="alert alert-${t}" href="${href}"><span aria-hidden="true">${t === "bad" ? "⛔" : t === "warn" ? "⚠️" : "ℹ️"}</span>${esc(m)}</a>`).join("")
    : `<p class="alert alert-ok"><span aria-hidden="true">✅</span>Tidak ada yang perlu ditindaklanjuti.</p>`;

  $("#c-rev-sub").textContent = `total ${rp(d.kpi.revenue)}`;
  barChart($("#c-rev"), d.daily, { y: "revenue", fmt: rp, axis: rpShort, label: "Pendapatan", title: "Pendapatan harian" });
  barChart($("#c-learn"), d.daily, { y: "learners", fmt: (v) => `${num(v)} pengguna`, axis: num, label: "Pengguna aktif belajar", title: "Pengguna aktif belajar per hari" });
}

function renderBusiness(d) {
  const b = d.business;
  $("#b-kpis").innerHTML = [
    kpi("Hari ini", rp(b.revenueToday), "pendapatan lunas"),
    kpi("7 hari", rp(b.revenue7), ""),
    kpi("30 hari", rp(b.revenue30), ""),
    kpi("Sepanjang waktu", rp(b.revenueTotal), `${num(b.payers)} pembeli`),
    kpi("Checkout → lunas", pct(b.checkoutToPaidPct), `pembeli berulang ${pct(b.repeatPct)}`),
    kpi("Ajak teman", num(b.referral.joined), `bergabung · ${num(b.referral.rewarded)} bonus · diskon ${rp(b.discountRange)}`),
  ].join("");

  $("#b-plan-sub").textContent = `${d.range.days} hari`;
  const maxRev = Math.max(1, ...b.byPlan.map((p) => p.revenue));
  $("#b-plans").innerHTML = b.byPlan.length
    ? hbars(b.byPlan.map((p) => ({ label: p.name, value: p.revenue, w: p.revenue / maxRev, text: `${rp(p.revenue)} · ${p.count}×` })))
      + (b.grantsRange ? `<p class="xsmall muted">+ ${b.grantsRange} pemberian Premium manual (Rp0) tidak dihitung sebagai pendapatan.</p>` : "")
    : `<p class="muted small">Belum ada penjualan pada periode ini.</p>`;

  const sc = b.statusCounts || {};
  const totalSc = Object.values(sc).reduce((s, v) => s + v, 0);
  $("#b-status").innerHTML = totalSc
    ? hbars(Object.keys(sc).sort((a, z) => sc[z] - sc[a]).map((k) => ({ label: STATUS_LABEL[k] || k, value: sc[k], w: sc[k] / totalSc, text: `${sc[k]} (${Math.round((sc[k] / totalSc) * 100)}%)` })))
    : `<p class="muted small">Belum ada checkout pada periode ini.</p>`;

  barChart($("#c-paid"), d.daily, { y: "paid", fmt: (v) => `${num(v)} transaksi`, axis: num, label: "Transaksi lunas", title: "Transaksi lunas per hari" });

  $("#b-exp-sub").textContent = `${b.expiringCount} pengguna`;
  $("#b-exp").innerHTML = b.expiring.length
    ? `<div class="table-wrap"><table class="table adm-table"><thead><tr><th>Nama</th><th>Email</th><th>Berakhir</th></tr></thead><tbody>${b.expiring
        .map((u) => `<tr><td>${esc(u.name || "–")}</td><td>${mailLink(u.email)}</td><td>${dShort(u.premiumUntil)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted small">Tidak ada Premium yang berakhir dalam 7 hari.</p>`;

  if (!S.trx) renderTrxTable(b.recent, `25 transaksi terbaru. Pilih tanggal lalu "Tampilkan" untuk daftar lengkap & CSV.`);
}

function mailLink(email) {
  return email ? `<a href="#cari" data-q="${esc(email)}" class="lk-user">${esc(email)}</a>` : "–";
}

function renderTrxTable(items, sum) {
  $("#t-sum").textContent = sum;
  $("#t-table").innerHTML = items.length
    ? `<thead><tr><th>Dibuat</th><th>Email</th><th>Paket</th><th class="num">Nominal</th><th class="num">Diskon</th><th>Status</th><th>Lunas</th><th>Kode ajak</th><th>ID</th></tr></thead><tbody>${items
        .map((t) => `<tr><td>${dTime(t.createdAt)}</td><td>${mailLink(t.email)}</td><td>${esc(t.planName || t.planId || "–")}</td><td class="num">${rp(t.amount)}</td><td class="num">${t.discount ? rp(t.discount) : "–"}</td><td><span class="chip ${STATUS_CHIP[t.status] || ""}">${esc(STATUS_LABEL[t.status] || t.status)}</span></td><td>${t.paidAt ? dTime(t.paidAt) : "–"}</td><td>${esc(t.refCode || "–")}</td><td class="mono xsmall">${esc(t.trxId)}</td></tr>`)
        .join("")}</tbody>`
    : `<tbody><tr><td class="muted">Tidak ada transaksi.</td></tr></tbody>`;
  bindUserLinks($("#t-table"));
}

async function loadTrx() {
  const btn = $("#t-form button[type=submit]");
  setBusy(btn, true, "Memuat…");
  const res = await api.call("adminTransactions", { from: $("#t-from").value, to: $("#t-to").value, status: $("#t-status").value });
  setBusy(btn, false);
  if (!res.ok) return ($("#t-sum").textContent = res.error.message);
  S.trx = res.data;
  const paid = res.data.items.filter((t) => t.status === "paid");
  renderTrxTable(res.data.items, `${num(res.data.total)} transaksi${res.data.truncated ? " (ditampilkan 3.000 pertama)" : ""} · lunas ${num(paid.length)} = ${rp(paid.reduce((s, t) => s + t.amount, 0))}`);
  $("#t-csv").disabled = !res.data.items.length;
}

function downloadCsv() {
  if (!S.trx) return;
  const cols = ["trxId", "createdAt", "paidAt", "email", "planId", "planName", "amount", "discount", "status", "refCode", "source", "mayarId"];
  const q = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // cegah formula injection saat dibuka di spreadsheet
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...S.trx.items.map((t) => cols.map((c) => q(t[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `transaksi-siap-cpns-${S.trx.from}_${S.trx.to}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function renderUsers(d) {
  const u = d.users;
  $("#u-kpis").innerHTML = [
    kpi("Total pengguna", num(u.total), `${num(u.profilesComplete)} profil lengkap`),
    kpi("Baru hari ini", num(u.newToday), `7 hari ${num(u.new7)} · 30 hari ${num(u.new30)}`),
    kpi("Aktif belajar 7 hari", num(u.learners7), `30 hari ${num(u.learners30)}`),
    kpi("Login 7 hari", num(u.login7), "membuka aplikasi"),
  ].join("");

  const f = u.funnel;
  const base = Math.max(1, f[0].n);
  $("#u-funnel-sub").textContent = `pendaftar ${d.range.days} hari terakhir`;
  $("#u-funnel").innerHTML = f[0].n
    ? hbars(f.map((s, i) => ({ label: s.label, value: s.n, w: s.n / base, text: `${num(s.n)} · ${Math.round((s.n / base) * 100)}%` })))
      + `<p class="xsmall muted">Persentase dihitung dari jumlah pendaftar pada periode ini. Langkah tidak harus berurutan (misalnya pengguna bisa latihan tanpa tryout).</p>`
    : `<p class="muted small">Belum ada pendaftar pada periode ini.</p>`;

  barChart($("#c-signup"), d.daily, { y: "signups", fmt: (v) => `${num(v)} pendaftar`, axis: num, label: "Pendaftar", title: "Pendaftar baru per hari" });

  $("#u-cohort").innerHTML = `<thead><tr><th>Minggu daftar</th><th class="num">Pengguna</th><th class="num">Minggu 1</th><th class="num">Minggu 2</th><th class="num">Minggu 3</th><th class="num">Minggu 4</th></tr></thead><tbody>${u.cohorts
    .map((c) => `<tr><td>${dShort(c.week)}</td><td class="num">${num(c.size)}</td>${c.weeks
      .map((v) => (v === null ? `<td class="num muted">·</td>` : `<td class="num heat" style="--h:${Math.min(1, v / 60).toFixed(2)}">${pct(v)}</td>`)).join("")}</tr>`).join("")}</tbody>`;

  const list = (arr) => {
    const m = Math.max(1, ...arr.map((x) => x.n));
    return arr.length ? hbars(arr.map((x) => ({ label: x.key, value: x.n, w: x.n / m, text: num(x.n) }))) : `<p class="muted small">Belum ada data.</p>`;
  };
  $("#u-edu").innerHTML = list(u.education);
  $("#u-prov").innerHTML = list(u.provinces);
}

function renderLearning(d) {
  const l = d.learning;
  $("#l-kpis").innerHTML = [
    kpi("Tryout selesai", num(l.attempts), `${d.range.days} hari`),
    kpi("Soal latihan dijawab", num(l.practice), `${num(l.practiceUsers)} pengguna`),
    kpi("Ketepatan latihan", pct(l.practiceAccPct), "TWK & TIU (benar)"),
    kpi("Lolos SKD resmi", pct(l.skd.passPct), `${num(l.skd.n)} skor diisi`),
  ].join("");

  const cell = (v, pg) => (v === null ? "–" : `<span class="${v >= pg ? "ok-t" : "bad-t"}">${String(v).replace(".", ",")}</span>`);
  $("#l-types").innerHTML = l.attemptsByType.length
    ? `<thead><tr><th>Jenis</th><th class="num">Selesai</th><th class="num">Rata-rata total</th><th class="num">Lolos semua</th><th class="num">TWK</th><th class="num">TIU</th><th class="num">TKP</th></tr></thead><tbody>${l.attemptsByType
        .map((t) => `<tr><td>${esc(TYPE_LABEL[t.type] || t.type)}</td><td class="num">${num(t.n)}</td><td class="num">${t.avgTotal === null ? "–" : String(t.avgTotal).replace(".", ",")}</td><td class="num">${pct(t.passPct)}</td><td class="num">${cell(t.avgTwk, PG.twk)}</td><td class="num">${cell(t.avgTiu, PG.tiu)}</td><td class="num">${cell(t.avgTkp, PG.tkp)}</td></tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="muted">Belum ada tryout selesai pada periode ini.</td></tr></tbody>`;

  barChart($("#c-prac"), d.daily, { y: "practice", fmt: (v, r) => `${num(v)} soal latihan · ${num(r.attempts)} tryout`, axis: num, label: "Soal latihan", title: "Soal latihan dijawab per hari" });

  $("#l-weak").innerHTML = l.topicsWeak.length
    ? hbars(l.topicsWeak.map((t) => ({ label: `${t.name} <span class="muted">${t.subtest.toUpperCase()}</span>`, value: t.pct, w: (t.pct || 0) / 100, text: `${pct(t.pct)} · ${num(t.n)} soal` })), true)
    : `<p class="muted small">Belum ada latihan pada periode ini.</p>`;

  $("#l-skd").innerHTML = `<dl class="kv2"><div><dt>Skor diisi</dt><dd>${num(l.skd.n)}</dd></div><div><dt>Lolos ambang batas</dt><dd>${pct(l.skd.passPct)}</dd></div><div><dt>Rata-rata total</dt><dd>${l.skd.avgTotal === null ? "–" : String(l.skd.avgTotal).replace(".", ",")}</dd></div></dl>`;

  $("#l-akbar").innerHTML = l.akbar.length
    ? `<thead><tr><th>Tanggal</th><th>Paket</th><th>Status</th><th class="num">Ikut</th><th class="num">Dinilai</th><th class="num">Rata-rata</th><th class="num">Tertinggi</th><th class="num">Lolos</th></tr></thead><tbody>${l.akbar
        .map((e) => `<tr><td>${dShort(e.opensAt)}</td><td>${esc(e.packageId)}</td><td>${esc(AKBAR_STATE[e.status] || e.status)}</td><td class="num">${num(e.joined)}</td><td class="num">${num(e.ranked)}</td><td class="num">${e.avg === null ? "–" : String(e.avg).replace(".", ",")}</td><td class="num">${num(e.top)}</td><td class="num">${pct(e.passPct)}</td></tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="muted">Belum ada Tryout Akbar.</td></tr></tbody>`;
}

function renderOps(d) {
  const o = d.ops;
  $("#o-kpis").innerHTML = [
    kpi("Galat 24 jam", num(o.errors24h.total), `server ${num(o.errors24h.server)} · browser ${num(o.errors24h.client)}`),
    kpi("Webhook Mayar 7 hari", num(o.webhook.count7), `${num(o.webhook.problems7)} bermasalah · terakhir ${o.webhook.last ? dTime(o.webhook.last) : "–"}`),
    kpi("Email pengingat 7 hari", num(o.reminders.sent7), `${num(o.reminders.failed7)} gagal/dilewati`),
    kpi("Backup terakhir", o.lastBackup ? dShort(o.lastBackup) : "–", o.lastBackup ? "salinan spreadsheet utama" : "BACKUP_FOLDER_ID belum diisi?"),
  ].join("");
  $("#o-health").innerHTML = (o.health?.report || [])
    .map((line) => `<li class="${line.startsWith("⚠️") ? "warn" : line.startsWith("✅") ? "ok" : "note"}">${esc(line)}</li>`).join("");
  $("#o-errors").innerHTML = o.errors24h.top.length
    ? `<ul class="err-list">${o.errors24h.top.map((t) => `<li><b>${t.n}×</b> <span>${esc(t.key)}</span></li>`).join("")}</ul>`
    : `<p class="muted small">Tidak ada galat dalam 24 jam terakhir.</p>`;
}

/* ---------------- cari pengguna ---------------- */
function bindUserLinks(root) {
  root.querySelectorAll(".lk-user").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = "#cari";
      $("#s-q").value = a.dataset.q;
      lookup(a.dataset.q);
    })
  );
}

async function lookup(q) {
  q = String(q || "").trim();
  $("#s-detail").hidden = true;
  $("#s-list").innerHTML = "";
  $("#s-sum").textContent = "Mencari…";
  const res = await api.call("adminLookupUser", { q });
  if (!res.ok) return ($("#s-sum").textContent = res.error.message);
  const r = res.data;
  $("#s-sum").textContent = r.total ? `${r.total} pengguna cocok${r.total > 20 ? " (20 pertama)" : ""}` : "Tidak ada pengguna yang cocok.";
  if (r.list.length > 1) {
    $("#s-list").innerHTML = `<div class="table-wrap"><table class="table adm-table"><thead><tr><th>Nama</th><th>Email</th><th>Paket</th><th>Daftar</th></tr></thead><tbody>${r.list
      .map((u) => `<tr><td>${esc(u.name || "–")}</td><td>${mailLink(u.email)}</td><td>${u.plan === "premium" ? `<span class="chip chip-accent">Premium</span>` : "Gratis"}</td><td>${dShort(u.createdAt)}</td></tr>`).join("")}</tbody></table></div>`;
    bindUserLinks($("#s-list"));
  }
  if (r.detail) renderDetail(r.detail);
}

function renderDetail(u) {
  const el = $("#s-detail");
  el.hidden = false;
  const p = u.profile;
  el.innerHTML = `
    <div class="panel-head"><h2>${esc(u.name || u.email)}</h2>${u.plan === "premium" ? `<span class="chip chip-accent">Premium s.d. ${dShort(u.premiumUntil)}</span>` : `<span class="chip">Gratis${u.premiumUntil ? ` · Premium berakhir ${dShort(u.premiumUntil)}` : ""}</span>`}</div>
    <dl class="kv2">
      <div><dt>Email</dt><dd>${esc(u.email)}</dd></div>
      <div><dt>Daftar</dt><dd>${dShort(u.createdAt)}</dd></div>
      <div><dt>Login terakhir</dt><dd>${dShort(u.lastLoginAt)}</dd></div>
      <div><dt>Kode ajak</dt><dd>${esc(u.refCode || "–")} · mengajak ${num(u.referrals.invited)} (${num(u.referrals.rewarded)} bonus)</dd></div>
      <div><dt>Pendidikan / jurusan</dt><dd>${p ? `${esc(p.education || "–")} · ${esc(p.major || "–")}` : "Profil belum diisi"}</dd></div>
      <div><dt>Target</dt><dd>${p ? `${esc(p.formation || "–")} · ${esc(p.province || "–")}${p.testDate ? ` · tes ${dShort(p.testDate)}` : ""}` : "–"}</dd></div>
      <div><dt>Latihan</dt><dd>${num(u.practice.answers)} soal · ketepatan ${pct(u.practice.accPct)} · terakhir ${dShort(u.practice.last)}</dd></div>
      <div><dt>Skor SKD resmi</dt><dd>${u.skd ? `${num(u.skd.total)} · ${u.skd.passedAll ? "lolos" : "belum lolos"}` : "–"}</dd></div>
    </dl>
    <h3 class="adm-h3">Transaksi</h3>
    ${u.transactions.length ? `<div class="table-wrap"><table class="table adm-table"><thead><tr><th>Dibuat</th><th>Paket</th><th class="num">Nominal</th><th>Status</th><th>Lunas</th><th>ID</th></tr></thead><tbody>${u.transactions
      .map((t) => `<tr><td>${dTime(t.createdAt)}</td><td>${esc(t.planName || t.planId)}</td><td class="num">${rp(t.amount)}</td><td><span class="chip ${STATUS_CHIP[t.status] || ""}">${esc(STATUS_LABEL[t.status] || t.status)}</span></td><td>${t.paidAt ? dTime(t.paidAt) : "–"}</td><td class="mono xsmall">${esc(t.trxId)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">Belum pernah checkout.</p>`}
    <h3 class="adm-h3">Tryout terakhir <span class="muted small">(${num(u.attemptsTotal)} selesai)</span></h3>
    ${u.attempts.length ? `<div class="table-wrap"><table class="table adm-table"><thead><tr><th>Tanggal</th><th>Paket</th><th>Jenis</th><th class="num">Total</th><th>Lolos</th></tr></thead><tbody>${u.attempts
      .map((a) => `<tr><td>${dShort(a.submittedAt)}</td><td>${esc(a.packageId)}</td><td>${esc(TYPE_LABEL[a.type] || a.type)}</td><td class="num">${num(a.total)}</td><td>${a.type === "skb" ? "–" : a.passedAll ? "Ya" : "Belum"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">Belum ada tryout selesai.</p>`}`;
}

/* ---------------- grafik ---------------- */
function hbars(rows, warnLow = false) {
  return `<ul class="hbars">${rows
    .map((r) => `<li><span class="hb-label">${r.label}</span><span class="hb-track"><span class="hb-fill${warnLow && r.value < 50 ? " low" : ""}" style="width:${Math.max(r.value ? 2 : 0, Math.round(r.w * 100))}%"></span></span><span class="hb-val">${r.text}</span></li>`)
    .join("")}</ul>`;
}

/** Grafik batang harian (SVG) dengan tooltip saat diarahkan/disentuh dan tabel alternatif.
 *  Digambar sesuai lebar wadah (teks tetap terbaca di HP); grafik di tab tersembunyi digambar saat tab dibuka. */
const CHARTS = new Map();
function barChart(el, rows, o) {
  CHARTS.set(el, [rows, o]);
  if (el.offsetParent !== null) drawBars(el, rows, o);
}
function redrawCharts() {
  CHARTS.forEach(([rows, o], el) => { if (el.offsetParent !== null && el.dataset.w !== String(el.clientWidth)) drawBars(el, rows, o); });
}
function drawBars(el, rows, o) {
  const W = Math.max(280, Math.round(el.clientWidth || 640)), H = W < 480 ? 180 : 210, L = 52, R = 8, T = 10, B = 26;
  el.dataset.w = String(el.clientWidth);
  const vals = rows.map((r) => Number(r[o.y]) || 0);
  const max = niceMax(Math.max(0, ...vals));
  const n = rows.length;
  const step = (W - L - R) / n;
  const bw = Math.max(2, Math.min(22, step - 2));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 64))));
  let g = ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${esc(o.axis(t))}</text>`).join("");
  rows.forEach((r, i) => {
    const v = vals[i];
    const x = L + i * step + (step - bw) / 2;
    const h = Math.max(0, H - B - y(v));
    if (h > 0) g += `<path class="bar" d="${roundTop(x, y(v), bw, h, Math.min(4, bw / 2, h))}"/>`;
    g += `<rect class="hit" x="${L + i * step}" y="${T}" width="${step}" height="${H - T - B}" data-i="${i}"/>`;
    if (i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) g += `<text class="ax" x="${L + i * step + step / 2}" y="${H - 8}" text-anchor="middle">${esc(dShort(r.date))}</text>`;
  });
  const total = vals.reduce((s, v) => s + v, 0);
  el.innerHTML = `<figure class="chart-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}: total ${esc(o.fmt(total, {}))}">${g}</svg>
    <details class="chart-table"><summary>Lihat tabel</summary><div class="table-wrap"><table class="table adm-table"><thead><tr><th>Tanggal</th><th class="num">${esc(o.label)}</th></tr></thead><tbody>${rows
      .map((r, i) => `<tr><td>${dShort(r.date)}</td><td class="num">${esc(o.fmt(vals[i], r))}</td></tr>`).join("")}</tbody></table></div></details></figure>`;
  const svg = el.querySelector("svg");
  svg.querySelectorAll(".hit").forEach((h) => {
    const show = (ev) => {
      const i = Number(h.dataset.i);
      svg.querySelectorAll(".hit.on").forEach((x) => x.classList.remove("on"));
      h.classList.add("on");
      tip(ev, `<b>${esc(dShort(rows[i].date))}</b><br>${esc(o.fmt(vals[i], rows[i]))}`);
    };
    h.addEventListener("mousemove", show);
    h.addEventListener("click", show);
    h.addEventListener("mouseleave", () => { h.classList.remove("on"); tip(null); });
  });
}
function roundTop(x, y, w, h, r) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

let tipEl;
function initTooltip() {
  tipEl = document.createElement("div");
  tipEl.className = "chart-tip";
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  document.addEventListener("scroll", () => tip(null), { passive: true });
}
function tip(ev, html) {
  if (!ev) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const pad = 12, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = ev.clientX + pad, yy = ev.clientY - h - pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (yy < 8) yy = ev.clientY + pad;
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${yy}px`;
}
