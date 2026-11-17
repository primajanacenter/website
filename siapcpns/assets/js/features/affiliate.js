/**
 * affiliate.js: Program Affiliate (Fase 15)
 *
 * Komisi dihitung dan disimpan di server (Affiliate.gs). Halaman ini hanya menampilkan status,
 * link, saldo, riwayat, formulir pendaftaran, dan permintaan pencairan.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { CONFIG } from "../core/config.js";
import { $, $$, esc, fmtDate, copyText, toast, setBusy } from "../core/ui.js";

const S = { d: null };
const nf = new Intl.NumberFormat("id-ID");
const rp = (n) => "Rp" + nf.format(Math.round(n || 0));
const KIND = { premium: "Premium SKD", skb: "Premium SKB", tryout: "Paket tryout", akbar: "Tryout Akbar", live: "Live mentoring", rec: "Rekaman mentoring", consult: "Konsultasi" };
const STATE = {
  holding: ["Masa tahan", "chip-warn"], available: ["Bisa dicairkan", "chip-ok"], requested: ["Diproses", "chip-primary"],
  paid: ["Dibayar", "chip-ok"], void: ["Dibatalkan", "chip-bad"],
};
const PAY_STATE = { requested: ["Diproses admin", "chip-primary"], paid: ["Sudah ditransfer", "chip-ok"], rejected: ["Ditolak", "chip-bad"] };
const VIA = { bank: "transfer bank", ewallet: "e-wallet", mayar: "Mayar" };

export async function initAffiliate() {
  if (!auth.requireLogin("masuk.html")) return;
  $("#af-form").addEventListener("submit", apply);
  $("#af-copy").addEventListener("click", async () => toast((await copyText($("#af-link").value)) ? "Link affiliate disalin." : "Gagal menyalin. Salin manual dari kolom link."));
  $("#af-copy-msg").addEventListener("click", async () => toast((await copyText(promoText())) ? "Teks promosi disalin. Tempel di WA, IG, atau grup." : "Gagal menyalin."));
  $("#af-payout").addEventListener("click", confirmPayout);
  $("#af-confirm").addEventListener("close", () => { if ($("#af-confirm").returnValue === "ok") requestPayout(); });
  $("#af-acc-edit").addEventListener("click", () => toggleAcc(true));
  $("#af-acc-cancel").addEventListener("click", () => toggleAcc(false));
  $("#af-acc-form").addEventListener("submit", saveAccount);
  await load();
}

async function load() {
  const res = await api.call("getAffiliate", {}, { fresh: true });
  $("#af-loading").hidden = true;
  if (!res.ok) return fail(res.error);
  S.d = res.data;
  render();
}

function link(code) {
  const root = new URL("../", location.href).href;
  return `${root}?ref=${encodeURIComponent(code)}&utm_source=affiliate&utm_medium=referral&utm_campaign=${encodeURIComponent(code)}`;
}

function promoText() {
  const d = S.d;
  return `Lagi persiapan CPNS 2026? Aku pakai ${CONFIG.APP_NAME} oleh ${CONFIG.ORG_NAME}: tryout CAT 110 soal format terbaru (termasuk figural HOTS), materi, latihan per topik, sampai Paket SKB dan latihan wawancara. Daftar gratis lewat link ini, dan dapat diskon 10% untuk Premium pertama:\n${link(d.code)}`;
}

function render() {
  const d = S.d, p = d.program, rate = d.ratePct || p.ratePct;
  $$("[data-aff-rate]").forEach((el) => (el.textContent = rate));
  $$("[data-aff-window]").forEach((el) => (el.textContent = p.windowDays));
  $$("[data-aff-hold]").forEach((el) => (el.textContent = p.holdDays));
  $$("[data-aff-min]").forEach((el) => (el.textContent = rp(p.minPayout)));
  $$("[data-aff-fee]").forEach((el) => (el.textContent = rp(p.fee)));
  const c1 = 10 * Math.floor(75000 * 0.9 * rate / 100), c2 = 5 * Math.floor(85000 * rate / 100);
  $("#af-sim1").textContent = rp(c1); $("#af-sim2").textContent = rp(c2); $("#af-simt").textContent = rp(c1 + c2);

  const st = d.status;
  $("#af-join").hidden = !(st === "none" || st === "rejected");
  $("#af-pending").hidden = st !== "pending";
  $("#af-suspended").hidden = st !== "suspended";
  $("#af-active").hidden = st !== "approved";
  if (st === "none" || st === "rejected") renderJoin(d);
  if (st === "suspended") $("#af-suspended").innerHTML = `<strong>Akun affiliate-mu sedang dinonaktifkan.</strong> ${esc(d.adminNote || "")} Hubungi admin ${esc(CONFIG.ORG_NAME)} untuk informasi lebih lanjut.`;
  if (st === "pending") $("#af-pending-text").textContent = `Dikirim ${fmtDate(d.appliedAt)}. Admin akan meninjau dalam 1x24 jam kerja. Kamu sudah bisa membagikan link ajakan; komisi dihitung untuk pembelian setelah kamu disetujui.`;
  if (st === "approved") renderActive(d);
}

/* ---------------- pendaftaran ---------------- */
function payFields(root, prefix, cur = {}) {
  const prov = S.d.program.providers;
  root.innerHTML = `<legend>Rekening untuk pencairan komisi</legend>
    <div class="af-seg" role="radiogroup" aria-label="Jenis rekening">
      <label><input type="radio" name="${prefix}-method" value="bank"${cur.method !== "ewallet" ? " checked" : ""}> Rekening bank</label>
      <label><input type="radio" name="${prefix}-method" value="ewallet"${cur.method === "ewallet" ? " checked" : ""}> E-wallet</label>
    </div>
    <div class="af-row2">
      <div class="field"><label for="${prefix}-provider">Bank / e-wallet</label><select class="input" id="${prefix}-provider"></select></div>
      <div class="field"><label for="${prefix}-accno" id="${prefix}-acclabel">Nomor rekening</label><input class="input mono" id="${prefix}-accno" inputmode="numeric" maxlength="24" autocomplete="off"></div>
    </div>
    <div class="field"><label for="${prefix}-accname">Nama pemilik rekening</label><input class="input" id="${prefix}-accname" maxlength="80" autocomplete="off" placeholder="Sesuai buku tabungan / aplikasi"></div>`;
  const sync = () => {
    const m = root.querySelector(`input[name=${prefix}-method]:checked`).value;
    const sel = root.querySelector(`#${prefix}-provider`);
    const keep = sel.value || cur.provider;
    sel.innerHTML = `<option value="">Pilih…</option>` + prov[m].map((x) => `<option${x === keep ? " selected" : ""}>${esc(x)}</option>`).join("");
    root.querySelector(`#${prefix}-acclabel`).textContent = m === "bank" ? "Nomor rekening" : "Nomor HP terdaftar di e-wallet";
  };
  root.querySelectorAll(`input[name=${prefix}-method]`).forEach((r) => r.addEventListener("change", sync));
  sync();
}
function readPay(root, prefix) {
  return {
    method: root.querySelector(`input[name=${prefix}-method]:checked`).value,
    provider: root.querySelector(`#${prefix}-provider`).value,
    accountNo: root.querySelector(`#${prefix}-accno`).value,
    accountName: root.querySelector(`#${prefix}-accname`).value,
  };
}

function renderJoin(d) {
  const rej = $("#af-rejected");
  rej.hidden = d.status !== "rejected";
  if (d.status === "rejected") rej.innerHTML = `<strong>Pendaftaran sebelumnya belum disetujui.</strong> ${esc(d.adminNote || "")} Perbaiki datamu lalu kirim ulang.`;
  if (!$("#af-pay").childElementCount) {
    payFields($("#af-pay"), "af", d.payment || {});
    const me = auth.getUser ? auth.getUser() : null;
    if (me && me.name && !$("#af-name").value) $("#af-name").value = me.name;
    if (d.payment) { $("#af-phone").value = d.payment.phone || ""; $("#af-channel").value = d.payment.channel || ""; }
  }
}

async function apply(e) {
  e.preventDefault();
  const payload = { name: $("#af-name").value, phone: $("#af-phone").value, channel: $("#af-channel").value, agree: $("#af-agree").checked, ...readPay($("#af-pay"), "af") };
  const miss = !payload.name.trim() ? "Isi nama lengkap." : payload.phone.replace(/\D/g, "").length < 9 ? "Isi nomor WhatsApp aktif." : !payload.provider ? "Pilih bank atau e-wallet." :
    payload.accountNo.replace(/\D/g, "").length < 6 ? "Isi nomor rekening / e-wallet." : payload.accountName.trim().length < 3 ? "Isi nama pemilik rekening." :
    payload.channel.trim().length < 5 ? "Ceritakan singkat di mana kamu akan mempromosikan." : !payload.agree ? "Centang persetujuan ketentuan." : "";
  if (miss) return status(miss, true);
  const btn = $("#af-submit");
  setBusy(btn, true, "Mengirim…");
  const res = await api.call("applyAffiliate", payload);
  setBusy(btn, false);
  if (!res.ok) return fail(res.error);
  status("Pendaftaran terkirim. Kami kabari setelah ditinjau admin.");
  window.scrollTo({ top: 0, behavior: "smooth" });
  await load();
}

/* ---------------- dasbor affiliate ---------------- */
function renderActive(d) {
  const p = d.program, s = d.stats;
  $("#af-rate-chip").textContent = `Komisi ${d.ratePct}%`;
  $("#af-link").value = link(d.code);
  $("#af-code").textContent = d.code;
  $("#af-wa").href = `https://wa.me/?text=${encodeURIComponent(promoText())}`;
  $("#af-available").textContent = rp(s.available);
  const pctv = Math.min(100, Math.round((s.available / p.minPayout) * 100));
  $("#af-progress").style.width = `${pctv}%`;
  $("#af-progress-text").textContent = d.openRequest ? "Pencairan sebelumnya sedang diproses admin."
    : s.available >= p.minPayout ? `Kamu akan menerima ${rp(s.available - p.fee)} setelah potongan transfer ${rp(p.fee)}.`
    : `Kurang ${rp(p.minPayout - s.available)} lagi untuk mencapai minimal pencairan ${rp(p.minPayout)}.`;
  $("#af-payout").disabled = !d.canRequest;
  $("#af-holding").textContent = rp(s.holding);
  $("#af-hold-note").textContent = `cair setelah ${p.holdDays} hari`;
  $("#af-requested").textContent = rp(s.requested);
  $("#af-paid").textContent = rp(s.paid);
  $("#af-buyers").textContent = nf.format(s.buyers);
  $("#af-referred").textContent = `${nf.format(s.referred)} orang bergabung · penjualan ${rp(s.sales)}`;

  $("#af-coms").innerHTML = d.commissions.length
    ? d.commissions.map((c) => {
        const [lbl, cls] = STATE[c.state] || [c.state, ""];
        const when = c.state === "holding" ? ` · bisa dicairkan ${fmtDate(c.availableAt)}` : "";
        return `<li><div><b>${esc(KIND[c.kind] || c.product || c.kind)}</b><small class="muted">${fmtDate(c.at)} · dibayar pembeli ${rp(c.amount)}${when}</small></div><div class="af-com-r"><b>${rp(c.commission)}</b><span class="chip ${cls}">${lbl}</span></div></li>`;
      }).join("")
    : `<li class="muted small">Belum ada komisi. Bagikan link-mu ke teman, grup belajar, atau media sosial.</li>`;

  $("#af-payouts").innerHTML = d.payouts.length
    ? d.payouts.map((x) => {
        const [lbl, cls] = PAY_STATE[x.status] || [x.status, ""];
        const extra = x.status === "paid" ? `Ditransfer ${fmtDate(x.processedAt)} via ${VIA[x.paidVia] || x.paidVia}${x.refNo ? ` · ref ${esc(x.refNo)}` : ""}`
          : x.status === "rejected" ? `Alasan: ${esc(x.note)}. Saldo dikembalikan.` : `Diajukan ${fmtDate(x.requestedAt)} ke ${esc(x.provider)} ${esc(x.accountMasked)}`;
        return `<li><div><b>${rp(x.net)}</b> <small class="muted">(${rp(x.gross)} dikurangi ${rp(x.fee)})</small><br><small class="muted">${extra}</small></div><span class="chip ${cls}">${lbl}</span></li>`;
      }).join("")
    : `<li class="muted small">Belum ada pencairan.</li>`;

  const a = d.payment;
  $("#af-acc").innerHTML = `<div><dt>${a.method === "ewallet" ? "E-wallet" : "Bank"}</dt><dd>${esc(a.provider)}</dd></div><div><dt>Nomor</dt><dd class="mono">${esc(a.accountMasked)}</dd></div><div><dt>Atas nama</dt><dd>${esc(a.accountName)}</dd></div><div><dt>WhatsApp</dt><dd>${esc(a.phone)}</dd></div>`;
}

function toggleAcc(on) {
  $("#af-acc").hidden = on;
  $("#af-acc-form").hidden = !on;
  $("#af-acc-edit").hidden = on;
  if (on) {
    payFields($("#af-pay2"), "af2", S.d.payment);
    $("#af2-accname").value = S.d.payment.accountName || "";
    $("#af-phone2").value = S.d.payment.phone || "";
    $("#af2-accno").focus();
  }
}

async function saveAccount(e) {
  e.preventDefault();
  const payload = { phone: $("#af-phone2").value, ...readPay($("#af-pay2"), "af2") };
  const btn = $("#af-acc-save");
  setBusy(btn, true, "Menyimpan…");
  const res = await api.call("updateAffiliatePayment", payload);
  setBusy(btn, false);
  if (!res.ok) return status(res.error.message, true);
  toast("Rekening pencairan diperbarui.");
  toggleAcc(false);
  await load();
}

function confirmPayout() {
  const d = S.d, s = d.stats, p = d.program;
  $("#af-c-gross").textContent = rp(s.available);
  $("#af-c-fee").textContent = `− ${rp(p.fee)}`;
  $("#af-c-net").textContent = rp(s.available - p.fee);
  $("#af-c-to").textContent = `${d.payment.provider} ${d.payment.accountMasked} a.n. ${d.payment.accountName}`;
  const dlg = $("#af-confirm");
  dlg.returnValue = "";
  if (dlg.showModal) dlg.showModal(); else if (confirm(`Cairkan ${rp(s.available)}? Kamu menerima ${rp(s.available - p.fee)}.`)) requestPayout();
}

async function requestPayout() {
  const btn = $("#af-payout");
  setBusy(btn, true, "Mengajukan…");
  const res = await api.call("requestPayout", {});
  setBusy(btn, false);
  if (!res.ok) return status(res.error.message, true);
  status(`Pencairan ${rp(res.data.net)} diajukan. Admin akan mentransfer dalam 1 sampai 3 hari kerja.`);
  await load();
}

function fail(error) {
  if (error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("affiliate.html")}`);
  status(error.message, true);
}

function status(msg, isError = false) {
  const el = $("#af-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}
