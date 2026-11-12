/**
 * akun.js — Member area (Fase 13): Premium, tiket Live Mentoring (tombol Gabung), rekaman, konsultasi,
 * paket tryout & tiket Akbar milik pengguna, riwayat pembayaran, dan menu fitur lain.
 *
 * Link Zoom diminta ke server (joinLive) hanya saat tombol Gabung ditekan dan tidak pernah ditampilkan sebagai teks.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate, setBusy, toast } from "../core/ui.js";
import { emptyBox, fmtDT, fmtDay, fmtTime, initBottomNav, premiumSheet, skbSheet, rupiah } from "./hub.js";

const KIND = { premium: "Premium", tryout: "Paket tryout", akbar: "Tiket Akbar", live: "Live Mentoring", rec: "Rekaman", consult: "Konsultasi", skb: "Premium SKB" };
const STATUS = { paid: ["Lunas", "chip-ok"], pending: ["Menunggu", "chip-warn"], expired: ["Kedaluwarsa", ""], failed: ["Gagal", "chip-bad"] };

export async function initAkun() {
  initBottomNav("akun");
  if (!auth.requireLogin("masuk.html")) return;
  $("#btn-logout").addEventListener("click", () => { auth.logout(); location.replace("../"); });
  const [me, items] = await api.batch([{ action: "getMe" }, { action: "getMyItems" }]);
  if (!items.ok) {
    if (items.error.code === "UNAUTHENTICATED") return location.replace("masuk.html?next=akun.html");
    const el = $("#ak-status"); el.hidden = false; el.classList.add("error"); el.textContent = items.error.message; return;
  }
  if (me.ok) { store.set(KEYS.ME, { ...me.data, fetchedAt: Date.now() }); auth.updateUser(me.data.user); }
  const user = me.ok ? me.data.user : auth.getUser();
  renderProfile(user, items.data.premium, items.data.skb);
  $("#ak-admin").hidden = !(me.ok && me.data.isAdmin);
  renderPending(items.data.pending);
  renderLive(items.data.live);
  renderRec(items.data.recordings);
  renderKon(items.data.consults);
  renderTryout(items.data.tryouts, items.data.akbar);
  renderHistory(items.data.history);
  api.call("getConsultSlots").then((r) => { if (r.ok && r.data.isConsultant) $("#ak-desk").hidden = false; });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

function renderProfile(u, p, skb) {
  const ini = String(u?.name || u?.email || "?").trim().charAt(0).toUpperCase();
  $("#ak-prof").innerHTML = `${u?.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc(ini)}</span>`}<div><b>${esc(u?.name || "Pengguna")}</b><span>${esc(u?.email || "")}</span></div>`;
  $("#ak-premium").innerHTML = p.active
    ? `<div class="row" style="align-items:center;gap:8px"><span class="chip chip-accent">Premium aktif</span><span class="small">s.d. ${esc(fmtDate(p.until))}${p.legacy ? " · termasuk semua paket tryout reguler (hak paket lama)" : ""}</span></div>`
    : `<div class="row" style="align-items:center;gap:8px;justify-content:space-between"><span class="small muted">Akun gratis · Premium membuka semua Paket Materi & Latihan Soal per Materi</span><button class="btn btn-accent" type="button" id="ak-go-premium">Berlangganan</button></div>`;
  $("#ak-go-premium")?.addEventListener("click", () => premiumSheet({ title: "Langganan Premium", text: "Buka semua materi dan latihan soal." }));
  // Fase 14: Premium SKB (terpisah dari Premium SKD)
  if (skb) {
    $("#ak-premium").insertAdjacentHTML("beforeend", skb.active
      ? `<div class="row" style="align-items:center;gap:8px;margin-top:8px"><span class="chip chip-ok">Premium SKB aktif</span><span class="small">s.d. ${esc(fmtDate(skb.until))} · semua instansi</span><a class="small" href="paket-skb.html">Paket SKB ›</a></div>`
      : `<div class="row" style="align-items:center;gap:8px;justify-content:space-between;margin-top:8px"><span class="small muted">Premium SKB ${rupiah(skb.price)}/bulan · tryout, materi, latihan & wawancara SKB semua instansi</span><button class="btn btn-secondary btn-sm" type="button" id="ak-go-skb">Lihat</button></div>`);
    $("#ak-go-skb")?.addEventListener("click", () => skbSheet({ price: skb.price }));
  }
}

function renderPending(list) {
  if (!list.length) return;
  const box = $("#ak-pending");
  box.hidden = false;
  box.innerHTML = list.map((t) => `<div class="callout callout-warn"><div><strong>Pembayaran belum selesai: ${esc(t.planName)} (${rupiah(t.amount)})</strong>
    <div class="row" style="margin-top:8px;gap:8px"><a class="btn btn-primary" href="${esc(t.paymentUrl)}" rel="noopener">Lanjutkan bayar</a><a class="btn btn-secondary" href="status-bayar.html?trx=${encodeURIComponent(t.trxId)}">Cek status</a></div></div></div>`).join("");
}

function renderLive(list) {
  const box = $("#ak-live");
  const live = list.filter((x) => x.state !== "ended");
  if (!list.length) { box.innerHTML = emptyBox("Belum ada tiket. Pilih sesi di menu Mentoring."); return; }
  box.innerHTML = list.map((s) => {
    const label = { upcoming: `${fmtDT(s.startsAt)} – ${fmtTime(s.endsAt)} WIB`, joinable: "Ruang Zoom sudah bisa dimasuki", live: "Sesi sedang berlangsung", ended: `Selesai · ${fmtDay(s.startsAt)}`, cancelled: "Dibatalkan — admin akan menghubungimu" }[s.state];
    const btn = s.canJoin ? `<button class="btn btn-accent" type="button" data-join="${esc(s.sessionId)}">Gabung Zoom</button>`
      : s.state === "upcoming" ? `<button class="btn btn-secondary" type="button" disabled title="Aktif 15 menit sebelum mulai">Gabung (${fmtTime(s.joinFrom)})</button>`
      : s.recordingAvailable ? `<a class="btn btn-secondary" href="mentoring.html#h-rec">Rekaman</a>` : "";
    return `<div class="ticket"><div class="tx"><b>${esc(s.title)}</b><small>${esc(label)}</small></div>${btn}</div>`;
  }).join("") + (live.length ? "" : "");
  box.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => join(b)));
}

async function join(btn) {
  // Buka jendela lebih dulu (dalam klik pengguna) agar tidak diblokir browser, lalu arahkan setelah link diterima.
  const w = window.open("", "_blank");
  setBusy(btn, true, "Membuka Zoom…");
  const res = await api.call("joinLive", { sessionId: btn.dataset.join, ua: navigator.userAgent.slice(0, 120) });
  setBusy(btn, false);
  if (!res.ok) { if (w) w.close(); return toast(res.error.message, 4500); }
  if (res.data.passcode) toast(`Passcode Zoom: ${res.data.passcode} · gunakan nama "${res.data.name}"`, 9000);
  if (w) { w.opener = null; w.location.href = res.data.url; } else location.href = res.data.url;
}

function renderRec(list) {
  $("#ak-rec").innerHTML = list.length
    ? list.map((r) => `<div class="ticket"><div class="tx"><b>${esc(r.title)}</b><small>Rekaman ${esc(fmtDay(r.startsAt))}</small></div>${r.available ? `<a class="btn btn-primary" href="rekaman.html?id=${encodeURIComponent(r.sessionId)}">Tonton</a>` : `<span class="chip">Sedang diproses</span>`}</div>`).join("")
    : emptyBox("Belum ada rekaman yang dibeli.");
}

function renderKon(list) {
  $("#ak-kon").innerHTML = list.length
    ? list.map((c) => `<div class="ticket"><div class="tx"><b>Konsultasi dengan ${esc(c.consultantName)}</b><small>${esc(c.state === "open" ? "Ruang chat sedang dibuka" : c.state === "ended" ? `Selesai · ${fmtDay(c.startsAt)}` : fmtDT(c.startsAt))}${c.conflict ? " · jadwal bentrok, admin akan menghubungimu" : ""}</small></div>
        <a class="btn ${c.chatOpen ? "btn-accent" : "btn-secondary"}" href="konsultasi.html?slot=${encodeURIComponent(c.slotId)}">${c.chatOpen ? "Masuk chat" : c.state === "ended" ? "Riwayat" : "Buka"}</a></div>`).join("")
    : emptyBox("Belum ada jadwal konsultasi.");
}

function renderTryout(tryouts, akbar) {
  const rows = [
    ...akbar.map((a) => `<div class="ticket"><div class="tx"><b>Tiket ${esc(a.title)}</b><small>${esc(a.state === "published" ? "Hasil sudah terbit" : a.state === "open" ? "Sedang berlangsung" : fmtDT(a.opensAt))}</small></div><a class="btn btn-secondary" href="akbar.html">Buka</a></div>`),
    ...tryouts.map((t) => `<div class="ticket"><div class="tx"><b>${esc(t.title)}</b><small>Dibeli ${esc(fmtDate(t.boughtAt))} · bebas diulang</small></div><a class="btn btn-primary" href="tryout.html?paket=${encodeURIComponent(t.packageId)}">Kerjakan</a></div>`),
  ];
  $("#ak-tryout").innerHTML = rows.length ? rows.join("") : emptyBox("Belum ada paket tryout yang dibeli.");
}

function renderHistory(list) {
  $("#ak-history").innerHTML = list.length
    ? `<thead><tr><th>Tanggal</th><th>Produk</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>${list.map((t) => {
        const [lab, cls] = STATUS[t.status] || [t.status, ""];
        return `<tr><td>${esc(fmtDate(t.createdAt))}</td><td>${esc(t.planName)}<br><span class="xsmall muted">${esc(KIND[t.kind] || "")}</span></td><td>${rupiah(t.amount)}</td><td><span class="chip ${cls}">${esc(lab)}</span></td></tr>`;
      }).join("")}</tbody>`
    : `<tbody><tr><td class="muted">Belum ada transaksi.</td></tr></tbody>`;
}
