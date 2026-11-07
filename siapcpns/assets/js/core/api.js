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
};

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
      return { ok: false, error: { code: e.code || "UNKNOWN", message: e.message || "Terjadi kesalahan." } };
    }
  },

  get isMock() {
    return CONFIG.USE_MOCK;
  },
};
