/**
 * Router.gs — pintu masuk Web App.
 *
 * Frontend mengirim POST (Content-Type: text/plain) dengan body:
 *   { "action": "namaAction", "payload": {...}, "token": "<Google ID token atau null>" }
 * Balasan selalu:
 *   { "ok": true, "data": ... }  atau  { "ok": false, "error": { "code": "...", "message": "..." } }
 *
 * Webhook Mayar (Fase 5) masuk ke URL yang sama dengan ?hook=mayar&token=...
 * Lihat docs/api-contract.md untuk daftar action.
 */

/**
 * Daftar action. auth:
 *  - "none"     : tanpa login
 *  - "optional" : jika ada token, diverifikasi dan user dikirim ke handler; jika tidak, user = null
 *  - "required" : wajib login
 * Dibuat sebagai fungsi (bukan variabel global) agar semua handler di file lain sudah terdefinisi.
 */
function getRoutes_() {
  return {
    ping:           { handler: handlePing_,           auth: 'none' },

    // Fase 2
    joinWaitlist:   { handler: handleJoinWaitlist_,   auth: 'none' },
    saveAssessment: { handler: handleSaveAssessment_, auth: 'optional' },
    login:          { handler: handleLogin_,          auth: 'required' },
    getMe:          { handler: handleGetMe_,          auth: 'required' },
    saveProfile:    { handler: handleSaveProfile_,    auth: 'required' },

    // Fase 3
    getTryoutInfo:  { handler: handleGetTryoutInfo_,  auth: 'required' },
    startAttempt:   { handler: handleStartAttempt_,   auth: 'required' },
    saveProgress:   { handler: handleSaveProgress_,   auth: 'required' },
    submitAttempt:  { handler: handleSubmitAttempt_,  auth: 'required' },
    getReport:      { handler: handleGetReport_,      auth: 'required' }

    // Fase 5
    // createCheckout:   { handler: handleCreateCheckout_,   auth: 'required' },
    // getPaymentStatus: { handler: handleGetPaymentStatus_, auth: 'required' }
  };
}

function doGet(e) {
  return json_({ ok: true, data: { status: 'ok', service: 'siap-cpns-api', time: new Date().toISOString() } });
}

function doPost(e) {
  try {
    // Webhook Mayar (Fase 5)
    if (e && e.parameter && e.parameter.hook === 'mayar') {
      return json_(handleMayarWebhook_(e));
    }

    var body = parseBody_(e);
    var route = getRoutes_()[body.action];
    if (!route) throw new AppError_('UNKNOWN_ACTION', 'Action "' + body.action + '" tidak dikenal.');

    var user = null;
    if (route.auth === 'required') {
      user = verifyUser_(body.token);
    } else if (route.auth === 'optional' && body.token) {
      try { user = verifyUser_(body.token); } catch (err) { user = null; }
    }

    var data = route.handler(body.payload || {}, user);
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_(errorBody_(err));
  }
}

/* ---------------- Handler ---------------- */

function handlePing_(payload) {
  return { status: 'ok', mode: 'apps-script', time: new Date().toISOString() };
}

/* ---------------- Utilitas ---------------- */

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new AppError_('BAD_REQUEST', 'Body permintaan kosong.');
  }
  if (e.postData.contents.length > 100000) {
    throw new AppError_('BAD_REQUEST', 'Permintaan terlalu besar.');
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new AppError_('BAD_REQUEST', 'Body bukan JSON yang valid.');
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function AppError_(code, message) {
  this.code = code;
  this.message = message;
}

function errorBody_(err) {
  if (err instanceof AppError_) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  console.error(err && err.stack ? err.stack : err);
  // Jangan bocorkan detail error internal ke pengguna.
  return { ok: false, error: { code: 'SERVER_ERROR', message: 'Terjadi kesalahan di server. Coba lagi sebentar.' } };
}
