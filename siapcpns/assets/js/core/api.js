/**
 * api.js — SATU-SATUNYA pintu frontend ke backend.
 *
 * Semua halaman memanggil:  const res = await api.call("namaAction", { ...payload });
 * Hasilnya selalu berbentuk: { ok: true, data } atau { ok: false, error: { code, message } }
 *
 * - USE_MOCK = true  → dijawab oleh handler mock di bawah (tanpa jaringan).
 * - USE_MOCK = false → dikirim ke Apps Script Web App.
 *
 * Saat backend pindah dari Apps Script ke layanan lain, cukup file ini yang diubah.
 * Daftar action dan formatnya didokumentasikan di docs/api-contract.md.
 */

import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { auth } from "./auth.js";

/* ------------------------------------------------------------------ */
/* Mock: handler sementara untuk Fase 0–1                              */
/* ------------------------------------------------------------------ */
const mockHandlers = {
  async ping() {
    return { status: "ok", mode: "mock", time: new Date().toISOString() };
  },

  // Fase 1: hasil disimpan di browser. Fase 2: disimpan ke sheet "assessments".
  async saveAssessment(payload) {
    const list = store.get("mock.assessments", []);
    const record = { id: "mock-" + Date.now(), ...payload, savedAt: new Date().toISOString() };
    list.push(record);
    store.set("mock.assessments", list.slice(-20));
    return { id: record.id };
  },

  // Fase 1: daftar tunggu sebelum login tersedia.
  async joinWaitlist(payload) {
    const email = String(payload?.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw apiError("INVALID_EMAIL", "Format email belum benar.");
    }
    store.set("mock.waitlist", { email, at: new Date().toISOString() });
    return { email };
  },

  // Fase 2: login, profil. Data uji disimpan di browser.
  async login(payload) {
    requireMockSession();
    const db = mockDb();
    const isNew = !db.user;
    if (!db.user) {
      const u = auth.getUser() || {};
      db.user = { userId: "u_mock", email: u.email || "uji@contoh.id", name: u.name || "Pengguna Uji", picture: "", plan: "free", premiumUntil: "" };
    }
    let attachedAssessmentId = null;
    if (payload?.assessment) {
      const a = payload.assessment;
      db.assessments.push({ id: "a_mock_" + Date.now(), total: a.total, levelId: a.levelId, aspects: a.aspects, completedAt: a.completedAt || new Date().toISOString() });
      attachedAssessmentId = db.assessments[db.assessments.length - 1].id;
    }
    saveMockDb(db);
    return { ...buildMockMe(db), isNew, attachedAssessmentId };
  },

  async getMe() {
    requireMockSession();
    const db = mockDb();
    if (!db.user) throw apiError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
    return buildMockMe(db);
  },

  async saveProfile(p) {
    requireMockSession();
    if (!p.education) throw apiError("BAD_REQUEST", "Pilih jenjang pendidikan.");
    if (!String(p.major || "").trim()) throw apiError("BAD_REQUEST", "Isi program studi atau jurusan.");
    if (!p.minutesPerDay) throw apiError("BAD_REQUEST", "Pilih waktu belajar per hari.");
    if (!p.daysPerWeek) throw apiError("BAD_REQUEST", "Pilih jumlah hari belajar per minggu.");
    const db = mockDb();
    db.profile = { ...p, minutesPerDay: Number(p.minutesPerDay), daysPerWeek: Number(p.daysPerWeek), updatedAt: new Date().toISOString() };
    saveMockDb(db);
    return { profile: db.profile, profileComplete: true };
  },
};

// ---------- Fase 3: tryout (mode uji memakai paket DEMO publik) ----------
const DEMO_URL = new URL("../../data/demo-tryout.json", import.meta.url).href;
let demoCache = null;
async function demoPkg() {
  if (!demoCache) demoCache = await (await fetch(DEMO_URL)).json();
  return demoCache;
}
function demoQuestions(d) {
  return d.questions.map((q) => ({
    id: `${d.package.package_id}-${String(q.number).padStart(3, "0")}`,
    number: q.number, subtest: q.subtest.toLowerCase(), topicId: q.topic_id, text: q.text, context: q.context || "",
    options: q.options.map((t, i) => ({ key: "abcde"[i], text: t, score: q.scores ? q.scores[i] : null })),
    answer: q.answer || "", explanation: q.explanation,
  }));
}
function mockPkgInfo(d) {
  const p = d.package;
  return { packageId: p.package_id, title: p.title, type: p.type, description: p.description, durationMin: Number(p.duration_min), pg: { twk: p.pg_twk, tiu: p.pg_tiu, tkp: p.pg_tkp } };
}
function mockGrade(questions, answers, pg) {
  const sub = { twk: { score: 0, max: 0, total: 0, answered: 0, correct: 0 }, tiu: { score: 0, max: 0, total: 0, answered: 0, correct: 0 }, tkp: { score: 0, max: 0, total: 0, answered: 0, correct: 0 } };
  const topics = {};
  questions.forEach((q) => {
    const s = sub[q.subtest]; const a = answers[q.id];
    let pts = 0;
    s.total++; s.max += 5;
    if (a) { s.answered++; if (q.subtest === "tkp") { pts = q.options.find((o) => o.key === a)?.score || 0; if (pts >= 4) s.correct++; } else if (a === q.answer) { pts = 5; s.correct++; } }
    s.score += pts;
    const t = (topics[q.topicId] ||= { points: 0, max: 0, total: 0, answered: 0 });
    t.points += pts; t.max += 5; t.total++; if (a) t.answered++;
  });
  const passed = { twk: sub.twk.score >= pg.twk, tiu: sub.tiu.score >= pg.tiu, tkp: sub.tkp.score >= pg.tkp };
  return { sub, topics, passed };
}
Object.assign(mockHandlers, {
  async getTryoutInfo() {
    requireMockSession();
    const d = await demoPkg(); const db = mockDb(); const info = mockPkgInfo(d);
    const mine = (db.attempts || []).filter((a) => a.packageId === info.packageId);
    const run = mine.find((a) => a.status === "in_progress" && Date.parse(a.endsAt) > Date.now());
    return { plan: "free", serverNow: new Date().toISOString(), packages: [{
      ...info, questionCount: d.questions.length, canStart: true, lockReason: null,
      inProgress: run ? { attemptId: run.attemptId, endsAt: run.endsAt } : null,
      attempts: mine.filter((a) => a.status === "submitted").map((a) => ({ attemptId: a.attemptId, total: a.total, passedAll: a.passedAll, submittedAt: a.submittedAt })).reverse(),
    }] };
  },
  async startAttempt({ packageId }) {
    requireMockSession();
    const d = await demoPkg(); const info = mockPkgInfo(d);
    if (packageId !== info.packageId) throw apiError("NOT_FOUND", "Paket tryout tidak ditemukan.");
    const db = mockDb(); db.attempts ||= [];
    let a = db.attempts.find((x) => x.packageId === packageId && x.status === "in_progress" && Date.parse(x.endsAt) > Date.now());
    if (!a) {
      a = { attemptId: "t_mock_" + Date.now(), packageId, status: "in_progress", startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + info.durationMin * 60000).toISOString(), answers: {} };
      db.attempts.push(a); saveMockDb(db);
    }
    const qs = demoQuestions(d).map(({ answer, explanation, ...q }) => ({ ...q, options: q.options.map(({ key, text }) => ({ key, text })) }));
    return { attemptId: a.attemptId, packageId, title: info.title, durationMin: info.durationMin, startedAt: a.startedAt, endsAt: a.endsAt, serverNow: new Date().toISOString(), questions: qs, answers: a.answers };
  },
  async saveProgress({ attemptId, answers }) {
    const db = mockDb(); const a = (db.attempts || []).find((x) => x.attemptId === attemptId);
    if (!a) throw apiError("NOT_FOUND", "Data tryout tidak ditemukan.");
    if (a.status === "in_progress") { a.answers = answers || {}; saveMockDb(db); }
    return { saved: true, count: Object.keys(a.answers).length, savedAt: new Date().toISOString() };
  },
  async submitAttempt({ attemptId, answers, finishMode }) {
    const d = await demoPkg(); const info = mockPkgInfo(d);
    const db = mockDb(); const a = (db.attempts || []).find((x) => x.attemptId === attemptId);
    if (!a) throw apiError("NOT_FOUND", "Data tryout tidak ditemukan.");
    if (a.status !== "submitted") {
      const g = mockGrade(demoQuestions(d), answers || {}, info.pg);
      Object.assign(a, { status: "submitted", answers: answers || {}, submittedAt: new Date().toISOString(), finishMode: finishMode || "manual", sub: g.sub, topics: g.topics, passed: g.passed,
        total: g.sub.twk.score + g.sub.tiu.score + g.sub.tkp.score, passedAll: g.passed.twk && g.passed.tiu && g.passed.tkp,
        durationSec: Math.round((Math.min(Date.now(), Date.parse(a.endsAt)) - Date.parse(a.startedAt)) / 1000) });
      saveMockDb(db);
    }
    return { attemptId, status: "submitted" };
  },
  async getReport({ attemptId }) {
    requireMockSession();
    const d = await demoPkg(); const info = mockPkgInfo(d); const qs = demoQuestions(d);
    const a = (mockDb().attempts || []).find((x) => x.attemptId === attemptId);
    if (!a) throw apiError("NOT_FOUND", "Data tryout tidak ditemukan.");
    if (a.status !== "submitted") throw apiError("NOT_FINISHED", "Tryout ini masih berlangsung.");
    const NAMES = TOPIC_NAMES;
    const topics = Object.entries(a.topics).map(([id, t]) => ({ topicId: id, name: NAMES[id] || id, subtest: id.slice(0, 3), pct: Math.round((t.points / t.max) * 100), answered: t.answered, total: t.total })).sort((x, y) => x.pct - y.pct);
    const order = Object.fromEntries(topics.map((t, i) => [t.topicId, i]));
    const pool = qs.map((q) => {
      const mine = a.answers[q.id] || ""; const opt = q.options.find((o) => o.key === mine);
      const pts = q.subtest === "tkp" ? opt?.score || 0 : mine && mine === q.answer ? 5 : 0;
      const best = q.subtest === "tkp" ? q.options.reduce((x, y) => ((y.score || 0) > (x.score || 0) ? y : x)) : q.options.find((o) => o.key === q.answer);
      return { number: q.number, subtest: q.subtest, topic: NAMES[q.topicId] || q.topicId, text: q.text, context: q.context, options: q.options.map((o) => ({ key: o.key, text: o.text, score: q.subtest === "tkp" ? o.score : null })), yourAnswer: mine, bestAnswer: best?.key || "", points: pts, explanation: q.explanation, w: order[q.topicId] };
    });
    const wrong = pool.filter((r) => r.points < 5);
    return {
      attemptId, package: { packageId: info.packageId, title: info.title, type: info.type, durationMin: info.durationMin },
      startedAt: a.startedAt, submittedAt: a.submittedAt, durationSec: a.durationSec, finishMode: a.finishMode,
      total: a.total, maxTotal: qs.length * 5, passedAll: a.passedAll, answered: Object.keys(a.answers).length, questionCount: qs.length,
      subtests: ["twk", "tiu", "tkp"].map((id) => ({ id, label: SUBTEST_NAMES[id], score: a.sub[id].score, max: a.sub[id].max, passingGrade: info.pg[id], passed: a.passed[id], answered: a.sub[id].answered, total: a.sub[id].total, correct: a.sub[id].correct })),
      topics: topics.map((t, i) => (i === 0 ? t : { topicId: t.topicId, name: t.name, subtest: t.subtest, locked: true })),
      topicsLocked: topics.length > 1,
      review: wrong.sort((x, y) => x.w - y.w || x.number - y.number).slice(0, 5).sort((x, y) => x.number - y.number).map(({ w, ...r }) => r),
      reviewLocked: true, reviewTotal: wrong.length, premium: false,
    };
  },
});
const SUBTEST_NAMES = { twk: "Tes Wawasan Kebangsaan", tiu: "Tes Intelegensia Umum", tkp: "Tes Karakteristik Pribadi" };
const TOPIC_NAMES = {
  "twk-pancasila": "Pancasila", "twk-uud": "UUD 1945", "twk-nkri": "NKRI", "twk-bhinneka": "Bhinneka Tunggal Ika", "twk-nasionalisme": "Nasionalisme", "twk-integritas": "Integritas", "twk-belanegara": "Bela negara",
  "tiu-analogi": "Analogi", "tiu-silogisme": "Silogisme", "tiu-analitis": "Penalaran analitis", "tiu-deret": "Deret angka", "tiu-hitung": "Hitungan & perbandingan", "tiu-cerita": "Soal cerita", "tiu-figural": "Figural",
  "tkp-pelayanan": "Pelayanan publik", "tkp-jejaring": "Jejaring kerja", "tkp-sosbud": "Sosial budaya", "tkp-tik": "Teknologi informasi", "tkp-profesionalisme": "Profesionalisme", "tkp-antiradikalisme": "Anti-radikalisme",
};

function requireMockSession() {
  if (!auth.isLoggedIn()) throw apiError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
}
function mockDb() {
  return store.get("mock.db", { user: null, profile: null, assessments: [], attempts: [] });
}
function saveMockDb(db) {
  store.set("mock.db", db);
}
function buildMockMe(db) {
  const p = db.profile;
  return {
    user: db.user,
    profile: p,
    profileComplete: Boolean(p && p.education && p.major && p.minutesPerDay && p.daysPerWeek),
    latestAssessment: db.assessments[db.assessments.length - 1] || null,
    latestAttempt: (() => {
      const a = (db.attempts || [])[(db.attempts || []).length - 1];
      if (!a) return null;
      return a.status === "submitted"
        ? { attemptId: a.attemptId, status: "submitted", packageId: a.packageId, total: a.total, passedAll: a.passedAll, submittedAt: a.submittedAt }
        : { attemptId: a.attemptId, status: a.status, packageId: a.packageId, endsAt: a.endsAt };
    })(),
  };
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                            */
/* ------------------------------------------------------------------ */
function apiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function callMock(action, payload) {
  const handler = mockHandlers[action];
  if (!handler) throw apiError("UNKNOWN_ACTION", `Action "${action}" belum tersedia di mode mock.`);
  await delay(250); // simulasi jeda jaringan
  return handler(payload);
}

async function callRemote(action, payload) {
  if (!CONFIG.APPS_SCRIPT_URL) {
    throw apiError("NO_BACKEND", "APPS_SCRIPT_URL belum diisi di config.js.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    // Content-Type text/plain sengaja dipakai agar browser tidak mengirim
    // preflight CORS (OPTIONS), yang tidak didukung Apps Script.
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload, token: auth.getToken() }),
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw apiError("HTTP_" + res.status, "Server sedang bermasalah. Coba lagi sebentar.");
    const json = await res.json();
    if (!json.ok) throw apiError(json.error?.code || "SERVER_ERROR", json.error?.message || "Terjadi kesalahan di server.");
    return json.data;
  } catch (e) {
    if (e.name === "AbortError") throw apiError("TIMEOUT", "Koneksi terlalu lama. Periksa internet kamu lalu coba lagi.");
    if (e.code) throw e;
    throw apiError("NETWORK", "Tidak bisa terhubung ke server. Periksa koneksi internet kamu.");
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* API publik                                                          */
/* ------------------------------------------------------------------ */
export const api = {
  /**
   * @param {string} action  nama action, lihat docs/api-contract.md
   * @param {object} payload data yang dikirim
   * @returns {Promise<{ok: boolean, data?: any, error?: {code: string, message: string}}>}
   */
  async call(action, payload = {}) {
    try {
      const data = CONFIG.USE_MOCK ? await callMock(action, payload) : await callRemote(action, payload);
      return { ok: true, data };
    } catch (e) {
      // Token ditolak server: hapus sesi lokal agar halaman bisa mengarahkan ke login.
      if (e.code === "UNAUTHENTICATED") auth.logout();
      return { ok: false, error: { code: e.code || "UNKNOWN", message: e.message || "Terjadi kesalahan." } };
    }
  },

  get isMock() {
    return CONFIG.USE_MOCK;
  },
};
