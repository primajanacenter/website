/**
 * premium.js — halaman Premium (pilih paket → checkout Mayar) dan halaman status pembayaran (Fase 5).
 *
 * Keamanan: frontend hanya mengirim planId. Harga, durasi, dan aktivasi premium ditentukan server
 * setelah status pembayaran dicek langsung ke Mayar.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate, getParam, setBusy, toast } from "../core/ui.js";

const PENDING_KEY = "pay.pending";
const FEATURES = ["Materi pendalaman level 2–4 (63 materi)", "Rencana belajar adaptif", "Latihan harian tanpa batas", "Rapor lengkap & pembahasan semua soal", "Ulangi tryout diagnostik tanpa batas", "Pengingat belajar & Tryout Akbar lewat email"];
const rupiah = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");

/* ======================= Halaman Premium ======================= */
export async function initPremium() {
  const res = await api.call("getPlans");
  if (!res.ok) {
    showStatus("#pr-status", res.error.message, true);
    $("#pr-plans").innerHTML = "";
    return;
  }
  const d = res.data;
  renderEnv(d.env);
  renderCurrent(d.current);
  renderPending(d.pending);
  renderReferral(d.referral);
  renderPlans(d.plans, d.env, d.current);
}

/** Fase 8: diskon kode ajakan teman untuk pembelian pertama. */
function renderReferral(ref) {
  if (!ref) return;
  const box = $("#pr-referral");
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<div><strong>Diskon ajakan ${ref.discountPct}% aktif.</strong> Harga di bawah sudah dipotong untuk pembelian Premium pertamamu.</div>`;
}

function renderEnv(env) {
  const box = $("#pr-env");
  if (api.isMock) {
    box.hidden = false;
    $("#pr-env-text").textContent = "Aplikasi berjalan tanpa backend. Pembayaran disimulasikan di browser ini.";
  } else if (env === "sandbox") {
    box.hidden = false;
  }
}

function renderCurrent(cur) {
  if (!cur || cur.plan !== "premium") return;
  const box = $("#pr-current");
  box.hidden = false;
  box.innerHTML = `<div><strong>Premium kamu aktif s.d. ${esc(fmtDate(cur.premiumUntil))}.</strong> Membeli lagi akan menambah masa aktif dari tanggal tersebut.</div>`;
}

function renderPending(p) {
  if (!p) return;
  const box = $("#pr-pending");
  box.hidden = false;
  box.innerHTML = `<div><strong>Ada pembayaran yang belum selesai: ${esc(p.planName)} (${rupiah(p.amount)})</strong>
    Berlaku s.d. ${esc(new Date(p.expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }))}.
    <div class="row" style="margin-top:8px"><a class="btn btn-primary" href="${esc(p.paymentUrl)}" rel="noopener">Lanjutkan pembayaran</a>
    <a class="btn btn-secondary" href="status-bayar.html?trx=${encodeURIComponent(p.trxId)}">Cek status</a></div></div>`;
}

function renderPlans(plans, env, cur) {
  const grid = $("#pr-plans");
  if (!plans.length) {
    grid.innerHTML = `<p class="muted">Paket belum tersedia. Coba lagi nanti.</p>`;
    return;
  }
  const off = env === "off" && !api.isMock;
  const featuredId = (plans.find((p) => p.badge) || plans[Math.floor(plans.length / 2)]).planId;
  grid.innerHTML = plans
    .map((p) => {
      const months = Math.max(1, Math.round(p.durationDays / 30));
      const pay = p.refPrice || p.price;
      const perMonth = Math.round(pay / months / 100) * 100;
      const label = off ? "Segera dibuka" : cur?.plan === "premium" ? "Tambah masa aktif" : "Pilih paket";
      return `<article class="plan-card ${p.planId === featuredId ? "featured" : ""}">
        ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}
        <h3>${esc(p.name)}</h3>
        <div class="plan-price">
          <span class="now">${rupiah(pay)}</span>
          ${p.refPrice ? `<span class="ref">Harga ajakan · normal ${rupiah(p.price)}</span>` : ""}
          ${p.priceBefore && p.priceBefore > p.price ? `<span class="save">Hemat ${rupiah(p.priceBefore - p.price)} dibanding bayar bulanan</span>` : ""}
          <span class="per">${p.durationDays} hari${months > 1 ? ` · ±${rupiah(perMonth)}/bulan` : ""} · sekali bayar</span>
        </div>
        ${p.description ? `<p class="small muted">${esc(p.description)}</p>` : ""}
        <ul>${FEATURES.map((f) => `<li>${f}</li>`).join("")}</ul>
        <button class="btn ${p.planId === featuredId ? "btn-accent" : "btn-primary"}" type="button" data-plan="${esc(p.planId)}" ${off ? "disabled" : ""}>${label}</button>
      </article>`;
    })
    .join("");
  grid.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => checkout(b)));
}

async function checkout(btn) {
  if (!auth.isLoggedIn()) {
    location.href = `masuk.html?next=${encodeURIComponent("premium.html")}`;
    return;
  }
  setBusy(btn, true, "Menyiapkan pembayaran…");
  const res = await api.call("createCheckout", { planId: btn.dataset.plan });
  if (!res.ok) {
    setBusy(btn, false);
    if (res.error.code === "UNAUTHENTICATED") {
      location.href = `masuk.html?next=${encodeURIComponent("premium.html")}`;
      return;
    }
    showStatus("#pr-status", res.error.message, true);
    return;
  }
  store.set(PENDING_KEY, { trxId: res.data.trxId, at: Date.now() });
  location.href = res.data.paymentUrl;
}

/* ======================= Halaman status pembayaran ======================= */
let timer = null;
let tries = 0;

export async function initStatusBayar() {
  const trxId = getParam("trx") || store.get(PENDING_KEY)?.trxId;
  if (!trxId) {
    render("none");
    return;
  }
  if (!auth.requireLogin("masuk.html")) return;
  if (api.isMock) {
    $("#ps-mock").hidden = false;
    document.querySelectorAll("[data-sim]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api.call("mockSimulatePayment", { trxId, result: b.dataset.sim });
        check(trxId);
      })
    );
  }
  check(trxId);
}

async function check(trxId, manual = false) {
  clearTimeout(timer);
  const res = await api.call("getPaymentStatus", { trxId });
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") {
      location.replace(`masuk.html?next=${encodeURIComponent("status-bayar.html?trx=" + trxId)}`);
      return;
    }
    render("error", { message: res.error.message, trxId });
    return;
  }
  const { transaction: t, premiumUntil } = res.data;
  if (t.status === "paid") {
    store.set(PENDING_KEY, null);
    await refreshMe();
    render("paid", { t, premiumUntil });
    return;
  }
  if (t.status === "expired" || t.status === "failed") {
    store.set(PENDING_KEY, null);
    render(t.status, { t });
    return;
  }
  tries++;
  render("pending", { t, manual });
  // Cek otomatis: tiap 5 detik selama 2 menit pertama, lalu tiap 20 detik sampai 10 menit
  const wait = tries < 24 ? 5000 : tries < 51 ? 20000 : null;
  if (wait) timer = setTimeout(() => check(trxId), wait);
}

async function refreshMe() {
  const me = await api.call("getMe");
  if (me.ok) {
    store.set(KEYS.ME, { ...me.data, fetchedAt: Date.now() });
    auth.updateUser?.(me.data.user);
  }
}

function render(state, o = {}) {
  const icon = $("#ps-icon"), title = $("#ps-title"), desc = $("#ps-desc"), acts = $("#ps-actions"), kv = $("#ps-detail");
  icon.className = "pay-icon";
  const t = o.t;
  if (t) {
    kv.hidden = false;
    kv.innerHTML = [
      ["Paket", t.planName],
      ["Jumlah", rupiah(t.amount)],
      ["Kode transaksi", `<code>${esc(t.trxId)}</code>`],
      t.paidAt ? ["Dibayar", new Date(t.paidAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })] : null,
    ]
      .filter(Boolean)
      .map(([k, v]) => `<dt>${k}</dt><dd>${k === "Kode transaksi" ? v : esc(v)}</dd>`)
      .join("");
  }
  if (state === "paid") {
    icon.classList.add("ok"); icon.textContent = "✓";
    title.textContent = "Pembayaran berhasil, Premium aktif";
    desc.textContent = `Premium kamu berlaku s.d. ${fmtDate(o.premiumUntil)}. Selamat belajar!`;
    acts.innerHTML = `<a class="btn btn-primary" href="latihan.html">Mulai latihan tanpa batas</a><a class="btn btn-secondary" href="dashboard.html">Ke beranda</a>`;
    $("#ps-mock").hidden = true;
  } else if (state === "pending") {
    icon.innerHTML = `<span class="spinner"></span>`;
    title.textContent = "Menunggu pembayaran";
    desc.textContent = "Selesaikan pembayaran di halaman Mayar. Halaman ini akan memperbarui status secara otomatis.";
    acts.innerHTML = `${t.paymentUrl ? `<a class="btn btn-primary" href="${esc(t.paymentUrl)}" rel="noopener">Buka halaman pembayaran</a>` : ""}<button class="btn btn-secondary" type="button" id="ps-recheck">Saya sudah bayar, cek lagi</button>`;
    $("#ps-recheck").addEventListener("click", (e) => {
      setBusy(e.currentTarget, true, "Memeriksa…");
      tries = 0;
      check(t.trxId, true).then(() => o.manual || toast("Status diperbarui"));
    });
    if (o.manual) toast("Pembayaran belum terdeteksi. Jika baru saja membayar, tunggu 1–2 menit.");
  } else if (state === "expired" || state === "failed") {
    icon.classList.add(state === "failed" ? "bad" : "warn"); icon.textContent = "!";
    title.textContent = state === "failed" ? "Pembayaran gagal dibuat" : "Link pembayaran kedaluwarsa";
    desc.textContent = "Tidak ada dana yang ditagih untuk transaksi ini. Silakan buat pembayaran baru.";
    acts.innerHTML = `<a class="btn btn-primary" href="premium.html">Pilih paket lagi</a>`;
  } else if (state === "none") {
    icon.classList.add("warn"); icon.textContent = "?";
    title.textContent = "Belum ada pembayaran";
    desc.textContent = "Pilih paket Premium terlebih dahulu.";
    acts.innerHTML = `<a class="btn btn-primary" href="premium.html">Lihat paket Premium</a>`;
    $("#ps-note").hidden = true;
  } else {
    icon.classList.add("bad"); icon.textContent = "!";
    title.textContent = "Status belum bisa diperiksa";
    desc.textContent = o.message || "Coba lagi sebentar.";
    acts.innerHTML = `<button class="btn btn-primary" type="button" id="ps-retry">Coba lagi</button><a class="btn btn-secondary" href="premium.html">Ke halaman Premium</a>`;
    $("#ps-retry").addEventListener("click", () => check(o.trxId));
  }
}

function showStatus(sel, msg, isError) {
  const el = $(sel);
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
