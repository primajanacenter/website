/**
 * konsultasi.js — Menu E "Konsultasi CPNS" (Fase 13).
 *
 * - Pesan jadwal: pilih tanggal → jam → bayar (slot 60 menit untuk 1 orang).
 * - Ruang chat (?slot=ID): pembeli & konsultan saling berkirim pesan; diperbarui otomatis tiap ±4 detik
 *   saat halaman terlihat (±15 detik saat tab disembunyikan). Chat terbuka 10 menit sebelum jadwal sampai selesai.
 * - Meja konsultan (?desk=1): daftar sesi untuk email konsultan/admin.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, getParam, toast } from "../core/ui.js";
import { ICON, buy, emptyBox, fmtDay, fmtDT, fmtTime, goLogin, initBottomNav, rupiah, handleCommonError } from "./hub.js";

let slots = [];
let selDay = null;

export async function initKonsultasi() {
  initBottomNav("home");
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ""));
  const slot = getParam("slot");
  if (slot) return openChat(slot);
  if (getParam("desk")) return openDesk();
  await loadBooking();
}

/* ======================= Pesan jadwal ======================= */
async function loadBooking() {
  const res = await api.call("getConsultSlots");
  if (!res.ok) return handleCommonError(res.error, $("#k-status"));
  const d = res.data;
  slots = d.slots;
  $("#k-desk-link").hidden = !d.isConsultant;
  if (d.mine.length) {
    $("#k-mine-sec").hidden = false;
    $("#k-mine").innerHTML = d.mine.map(mineCard).join("");
  }
  const days = [...new Set(slots.map((s) => dayKey(s.startsAt)))];
  if (!days.length) {
    $("#k-days").innerHTML = "";
    $("#k-slots").innerHTML = emptyBox("Belum ada jadwal kosong. Jadwal baru dibuka berkala — cek lagi nanti.");
    return;
  }
  selDay = days[0];
  const draw = () => {
    $("#k-days").innerHTML = days.map((k) => {
      const s = slots.find((x) => dayKey(x.startsAt) === k);
      const d0 = new Date(s.startsAt);
      return `<button type="button" data-day="${k}" aria-pressed="${k === selDay}"><small>${esc(d0.toLocaleDateString("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }))}</small><b>${esc(d0.toLocaleDateString("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" }))}</b><small>${esc(d0.toLocaleDateString("id-ID", { month: "short", timeZone: "Asia/Jakarta" }))}</small></button>`;
    }).join("");
    $("#k-days").querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { selDay = b.dataset.day; draw(); }));
    $("#k-slots").innerHTML = slots.filter((s) => dayKey(s.startsAt) === selDay).map((s) =>
      `<button type="button" data-slot="${esc(s.slotId)}">${fmtTime(s.startsAt)}<small>${esc(s.consultantName)}</small></button>`).join("");
    $("#k-slots").querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => confirmSlot(b.dataset.slot)));
  };
  draw();
}

const dayKey = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10);

function mineCard(c) {
  const label = { upcoming: `Terjadwal · ${fmtDT(c.startsAt)}`, open: "Ruang chat sedang dibuka", ended: `Selesai · ${fmtDay(c.startsAt)}`, cancelled: "Dibatalkan" }[c.state];
  return `<div class="ticket"><div class="tx"><b>Konsultasi dengan ${esc(c.consultantName)}</b><small>${esc(label)}</small></div>
    <a class="btn ${c.chatOpen ? "btn-accent" : "btn-secondary"}" href="konsultasi.html?slot=${encodeURIComponent(c.slotId)}">${c.chatOpen ? "Masuk ruang chat" : c.state === "ended" ? "Lihat riwayat" : "Buka"}</a></div>`;
}

function confirmSlot(id) {
  if (!auth.isLoggedIn()) return goLogin("konsultasi.html");
  const s = slots.find((x) => x.slotId === id);
  if (!s) return;
  $("#k-sheet-body").innerHTML = `<dl class="kv"><dt>Jadwal</dt><dd>${esc(fmtDT(s.startsAt))} – ${fmtTime(s.endsAt)} WIB</dd><dt>Konsultan</dt><dd>${esc(s.consultantName)}</dd><dt>Layanan</dt><dd>Chat di aplikasi, maksimal 60 menit</dd><dt>Harga</dt><dd><b>${rupiah(s.price)}</b></dd></dl>`;
  $("#k-sheet-buy").textContent = `Bayar ${rupiah(s.price)}`;
  $("#k-sheet").hidden = false;
  $("#k-sheet-x").onclick = () => ($("#k-sheet").hidden = true);
  $("#k-sheet-buy").onclick = (e) => buy("consult", s.slotId, e.currentTarget);
}

/* ======================= Ruang chat ======================= */
let chat = { slotId: null, last: null, role: null, timer: null, ids: new Set(), state: null };

async function openChat(slotId) {
  if (!auth.requireLogin("masuk.html")) return;
  $("#k-book").hidden = true;
  $("#k-chat").hidden = false;
  document.body.classList.add("chat-on");
  $("#k-back").textContent = "‹ Konsultasi";
  $("#k-back").href = "konsultasi.html";
  $("#k-title").textContent = "Ruang konsultasi";
  $("#k-lead").textContent = "Pesan tersimpan otomatis. Jangan bagikan data sensitif seperti kata sandi atau nomor rekening.";
  chat.slotId = slotId;
  $("#c-form").addEventListener("submit", send);
  $("#c-text").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } });
  $("#c-text").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(120, e.target.scrollHeight) + "px"; });
  document.addEventListener("visibilitychange", () => schedule(document.hidden ? 15000 : 800));
  await poll(true);
}

async function poll(first) {
  clearTimeout(chat.timer);
  const res = await api.call("getConsultChat", { slotId: chat.slotId, after: first ? "" : chat.last || "" });
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return goLogin();
    if (first) return handleCommonError(res.error, $("#k-status"));
    return schedule(15000);
  }
  const d = res.data;
  chat.role = d.role;
  renderHead(d);
  const body = $("#c-body");
  if (first || d.full) { body.innerHTML = ""; chat.ids.clear(); }
  if (first && !d.messages.length) body.innerHTML = `<span class="chat-note">${d.slot.chatOpen ? "Ruang chat sudah dibuka. Mulai dengan perkenalan singkat dan pertanyaan utamamu." : "Belum ada pesan."}</span>`;
  appendMsgs(d.messages);
  const open = d.slot.chatOpen;
  $("#c-text").disabled = !open;
  $("#c-send").disabled = !open;
  $("#c-text").placeholder = open ? "Tulis pesan…" : d.slot.state === "upcoming" ? `Ruang chat dibuka ${fmtDT(d.slot.openFrom)}` : "Sesi sudah berakhir";
  if (d.slot.state === "ended" || d.slot.state === "cancelled") return;   // berhenti memperbarui
  schedule(document.hidden ? 15000 : d.slot.state === "upcoming" ? 30000 : 4000);
}

function schedule(ms) {
  clearTimeout(chat.timer);
  if (chat.state === "ended") return;
  chat.timer = setTimeout(() => poll(false), ms);
}

function renderHead(d) {
  chat.state = d.slot.state;
  const other = chat.role === "consultant" ? d.slot.clientName || "Peserta" : d.slot.consultantName;
  $("#c-name").textContent = other;
  $("#c-av").textContent = String(other).trim().charAt(0).toUpperCase() || "K";
  $("#c-state").textContent = {
    upcoming: `Terjadwal ${fmtDT(d.slot.startsAt)} · ruang chat dibuka 10 menit sebelumnya`,
    open: `Sesi berlangsung · berakhir ${fmtTime(d.slot.endsAt)} WIB`,
    ended: `Sesi selesai · ${fmtDay(d.slot.startsAt)}`,
    cancelled: "Sesi dibatalkan",
  }[d.slot.state];
}

function appendMsgs(list) {
  const body = $("#c-body");
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  list.forEach((m) => {
    if (chat.ids.has(m.id)) return;
    chat.ids.add(m.id);
    chat.last = m.id;
    body.querySelector(".chat-note")?.remove();
    const el = document.createElement("div");
    el.className = `msg ${m.sender === chat.role ? "me" : "them"}`;
    el.innerHTML = `${esc(m.text)}<time>${fmtTime(m.at)}</time>`;
    body.appendChild(el);
  });
  if (nearBottom || list.length) body.scrollTop = body.scrollHeight;
}

async function send(e) {
  e.preventDefault();
  const ta = $("#c-text");
  const text = ta.value.trim();
  if (!text) return;
  $("#c-send").disabled = true;
  const res = await api.call("sendConsultMessage", { slotId: chat.slotId, text });
  $("#c-send").disabled = false;
  if (!res.ok) return toast(res.error.message, 4000);
  ta.value = "";
  ta.style.height = "auto";
  appendMsgs([res.data]);
  ta.focus();
}

/* ======================= Meja konsultan ======================= */
async function openDesk() {
  if (!auth.requireLogin("masuk.html")) return;
  $("#k-book").hidden = true;
  $("#k-desk").hidden = false;
  $("#k-back").textContent = "‹ Konsultasi";
  $("#k-back").href = "konsultasi.html";
  $("#k-title").textContent = "Meja konsultan";
  $("#k-lead").textContent = "Sesi 3 hari terakhir sampai 14 hari ke depan. Buka sesi yang sedang berlangsung untuk membalas chat.";
  const res = await api.call("getConsultDesk");
  if (!res.ok) return handleCommonError(res.error, $("#k-status"));
  const list = res.data.slots;
  $("#k-desk-list").innerHTML = list.length ? list.map((s) => {
    const who = s.status === "booked" ? `${esc(s.clientName || "Peserta")} · ${esc(s.clientEmail)}` : s.status === "open" ? "Belum dipesan" : esc(s.status);
    return `<div class="ticket"><div class="tx"><b>${esc(fmtDT(s.startsAt))}</b><small>${who}${res.data.admin ? ` · ${esc(s.consultantName)}` : ""}</small></div>
      ${s.status === "booked" ? `<a class="btn ${s.chatOpen ? "btn-accent" : "btn-secondary"}" href="konsultasi.html?slot=${encodeURIComponent(s.slotId)}">${s.chatOpen ? "Balas chat" : "Buka"}</a>` : ""}</div>`;
  }).join("") : emptyBox("Belum ada sesi untuk akunmu.");
}
