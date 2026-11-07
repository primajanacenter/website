/**
 * auth.js — sesi login pengguna.
 *
 * Fase 0–1: belum ada login. Semua fungsi mengembalikan status "belum login".
 * Fase 2  : tambahkan Google Identity Services (Sign in with Google):
 *   1. Muat https://accounts.google.com/gsi/client di halaman login.
 *   2. Saat callback, simpan credential (ID token) lewat setSession().
 *   3. api.js otomatis mengirim token ini di setiap permintaan.
 *   4. Apps Script WAJIB memverifikasi token di server (lihat backend/apps-script/Auth.gs).
 *
 * Catatan: token ini bukan rahasia aplikasi, tapi milik pengguna.
 * Jangan pernah mempercayai data profil dari frontend; server yang memutuskan.
 */

import { store, KEYS } from "./store.js";

export const auth = {
  getSession() {
    const s = store.get(KEYS.SESSION);
    if (!s || !s.token || (s.expiresAt && Date.now() > s.expiresAt)) return null;
    return s;
  },

  getToken() {
    return this.getSession()?.token || null;
  },

  isLoggedIn() {
    return Boolean(this.getSession());
  },

  /** Dipanggil di Fase 2 setelah Google Sign-In berhasil. */
  setSession({ token, expiresAt, user }) {
    store.set(KEYS.SESSION, { token, expiresAt, user });
  },

  logout() {
    store.remove(KEYS.SESSION);
  },
};
