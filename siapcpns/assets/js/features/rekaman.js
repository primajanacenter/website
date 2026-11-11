/**
 * rekaman.js — pemutar rekaman mentoring di member area (Fase 13).
 * ID video hanya diberikan server kepada pembeli. Tanda air (email pembeli) bergerak di atas video
 * sebagai pencegah pembagian. Catatan: video "Unlisted" tetap bisa disalin oleh orang yang berniat.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, getParam } from "../core/ui.js";
import { fmtDay, initBottomNav, buy } from "./hub.js";

export async function initRekaman() {
  initBottomNav("akun");
  if (!auth.requireLogin("masuk.html")) return;
  const id = getParam("id");
  const res = await api.call("getRecording", { sessionId: id, ua: navigator.userAgent.slice(0, 120) });
  if (!res.ok) {
    const el = $("#rk-status");
    el.hidden = false;
    el.classList.add("error");
    el.innerHTML = esc(res.error.message) + (res.error.code === "PAYMENT_REQUIRED" ? ` <button class="btn btn-accent" type="button" id="rk-buy" style="margin-left:8px">Beli rekaman</button>` : "");
    $("#rk-buy")?.addEventListener("click", (e) => buy("rec", id, e.currentTarget));
    return;
  }
  const r = res.data;
  $("#rk-title").textContent = r.title;
  $("#rk-sub").textContent = `Rekaman Live Mentoring ${fmtDay(r.startsAt)}`;
  document.title = `${r.title} — Rekaman — Siap CPNS`;
  const box = $("#rk-player");
  box.hidden = false;
  const f = document.createElement("iframe");
  f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.videoId)}?rel=0&modestbranding=1&playsinline=1`;
  f.title = r.title;
  f.allow = "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen";
  f.referrerPolicy = "strict-origin-when-cross-origin";
  f.allowFullscreen = true;
  box.prepend(f);
  box.addEventListener("contextmenu", (e) => e.preventDefault());
  $("#rk-info").hidden = false;
  $("#rk-desc").textContent = r.description || "";
  const wm = $("#rk-wm");
  const move = () => {
    wm.textContent = `${r.watermark} · ${new Date().toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}`;
    wm.style.top = `${8 + Math.random() * 78}%`;
    wm.style.left = `${4 + Math.random() * 55}%`;
  };
  move();
  setInterval(move, 8000);
}
