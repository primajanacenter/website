/**
 * analytics.js: Google Analytics 4 (gtag.js) untuk Siap CPNS.
 *
 * Aktif hanya bila CONFIG.GA_MEASUREMENT_ID diisi (format "G-XXXXXXXXXX").
 * Measurement ID memang bersifat publik, jadi aman ditaruh di config.js.
 *
 * Prinsip privasi:
 *  - Tidak pernah mengirim nama, email, token, userId, atau isi jawaban ke Google Analytics.
 *  - Parameter URL dibersihkan: hanya utm_* yang dikirim (token, trxId, next, dll dibuang).
 *  - Google Signals & personalisasi iklan dimatikan.
 *  - Tidak aktif di localhost dan halaman admin.
 *  - Pengguna bisa mematikan pelacakan di perangkatnya: localStorage "sc_ga_off" = "1".
 */
import { CONFIG } from "./config.js";

const ID = (CONFIG.GA_MEASUREMENT_ID || "").trim();
const OFF_KEY = "sc_ga_off";
const SENT_KEY = "sc_ga_purchases";
let ready = false;

function disabled() {
  if (!/^G-[A-Z0-9]+$/i.test(ID)) return true;
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return true;
  if (/admin\.html$/i.test(location.pathname)) return true;
  try { if (localStorage.getItem(OFF_KEY) === "1") return true; } catch { /* abaikan */ }
  return false;
}

/** URL tanpa data sensitif: hanya utm_* yang dipertahankan, hash dibuang. */
export function cleanUrl(href = location.href) {
  try {
    const u = new URL(href);
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => { if (/^utm_/i.test(k)) keep.set(k, v); });
    u.search = keep.toString();
    u.hash = "";
    return u.toString();
  } catch { return location.origin + location.pathname; }
}

/** Dipanggil sekali per halaman (dari hydrateCommon). */
export function initAnalytics() {
  if (ready || disabled()) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", ID, {
    send_page_view: false,
    page_location: cleanUrl(),
    page_referrer: document.referrer ? cleanUrl(document.referrer) : "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ID);
  document.head.appendChild(s);
  window.gtag("event", "page_view", { page_location: cleanUrl(), page_title: document.title });
}

/** Kirim event kustom. Parameter hanya boleh berisi data non-pribadi. */
export function track(name, params = {}) {
  if (!ready) return;
  try { window.gtag("event", name, params); } catch { /* abaikan */ }
}

function purchaseOnce(trx) {
  let sent = [];
  try { sent = JSON.parse(localStorage.getItem(SENT_KEY) || "[]"); } catch { /* abaikan */ }
  if (sent.includes(trx.trxId)) return;
  track("purchase", {
    transaction_id: trx.trxId,
    value: Number(trx.amount) || 0,
    currency: "IDR",
    items: [{ item_id: trx.planId || trx.kind, item_name: trx.planName || trx.kind, item_category: trx.kind, price: Number(trx.amount) || 0, quantity: 1 }],
  });
  try { localStorage.setItem(SENT_KEY, JSON.stringify(sent.concat(trx.trxId).slice(-50))); } catch { /* abaikan */ }
}

/** Dipanggil oleh api.call setelah aksi berhasil. Hanya aksi penting yang dicatat. */
export function trackApi(action, payload = {}, data = {}) {
  if (!ready) return;
  switch (action) {
    case "login": track(data && data.isNew ? "sign_up" : "login", { method: "Google" }); break;
    case "saveAssessment": track("cek_kesiapan_selesai"); break;
    case "startAttempt": track("tryout_mulai", { paket: payload.packageId || "" }); break;
    case "submitAttempt": track("tryout_selesai"); break;
    case "startPractice": case "getTopicPractice": track("latihan_mulai"); break;
    case "getMaterial": case "getMateriTopic": track("materi_dibuka"); break;
    case "joinAkbar": track("akbar_daftar"); break;
    case "startInterview": track("wawancara_mulai"); break;
    case "submitInterview": track("wawancara_selesai"); break;
    case "claimReferral": track("ajak_teman_klaim"); break;
    case "createCheckout": track("begin_checkout", { currency: "IDR", produk: payload.planId || payload.kind || "", ref: payload.refId || "" }); break;
    case "getPaymentStatus": {
      const t = data && data.transaction;
      if (t && t.status === "paid" && t.trxId) purchaseOnce(t);
      break;
    }
    default: break;
  }
}
