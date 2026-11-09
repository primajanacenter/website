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
import { buildPlan, ALL_TOPICS } from "../features/plan.js";

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
      topics: mockPremium(mockDb()) ? topics : topics.map((t, i) => (i === 0 ? t : { topicId: t.topicId, name: t.name, subtest: t.subtest, locked: true })),
      topicsLocked: !mockPremium(mockDb()) && topics.length > 1,
      review: (mockPremium(mockDb()) ? pool : wrong.sort((x, y) => x.w - y.w || x.number - y.number).slice(0, 5)).sort((x, y) => x.number - y.number).map(({ w, ...r }) => r),
      reviewLocked: !mockPremium(mockDb()), reviewTotal: wrong.length, premium: mockPremium(mockDb()),
    };
  },
});
// ---------- Fase 4: latihan harian (mode uji: soal DEMO publik sebagai bank latihan) ----------
const FREE_DAILY = 10;
function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
Object.assign(mockHandlers, {
  async getToday() {
    requireMockSession();
    const db = mockDb(); const d = await demoPkg();
    const hist = db.practice || [];
    const today = todayLocal();
    const done = hist.filter((h) => h.date === today);
    const stats = {};
    const lastAttempt = (db.attempts || []).filter((a) => a.status === "submitted").slice(-1)[0];
    if (lastAttempt) Object.entries(lastAttempt.topics).forEach(([k, t]) => (stats[k] = { p: t.points, m: t.max, n: t.total }));
    hist.slice(-60).forEach((h) => { const s = (stats[h.topicId] ||= { p: 0, m: 0, n: 0 }); s.p += h.points; s.m += 5; s.n++; });
    const levels = {};
    Object.entries(stats).forEach(([k, s]) => { const pct = Math.round((s.p / s.m) * 100); levels[k] = { pct, n: s.n, level: pct < 40 ? 1 : pct < 70 ? 2 : pct <= 85 ? 3 : 4 }; });
    const focus = Object.keys(levels).sort((a, b) => levels[a].pct - levels[b].pct).slice(0, 3);
    ["tiu-deret", "twk-pancasila", "tkp-pelayanan"].forEach((t) => { if (focus.length < 3 && !focus.includes(t)) focus.push(t); });
    const days = new Set(hist.map((h) => h.date));
    let streak = 0; const c = new Date(); if (!days.has(today)) c.setDate(c.getDate() - 1);
    while (days.has(new Date(c.getTime() - c.getTimezoneOffset() * 60000).toISOString().slice(0, 10))) { streak++; c.setDate(c.getDate() - 1); }
    return {
      date: today, profile: db.profile, plan: mockPremium(db) ? "premium" : "free", streak,
      focusTopics: focus.map((k) => ({ topicId: k, name: TOPIC_NAMES[k] || k, subtest: k.slice(0, 3) })),
      topicLevels: levels,
      practice: mockPremium(db)
        ? { doneToday: done.length, correctToday: done.filter((h) => h.points >= 4).length, byTopicToday: countBy(done), dailyLimit: null, remaining: 10, bankSize: d.questions.length }
        : { doneToday: done.length, correctToday: done.filter((h) => h.points >= 4).length, byTopicToday: countBy(done), dailyLimit: FREE_DAILY, remaining: Math.max(0, FREE_DAILY - done.length), bankSize: d.questions.length },
      hasTryout: (db.attempts || []).some((a) => a.status === "submitted"),
    };
  },
  async startPractice({ topicId } = {}) {
    requireMockSession();
    const db = mockDb(); const qs = demoQuestions(await demoPkg());
    const done = (db.practice || []).filter((h) => h.date === todayLocal()).length;
    const premium = mockPremium(db);
    const remaining = premium ? 10 : FREE_DAILY - done;
    if (remaining <= 0) throw apiError("DAILY_LIMIT", "Kuota latihan gratis hari ini sudah habis. Lanjutkan besok, atau pelajari materi sambil menunggu.");
    let pool = topicId ? qs.filter((q) => q.topicId === topicId) : qs;
    if (!pool.length) throw apiError("NOT_FOUND", "Belum ada soal latihan untuk topik ini.");
    pool = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(10, remaining));
    const sessionId = "p_mock_" + Date.now();
    db.practiceSession = { sessionId, ids: pool.map((q) => q.id), answered: {} };
    saveMockDb(db);
    return { sessionId, topicId: topicId || null, remainingToday: premium ? null : remaining, dailyLimit: premium ? null : FREE_DAILY,
      questions: pool.map((q) => ({ id: q.id, number: q.number, subtest: q.subtest, topicId: q.topicId, text: q.text, context: q.context, options: q.options.map(({ key, text }) => ({ key, text })) })) };
  },
  async answerPractice({ sessionId, questionId, answer }) {
    requireMockSession();
    const db = mockDb(); const sess = db.practiceSession;
    if (!sess || sess.sessionId !== sessionId) throw apiError("SESSION_EXPIRED", "Sesi latihan sudah berakhir. Mulai sesi latihan baru.");
    if (!sess.ids.includes(questionId)) throw apiError("BAD_REQUEST", "Soal tidak termasuk dalam sesi ini.");
    const q = demoQuestions(await demoPkg()).find((x) => x.id === questionId);
    const points = q.subtest === "tkp" ? q.options.find((o) => o.key === answer)?.score || 0 : answer === q.answer ? 5 : 0;
    if (!(questionId in sess.answered)) {
      sess.answered[questionId] = points;
      (db.practice ||= []).push({ date: todayLocal(), questionId, topicId: q.topicId, points });
      saveMockDb(db);
    }
    const best = q.subtest === "tkp" ? q.options.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a)) : q.options.find((o) => o.key === q.answer);
    return { questionId, answer, points, correct: q.subtest === "tkp" ? points >= 4 : points === 5, bestAnswer: best.key,
      optionScores: q.subtest === "tkp" ? q.options.map((o) => ({ key: o.key, score: o.score })) : null, explanation: q.explanation, topic: TOPIC_NAMES[q.topicId] || q.topicId };
  },
});
// ---------- Fase 5: pembayaran (mode uji: disimulasikan di browser) ----------
const MOCK_PLANS = [
  { planId: "P1M", name: "Premium 1 bulan", durationDays: 30, price: 49000, priceBefore: null, badge: "", description: "Cocok untuk persiapan singkat menjelang tes.", order: 1 },
  { planId: "P3M", name: "Premium 3 bulan", durationDays: 90, price: 119000, priceBefore: 147000, badge: "Paling populer", description: "Waktu ideal untuk menutup topik lemah secara bertahap.", order: 2 },
  { planId: "P6M", name: "Premium 6 bulan", durationDays: 180, price: 179000, priceBefore: 294000, badge: "Paling hemat", description: "Untuk yang mulai jauh hari sampai hari-H SKD.", order: 3 },
];
function mockPremium(db) {
  return Boolean(db.user && db.user.plan === "premium" && db.user.premiumUntil && new Date(db.user.premiumUntil) > new Date());
}
function mockPublicTrx(t) {
  return { ...t, paymentUrl: t.status === "pending" ? t.paymentUrl : "" };
}
Object.assign(mockHandlers, {
  async getPlans() {
    const out = { plans: MOCK_PLANS, env: "mock", current: null, pending: null, history: [] };
    if (auth.isLoggedIn()) {
      const db = mockDb();
      if (db.user) {
        out.current = { plan: mockPremium(db) ? "premium" : "free", premiumUntil: db.user.premiumUntil || "" };
        const list = (db.transactions || []).slice(-5).reverse();
        out.history = list.map(mockPublicTrx);
        const p = list.find((t) => t.status === "pending" && new Date(t.expiresAt) > new Date());
        out.pending = p ? mockPublicTrx(p) : null;
      }
    }
    return out;
  },
  async createCheckout({ planId }) {
    requireMockSession();
    const plan = MOCK_PLANS.find((p) => p.planId === planId);
    if (!plan) throw apiError("BAD_REQUEST", "Paket tidak ditemukan.");
    const db = mockDb();
    const trxId = "trx_mock" + Date.now().toString(36);
    const t = { trxId, planId, planName: plan.name, amount: plan.price, durationDays: plan.durationDays, status: "pending",
      paymentUrl: `status-bayar.html?trx=${trxId}`, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), paidAt: "", premiumUntil: "" };
    (db.transactions ||= []).push(t);
    saveMockDb(db);
    return { trxId, paymentUrl: t.paymentUrl, expiresAt: t.expiresAt, reused: false };
  },
  async getPaymentStatus({ trxId }) {
    requireMockSession();
    const db = mockDb();
    const t = (db.transactions || []).find((x) => x.trxId === trxId);
    if (!t) throw apiError("NOT_FOUND", "Transaksi tidak ditemukan.");
    return { transaction: mockPublicTrx(t), plan: mockPremium(db) ? "premium" : "free", premiumUntil: db.user.premiumUntil || "" };
  },
  // Khusus mode uji: tombol "Simulasikan berhasil/kedaluwarsa" di halaman status
  async mockSimulatePayment({ trxId, result }) {
    requireMockSession();
    const db = mockDb();
    const t = (db.transactions || []).find((x) => x.trxId === trxId);
    if (!t || t.status !== "pending") return { ok: false };
    if (result === "paid") {
      const base = mockPremium(db) ? new Date(db.user.premiumUntil).getTime() : Date.now();
      const until = new Date(base + t.durationDays * 86400000).toISOString();
      Object.assign(t, { status: "paid", paidAt: new Date().toISOString(), premiumUntil: until.slice(0, 10) });
      db.user.plan = "premium"; db.user.premiumUntil = until.slice(0, 10);
    } else {
      t.status = "expired";
    }
    saveMockDb(db);
    return { ok: true };
  },
});

// ---------- Fase 6: materi premium & rencana adaptif (mode uji: isi contoh, bukan materi asli) ----------
function countBy(list) {
  return list.reduce((m, h) => ((m[h.topicId] = (m[h.topicId] || 0) + 1), m), {});
}
const MOCK_LEVEL_TITLE = { 2: "Konsep lengkap & pola soal", 3: "Analisis kasus HOTS", 4: "Strategi waktu & jebakan lanjut" };
function mockMaterial(topicId, level) {
  const name = TOPIC_NAMES[topicId] || topicId;
  return {
    materialId: `MAT-${topicId}-L${level}`, topicId, level, title: `${name}: ${MOCK_LEVEL_TITLE[level]}`, minutes: 8 + level,
    ringkasan: `Ini contoh isi materi level ${level} untuk mode uji. Materi Premium yang sebenarnya disimpan di spreadsheet server dan hanya dikirim kepada pengguna Premium setelah backend tersambung.`,
    poinKunci: ["Poin kunci contoh pertama.", "Poin kunci contoh kedua.", "Poin kunci contoh ketiga."],
    contoh: { soal: `Contoh soal level ${level} (mode uji). Pilih jawaban yang paling tepat.`, pilihan: ["Jawaban benar", "Pengecoh 1", "Pengecoh 2", "Pengecoh 3", "Pengecoh 4"], jawaban: 0, pembahasan: "Pembahasan contoh untuk mode uji." },
    tips: ["Strategi contoh."], jebakan: ["Jebakan contoh."],
  };
}
async function mockTopicStats() {
  if (!auth.isLoggedIn() || !mockDb().user) return null;
  return (await mockHandlers.getToday()).topicLevels;
}
Object.assign(mockHandlers, {
  async getMaterialIndex() {
    const available = {};
    ALL_TOPICS.forEach((t) => (available[t.id] = [2, 3, 4].map((l) => ({ level: l, title: mockMaterial(t.id, l).title, minutes: 8 + l }))));
    const db = mockDb(); const levels = await mockTopicStats();
    const recommended = {};
    if (levels) ALL_TOPICS.forEach((t) => (recommended[t.id] = levels[t.id] ? Math.min(4, levels[t.id].level + 1) : 1));
    return { premium: mockPremium(db), loggedIn: Boolean(levels), available, recommended };
  },
  async getMaterial({ topicId, level }) {
    level = Number(level);
    if (!TOPIC_NAMES[topicId] || ![2, 3, 4].includes(level)) throw apiError("BAD_REQUEST", "Topik atau level materi tidak valid.");
    const m = mockMaterial(topicId, level);
    const db = mockDb();
    if (!auth.isLoggedIn() || !mockPremium(db)) {
      return { locked: true, reason: auth.isLoggedIn() ? "PREMIUM" : "LOGIN", teaser: { topicId, level, title: m.title, minutes: m.minutes, pointCount: 3, intro: m.ringkasan.slice(0, 120) + "…" } };
    }
    return { locked: false, material: m };
  },
  async getPlan() {
    requireMockSession();
    const db = mockDb();
    if (!mockPremium(db)) throw apiError("FORBIDDEN", "Rencana adaptif tersedia untuk pengguna Premium.");
    const today = await mockHandlers.getToday();
    if (!today.profile) throw apiError("PROFILE_INCOMPLETE", "Lengkapi profil belajar terlebih dahulu.");
    const base = buildPlan(today);
    const lv = today.topicLevels;
    const priorities = ALL_TOPICS.map((t) => {
      const st = lv[t.id]; const level = st ? st.level : null;
      return { topicId: t.id, name: t.name, subtest: t.subtest, level, pct: st ? st.pct : null, n: st ? st.n : 0, targetLevel: 3,
        recommendedLevel: st ? Math.min(4, st.level + 1) : 1, score: (3 - (level || 1)) + (st ? 0 : 0.75),
        reason: st ? `Level ${level} (${st.pct}%), target level 3` : "Belum cukup data — kerjakan latihan topik ini untuk mengukur levelmu" };
    }).sort((a, b) => b.score - a.score);
    const last = (db.attempts || []).filter((a) => a.status === "submitted").slice(-1)[0];
    const gaps = last ? Object.fromEntries(["twk", "tiu", "tkp"].map((s) => { const pg = { twk: 65, tiu: 80, tkp: 166 }[s] * last.sub[s].max / ({ twk: 150, tiu: 175, tkp: 225 }[s]); const pgR = Math.round(pg); return [s, { score: last.sub[s].score, pg: pgR, gap: Math.max(0, pgR - last.sub[s].score), passed: last.sub[s].score >= pgR }]; })) : null;
    let i = 0;
    const week = base.week.map((d) => {
      const p = priorities[i++ % 6]; const l = Math.max(2, p.recommendedLevel);
      return { ...d, tasks: d.tasks.map((t) => {
        if (t.type === "materi") return { ...t, topicId: p.topicId, level: l, label: `Materi Lv${l}: ${p.name}`, href: `materi.html?topik=${p.topicId}&level=${l}` };
        if (t.type === "latihan-topik") return { ...t, topicId: p.topicId, count: 10, label: `Latihan topik ${p.name} (10 soal)`, href: `latihan.html?topik=${p.topicId}` };
        return t;
      }) };
    });
    const notes = [];
    if (!last) notes.push("Belum ada tryout. Kerjakan tryout diagnostik minggu ini agar prioritas topik lebih akurat.");
    if (gaps) ["twk", "tiu", "tkp"].forEach((s) => { if (!gaps[s].passed) notes.push(`${s.toUpperCase()} masih ${gaps[s].gap} poin di bawah ambang batas (${gaps[s].score}/${gaps[s].pg}). Porsi topik ${s.toUpperCase()} dinaikkan.`); });
    notes.push("Mode uji: analisis ini disederhanakan di browser. Versi server memakai skor tryout, level topik, dan kepatuhan mingguan.");
    return { ...base, week, today: week.find((w) => w.isToday), adaptive: true, generatedAt: new Date().toISOString(), targetLevel: 3,
      targets: { practicePerDay: 20, practicePerWeek: 20 * base.weekly.days, tryoutThisWeek: !last, cadenceDays: 14, intensity: 1 },
      adherence: { done: 0, planned: 0, pct: null }, gaps, priorities, notes };
  },
});

const SUBTEST_NAMES = { twk: "Tes Wawasan Kebangsaan", tiu: "Tes Intelegensia Umum", tkp: "Tes Karakteristik Pribadi" };
const TOPIC_NAMES = {
  "twk-pancasila": "Pancasila", "twk-uud": "UUD 1945", "twk-nkri": "NKRI", "twk-bhinneka": "Bhinneka Tunggal Ika", "twk-nasionalisme": "Nasionalisme", "twk-integritas": "Integritas", "twk-belanegara": "Bela negara", "twk-bahasa": "Bahasa negara",
  "tiu-analogi": "Analogi", "tiu-silogisme": "Silogisme", "tiu-analitis": "Penalaran analitis", "tiu-deret": "Deret angka", "tiu-hitung": "Hitungan & perbandingan", "tiu-cerita": "Soal cerita", "tiu-figural": "Figural",
  "tkp-pelayanan": "Pelayanan publik", "tkp-jejaring": "Jejaring kerja", "tkp-sosbud": "Sosial budaya", "tkp-tik": "Teknologi informasi", "tkp-profesionalisme": "Profesionalisme", "tkp-antiradikalisme": "Anti-radikalisme",
};

function requireMockSession() {
  if (!auth.isLoggedIn()) throw apiError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
}
function mockDb() {
  return store.get("mock.db", { user: null, profile: null, assessments: [], attempts: [], practice: [] });
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
