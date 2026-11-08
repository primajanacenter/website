/**
 * config.js — konfigurasi frontend.
 *
 * PENTING: file ini ada di repo PUBLIK dan bisa dibaca siapa pun.
 * Hanya isi dengan nilai yang memang aman untuk publik.
 *
 *  BOLEH di sini : URL Web App Apps Script, Google OAuth Client ID, nama aplikasi.
 *  DILARANG      : API key Mayar, token webhook, ID Spreadsheet, password apa pun.
 *                  Semua rahasia disimpan di Script Properties (Apps Script).
 */

export const CONFIG = {
  APP_NAME: "Siap CPNS",
  APP_SHORT: "SC",
  ORG_NAME: "Primajana",          // lembaga induk (logo: assets/img/primajana-*.png)
  APP_VERSION: "0.2.0",

  // Fase 0–1: true (data contoh, tanpa backend).
  // Fase 2  : ubah ke false setelah Web App Apps Script di-deploy.
  USE_MOCK: true,

  // Diisi di Fase 2: URL dari Deploy > Web app (berakhiran /exec).
  APPS_SCRIPT_URL: "",

  // Diisi di Fase 2: OAuth Client ID dari Google Cloud Console (untuk Google Sign-In).
  GOOGLE_CLIENT_ID: "",

  // Opsional (Fase 1): link Google Form untuk daftar tunggu sebelum fitur akun siap.
  // Kosongkan jika belum ada; tombol daftar tunggu akan disembunyikan.
  WAITLIST_URL: "",

  // Batas waktu permintaan ke backend (ms).
  REQUEST_TIMEOUT: 20000,

  // Tautan resmi yang ditampilkan di aplikasi.
  OFFICIAL_LINKS: {
    sscasn: "https://sscasn.bkn.go.id",
    bkn: "https://www.bkn.go.id",
    menpan: "https://www.menpan.go.id",
  },
};
