/**
 * mentoring.js — Menu D "Mentoring CPNS" (Fase 13): jadwal Live Mentoring (Zoom) & katalog rekaman.
 * Link Zoom tidak pernah ada di halaman ini; tombol Gabung hanya di member area (akun.html).
 */

import { api } from "../core/api.js";
import { $, esc } from "../core/ui.js";
import { buy, calBox, emptyBox, fmtDay, fmtTime, initBottomNav, rupiah, handleCommonError } from "./hub.js";

const SUBL = { twk: "TWK", tiu: "TIU", tkp: "TKP", umum: "Umum" };

export async function initMentoring() {
  initBottomNav("home");
  const res = await api.call("getMentoring");
  if (!res.ok) return handleCommonError(res.error, $("#mt-status"));
  renderLive(res.data.live);
  renderRec(res.data.recordings);
}

function renderLive(list) {
  const box = $("#mt-live");
  if (!list.length) { box.innerHTML = emptyBox("Jadwal sesi berikutnya segera diumumkan."); return; }
  box.innerHTML = list.map((s) => {
    let foot;
    if (s.owned) foot = `<span class="owned">✓ Tiket dimiliki</span><a class="btn btn-${s.canJoin ? "accent" : "secondary"}" href="akun.html#live">${s.canJoin ? "Gabung sekarang" : "Lihat di Akun"}</a>`;
    else if (!s.onSale) foot = `<span class="chip">${s.seatsLeft ? "Pendaftaran ditutup" : "Kursi penuh"}</span>`;
    else foot = `<span class="price">${rupiah(s.price)}</span><button class="btn btn-accent" type="button" data-buy="${esc(s.sessionId)}">Pesan tiket</button>`;
    return `<article class="pcard">
      <div class="when">${calBox(s.startsAt)}<div class="tm"><b>${esc(fmtDay(s.startsAt))}</b>${fmtTime(s.startsAt)}–${fmtTime(s.endsAt)} WIB · Zoom</div></div>
      <div class="meta"><span class="chip chip-primary">${esc(SUBL[s.subtest] || "Umum")}</span><span class="seats ${s.seatsLeft <= 5 ? "low" : ""}">${s.seatsLeft ? `Sisa ${s.seatsLeft} dari ${s.capacity} kursi` : "Kursi penuh"}</span></div>
      <h3>${esc(s.title)}</h3>
      ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
      <div class="foot">${foot}</div>
    </article>`;
  }).join("");
  box.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buy("live", b.dataset.buy, b)));
}

function renderRec(list) {
  const box = $("#mt-rec");
  if (!list.length) { box.innerHTML = emptyBox("Rekaman sesi akan tersedia setelah Live Mentoring berlangsung."); return; }
  box.innerHTML = list.map((s) => `<article class="pcard">
      <div class="meta"><span class="chip chip-primary">${esc(SUBL[s.subtest] || "Umum")}</span><span class="chip">Rekaman ${esc(fmtDay(s.startsAt))}</span></div>
      <h3>${esc(s.title)}</h3>
      ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
      <div class="foot">${s.owned
        ? `<span class="owned">✓ Dimiliki</span><a class="btn btn-primary" href="rekaman.html?id=${encodeURIComponent(s.sessionId)}">Tonton</a>`
        : `<span class="price">${rupiah(s.price)}</span><button class="btn btn-accent" type="button" data-rec="${esc(s.sessionId)}">Beli rekaman</button>`}</div>
    </article>`).join("");
  box.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", () => buy("rec", b.dataset.rec, b)));
}
