/**
 * store.js — penyimpanan lokal yang aman.
 *
 * localStorage bisa tidak tersedia (mode privat, diblokir browser),
 * jadi semua akses dibungkus try/catch dan ada cadangan di memori.
 * Jangan simpan data sensitif di sini; ini hanya untuk kenyamanan pengguna.
 */

const PREFIX = "sc:";
const memory = new Map();

export const store = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return memory.has(key) ? memory.get(key) : fallback;
    }
  },

  set(key, value) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    memory.delete(key);
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* abaikan */ }
  },
};

/** Kunci penyimpanan yang dipakai lintas fitur. */
export const KEYS = {
  ASSESSMENT_RESULT: "assessment.result",
  ASSESSMENT_DRAFT: "assessment.draft",
  DOC_CHECKLIST: "panduan.checklist",
  SESSION: "auth.session",          // Fase 2: token & data tampilan user
  ME: "auth.me",                    // Fase 2: cache profil dari server
  ONBOARDING_DRAFT: "onboarding.draft",
  REF_CODE: "referral.code",        // Fase 8: kode ajakan dari tautan ?ref=
};
