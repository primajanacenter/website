/**
 * login.js — halaman Masuk (Fase 2)
 *
 * - USE_MOCK = true  : tombol "Masuk dengan akun uji" (tanpa Google).
 * - USE_MOCK = false : tombol "Sign in with Google" (Google Identity Services).
 *
 * Setelah token didapat → api.call("login", { assessment }) → server membuat/mencari user,
 * menautkan hasil Cek Kesiapan lokal, lalu mengembalikan profil.
 * Arah selanjutnya: profil belum lengkap → onboarding.html, sudah lengkap → next / dashboard.html.
 */

import { CONFIG } from "../core/config.js";
import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, getParam, safeNext, pendingReferral } from "../core/ui.js";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const LEVEL_LABEL = { "baru-mulai": "Baru mulai", "sedang-bersiap": "Sedang bersiap", "hampir-siap": "Hampir siap" };

export function initLogin() {
  const next = safeNext(getParam("next"), "dashboard.html");

  // Sudah login & token masih berlaku → langsung lanjut
  if (auth.isLoggedIn() && store.get(KEYS.ME)) {
    location.replace(next);
    return;
  }

  if (auth.hasPreviousSession()) {
    $("#login-sub").textContent = "Sesi sebelumnya sudah berakhir. Masuk lagi untuk melanjutkan.";
  }

  const local = store.get(KEYS.ASSESSMENT_RESULT);
  if (local && !local.syncedAt) {
    $("#assessment-note").hidden = false;
    $("#note-score").textContent = local.total;
    $("#note-level").textContent = LEVEL_LABEL[local.levelId] || "";
  }

  if (CONFIG.USE_MOCK) {
    $("#gsi-button").hidden = true;
    // Akun uji hanya boleh dipakai saat pengembangan di komputer sendiri,
    // agar pengunjung situs produksi tidak masuk ke akun palsu.
    if (!isLocalhost()) {
      showStatus("Fitur masuk sedang disiapkan dan akan segera aktif. Hasil Cek Kesiapan-mu tetap tersimpan di perangkat ini.");
      return;
    }
    $("#mock-box").hidden = false;
    $("#btn-mock-login").addEventListener("click", () => {
      auth.setMockSession({ email: "uji@contoh.id", name: "Pengguna Uji", picture: "" });
      completeLogin(next);
    });
    return;
  }

  if (!CONFIG.GOOGLE_CLIENT_ID) {
    showStatus("GOOGLE_CLIENT_ID belum diisi di config.js.", true);
    return;
  }
  loadGsi()
    .then(() => renderGoogleButton(next))
    .catch(() => showStatus("Tombol Google tidak bisa dimuat. Periksa koneksi internet lalu muat ulang halaman.", true));
}

function isLocalhost() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GSI gagal dimuat"));
    document.head.appendChild(s);
  });
}

function renderGoogleButton(next) {
  const gid = window.google.accounts.id;
  gid.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: (resp) => onCredential(resp, next),
    auto_select: true,           // pengguna yang pernah masuk langsung login otomatis
    cancel_on_tap_outside: true,
    itp_support: true,
    use_fedcm_for_prompt: true,
  });
  const box = $("#gsi-button");
  gid.renderButton(box, {
    type: "standard",
    theme: "filled_blue",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    locale: "id",
    width: Math.min(360, box.clientWidth || 320),
  });
  gid.prompt(); // One Tap: muncul otomatis untuk pengguna yang pernah masuk
}

function onCredential(resp, next) {
  if (!resp?.credential) {
    showStatus("Login dibatalkan. Coba lagi.", true);
    return;
  }
  try {
    auth.setFromCredential(resp.credential);
  } catch {
    showStatus("Data login dari Google tidak valid. Coba lagi.", true);
    return;
  }
  completeLogin(next);
}

async function completeLogin(next) {
  showStatus("Menyiapkan akunmu…");
  const local = store.get(KEYS.ASSESSMENT_RESULT);
  const payload = {};
  if (local && !local.syncedAt) {
    payload.assessment = {
      version: local.version,
      total: local.total,
      levelId: local.levelId,
      durationSec: local.durationSec || 0,
      aspects: (local.aspects || []).map(({ id, score }) => ({ id, score })),
      answers: local.answers || {},
      completedAt: local.completedAt,
    };
  }

  const ref = pendingReferral();
  if (ref) payload.ref = ref;

  const res = await api.call("login", payload);
  if (!res.ok) {
    showStatus(res.error.message, true);
    return;
  }

  const me = res.data;
  store.set(KEYS.ME, { ...me, fetchedAt: Date.now() });
  auth.updateUser(me.user);
  if (payload.assessment && me.attachedAssessmentId) {
    store.set(KEYS.ASSESSMENT_RESULT, { ...local, syncedAt: new Date().toISOString(), serverId: me.attachedAssessmentId });
  }

  if (ref) store.remove(KEYS.REF_CODE); // dipakai sekali; server mengabaikan kode yang tidak berlaku
  if (me.referralClaimed) store.set("referral.notice", { code: ref, at: Date.now() });

  location.replace(me.profileComplete ? next : `onboarding.html?next=${encodeURIComponent(next)}`);
}

function showStatus(msg, isError = false) {
  const el = $("#login-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}
