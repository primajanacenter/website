/**
 * auth.js — sesi login pengguna (Fase 2: Google Sign-In).
 *
 * Alur:
 *  1. pages/masuk.html menampilkan tombol "Sign in with Google" (Google Identity Services).
 *  2. Google mengembalikan ID token (JWT). setFromCredential() menyimpannya sebagai sesi.
 *  3. api.js mengirim token ini di setiap permintaan; Apps Script memverifikasinya di server.
 *  4. ID token Google berlaku ± 1 jam. Setelah itu pengguna diarahkan ke halaman masuk;
 *     pengguna yang pernah masuk akan login otomatis (auto select) tanpa mengetik ulang.
 *
 * Catatan keamanan: isi token didekode di sini HANYA untuk tampilan (nama, foto, masa berlaku).
 * Keputusan siapa pengguna dan apa haknya selalu dibuat oleh server.
 */

import { store, KEYS } from "./store.js";

const EXPIRY_MARGIN_MS = 60 * 1000; // anggap kedaluwarsa 1 menit lebih awal

function decodeJwt(token) {
  try {
    const part = token.split(".")[1];
    const json = decodeURIComponent(
      atob(part.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const auth = {
  getSession() {
    const s = store.get(KEYS.SESSION);
    if (!s || !s.token) return null;
    if (s.expiresAt && Date.now() > s.expiresAt - EXPIRY_MARGIN_MS) return null;
    return s;
  },

  getToken() {
    return this.getSession()?.token || null;
  },

  isLoggedIn() {
    return Boolean(this.getSession());
  },

  /** Pernah login di perangkat ini (meski token sudah kedaluwarsa). */
  hasPreviousSession() {
    return Boolean(store.get(KEYS.SESSION)?.user);
  },

  getUser() {
    return store.get(KEYS.SESSION)?.user || null;
  },

  /** Simpan sesi dari credential Google Sign-In. */
  setFromCredential(credential) {
    const claims = decodeJwt(credential);
    if (!claims) throw new Error("Credential tidak valid");
    const session = {
      token: credential,
      expiresAt: claims.exp ? claims.exp * 1000 : Date.now() + 55 * 60 * 1000,
      user: { email: claims.email, name: claims.name || claims.email, picture: claims.picture || "" },
    };
    store.set(KEYS.SESSION, session);
    return session;
  },

  /** Simpan sesi uji coba (hanya dipakai saat USE_MOCK = true). */
  setMockSession(user) {
    store.set(KEYS.SESSION, {
      token: "mock.header.payload",
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      user,
    });
  },

  /** Perbarui data user yang ditampilkan (dari jawaban server). */
  updateUser(user) {
    const s = store.get(KEYS.SESSION);
    if (!s) return;
    s.user = { ...s.user, ...user };
    store.set(KEYS.SESSION, s);
  },

  logout() {
    store.remove(KEYS.SESSION);
    store.remove(KEYS.ME);
    try { Object.keys(sessionStorage).filter((k) => k.startsWith("sc:rc:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* abaikan */ }
    try {
      window.google?.accounts?.id?.disableAutoSelect();
    } catch {
      /* abaikan */
    }
  },

  /**
   * Pastikan pengguna sudah login. Jika belum, arahkan ke halaman masuk
   * lalu kembali ke halaman ini setelah berhasil.
   * @param {string} loginUrl path relatif ke masuk.html dari halaman saat ini
   * @returns {boolean} true jika sudah login
   */
  requireLogin(loginUrl = "masuk.html") {
    if (this.isLoggedIn()) return true;
    const next = location.pathname.split("/").pop() + location.search;
    location.replace(`${loginUrl}?next=${encodeURIComponent(next)}`);
    return false;
  },
};

export { decodeJwt };
