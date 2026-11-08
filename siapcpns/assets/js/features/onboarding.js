/**
 * onboarding.js — Lengkapi profil (Fase 2)
 *
 * 3 langkah: Pendidikan → Target → Komitmen. Disimpan lewat api.call("saveProfile").
 * Isian awal diambil dari profil di server (jika sudah ada) atau dari jawaban Cek Kesiapan.
 * Draf disimpan lokal agar tidak hilang saat halaman dimuat ulang.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, $$, getParam, safeNext, setBusy, toast, fmtDate } from "../core/ui.js";

const PROVINCES = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan",
  "Kepulauan Bangka Belitung", "Bengkulu", "Lampung", "DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah",
  "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat",
  "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara",
  "Gorontalo", "Sulawesi Tengah", "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara", "Maluku",
  "Maluku Utara", "Papua", "Papua Barat", "Papua Barat Daya", "Papua Tengah", "Papua Pegunungan", "Papua Selatan",
];

// Jawaban Cek Kesiapan q9 (waktu belajar) → menit per hari
const MINUTES_FROM_ASSESSMENT = { a: 15, b: 30, c: 45, d: 60 };
const TITLES = ["Lengkapi profil belajarmu", "Tetapkan targetmu", "Atur komitmen belajarmu"];

let step = 1;
let next = "dashboard.html";

export async function initOnboarding() {
  if (!auth.requireLogin("masuk.html")) return;
  next = safeNext(getParam("next"), "dashboard.html");

  fillProvinces();
  const form = $("#ob-form");
  form.addEventListener("submit", onSubmit);
  form.addEventListener("change", () => { saveDraft(); renderSummary(); });
  form.addEventListener("input", saveDraft);
  $("#ob-prev").addEventListener("click", () => goStep(step - 1));

  // Isi awal: draf lokal → profil server → jawaban Cek Kesiapan
  let me = store.get(KEYS.ME);
  if (!me) {
    const res = await api.call("getMe");
    if (!res.ok) return handleAuthError(res.error);
    me = res.data;
    store.set(KEYS.ME, { ...me, fetchedAt: Date.now() });
  }
  const draft = store.get(KEYS.ONBOARDING_DRAFT);
  prefill(draft || me.profile || defaultsFromAssessment());
  if (me.profileComplete) {
    $("#ob-title").textContent = "Ubah profil belajar";
  }

  goStep(1);
  renderSummary();
}

function fillProvinces() {
  const sel = $("#targetProvince");
  sel.innerHTML =
    `<option value="">Pilih lokasi…</option>` +
    `<option value="Instansi pusat">Instansi pusat / belum tahu</option>` +
    PROVINCES.map((p) => `<option value="${p}">${p}</option>`).join("");
}

function defaultsFromAssessment() {
  const a = store.get(KEYS.ASSESSMENT_RESULT);
  const d = { targetType: "passing_grade", daysPerWeek: 5, reminderTime: "19:30" };
  const m = a?.answers?.q9 && MINUTES_FROM_ASSESSMENT[a.answers.q9];
  if (m) d.minutesPerDay = m;
  if (a?.levelId === "hampir-siap") d.targetType = "kompetitif";
  return d;
}

function prefill(p) {
  if (!p) return;
  const form = $("#ob-form");
  ["major", "targetFormation", "targetProvince", "testDate", "reminderTime"].forEach((k) => {
    if (p[k] !== undefined && p[k] !== null && form.elements[k]) form.elements[k].value = p[k];
  });
  ["education", "targetType", "minutesPerDay", "daysPerWeek"].forEach((k) => {
    if (p[k] === undefined || p[k] === null || p[k] === "") return;
    const input = form.querySelector(`input[name="${k}"][value="${p[k]}"]`);
    if (input) input.checked = true;
  });
}

function values() {
  const f = $("#ob-form");
  const radio = (n) => f.querySelector(`input[name="${n}"]:checked`)?.value || "";
  return {
    education: radio("education"),
    major: f.elements.major.value.trim(),
    targetFormation: f.elements.targetFormation.value.trim(),
    targetProvince: f.elements.targetProvince.value,
    testDate: f.elements.testDate.value,
    targetType: radio("targetType") || "passing_grade",
    minutesPerDay: Number(radio("minutesPerDay")) || 0,
    daysPerWeek: Number(radio("daysPerWeek")) || 0,
    reminderTime: f.elements.reminderTime.value,
  };
}

function saveDraft() {
  store.set(KEYS.ONBOARDING_DRAFT, values());
}

/* ---------------- Navigasi langkah ---------------- */

function goStep(n) {
  step = Math.max(1, Math.min(3, n));
  $$("[data-step]").forEach((el) => (el.hidden = Number(el.dataset.step) !== step));
  $$("[data-step-ind]").forEach((el) => {
    const i = Number(el.dataset.stepInd);
    el.classList.toggle("done", i < step);
    el.classList.toggle("active", i === step);
  });
  $("#ob-eyebrow").textContent = `Langkah ${step} dari 3`;
  if (!$("#ob-title").textContent.startsWith("Ubah")) $("#ob-title").textContent = TITLES[step - 1];
  $("#ob-prev").style.visibility = step === 1 ? "hidden" : "visible";
  $("#ob-next").textContent = step === 3 ? "Simpan profil" : "Lanjut ›";
  showError("");
  window.scrollTo(0, 0);
}

function validateStep(n, v) {
  if (n === 1) {
    if (!v.education) return "Pilih jenjang pendidikan terakhir.";
    if (!v.major) return "Isi program studi atau jurusan.";
  }
  if (n === 2 && v.testDate) {
    const d = new Date(v.testDate);
    if (isNaN(d.getTime())) return "Tanggal tes tidak valid.";
  }
  if (n === 3) {
    if (!v.minutesPerDay) return "Pilih berapa menit per hari kamu bisa belajar.";
    if (!v.daysPerWeek) return "Pilih berapa hari per minggu.";
  }
  return "";
}

async function onSubmit(e) {
  e.preventDefault();
  const v = values();
  const err = validateStep(step, v);
  if (err) return showError(err);
  if (step < 3) return goStep(step + 1);

  const btn = $("#ob-next");
  setBusy(btn, true, "Menyimpan…");
  const res = await api.call("saveProfile", v);
  setBusy(btn, false);
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return handleAuthError(res.error);
    return showError(res.error.message);
  }

  const me = store.get(KEYS.ME) || {};
  store.set(KEYS.ME, { ...me, profile: res.data.profile, profileComplete: res.data.profileComplete, fetchedAt: Date.now() });
  store.remove(KEYS.ONBOARDING_DRAFT);
  toast("Profil tersimpan.");
  location.replace(next);
}

function showError(msg) {
  const el = $("#ob-error");
  el.hidden = !msg;
  el.textContent = msg;
}

function handleAuthError(error) {
  if (error.code === "UNAUTHENTICATED") {
    location.replace(`masuk.html?next=${encodeURIComponent("onboarding.html")}`);
  } else {
    showError(error.message);
  }
}

/* ---------------- Ringkasan komitmen ---------------- */

function renderSummary() {
  const v = values();
  const box = $("#commit-summary");
  if (!box) return;
  if (!v.minutesPerDay || !v.daysPerWeek) {
    box.innerHTML = `<span class="muted">Pilih waktu belajar untuk melihat ringkasan komitmenmu.</span>`;
    return;
  }
  const weekly = v.minutesPerDay * v.daysPerWeek;
  const hours = (weekly / 60).toLocaleString("id-ID", { maximumFractionDigits: 1 });
  let lines = `<span>Komitmenmu: <b>${v.minutesPerDay} menit × ${v.daysPerWeek} hari</b> = <b>± ${hours} jam per minggu</b>.</span>`;

  if (v.testDate) {
    const days = Math.ceil((new Date(v.testDate) - new Date()) / 86400000);
    if (days > 0) {
      const weeks = Math.max(1, Math.floor(days / 7));
      const total = Math.round((weekly * weeks) / 60);
      lines += `<span>Sisa waktu sampai ${fmtDate(v.testDate)}: <b>${days} hari</b> (± ${weeks} minggu), total ± <b>${total} jam</b> belajar.</span>`;
      if (v.targetType === "kompetitif" && weekly < 180) {
        lines += `<span class="muted">Untuk target skor kompetitif, pertimbangkan menambah waktu belajar menjadi minimal ± 3 jam per minggu.</span>`;
      }
    }
  }
  box.innerHTML = lines;
}
