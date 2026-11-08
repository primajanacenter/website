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

function requireMockSession() {
  if (!auth.isLoggedIn()) throw apiError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
}
function mockDb() {
  return store.get("mock.db", { user: null, profile: null, assessments: [] });
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
