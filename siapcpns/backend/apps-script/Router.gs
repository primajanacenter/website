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
    getReport:      { handler: handleGetReport_,      auth: 'required' },

    // Fase 4
    getToday:       { handler: handleGetToday_,       auth: 'required' },
    startPractice:  { handler: handleStartPractice_,  auth: 'required' },
    answerPractice: { handler: handleAnswerPractice_, auth: 'required' },

    // Fase 5
    getPlans:         { handler: handleGetPlans_,         auth: 'optional' },
    createCheckout:   { handler: handleCreateCheckout_,   auth: 'required' },
    getPaymentStatus: { handler: handleGetPaymentStatus_, auth: 'required' },

    // Fase 6
    getMaterialIndex: { handler: handleGetMaterialIndex_, auth: 'optional' },
    getMaterial:      { handler: handleGetMaterial_,      auth: 'optional' },
    getPlan:          { handler: handleGetPlan_,          auth: 'required' },

    // Fase 7
    getAkbarInfo:     { handler: handleGetAkbarInfo_,     auth: 'optional' },
    joinAkbar:        { handler: handleJoinAkbar_,        auth: 'required' },
    getAkbarRanking:  { handler: handleGetAkbarRanking_,  auth: 'optional' },
    loadProbe:        { handler: handleLoadProbe_,        auth: 'none' },

    // Fase 8
    getPostSkd:       { handler: handleGetPostSkd_,       auth: 'required' },
    saveSkdResult:    { handler: handleSaveSkdResult_,    auth: 'required' },
    getReferral:      { handler: handleGetReferral_,      auth: 'required' },
    claimReferral:    { handler: handleClaimReferral_,    auth: 'required' },

    // Fase 9
    logClientError:   { handler: handleLogClientError_,   auth: 'none' },

    // Fase 10
    getNotifPrefs:    { handler: handleGetNotifPrefs_,    auth: 'required' },
    saveNotifPrefs:   { handler: handleSaveNotifPrefs_,   auth: 'required' },

    // Fase 12: Super User Dashboard (hanya ADMIN_EMAILS)
    getAdminDashboard: { handler: handleGetAdminDashboard_, auth: 'required' },
    adminTransactions: { handler: handleAdminTransactions_, auth: 'required' },
    adminLookupUser:   { handler: handleAdminLookupUser_,   auth: 'required' },

    // Fase 13: menu A–F, produk satuan, member area
    getTryoutCatalog:   { handler: handleGetTryoutCatalog_,   auth: 'optional' },
    getMateriIndex:     { handler: handleGetMateriIndex_,     auth: 'optional' },
    getMateriTopic:     { handler: handleGetMateriTopic_,     auth: 'optional' },
    getTopicPractice:   { handler: handleGetTopicPractice_,   auth: 'optional' },
    getMentoring:       { handler: handleGetMentoring_,       auth: 'optional' },
    joinLive:           { handler: handleJoinLive_,           auth: 'required' },
    getRecording:       { handler: handleGetRecording_,       auth: 'required' },
    getConsultSlots:    { handler: handleGetConsultSlots_,    auth: 'optional' },
    getConsultChat:     { handler: handleGetConsultChat_,     auth: 'required' },
    sendConsultMessage: { handler: handleSendConsultMessage_, auth: 'required' },
    getConsultDesk:     { handler: handleGetConsultDesk_,     auth: 'required' },
    getMyItems:         { handler: handleGetMyItems_,         auth: 'required' },
    getRaporHub:        { handler: handleGetRaporHub_,        auth: 'required' }
  };
}

function doGet(e) {
  // Fase 10: tautan berhenti langganan dari email pengingat
  if (e && e.parameter && e.parameter.unsub) {
    try { return handleUnsubscribe_(e); } catch (err) { console.error(err); return HtmlService.createHtmlOutput('<p>Terjadi kesalahan. Coba lagi nanti atau atur di halaman Pengaturan aplikasi.</p>'); }
  }
  return json_({ ok: true, data: { status: 'ok', service: 'siap-cpns-api', time: new Date().toISOString() } });
}

function doPost(e) {
  var body = null;
  resetMemo_();
  try {
    // Webhook Mayar (Fase 5)
    if (e && e.parameter && e.parameter.hook === 'mayar') {
      return json_(handleMayarWebhook_(e));
    }

    body = parseBody_(e);
    if (body.action === 'batch') return json_({ ok: true, data: runBatch_(body) });
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
    if (!(err instanceof AppError_)) {
      console.error('Action ' + (body && body.action) + ' gagal');
      logServerError_(body && body.action, err); // Fase 9: tercatat di sheet error_log
    }
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

/* ---------------- Fase 10.2: batch ---------------- */

/**
 * Beberapa action BACA dalam satu permintaan HTTP (hemat 1–3 detik per action tambahan di Apps Script).
 * payload: { calls: [{ action, payload }] } (maks 6) → data: [{ ok, data } | { ok:false, error }]
 * Token diverifikasi sekali. Hanya action baca (tanpa efek samping) yang boleh digabung.
 */
var BATCHABLE = {
  ping: 1, getMe: 1, getToday: 1, getPlan: 1, getPlans: 1, getMaterialIndex: 1, getTryoutInfo: 1,
  getAkbarInfo: 1, getAkbarRanking: 1, getReferral: 1, getPostSkd: 1, getNotifPrefs: 1,
  getTryoutCatalog: 1, getMateriIndex: 1, getTopicPractice: 1, getMentoring: 1, getConsultSlots: 1, getMyItems: 1, getRaporHub: 1
};
var BATCH_MAX = 6;

function runBatch_(body) {
  var calls = body.payload && Array.isArray(body.payload.calls) ? body.payload.calls : null;
  if (!calls || !calls.length || calls.length > BATCH_MAX) throw new AppError_('BAD_REQUEST', 'Batch harus berisi 1–' + BATCH_MAX + ' permintaan.');
  var routes = getRoutes_();
  var user = null, authErr = null;
  if (body.token) {
    try { user = verifyUser_(body.token); } catch (err) { authErr = err; }
  }
  return calls.map(function (c) {
    var action = c && String(c.action || '');
    try {
      var route = routes[action];
      if (!route || !BATCHABLE[action]) throw new AppError_('BAD_REQUEST', 'Action "' + action + '" tidak bisa digabung.');
      if (route.auth === 'required' && !user) throw authErr instanceof AppError_ ? authErr : new AppError_('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
      return { ok: true, data: route.handler((c && c.payload) || {}, route.auth === 'none' ? null : user) };
    } catch (err) {
      if (!(err instanceof AppError_)) logServerError_('batch:' + action, err);
      return errorBody_(err);
    }
  });
}
