/**
 * plan.js — rencana belajar dasar (Fase 4)
 *
 * Disusun di browser dari data getToday (profil, topik fokus, level topik, status latihan).
 * Premium (Fase 6) akan mendapat rencana adaptif dari server; struktur keluarannya sama.
 */

import { store } from "../core/store.js";

export const ALL_TOPICS = [
  ["twk-nasionalisme", "twk", "Nasionalisme"], ["twk-integritas", "twk", "Integritas"], ["twk-belanegara", "twk", "Bela negara"],
  ["twk-pancasila", "twk", "Pancasila"], ["twk-uud", "twk", "UUD 1945"], ["twk-nkri", "twk", "NKRI"],
  ["twk-bhinneka", "twk", "Bhinneka Tunggal Ika"], ["twk-bahasa", "twk", "Bahasa negara"],
  ["tiu-analogi", "tiu", "Analogi"], ["tiu-silogisme", "tiu", "Silogisme"], ["tiu-analitis", "tiu", "Penalaran analitis"],
  ["tiu-deret", "tiu", "Deret angka"], ["tiu-hitung", "tiu", "Berhitung & perbandingan"], ["tiu-cerita", "tiu", "Soal cerita"],
  ["tkp-pelayanan", "tkp", "Pelayanan publik"], ["tkp-jejaring", "tkp", "Jejaring kerja"], ["tkp-sosbud", "tkp", "Sosial budaya"],
  ["tkp-tik", "tkp", "Teknologi informasi"], ["tkp-profesionalisme", "tkp", "Profesionalisme"], ["tkp-antiradikalisme", "tkp", "Anti-radikalisme"],
].map(([id, subtest, name]) => ({ id, subtest, name }));

export const LEVEL_NAMES = { 1: "Kenal", 2: "Paham", 3: "Mahir", 4: "Siap tes" };
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
// Pola hari belajar berdasarkan jumlah hari per minggu (0 = Minggu)
const STUDY_DAYS = { 1: [6], 2: [2, 6], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };

const READ_KEY = "materi.read";

export function topicName(id) {
  return ALL_TOPICS.find((t) => t.id === id)?.name || id;
}

export function localDate(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function markRead(topicId) {
  const m = store.get(READ_KEY, {});
  m[topicId] = localDate();
  store.set(READ_KEY, m);
}

export function readToday(topicId) {
  return store.get(READ_KEY, {})[topicId] === localDate();
}

export function readMap() {
  return store.get(READ_KEY, {});
}

/** Urutan topik untuk materi: topik fokus dulu, lalu yang levelnya paling rendah/belum diukur. */
export function topicQueue(today) {
  const levels = today.topicLevels || {};
  const focus = (today.focusTopics || []).map((t) => t.topicId);
  const rest = ALL_TOPICS.map((t) => t.id)
    .filter((id) => !focus.includes(id))
    .sort((a, b) => (levels[a]?.pct ?? -1) - (levels[b]?.pct ?? -1));
  return [...focus, ...rest];
}

/**
 * @returns {{ weekly:{minutes:number,hours:string}, daysToTest:number|null, totalHours:number|null,
 *            week:Array<{date:string,dayName:string,isToday:boolean,study:boolean,tasks:Array}>, today:object }}
 */
export function buildPlan(today) {
  const p = today.profile || {};
  const minutes = Number(p.minutesPerDay) || 30;
  const days = Math.min(7, Math.max(1, Number(p.daysPerWeek) || 5));
  const studyDays = STUDY_DAYS[days];
  const queue = topicQueue(today);

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  let daysToTest = null;
  if (p.testDate) {
    daysToTest = Math.ceil((new Date(p.testDate) - new Date(localDate())) / 86400000);
  }
  const weeksLeft = daysToTest && daysToTest > 0 ? Math.max(1, Math.floor(daysToTest / 7)) : null;

  let topicIdx = 0;
  let tryoutPlaced = Boolean(today.hasTryout);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dow = d.getDay();
    const study = studyDays.includes(dow);
    const tasks = [];
    if (study) {
      const lastStudyDay = dow === studyDays[studyDays.length - 1];
      if (!tryoutPlaced && (dow === 6 || dow === 0 || lastStudyDay)) {
        tasks.push({ type: "tryout", label: "Tryout diagnostik (100 menit)", minutes: 100, href: "tryout.html" });
        tryoutPlaced = true;
      } else {
        const topic = queue[topicIdx++ % queue.length];
        const matMin = Math.max(5, Math.min(15, Math.round(minutes * 0.3)));
        tasks.push({ type: "materi", topicId: topic, label: `Materi: ${topicName(topic)}`, minutes: matMin, href: `materi.html?topik=${topic}` });
        tasks.push({ type: "latihan", label: "Latihan 10 soal", minutes: 15, href: "latihan.html" });
        if (minutes >= 45) {
          tasks.push({ type: "latihan-topik", topicId: topic, label: `Latihan topik ${topicName(topic)}`, minutes: Math.max(10, minutes - matMin - 15), href: `latihan.html?topik=${topic}` });
        }
        if (lastStudyDay && today.hasTryout) {
          tasks.push({ type: "evaluasi", label: "Evaluasi mingguan: cek level topik di Rencana", minutes: 5, href: "rencana.html" });
        }
      }
    }
    week.push({ date: localDate(d), dayName: DAY_NAMES[dow], isToday: localDate(d) === localDate(now), study, tasks });
  }

  const weeklyMinutes = minutes * days;
  return {
    weekly: { minutes: weeklyMinutes, hours: (weeklyMinutes / 60).toLocaleString("id-ID", { maximumFractionDigits: 1 }), perDay: minutes, days },
    daysToTest,
    totalHours: weeksLeft ? Math.round((weeklyMinutes * weeksLeft) / 60) : null,
    week,
    today: week.find((w) => w.isToday),
  };
}

/** Status selesai tiap tugas hari ini. */
export function taskDone(task, today) {
  // Materi dianggap selesai bila ada topik yang dibaca hari ini (topik fokus bisa berubah setelah latihan).
  if (task.type === "materi") return readToday(task.topicId) || Object.values(readMap()).includes(localDate());
  if (task.type === "latihan") {
    const target = today.practice.dailyLimit ?? 10;
    return today.practice.doneToday >= Math.min(10, target);
  }
  if (task.type === "tryout") return Boolean(today.hasTryout);
  return false;
}
