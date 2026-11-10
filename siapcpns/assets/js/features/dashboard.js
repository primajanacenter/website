/**
 * dashboard.js — Beranda setelah login (Fase 2, dikembangkan lagi di Fase 4)
 *
 * Menampilkan: sapaan & paket, langkah persiapan, hasil Cek Kesiapan terakhir,
 * target & komitmen, hitung mundur ke tanggal tes.
 * Data diambil dari cache lokal dulu (cepat), lalu diperbarui dari server (getMe).
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate, toast, pwa } from "../core/ui.js";
import { taskDone } from "./plan.js";
import { loadPlan } from "./rencana.js";

const LEVELS = {
  "baru-mulai": { label: "Baru mulai", chip: "chip-warn" },
  "sedang-bersiap": { label: "Sedang bersiap", chip: "chip-primary" },
  "hampir-siap": { label: "Hampir siap", chip: "chip-ok" },
};
const TARGET_LABEL = { passing_grade: "Lolos ambang batas", kompetitif: "Skor kompetitif" };
const ME_TTL = 5 * 60 * 1000;

export async function initDashboard() {
  if (!auth.requireLogin("masuk.html")) return;

  $("#btn-logout")?.addEventListener("click", (e) => {
    e.preventDefault();
    auth.logout();
    location.replace("../");
  });

  const cached = store.get(KEYS.ME);
  if (cached) render(cached);

  // Fase 10.2: profil, tugas hari ini, dan rencana diambil dalam SATU permintaan ke server.
  const needMe = !cached || Date.now() - (cached.fetchedAt || 0) > ME_TTL;
  const calls = [{ action: "getToday" }];
  if (needMe) calls.unshift({ action: "getMe" });
  if ((cached?.user?.plan || auth.getUser()?.plan) === "premium") calls.push({ action: "getPlan" });
  const results = await api.batch(calls);
  const meRes = needMe ? results[0] : null;
  const todayRes = results[needMe ? 1 : 0];
  const planRes = results[needMe ? 2 : 1] || null;

  if (needMe) {
    const res = meRes;
    if (!res.ok) {
      if (res.error.code === "UNAUTHENTICATED") {
        location.replace(`masuk.html?next=${encodeURIComponent("dashboard.html")}`);
        return;
      }
      if (!cached) showStatus(res.error.message, true);
      return;
    }
    const me = { ...res.data, fetchedAt: Date.now() };
    store.set(KEYS.ME, me);
    auth.updateUser(me.user);
    render(me);
  }

  // Profil belum lengkap → arahkan ke onboarding
  const me = store.get(KEYS.ME);
  if (me && !me.profileComplete) {
    location.replace(`onboarding.html?next=${encodeURIComponent("dashboard.html")}`);
    return;
  }

  // Tugas hari ini
  const t = todayRes;
  if (t.ok) {
    await renderToday(t.data, planRes);
    renderTasks(store.get(KEYS.ME) || me, t.data);
  } else {
    $("#today-card").hidden = true;
  }
}

async function renderToday(today, planRes = null) {
  const plan = await loadPlan(today, planRes);
  $("#today-date").textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  $("#today-streak").textContent = today.streak;
  const p = today.practice;
  if (p.doneToday > 0) import("./reminder-local.js").then((m) => m.markPracticed()).catch(() => {});
  $("#today-quota").textContent =
    p.dailyLimit === null
      ? `Latihan hari ini: ${p.doneToday} soal (Premium, tanpa batas)`
      : `Latihan hari ini: ${p.doneToday}/${p.dailyLimit} soal · ${p.correctToday} tepat`;

  const day = plan.today;
  const list = $("#today-tasks");
  if (!day || !day.study) {
    $("#today-title").textContent = "Hari istirahat";
    list.innerHTML = `<li><span class="ck">☕</span><div><b>Tidak ada jadwal belajar hari ini</b><br><small>Istirahat juga bagian dari rencana. Jika ingin tetap berlatih, kuota latihan tetap tersedia.</small></div><a class="btn btn-secondary" style="min-height:36px;padding:0 14px" href="latihan.html">Latihan</a></li>`;
    return;
  }
  const doneCount = day.tasks.filter((t) => taskDone(t, today)).length;
  $("#today-title").textContent = doneCount === day.tasks.length ? "Semua tugas hari ini selesai 🎉" : `Tugas belajar hari ini (${doneCount}/${day.tasks.length})`;
  list.innerHTML = day.tasks
    .map((t) => {
      const done = taskDone(t, today);
      const cta = done ? `<span class="chip chip-ok">Selesai</span>` : `<a class="btn btn-primary" style="min-height:36px;padding:0 14px" href="${t.href}">${t.type === "materi" ? "Baca" : t.type === "tryout" ? "Mulai" : "Kerjakan"}</a>`;
      return `<li class="${done ? "done" : ""}"><span class="ck">${done ? "✓" : ""}</span><div><b>${esc(t.label)}</b><br><small>± ${t.minutes} menit</small></div>${cta}</li>`;
    })
    .join("");
}

function referralNotice() {
  const n = store.get("referral.notice");
  if (!n) return;
  store.remove("referral.notice");
  toast(`Kode ajakan ${n.code} aktif: diskon 10% untuk pembelian Premium pertamamu.`, 5000);
}

/** Fase 10: ajakan pasang aplikasi (Android/desktop: tombol; iPhone: arahkan ke petunjuk). */
function installCard() {
  const card = $("#d-install");
  if (!card) return;
  const dismissed = Number(store.get("pwa.dismissed") || 0);
  const hide = () => (card.hidden = true);
  const update = () => {
    if (pwa.isStandalone() || store.get("pwa.installed") || Date.now() - dismissed < 14 * 864e5) return hide();
    if (pwa.canPrompt() || pwa.isIOS()) card.hidden = false;
  };
  $("#d-install-btn").onclick = async () => {
    if (pwa.canPrompt()) {
      const r = await pwa.prompt();
      if (r === "accepted") { store.set("pwa.installed", true); toast("Siap CPNS terpasang di layar utama."); }
      update();
    } else {
      location.href = "pengaturan.html";
    }
  };
  $("#d-install-x").onclick = () => { store.set("pwa.dismissed", Date.now()); hide(); };
  document.addEventListener("sc:installable", update);
  document.addEventListener("sc:installed", hide);
  update();
}

function render(me) {
  referralNotice();
  installCard();
  renderWelcome(me.user || auth.getUser() || {});
  renderTasks(me);
  renderAssessment(me.latestAssessment);
  renderProfile(me.profile);
}

function renderWelcome(user) {
  const first = String(user.name || "").split(" ")[0] || "Pejuang NIP";
  $("#d-greeting").textContent = `Halo, ${first}!`;
  $("#d-email").textContent = user.email || "";
  const av = $("#d-avatar");
  if (user.picture) {
    av.innerHTML = `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">`;
  } else {
    av.textContent = first.charAt(0).toUpperCase();
  }
  $("#d-plan").textContent = user.plan === "premium" ? `Premium s.d. ${fmtDate(user.premiumUntil)}` : "Paket Gratis";
  const up = $("#d-upsell");
  if (up) up.hidden = user.plan === "premium";
}

function renderTasks(me, today = null) {
  const tasks = [
    { title: "Cek kesiapan", desc: "Kenali posisimu sekarang", done: Boolean(me.latestAssessment), href: "../#cek-kesiapan", cta: "Mulai" },
    { title: "Lengkapi profil & target", desc: "Pendidikan, target, komitmen belajar", done: Boolean(me.profileComplete), href: "onboarding.html?next=dashboard.html", cta: "Isi" },
    tryoutTask(me.latestAttempt),
    { title: "Latihan harian & materi", desc: "10 soal per hari sesuai topik terlemahmu", done: Boolean(today && (today.streak > 0 || today.practice.doneToday > 0)), href: "latihan.html", cta: "Mulai" },
    { title: "Tryout Akbar mingguan", desc: "Gratis setiap Minggu, peringkat nasional terbit Senin", done: false, href: "akbar.html", cta: "Lihat jadwal" },
  ];
  const nextIdx = tasks.findIndex((t) => !t.done && !t.locked);
  $("#t-progress").textContent = `${tasks.filter((t) => t.done).length} dari ${tasks.length}`;

  $("#d-tasks").innerHTML = tasks
    .map((t, i) => {
      const cls = t.done ? "done" : i === nextIdx ? "next" : t.locked ? "locked" : "";
      const action = t.done
        ? t.doneHref
          ? `<a class="chip chip-ok" href="${t.doneHref}">${t.doneLabel || "Selesai"}</a>`
          : `<span class="chip chip-ok">Selesai</span>`
        : t.locked
          ? `<span class="chip">Terkunci</span>`
          : t.soon
            ? `<a class="chip chip-accent" href="${t.href}">${t.cta}</a>`
            : `<a class="btn btn-primary" style="min-height:36px;padding:0 14px" href="${t.href}">${t.cta}</a>`;
      return `<li class="task ${cls}"><span class="st">${t.done ? "✓" : i + 1}</span><div><b>${t.title}</b><small>${t.desc}</small></div>${action}</li>`;
    })
    .join("");
}

function tryoutTask(a) {
  const base = { title: "Tryout CAT", desc: "Soal & waktu seperti ujian asli, rapor per subtes", href: "tryout.html", cta: "Mulai" };
  if (!a) return { ...base, done: false };
  if (a.status === "in_progress") return { ...base, desc: "Ujianmu masih berjalan", done: false, cta: "Lanjutkan" };
  return {
    ...base,
    desc: `Skor terakhir ${a.total} · ${a.passedAll ? "lolos ambang batas" : "belum lolos ambang batas"}`,
    done: true,
    doneHref: `rapor.html?id=${encodeURIComponent(a.attemptId)}`,
    doneLabel: "Lihat rapor",
  };
}

function renderAssessment(a) {
  const box = $("#d-assessment");
  if (!a) {
    box.innerHTML = `<p class="small muted">Belum ada hasil. Kerjakan Cek Kesiapan (± 3 menit) untuk melihat posisimu.</p>
      <a class="btn btn-primary" href="../#cek-kesiapan">Cek kesiapan sekarang</a>`;
    return;
  }
  const lv = LEVELS[a.levelId] || { label: a.levelId, chip: "" };
  box.innerHTML = `
    <div class="mini-score">
      <span class="big">${Number(a.total)}</span>
      <div class="stack" style="gap:4px">
        <span class="chip ${lv.chip}">${esc(lv.label)}</span>
        <span class="xsmall muted">${fmtDate(a.completedAt)}</span>
      </div>
    </div>
    <p class="xsmall muted">Skor dari 100. Ini gambaran awal; skor sebenarnya akan terlihat dari tryout diagnostik.</p>`;
}

function renderProfile(p) {
  const dl = $("#d-profile");
  const cd = $("#d-countdown");
  if (!p) {
    dl.innerHTML = "";
    cd.innerHTML = `<p class="small muted">Profil belum diisi.</p>`;
    return;
  }
  const rows = [
    ["Pendidikan", `${p.education || "-"}${p.major ? " · " + p.major : ""}`],
    ["Incaran", p.targetFormation || "Belum ditentukan"],
    ["Lokasi", p.targetProvince || "-"],
    ["Target", TARGET_LABEL[p.targetType] || "-"],
    ["Komitmen", p.minutesPerDay ? `${p.minutesPerDay} menit × ${p.daysPerWeek} hari/minggu` : "-"],
    ["Pengingat", p.reminderTime ? `Pukul ${p.reminderTime}` : "-"],
  ];
  dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");

  if (p.testDate) {
    const days = Math.ceil((new Date(p.testDate) - new Date()) / 86400000);
    cd.innerHTML =
      days > 0
        ? `<div class="stack" style="gap:2px"><span class="countdown">${days} hari lagi</span><span class="xsmall muted">menuju perkiraan tes ${fmtDate(p.testDate)}</span></div>`
        : `<p class="small muted">Tanggal tes (${fmtDate(p.testDate)}) sudah lewat. Sudah ikut SKD? <a href="pasca-skd.html"><strong>Masukkan skormu</strong></a> untuk analisis &amp; langkah berikutnya, atau perbarui tanggal di profil.</p>`;
    const ps = $("#d-postskd");
    if (ps && days <= 0) ps.textContent = "Tes sudah lewat? Masukkan skor resmimu sekarang";
  } else {
    cd.innerHTML = `<p class="small muted">Belum ada perkiraan tanggal tes. <a href="onboarding.html?next=dashboard.html">Tambahkan</a> untuk melihat hitung mundur.</p>`;
  }
}

function showStatus(msg, isError) {
  const el = $("#d-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", Boolean(isError));
}
