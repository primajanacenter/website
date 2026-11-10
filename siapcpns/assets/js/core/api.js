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
    const mine = (db.attempts || []).filter((a) => a.packageId === info.packageId && a.type !== "akbar");
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
    let a = db.attempts.find((x) => x.type !== "akbar" && x.packageId === packageId && x.status === "in_progress" && Date.parse(x.endsAt) > Date.now());
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
    if (a.type === "akbar") throw apiError("RESULTS_PENDING", "Jawabanmu sudah tersimpan. Skor, rapor, dan peringkat terbit Senin 06.00 WIB.");
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
    const lastAttempt = (db.attempts || []).filter((a) => a.status === "submitted" && a.type !== "skb").slice(-1)[0];
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
      hasTryout: (db.attempts || []).some((a) => a.status === "submitted" && a.type !== "skb"),
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
    const last = (db.attempts || []).filter((a) => a.status === "submitted" && a.type !== "skb").slice(-1)[0];
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

// ---------- Fase 7: Tryout Akbar (mode uji: event & peringkat sintetis) ----------
const MOCK_EV_ID = "AK-MOCK-NOW";
function mockEvents() {
  const t0 = Math.floor(Date.now() / 3600000) * 3600000;
  return {
    current: { eventId: MOCK_EV_ID, title: "Tryout Akbar #2 (mode uji)", opensAt: new Date(t0 - 3600e3).toISOString(), closesAt: new Date(t0 + 6 * 3600e3).toISOString(), resultsAt: new Date(t0 + 15 * 3600e3).toISOString() },
    past: { eventId: "AK-MOCK-LALU", title: "Tryout Akbar #1 (mode uji)", opensAt: new Date(t0 - 7 * 86400e3).toISOString(), closesAt: new Date(t0 - 7 * 86400e3 + 15 * 3600e3).toISOString(), resultsAt: new Date(t0 - 6 * 86400e3).toISOString() },
  };
}
function mockBoard() {
  const names = ["Rina S.", "Bagas P.", "Dewi A.", "Fikri H.", "Sinta M.", "Yusuf R.", "Nadia K.", "Arif W.", "Lestari D.", "Galih T."];
  const provs = ["Jawa Barat", "Jawa Tengah", "Jawa Timur", "DKI Jakarta", "Sumatera Utara", "Sulawesi Selatan"];
  let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const rows = Array.from({ length: 137 }, (_, i) => {
    const twk = Math.round(60 + rnd() * 70), tiu = Math.round(60 + rnd() * 90), tkp = Math.round(150 + rnd() * 60);
    return { name: names[i % names.length], province: provs[i % provs.length], twk, tiu, tkp, total: twk + tiu + tkp, passedAll: twk >= 65 && tiu >= 80 && tkp >= 166 };
  }).sort((a, b) => b.total - a.total || b.tkp - a.tkp).map((r, i) => ({ ...r, rank: i + 1 }));
  const q = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  const top = rows.slice(0, 14); const avg = (k) => Math.round(top.reduce((s, r) => s + r[k], 0) / top.length);
  return { rows, stats: { n: rows.length, passRate: Math.round(rows.filter((r) => r.passedAll).length / rows.length * 100),
    median: { total: q("total"), twk: q("twk"), tiu: q("tiu"), tkp: q("tkp") }, top10: { total: avg("total"), twk: avg("twk"), tiu: avg("tiu"), tkp: avg("tkp") }, pg: { twk: 65, tiu: 80, tkp: 166 } } };
}
Object.assign(mockHandlers, {
  async getAkbarInfo() {
    const ev = mockEvents(); const d = await demoPkg(); const info = mockPkgInfo(d);
    const logged = auth.isLoggedIn() && Boolean(mockDb().user);
    const a = logged ? (mockDb().attempts || []).find((x) => x.eventId === MOCK_EV_ID) : null;
    const lastStart = new Date(Date.parse(ev.current.closesAt) - info.durationMin * 60000).toISOString();
    return { serverNow: new Date().toISOString(), loggedIn: logged, premium: logged && mockPremium(mockDb()),
      current: { ...ev.current, lastStartAt: lastStart, state: "open", durationMin: info.durationMin, questionCount: demoQuestions(d).length, participants: null,
        my: a ? { attemptId: a.attemptId, status: a.status, endsAt: a.status === "in_progress" ? a.endsAt : null, rank: null, total: null, percentile: null, passedAll: null } : null },
      next: [],
      past: [{ ...ev.past, lastStartAt: ev.past.closesAt, state: "published", durationMin: 100, questionCount: 110, participants: 137, my: null }] };
  },
  async joinAkbar({ eventId }) {
    requireMockSession();
    if (eventId !== MOCK_EV_ID) throw apiError("NOT_FOUND", "Tryout Akbar tidak ditemukan.");
    const d = await demoPkg(); const info = mockPkgInfo(d);
    const db = mockDb(); db.attempts ||= [];
    let a = db.attempts.find((x) => x.eventId === eventId);
    if (a && a.status === "submitted") throw apiError("ALREADY_DONE", "Kamu sudah mengikuti Tryout Akbar ini. Hasil dan peringkat terbit Senin 06.00 WIB.");
    if (!a) {
      a = { attemptId: "t_akbar_" + Date.now(), packageId: info.packageId, eventId, type: "akbar", status: "in_progress", startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + info.durationMin * 60000).toISOString(), answers: {} };
      db.attempts.push(a); saveMockDb(db);
    }
    const qs = demoQuestions(d).map(({ answer, explanation, ...q }) => ({ ...q, options: q.options.map(({ key, text }) => ({ key, text })) }));
    return { attemptId: a.attemptId, packageId: info.packageId, eventId, title: "Tryout Akbar #2 (mode uji)", durationMin: info.durationMin, startedAt: a.startedAt, endsAt: a.endsAt, serverNow: new Date().toISOString(), resultsAt: mockEvents().current.resultsAt, questions: qs, answers: a.answers };
  },
  async getAkbarRanking({ eventId, scope }) {
    if (eventId === MOCK_EV_ID) throw apiError("RESULTS_PENDING", "Peringkat terbit Senin 06.00 WIB.");
    if (eventId !== "AK-MOCK-LALU") throw apiError("NOT_FOUND", "Tryout Akbar tidak ditemukan.");
    const premium = auth.isLoggedIn() && mockPremium(mockDb());
    const b = mockBoard();
    const out = { event: { eventId, title: "Tryout Akbar #1 (mode uji)" }, scope: scope === "province" ? "province" : "national", premium, stats: b.stats, me: null, top: b.rows.slice(0, 50) };
    if (scope === "province") {
      if (!premium) throw apiError("FORBIDDEN", "Peringkat per provinsi tersedia untuk Premium.");
      const prov = mockDb().profile?.targetProvince || "Jawa Barat";
      const rows = b.rows.filter((r) => r.province === prov);
      Object.assign(out, { province: prov, provinceCount: rows.length, top: rows.slice(0, 20).map((r, i) => ({ ...r, provinceRank: i + 1 })) });
    }
    return out;
  },
});

// ---------- Fase 8: SKB, pasca-SKD, referral (mode uji) ----------
// Soal SKB contoh khusus mode uji (bukan isi paket SKB sungguhan).
const MOCK_SKB_ID = "SKB-MOCK";
const MOCK_SKB = [
  ["skb-asn", "Menurut UU Nomor 20 Tahun 2023, pegawai ASN terdiri atas …", ["PNS dan PPPK", "PNS dan honorer", "PNS, PPPK, dan tenaga alih daya", "PNS dan TNI/Polri", "PPPK dan pegawai kontrak"], "UU 20/2023: Pegawai ASN terdiri atas PNS dan PPPK."],
  ["skb-asn", "Nilai dasar ASN \"BerAKHLAK\" diawali dengan …", ["Berorientasi pelayanan", "Bertanggung jawab", "Beriman", "Berintegritas", "Berprestasi"], "BerAKHLAK: Berorientasi pelayanan, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif."],
  ["skb-pelayanan", "Lembaga yang berwenang mengawasi penyelenggaraan pelayanan publik dan menangani maladministrasi adalah …", ["Ombudsman Republik Indonesia", "Komisi Yudisial", "BPK", "Komisi Informasi", "KPU"], "Ombudsman mengawasi pelayanan publik termasuk dugaan maladministrasi."],
  ["skb-pelayanan", "Standar pelayanan sebaiknya disusun dengan …", ["Mengikutsertakan masyarakat dan pihak terkait", "Hanya oleh pimpinan unit", "Menyalin dari instansi lain", "Menunggu keluhan masyarakat", "Diserahkan kepada konsultan sepenuhnya"], "UU 25/2009 mewajibkan penyusunan standar pelayanan dengan mengikutsertakan masyarakat."],
  ["skb-integritas", "Permintaan informasi publik wajib ditanggapi badan publik paling lambat …", ["10 hari kerja, dapat diperpanjang 7 hari kerja", "3 hari kerja", "30 hari kalender", "14 hari kerja tanpa perpanjangan", "1 bulan"], "UU 14/2008 Pasal 22: paling lambat 10 hari kerja, dapat diperpanjang paling lambat 7 hari kerja."],
  ["skb-integritas", "Gratifikasi yang diterima pegawai wajib dilaporkan kepada KPK paling lambat …", ["30 hari kerja sejak diterima", "7 hari kerja", "60 hari kalender", "Akhir tahun anggaran", "Saat diminta atasan"], "UU 20/2001 Pasal 12C: paling lambat 30 hari kerja sejak gratifikasi diterima."],
];
function mockSkbQuestions() {
  return MOCK_SKB.map(([topicId, text, opts, expl], i) => ({ id: `${MOCK_SKB_ID}-${String(i + 1).padStart(3, "0")}`, number: i + 1, subtest: "skb", topicId, text, context: "",
    options: opts.map((t, j) => ({ key: "abcde"[j], text: t })), answer: "a", explanation: expl }));
}
const MOCK_SKB_TOPICS = { "skb-asn": "Manajemen ASN & disiplin", "skb-pelayanan": "Standar pelayanan publik", "skb-integritas": "Integritas & keterbukaan informasi" };
const _base = { getTryoutInfo: mockHandlers.getTryoutInfo, startAttempt: mockHandlers.startAttempt, submitAttempt: mockHandlers.submitAttempt, getReport: mockHandlers.getReport, login: mockHandlers.login, getPlans: mockHandlers.getPlans, createCheckout: mockHandlers.createCheckout };
Object.assign(mockHandlers, {
  async getTryoutInfo(payload = {}) {
    if (payload.type !== "skb") return _base.getTryoutInfo(payload);
    requireMockSession();
    const db = mockDb(); const mine = (db.attempts || []).filter((a) => a.packageId === MOCK_SKB_ID);
    const done = mine.filter((a) => a.status === "submitted");
    const run = mine.find((a) => a.status === "in_progress" && Date.parse(a.endsAt) > Date.now());
    const premium = mockPremium(db); const can = premium || done.length < 1;
    return { plan: premium ? "premium" : "free", serverNow: new Date().toISOString(), packages: [{
      packageId: MOCK_SKB_ID, title: "SKB Kemampuan Teknis Umum (mode uji)", type: "skb", description: "Contoh 6 soal untuk mencoba alur SKB.", durationMin: 10,
      pg: { twk: 65, tiu: 80, tkp: 166 }, questionCount: MOCK_SKB.length, canStart: Boolean(run) || can, lockReason: run || can ? null : "FREE_LIMIT",
      inProgress: run ? { attemptId: run.attemptId, endsAt: run.endsAt } : null,
      attempts: done.map((a) => ({ attemptId: a.attemptId, total: a.total, passedAll: null, submittedAt: a.submittedAt })).reverse() }] };
  },
  async startAttempt(payload) {
    if (payload.packageId !== MOCK_SKB_ID) return _base.startAttempt(payload);
    requireMockSession();
    const db = mockDb(); db.attempts ||= [];
    let a = db.attempts.find((x) => x.packageId === MOCK_SKB_ID && x.status === "in_progress" && Date.parse(x.endsAt) > Date.now());
    if (!a) {
      const done = db.attempts.filter((x) => x.packageId === MOCK_SKB_ID && x.status === "submitted").length;
      if (!mockPremium(db) && done >= 1) throw apiError("FORBIDDEN", "Kuota gratis untuk paket ini sudah dipakai. Lihat rapormu atau tunggu paket premium.");
      a = { attemptId: "t_skb_" + Date.now(), packageId: MOCK_SKB_ID, type: "skb", status: "in_progress", startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 10 * 60000).toISOString(), answers: {} };
      db.attempts.push(a); saveMockDb(db);
    }
    const qs = mockSkbQuestions().map(({ answer, explanation, ...q }) => q);
    return { attemptId: a.attemptId, packageId: MOCK_SKB_ID, title: "SKB Kemampuan Teknis Umum (mode uji)", durationMin: 10, startedAt: a.startedAt, endsAt: a.endsAt, serverNow: new Date().toISOString(), questions: qs, answers: a.answers };
  },
  async submitAttempt(payload) {
    const db = mockDb(); const a = (db.attempts || []).find((x) => x.attemptId === payload.attemptId);
    if (!a || a.type !== "skb") return _base.submitAttempt(payload);
    if (a.status !== "submitted") {
      const ans = payload.answers || {}; const qs = mockSkbQuestions();
      const topics = {}; let score = 0, correct = 0, answered = 0;
      qs.forEach((q) => { const t = (topics[q.topicId] ||= { points: 0, max: 0, total: 0, answered: 0 }); t.max += 5; t.total++; if (ans[q.id]) { answered++; t.answered++; } if (ans[q.id] === q.answer) { score += 5; correct++; t.points += 5; } });
      Object.assign(a, { status: "submitted", answers: ans, submittedAt: new Date().toISOString(), finishMode: payload.finishMode || "manual", total: score, topics, skb: { score, max: qs.length * 5, total: qs.length, answered, correct },
        durationSec: Math.round((Math.min(Date.now(), Date.parse(a.endsAt)) - Date.parse(a.startedAt)) / 1000) });
      saveMockDb(db);
    }
    return { attemptId: a.attemptId, status: "submitted" };
  },
  async getReport(payload) {
    const db = mockDb(); const a = (db.attempts || []).find((x) => x.attemptId === payload.attemptId);
    if (!a || a.type !== "skb") return _base.getReport(payload);
    requireMockSession();
    const qs = mockSkbQuestions(); const premium = mockPremium(db);
    const topics = Object.entries(a.topics).map(([id, t]) => ({ topicId: id, name: MOCK_SKB_TOPICS[id] || id, subtest: "skb", pct: Math.round((t.points / t.max) * 100), answered: t.answered, total: t.total })).sort((x, y) => x.pct - y.pct);
    const pool = qs.map((q) => ({ number: q.number, subtest: "skb", topic: MOCK_SKB_TOPICS[q.topicId], text: q.text, context: "", options: q.options.map((o) => ({ ...o, score: null })), yourAnswer: a.answers[q.id] || "", bestAnswer: "a", points: a.answers[q.id] === "a" ? 5 : 0, explanation: q.explanation }));
    const wrong = pool.filter((r) => r.points < 5);
    return { attemptId: a.attemptId, package: { packageId: MOCK_SKB_ID, title: "SKB Kemampuan Teknis Umum (mode uji)", type: "skb", durationMin: 10 },
      startedAt: a.startedAt, submittedAt: a.submittedAt, durationSec: a.durationSec, finishMode: a.finishMode, total: a.total, maxTotal: a.skb.max, passedAll: null,
      score100: Math.round((a.skb.score / a.skb.max) * 100), answered: a.skb.answered, questionCount: qs.length,
      subtests: [{ id: "skb", label: "Seleksi Kompetensi Bidang", score: a.skb.score, max: a.skb.max, passingGrade: null, passed: null, answered: a.skb.answered, total: a.skb.total, correct: a.skb.correct }],
      topics: premium ? topics : topics.map((t, i) => (i === 0 ? t : { topicId: t.topicId, name: t.name, subtest: "skb", locked: true })), topicsLocked: !premium && topics.length > 1,
      review: premium ? pool : wrong.slice(0, 5), reviewLocked: !premium, reviewTotal: wrong.length, premium };
  },
  async getPostSkd() {
    requireMockSession();
    const db = mockDb(); const list = db.skd || [];
    return mockPostSkd(db, list[list.length - 1] || null);
  },
  async saveSkdResult(p) {
    requireMockSession();
    const max = { twk: 150, tiu: 175, tkp: 225 };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.testDate || "")) throw apiError("BAD_REQUEST", "Tanggal tes tidak valid.");
    if (Date.parse(p.testDate) > Date.now() + 86400000) throw apiError("BAD_REQUEST", "Tanggal tes belum lewat. Isi skor setelah kamu mengikuti SKD.");
    const r = { testDate: p.testDate, formation: String(p.formation || "").replace(/[<>]/g, "").slice(0, 120), skbDate: p.skbDate || "" };
    for (const k of ["twk", "tiu", "tkp"]) {
      const v = Number(p[k]);
      if (p[k] === "" || p[k] == null || !Number.isInteger(v) || v < 0 || v > max[k]) throw apiError("BAD_REQUEST", `Skor ${k.toUpperCase()} harus bilangan bulat 0–${max[k]}.`);
      r[k] = v;
    }
    const db = mockDb(); db.skd = (db.skd || []).filter((x) => x.testDate !== r.testDate); db.skd.push(r); saveMockDb(db);
    return mockPostSkd(db, r);
  },
  async getReferral() {
    requireMockSession();
    const db = mockDb(); db.refCode ||= "SCUJI" + Math.random().toString(36).slice(2, 5).toUpperCase().replace(/[01OI]/g, "X"); saveMockDb(db);
    return { code: db.refCode, bonusDays: 7, discountPct: 10, invited: 3, purchased: 1, rewarded: 1, bonusDaysEarned: 7,
      recent: [{ status: "rewarded", joinedAt: new Date(Date.now() - 5 * 864e5).toISOString(), rewardedAt: new Date(Date.now() - 2 * 864e5).toISOString() }, { status: "joined", joinedAt: new Date(Date.now() - 864e5).toISOString(), rewardedAt: "" }, { status: "joined", joinedAt: new Date().toISOString(), rewardedAt: "" }],
      myReferral: db.myRef ? { code: db.myRef, status: "joined", discountActive: !(db.transactions || []).some((t) => t.status === "paid") } : null,
      canClaim: !db.myRef && !(db.transactions || []).some((t) => t.status === "paid") };
  },
  async claimReferral({ code }) {
    requireMockSession();
    const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{6,12}$/.test(c)) throw apiError("BAD_REQUEST", "Kode ajakan tidak valid.");
    const db = mockDb();
    if (c === db.refCode) throw apiError("BAD_REQUEST", "Kode ajakan milikmu sendiri tidak bisa dipakai.");
    if (db.myRef) throw apiError("ALREADY_DONE", "Kamu sudah memakai kode ajakan sebelumnya.");
    if ((db.transactions || []).some((t) => t.status === "paid")) throw apiError("BAD_REQUEST", "Kode ajakan hanya untuk pengguna yang belum pernah membeli Premium.");
    db.myRef = c; saveMockDb(db);
    return { claimed: true, code: c, discountPct: 10 };
  },
  async login(payload = {}) {
    const out = await _base.login(payload);
    let referralClaimed = false;
    if (payload.ref) { try { await mockHandlers.claimReferral({ code: payload.ref }); referralClaimed = true; } catch { referralClaimed = false; } }
    return { ...out, referralClaimed };
  },
  async getPlans(payload) {
    const out = await _base.getPlans(payload);
    if (auth.isLoggedIn()) {
      const db = mockDb();
      if (db.myRef && !(db.transactions || []).some((t) => t.status === "paid")) {
        out.referral = { discountPct: 10 };
        out.plans = out.plans.map((p) => ({ ...p, refPrice: Math.round((p.price * 0.9) / 100) * 100 }));
      }
    }
    return out;
  },
  async createCheckout(payload) {
    const out = await _base.createCheckout(payload);
    const db = mockDb();
    if (db.myRef && !(db.transactions || []).some((t) => t.status === "paid")) {
      const t = db.transactions.find((x) => x.trxId === out.trxId); if (t) { t.amount = Math.round((t.amount * 0.9) / 100) * 100; saveMockDb(db); }
    }
    return out;
  },
});
// ---------- Fase 10: pengingat email (mode uji) ----------
Object.assign(mockHandlers, {
  async getNotifPrefs() {
    requireMockSession();
    const db = mockDb();
    return { prefs: { daily: false, akbar: false, premium: true, ...(db.notif || {}) }, premium: mockPremium(db), email: db.user?.email || "uji@contoh.id", reminderTime: db.profile?.reminderTime || "", emailEnabled: true };
  },
  async saveNotifPrefs(p = {}) {
    requireMockSession();
    if (p.reminderTime !== undefined && p.reminderTime !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.reminderTime)) throw apiError("BAD_REQUEST", "Jam pengingat tidak valid (format JJ:MM).");
    const db = mockDb();
    if (!mockPremium(db) && (p.daily === true || p.akbar === true)) throw apiError("FORBIDDEN", "Pengingat lewat email tersedia untuk pengguna Premium. Gunakan pengingat di perangkat ini (gratis).");
    if (p.reminderTime && !db.profile) throw apiError("PROFILE_INCOMPLETE", "Lengkapi profil belajar terlebih dahulu agar jam pengingat bisa disimpan.");
    const cur = { daily: false, akbar: false, premium: true, ...(db.notif || {}) };
    for (const k of ["daily", "akbar", "premium"]) if (p[k] !== undefined) cur[k] = Boolean(p[k]);
    db.notif = cur;
    if (p.reminderTime !== undefined && db.profile) db.profile.reminderTime = p.reminderTime;
    saveMockDb(db);
    const out = await mockHandlers.getNotifPrefs();
    if (out.prefs.daily && !out.reminderTime) out.warning = "Isi jam pengingat agar pengingat harian bisa dikirim.";
    return out;
  },
});

function mockPostSkd(db, r) {
  const pg = { twk: 65, tiu: 80, tkp: 166 }; const max = { twk: 150, tiu: 175, tkp: 225 };
  const testDate = db.profile?.testDate || "";
  const out = { premium: mockPremium(db), profileTestDate: testDate, testPassed: Boolean(testDate) && Date.parse(testDate + "T23:59:59+07:00") < Date.now(), result: null, analysis: null,
    history: (db.skd || []).map((x) => ({ testDate: x.testDate, total: x.twk + x.tiu + x.tkp, passedAll: x.twk >= pg.twk && x.tiu >= pg.tiu && x.tkp >= pg.tkp })).reverse() };
  if (!r) return out;
  const total = r.twk + r.tiu + r.tkp; const passedAll = r.twk >= pg.twk && r.tiu >= pg.tiu && r.tkp >= pg.tkp;
  out.result = { ...r, total, passedAll };
  const subtests = ["twk", "tiu", "tkp"].map((k) => ({ id: k, score: r[k], max: max[k], pg: pg[k], gap: r[k] - pg[k], passed: r[k] >= pg[k] }));
  const weakest = [...subtests].sort((a, b) => a.score / a.pg - b.score / b.pg)[0];
  const tries = (db.attempts || []).filter((a) => a.status === "submitted" && a.type !== "skb" && a.type !== "akbar").slice(-5);
  const tryout = tries.length ? { n: tries.length, total: Math.round(tries.reduce((s, a) => s + a.total, 0) / tries.length), best: Math.max(...tries.map((a) => a.total)) } : null;
  if (tryout) tryout.diff = total - tryout.total;
  const skdPart = Math.round((total / 550) * 40 * 100) / 100;
  const steps = passedAll
    ? [{ id: "skb", title: "Siapkan SKB sekarang", text: "SKB umumnya berbobot 60% dari nilai akhir, lebih besar dari SKD. Mulai dari panduan dan tryout SKB.", href: "skb.html" },
       { id: "pengumuman", title: "Pantau pengumuman peserta SKB", text: "Lolos ambang batas belum otomatis lolos ke SKB. Peserta SKB dipilih berdasarkan peringkat skor SKD di formasi yang sama (umumnya maksimal 3× jumlah kebutuhan formasi). Cek pengumuman resmi instansi.", href: "" },
       { id: "dokumen", title: "Siapkan dokumen & jadwal", text: "Catat jadwal, lokasi, dan syarat SKB (kartu ujian, KTP, dokumen tambahan). Beberapa instansi menambah wawancara, psikotes, atau praktik kerja.", href: "panduan.html" }]
    : [{ id: "fokus", title: `Fokus ke ${weakest.id.toUpperCase()}`, text: `${weakest.id.toUpperCase()} paling jauh dari ambang batas (${weakest.score} dari ambang ${weakest.pg}). Satu subtes di bawah ambang batas sudah membuat peserta gugur.`, href: "materi.html" },
       { id: "rencana", title: "Susun ulang rencana belajar", text: "Perbarui tanggal tes di profil ke perkiraan seleksi berikutnya, lalu ikuti rencana dan latihan harian.", href: "rencana.html" },
       { id: "akbar", title: "Ikut Tryout Akbar mingguan", text: "Ukur kemajuan tiap minggu dan bandingkan dengan peserta lain.", href: "akbar.html" }];
  out.analysis = { subtests, weakest: weakest.id, tryout, skdPart, skdWeight: 40, skbWeight: 60,
    scenarios: [60, 70, 80, 90].map((skb) => ({ skb, final: Math.round((skdPart + skb * 0.6) * 100) / 100 })), steps,
    note: "Perhitungan nilai akhir memakai bobot umum SKD 40% dan SKB 60%. Bobot dan komponen SKB bisa berbeda per instansi; ikuti pengumuman resmi." };
  return out;
}

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
      const list = (db.attempts || []).filter((x) => x.type !== "akbar" && x.type !== "skb");
      const a = list[list.length - 1];
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
/* ------------------------------------------------------------------ */
/* Fase 10.2: cache baca di browser + penggabungan permintaan           */
/* ------------------------------------------------------------------ */
// Action baca yang aman di-cache sebentar (detik). Disimpan di sessionStorage (hilang saat browser ditutup),
// per akun. Semua action lain dianggap TULIS dan langsung mengosongkan cache ini agar data selalu benar.
const READ_TTL = {
  getMe: 120, getToday: 45, getPlan: 300, getPlans: 300, getMaterialIndex: 600, getMaterial: 1800,
  getTryoutInfo: 30, getAkbarInfo: 60, getAkbarRanking: 300, getReferral: 120, getPostSkd: 300, getNotifPrefs: 300,
};
// Action baca yang tidak di-cache tetapi juga tidak mengubah data (tidak perlu mengosongkan cache).
const NEUTRAL = new Set(["ping", "logClientError", "getReport", "saveProgress"]);
const RC_PREFIX = "sc:rc:";
const inflight = new Map();

function cacheKey(action, payload) {
  const who = (auth.getUser && auth.getUser()?.email) || "anon";
  return RC_PREFIX + who + ":" + action + ":" + JSON.stringify(payload || {});
}
function rcGet(key, ttl) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Date.now() - v.at < ttl * 1000 ? v.data : null;
  } catch { return null; }
}
function rcSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* penuh/diblokir: abaikan */ }
}
export function clearReadCache() {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(RC_PREFIX)).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* abaikan */ }
}
function wrapError(e) {
  if (e.code === "UNAUTHENTICATED") { auth.logout(); clearReadCache(); }
  return { ok: false, error: { code: e.code || "UNKNOWN", message: e.message || "Terjadi kesalahan." } };
}

export const api = {
  /**
   * @param {string} action  nama action, lihat docs/api-contract.md
   * @param {object} payload data yang dikirim
   * @param {{fresh?: boolean}} opts fresh = abaikan cache baca
   * @returns {Promise<{ok: boolean, data?: any, error?: {code: string, message: string}}>}
   */
  async call(action, payload = {}, opts = {}) {
    const ttl = READ_TTL[action];
    const key = ttl ? cacheKey(action, payload) : null;
    if (key && !opts.fresh) {
      const hit = rcGet(key, ttl);
      if (hit !== null) return { ok: true, data: hit };
      if (inflight.has(key)) return inflight.get(key); // permintaan sama sedang berjalan: tunggu hasilnya
    }
    if (!ttl && !NEUTRAL.has(action)) clearReadCache(); // aksi tulis: data baca lama tidak dipakai lagi
    const run = (async () => {
      try {
        const data = CONFIG.USE_MOCK ? await callMock(action, payload) : await callRemote(action, payload);
        if (key) rcSet(key, data);
        if (!ttl && !NEUTRAL.has(action)) clearReadCache(); // juga setelah selesai (hasil server sudah berubah)
        return { ok: true, data };
      } catch (e) {
        return wrapError(e);
      } finally {
        if (key) inflight.delete(key);
      }
    })();
    if (key) inflight.set(key, run);
    return run;
  },

  /**
   * Beberapa action BACA dalam satu permintaan ke server (lihat BATCHABLE di Router.gs).
   * Hasil dari cache dipakai bila ada; sisanya dikirim sekaligus. Urutan hasil = urutan calls.
   * @param {{action: string, payload?: object}[]} calls
   */
  async batch(calls, opts = {}) {
    const out = new Array(calls.length);
    const need = [];
    calls.forEach((c, i) => {
      const ttl = READ_TTL[c.action];
      const hit = ttl && !opts.fresh ? rcGet(cacheKey(c.action, c.payload || {}), ttl) : null;
      if (hit !== null) out[i] = { ok: true, data: hit }; else need.push(i);
    });
    if (!need.length) return out;
    if (need.length === 1 || CONFIG.USE_MOCK) {
      await Promise.all(need.map(async (i) => { out[i] = await api.call(calls[i].action, calls[i].payload || {}, { fresh: true }); }));
      return out;
    }
    try {
      const results = await callRemote("batch", { calls: need.map((i) => ({ action: calls[i].action, payload: calls[i].payload || {} })) });
      need.forEach((i, j) => {
        const r = results[j] || { ok: false, error: { code: "UNKNOWN", message: "Tidak ada jawaban." } };
        if (r.ok && READ_TTL[calls[i].action]) rcSet(cacheKey(calls[i].action, calls[i].payload || {}), r.data);
        if (!r.ok && r.error?.code === "UNAUTHENTICATED") { auth.logout(); clearReadCache(); }
        out[i] = r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
      });
    } catch (e) {
      // Backend lama tanpa action "batch": jatuh ke panggilan satu per satu (paralel)
      if (e.code === "UNKNOWN_ACTION") {
        await Promise.all(need.map(async (i) => { out[i] = await api.call(calls[i].action, calls[i].payload || {}, { fresh: true }); }));
      } else {
        const err = wrapError(e);
        need.forEach((i) => (out[i] = err));
      }
    }
    return out;
  },

  get isMock() {
    return CONFIG.USE_MOCK;
  },
};
