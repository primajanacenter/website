/**
 * pengaturan.js — Pasang aplikasi (PWA), pengingat di perangkat (gratis), dan pengingat email (Premium).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, pwa, setBusy, toast } from "../core/ui.js";
import * as local from "./reminder-local.js";

export async function initPengaturan() {
  renderInstall();
  document.addEventListener("sc:installable", renderInstall);
  document.addEventListener("sc:installed", renderInstall);
  $("#dv-clear").addEventListener("click", clearOffline);
  showCacheInfo();
  initLocal();
  await initEmail();
}

/* ---------- Pasang aplikasi ---------- */
function renderInstall() {
  const chip = $("#ins-chip"), box = $("#ins-action");
  if (pwa.isStandalone() || store.get("pwa.installed")) {
    chip.className = "chip chip-ok";
    chip.textContent = pwa.isStandalone() ? "Sedang dipakai sebagai aplikasi" : "Sudah terpasang";
    box.innerHTML = `<p class="small muted">Buka Siap CPNS dari ikon di layar utama HP-mu.</p>`;
    return;
  }
  chip.className = "chip";
  chip.textContent = "Belum terpasang";
  if (pwa.canPrompt()) {
    box.innerHTML = `<button class="btn btn-accent" type="button" id="ins-btn">Pasang aplikasi</button>`;
    $("#ins-btn").addEventListener("click", async () => {
      const r = await pwa.prompt();
      if (r === "accepted") { store.set("pwa.installed", true); toast("Siap CPNS terpasang di layar utama."); }
      renderInstall();
    });
  } else if (pwa.isIOS()) {
    box.innerHTML = `<p class="small"><b>Di iPhone/iPad (Safari):</b></p>
      <ol class="install-steps"><li>Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bawah layar.</li>
      <li>Gulir lalu pilih <b>Tambahkan ke Layar Utama</b>.</li><li>Ketuk <b>Tambah</b>. Ikon Siap CPNS muncul di layar utama.</li></ol>
      <p class="xsmall muted">Jika memakai Chrome di iPhone, buka halaman ini di Safari terlebih dahulu.</p>`;
  } else {
    box.innerHTML = `<p class="small"><b>Di Android (Chrome):</b></p>
      <ol class="install-steps"><li>Ketuk menu <b>⋮</b> di kanan atas.</li><li>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li></ol>
      <p class="xsmall muted">Di komputer (Chrome/Edge), klik ikon pasang di ujung kanan kolom alamat.</p>`;
  }
}

async function clearOffline() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("sc-")).map((k) => caches.delete(k)));
    }
    toast("Salinan offline dihapus. Halaman akan disimpan lagi saat dibuka.");
  } catch {
    toast("Tidak bisa menghapus salinan di browser ini.");
  }
  showCacheInfo();
}

async function showCacheInfo() {
  const el = $("#dv-info");
  try {
    if (!("caches" in window)) { el.textContent = "Browser ini tidak mendukung mode offline."; return; }
    let n = 0;
    for (const k of (await caches.keys()).filter((x) => x.startsWith("sc-"))) n += (await (await caches.open(k)).keys()).length;
    el.textContent = n ? `${n} berkas tersimpan untuk offline.` : "Belum ada salinan offline.";
  } catch {
    el.textContent = "";
  }
}

/* ---------- Pengingat di perangkat (gratis) ---------- */
function initLocal() {
  const p = local.getPrefs();
  $("#lr-daily").checked = p.daily;
  $("#lr-akbar").checked = p.akbar;
  $("#lr-time").value = p.time || "19:30";
  const sync = () => ($("#lr-time").disabled = !$("#lr-daily").checked);
  $("#lr-daily").addEventListener("change", sync);
  sync();
  $("#lr-form").addEventListener("submit", saveLocal);
  $("#lr-perm").addEventListener("click", async () => {
    const r = await local.requestNotifications();
    if (r === "denied") toast("Izin notifikasi ditolak. Ubah di pengaturan situs browser bila ingin mengaktifkan.");
    showPermInfo();
  });
  $("#lr-test").addEventListener("click", () => local.testReminder());
  showPermInfo();
}

async function saveLocal(e) {
  e.preventDefault();
  const daily = $("#lr-daily").checked, akbar = $("#lr-akbar").checked, time = $("#lr-time").value;
  if (daily && !/^\d{2}:\d{2}$/.test(time)) return status("Isi jam pengingat harian.", true);
  const p = local.getPrefs();
  // jam berubah → boleh muncul lagi hari ini
  const shown = time !== p.time ? { ...p.shown, daily: "" } : p.shown;
  await local.setPrefs({ daily, akbar, time: time || p.time, shown });
  if ((daily || akbar) && local.notificationStatus() === "granted") await local.enableBackgroundSync();
  status(daily || akbar ? "Pengingat di perangkat ini tersimpan." : "Pengingat di perangkat ini dimatikan.");
  if (daily || akbar) local.runLocalReminders();
  showPermInfo();
}

async function showPermInfo() {
  const el = $("#lr-perm-info"), btn = $("#lr-perm");
  const st = local.notificationStatus();
  const bg = await local.backgroundSyncSupported();
  if (st === "unsupported") {
    btn.hidden = true;
    el.textContent = "Browser ini tidak mendukung notifikasi. Pengingat tampil sebagai kartu saat kamu membuka Siap CPNS." + (pwa.isIOS() ? " Di iPhone, pasang aplikasi ke Layar Utama terlebih dahulu." : "");
  } else if (st === "granted") {
    btn.hidden = true;
    el.textContent = bg ? "Notifikasi aktif, termasuk saat aplikasi tertutup (jadwal diatur browser)." : "Notifikasi aktif saat Siap CPNS terbuka. Saat aplikasi tertutup, pengingat tampil ketika kamu membukanya lagi.";
  } else if (st === "denied") {
    btn.hidden = true;
    el.textContent = "Notifikasi diblokir di browser ini. Pengingat tetap tampil sebagai kartu saat kamu membuka Siap CPNS.";
  } else {
    btn.hidden = false;
    el.textContent = "Tanpa izin notifikasi, pengingat tampil sebagai kartu saat kamu membuka Siap CPNS.";
  }
}

/* ---------- Pengingat email (Premium) ---------- */
let emailPremium = false;

async function initEmail() {
  const lock = $("#nt-lock");
  if (!auth.isLoggedIn()) {
    disableEmail(true);
    lock.hidden = false;
    lock.innerHTML = `<div><a href="masuk.html?next=pengaturan.html"><strong>Masuk</strong></a> untuk mengatur pengingat email (khusus Premium).</div>`;
    return;
  }
  $("#nt-form").addEventListener("submit", saveEmail);
  $("#nt-daily").addEventListener("change", syncTime);
  const res = await api.call("getNotifPrefs");
  if (!res.ok) return fail(res.error);
  fill(res.data);
}

function disableEmail(off) {
  ["#nt-daily", "#nt-akbar", "#nt-time", "#nt-save"].forEach((s) => ($(s).disabled = off));
}

function fill(d) {
  emailPremium = Boolean(d.premium);
  $("#nt-email").innerHTML = `Dikirim tepat waktu ke <b>${esc(d.email || "email akunmu")}</b>, walaupun HP sedang tidak membuka aplikasi.${d.emailEnabled === false ? " <span class=\"chip chip-warn\">Pengiriman email sedang dinonaktifkan admin</span>" : ""}`;
  $("#nt-daily").checked = d.prefs.daily && emailPremium;
  $("#nt-akbar").checked = d.prefs.akbar && emailPremium;
  $("#nt-premium").checked = d.prefs.premium;
  $("#nt-time").value = d.reminderTime || "19:30";
  const lock = $("#nt-lock");
  if (!emailPremium) {
    lock.hidden = false;
    lock.innerHTML = `<div><strong>Pengingat email khusus Premium.</strong> Pengguna gratis bisa memakai pengingat di perangkat di atas. <a href="premium.html">Lihat Premium →</a></div>`;
    disableEmail(true);
    $("#nt-premium").closest(".toggle-row").hidden = true;
  } else {
    lock.hidden = true;
    disableEmail(false);
    $("#nt-premium").closest(".toggle-row").hidden = false;
  }
  syncTime();
}

function syncTime() {
  $("#nt-time").disabled = !emailPremium || !$("#nt-daily").checked;
}

async function saveEmail(e) {
  e.preventDefault();
  const btn = $("#nt-save");
  const payload = { daily: $("#nt-daily").checked, akbar: $("#nt-akbar").checked, premium: $("#nt-premium").checked };
  if (payload.daily) {
    const t = $("#nt-time").value;
    if (!/^\d{2}:\d{2}$/.test(t)) return status("Isi jam pengingat email harian.", true);
    payload.reminderTime = t;
  }
  setBusy(btn, true, "Menyimpan…");
  const res = await api.call("saveNotifPrefs", payload);
  setBusy(btn, false);
  if (!res.ok) return fail(res.error);
  fill(res.data);
  store.remove(KEYS.ME); // jam pengingat ikut tersimpan di profil
  status(res.data.warning || "Pengingat email tersimpan.");
}

function fail(error) {
  if (error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("pengaturan.html")}`);
  if (error.code === "PROFILE_INCOMPLETE") {
    const el = $("#st-status");
    el.hidden = false;
    el.classList.add("error");
    el.innerHTML = `${esc(error.message)} <a href="onboarding.html?next=pengaturan.html"><strong>Lengkapi profil →</strong></a>`;
    return;
  }
  status(error.message, true);
}

function status(msg, isError = false) {
  const el = $("#st-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
