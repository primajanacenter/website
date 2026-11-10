/**
 * Payment.gs — pembayaran Premium melalui Mayar.id API V2 (Fase 5).
 *
 * Alur:
 *  1. Frontend memanggil createCheckout { planId }. Harga & durasi diambil dari sheet "plans" (server),
 *     bukan dari frontend.
 *  2. Server mencatat transaksi "pending", lalu membuat payment request di Mayar
 *     (POST /hl/v2/payments/create) dan mengembalikan link pembayaran.
 *  3. Premium diaktifkan HANYA setelah server memastikan status "paid" langsung ke API Mayar
 *     (GET /hl/v2/payments/{id}). Pemicunya bisa salah satu dari:
 *       a. webhook Mayar (Webhook.gs) — isi webhook tidak dipercaya, hanya sebagai pemicu;
 *       b. halaman status pembayaran (getPaymentStatus);
 *       c. pengecekan otomatis setiap 15 menit (reconcilePayments di Triggers.gs).
 *  4. Aktivasi idempoten: kolom transactions.processed = "ya" mencegah premium ditambah dua kali.
 *
 * Script Properties (rahasia, jangan di repo):
 *   MAYAR_API_KEY   : API key Read & Write dari dashboard Mayar
 *   MAYAR_BASE_URL  : https://api.mayar.io (sandbox) atau https://api.mayar.id (production)
 *   WEBHOOK_TOKEN   : string acak panjang untuk URL webhook
 *   APP_BASE_URL    : (opsional) alamat situs, mis. https://siapcpns.primajana.id — untuk tombol kembali dari Mayar
 *   WEBAPP_URL      : (opsional) URL Web App /exec — dipakai registerMayarWebhook()
 */

var PAY_EXPIRE_HOURS = 24;          // masa berlaku link pembayaran
var PAY_REUSE_MINUTES = 30;         // link pending yang sama dipakai ulang bila diminta lagi dalam 30 menit
var PAY_MAX_PER_HOUR = 5;           // batas pembuatan checkout per pengguna per jam
var PAY_CHECK_THROTTLE_SEC = 15;    // jeda minimal cek status ke Mayar per transaksi

var DEFAULT_PLANS = [
  { plan_id: 'P1M', name: 'Premium 1 bulan', duration_days: 30, price: 49000, price_before: '', badge: '', description: 'Cocok untuk persiapan singkat menjelang tes.', status: 'active', order: 1 },
  { plan_id: 'P3M', name: 'Premium 3 bulan', duration_days: 90, price: 119000, price_before: 147000, badge: 'Paling populer', description: 'Waktu ideal untuk menutup topik lemah secara bertahap.', status: 'active', order: 2 },
  { plan_id: 'P6M', name: 'Premium 6 bulan', duration_days: 180, price: 179000, price_before: 294000, badge: 'Paling hemat', description: 'Untuk yang mulai jauh hari sampai hari-H SKD.', status: 'active', order: 3 }
];

/* ================= Paket ================= */

function getPlans_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('plans_v1');
  if (cached) return JSON.parse(cached);
  var list = readAll_('plans')
    .filter(function (p) { return String(p.status).toLowerCase() === 'active' && p.plan_id && Number(p.price) > 0 && Number(p.duration_days) > 0; })
    .map(function (p) {
      return {
        planId: String(p.plan_id).trim(),
        name: String(p.name || p.plan_id),
        durationDays: Number(p.duration_days),
        price: Math.round(Number(p.price)),
        priceBefore: isBlank_(p.price_before) ? null : Math.round(Number(p.price_before)),
        badge: String(p.badge || ''),
        description: String(p.description || ''),
        order: Number(p.order) || 99
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
  cache.put('plans_v1', JSON.stringify(list), 600);
  return list;
}

/** Jalankan dari editor setelah mengubah harga di sheet "plans" agar langsung berlaku. */
function refreshPlanCache() {
  CacheService.getScriptCache().remove('plans_v1');
  Logger.log('Paket aktif: ' + JSON.stringify(getPlans_()));
}

function seedPlans_() {
  if (readAll_('plans').length) return false;
  DEFAULT_PLANS.forEach(function (p) { insert_('plans', p); });
  return true;
}

function paymentEnv_() {
  var base = getConfigOptional_('MAYAR_BASE_URL', '');
  if (!base) return 'off';
  return /mayar\.io/.test(base) ? 'sandbox' : 'production';
}

/* ================= Handler ================= */

/** getPlans (auth optional): daftar paket + status premium & transaksi pending milik pengguna. */
function handleGetPlans_(payload, user) {
  var out = { plans: getPlans_(), env: paymentEnv_(), current: null, pending: null, history: [] };
  if (user) {
    out.current = { plan: user.plan, premiumUntil: user.premiumUntil };
    // Fase 8: diskon kode ajakan untuk pembelian pertama
    var pct = 0;
    try { pct = referralDiscountFor_(user); } catch (e) { pct = 0; }
    if (pct) {
      out.referral = { discountPct: pct };
      out.plans = out.plans.map(function (p) { return Object.assign({}, p, { refPrice: discountedPrice_(p.price, pct) }); });
    }
    var mine = findAll_('transactions', 'user_id', user.userId).slice(-5).reverse();
    out.history = mine.map(publicTrx_);
    var p = mine.filter(function (t) { return t.status === 'pending' && !isExpired_(t); })[0];
    out.pending = p ? publicTrx_(p) : null;
  }
  return out;
}

/** createCheckout (auth required): { planId } → { trxId, paymentUrl, expiresAt, reused } */
function handleCreateCheckout_(payload, user) {
  if (paymentEnv_() === 'off') throw new AppError_('PAYMENT_OFF', 'Pembayaran belum dibuka. Coba lagi nanti.');
  var planId = String(payload.planId || '').trim();
  var plan = getPlans_().filter(function (p) { return p.planId === planId; })[0];
  if (!plan) throw new AppError_('BAD_REQUEST', 'Paket tidak ditemukan.');

  var mine = findAll_('transactions', 'user_id', user.userId);
  var now = Date.now();
  var refPct = 0;
  try { refPct = referralDiscountFor_(user); } catch (e) { refPct = 0; }
  var amount = discountedPrice_(plan.price, refPct);
  // Pakai ulang link yang masih berlaku untuk paket & nominal yang sama (hindari tagihan ganda)
  var reuse = mine.filter(function (t) {
    return t.status === 'pending' && t.plan_id === plan.planId && Number(t.amount) === amount && t.payment_url && !isExpired_(t) &&
      now - new Date(t.created_at).getTime() < PAY_REUSE_MINUTES * 60000;
  }).pop();
  if (reuse) return { trxId: reuse.trx_id, paymentUrl: reuse.payment_url, expiresAt: reuse.expires_at, reused: true };

  var lastHour = mine.filter(function (t) { return now - new Date(t.created_at).getTime() < 3600000; }).length;
  if (lastHour >= PAY_MAX_PER_HOUR) throw new AppError_('RATE_LIMITED', 'Terlalu banyak permintaan pembayaran. Coba lagi dalam satu jam.');

  var trxId = newId_('trx');
  var expiresAt = new Date(now + PAY_EXPIRE_HOURS * 3600000).toISOString();
  withLock_(function () {
    insert_('transactions', {
      trx_id: trxId, user_id: user.userId, email: user.email, plan_id: plan.planId, plan_name: plan.name,
      duration_days: plan.durationDays, amount: amount, status: 'pending', created_at: nowIso_(),
      expires_at: expiresAt, processed: 'tidak',
      ref_code: refPct ? String((myReferral_(user.userId) || {}).code || '') : '', discount: refPct ? plan.price - amount : ''
    });
  });

  var body = {
    name: 'Siap CPNS – ' + plan.name,
    amount: amount,
    email: user.email,
    description: plan.name + ' (' + plan.durationDays + ' hari)' + (refPct ? ' · diskon ajakan ' + refPct + '%' : '') + ' · Ref ' + trxId,
    expiredAt: expiresAt
  };
  var base = getConfigOptional_('APP_BASE_URL', getConfigOptional_('ALLOWED_ORIGIN', ''));
  if (base) body.redirectUrl = base.replace(/\/+$/, '') + '/pages/status-bayar.html?trx=' + encodeURIComponent(trxId);

  var data;
  try {
    try {
      data = mayarRequest_('post', '/payments/create', body).data || {};
    } catch (err) {
      // Sebagian akun tidak mendukung redirectUrl pada payment request → ulangi tanpa redirectUrl
      if (body.redirectUrl && err.mayarMessage && /redirect/i.test(err.mayarMessage)) {
        delete body.redirectUrl;
        data = mayarRequest_('post', '/payments/create', body).data || {};
      } else {
        throw err;
      }
    }
    if (!data.link || !data.id) throw new AppError_('PAYMENT_ERROR', 'Layanan pembayaran tidak mengembalikan link pembayaran.');
  } catch (err) {
    var row = findOne_('transactions', 'trx_id', trxId);
    if (row) update_('transactions', row._row, { status: 'failed', note: cleanText_(err.message || 'gagal', 200) });
    throw err instanceof AppError_ ? err : new AppError_('PAYMENT_ERROR', 'Gagal membuat pembayaran. Coba lagi sebentar.');
  }

  var saved = findOne_('transactions', 'trx_id', trxId);
  update_('transactions', saved._row, {
    mayar_id: String(data.id), mayar_trx_id: String(data.transactionId || ''), payment_url: String(data.link)
  });
  return { trxId: trxId, paymentUrl: String(data.link), expiresAt: expiresAt, reused: false, redirect: Boolean(body.redirectUrl) };
}

/** getPaymentStatus (auth required): { trxId } → status terbaru (dicek ulang ke Mayar bila masih pending). */
function handleGetPaymentStatus_(payload, user) {
  var trx = findOne_('transactions', 'trx_id', String(payload.trxId || ''));
  if (!trx || trx.user_id !== user.userId) throw new AppError_('NOT_FOUND', 'Transaksi tidak ditemukan.');
  if (trx.status === 'pending') {
    var cache = CacheService.getScriptCache();
    var key = 'pchk_' + trx.trx_id;
    if (!cache.get(key)) {
      cache.put(key, '1', PAY_CHECK_THROTTLE_SEC);
      trx = syncTransaction_(trx, 'status-page');
    }
  }
  var fresh = findOne_('users', 'user_id', user.userId);
  var u = fresh ? toUser_(fresh, false) : user;
  return { transaction: publicTrx_(trx), plan: u.plan, premiumUntil: u.premiumUntil };
}

/* ================= Verifikasi & aktivasi ================= */

/**
 * Cek status transaksi langsung ke Mayar lalu aktifkan/tandai kedaluwarsa.
 * @returns {object} baris transaksi terbaru
 */
function syncTransaction_(trx, source) {
  if (trx.status !== 'pending') return trx;
  if (!trx.mayar_id) {
    if (isExpired_(trx)) return update_('transactions', trx._row, { status: 'expired' });
    return trx;
  }
  var v = verifyMayarPayment_(trx);
  if (v.paid) return fulfillTransaction_(trx.trx_id, source);
  if (v.closed || isExpired_(trx)) {
    return withLock_(function () {
      var again = findOne_('transactions', 'trx_id', trx.trx_id);
      if (again.status !== 'pending') return again;
      return update_('transactions', again._row, { status: 'expired', note: 'status Mayar: ' + v.status });
    });
  }
  return trx;
}

var PAID_STATUSES = ['paid', 'success', 'settled', 'settlement', 'completed'];

/** Tanyakan status ke Mayar. Tidak memakai isi webhook sama sekali. */
function verifyMayarPayment_(trx) {
  var res = mayarRequest_('get', '/payments/' + encodeURIComponent(trx.mayar_id)).data || {};
  var status = String(res.status || '').toLowerCase();
  var txs = Array.isArray(res.transactions) ? res.transactions : [];
  var paidTx = txs.some(function (t) { return PAID_STATUSES.indexOf(String(t.status || '').toLowerCase()) >= 0; });
  var paid = PAID_STATUSES.indexOf(status) >= 0 || paidTx;

  // Cadangan: cek detail transaksi bila payment request belum menunjukkan lunas
  if (!paid && trx.mayar_trx_id) {
    try {
      var t = mayarRequest_('get', '/transactions/' + encodeURIComponent(trx.mayar_trx_id)).data || {};
      if (PAID_STATUSES.indexOf(String(t.status || '').toLowerCase()) >= 0) { paid = true; status = 'paid'; }
    } catch (err) { /* transaksi belum dibuat Mayar sebelum pelanggan memilih metode: abaikan */ }
  }
  // Nominal harus sesuai tagihan
  if (paid && res.amount !== undefined && Number(res.amount) < Number(trx.amount)) {
    console.warn('Nominal Mayar lebih kecil dari tagihan untuk ' + trx.trx_id);
    paid = false; status = 'amount_mismatch';
  }
  return { paid: paid, status: status || 'unknown', closed: status === 'closed' || status === 'expired' };
}

/** Aktifkan premium untuk transaksi lunas. Aman dipanggil berkali-kali. */
function fulfillTransaction_(trxId, source) {
  return withLock_(function () {
    var trx = findOne_('transactions', 'trx_id', trxId);
    if (!trx) throw new AppError_('NOT_FOUND', 'Transaksi tidak ditemukan.');
    if (trx.processed === 'ya') return trx;
    var userRow = findOne_('users', 'user_id', trx.user_id);
    if (!userRow) throw new Error('User transaksi tidak ditemukan: ' + trx.user_id);
    var now = Date.now();
    var current = userRow.premium_until ? new Date(userRow.premium_until).getTime() : 0;
    var base = isPremiumActive_(userRow) && current > now ? current : now;
    var until = new Date(base + Number(trx.duration_days) * 86400000).toISOString();
    update_('users', userRow._row, { plan: 'premium', premium_until: until });
    var done = update_('transactions', trx._row, {
      status: 'paid', paid_at: nowIso_(), processed: 'ya', premium_until: until, source: source || ''
    });
    // Fase 8: bonus untuk pengajak (sekali, pada pembelian pertama). Gagal di sini tidak boleh membatalkan aktivasi.
    try { rewardReferralLocked_(done); } catch (e) { console.warn('Bonus ajakan gagal untuk ' + trxId + ': ' + (e && e.message)); }
    return done;
  });
}

function isExpired_(trx) {
  return trx.expires_at && new Date(trx.expires_at).getTime() < Date.now();
}

function publicTrx_(t) {
  return {
    trxId: t.trx_id, planId: t.plan_id, planName: t.plan_name, amount: Number(t.amount) || 0,
    status: t.status, paymentUrl: t.status === 'pending' ? t.payment_url : '',
    createdAt: t.created_at, expiresAt: t.expires_at, paidAt: t.paid_at || '', premiumUntil: t.premium_until ? toIsoDate_(t.premium_until) : ''
  };
}

/* ================= Klien API Mayar ================= */

function mayarBase_() {
  return getConfig_('MAYAR_BASE_URL').replace(/\/+$/, '').replace(/\/hl\/v[12]$/, '') + '/hl/v2';
}

function mayarRequest_(method, path, body) {
  var opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + getConfig_('MAYAR_API_KEY') },
    muteHttpExceptions: true
  };
  if (body) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(mayarBase_() + path, opts);
  var code = res.getResponseCode();
  var json = {};
  try { json = JSON.parse(res.getContentText() || '{}'); } catch (e) { json = {}; }
  var bodyCode = Number(json.statusCode) || code;   // di V2, statusCode di body yang menentukan
  if (code === 429 || bodyCode === 429) throw new AppError_('RATE_LIMITED', 'Layanan pembayaran sedang sibuk. Coba lagi sebentar.');
  if (code >= 400 || bodyCode >= 400) {
    var msg = String(json.messages || json.message || '');
    console.warn('Mayar ' + method.toUpperCase() + ' ' + path + ' → ' + code + '/' + bodyCode + ' ' + msg);
    var err = new AppError_('PAYMENT_ERROR', 'Gagal menghubungi layanan pembayaran. Coba lagi sebentar.');
    err.mayarMessage = msg; err.httpCode = bodyCode;
    throw err;
  }
  return json;
}

/* ================= Fungsi admin (jalankan dari editor) ================= */

/** Daftarkan URL webhook ke Mayar. Isi Script Property WEBAPP_URL (berakhiran /exec) dulu. */
function registerMayarWebhook() {
  var url = getConfig_('WEBAPP_URL').replace(/\?.*$/, '') + '?hook=mayar&token=' + encodeURIComponent(getConfig_('WEBHOOK_TOKEN'));
  mayarRequest_('post', '/webhooks/update', { urlHook: url });
  Logger.log('Webhook terdaftar (' + paymentEnv_() + '). URL berakhiran: …?hook=mayar&token=***');
}

/** Cek konfigurasi pembayaran tanpa menampilkan nilai rahasia. */
function checkPaymentConfig() {
  ['MAYAR_API_KEY', 'MAYAR_BASE_URL', 'WEBHOOK_TOKEN', 'APP_BASE_URL', 'WEBAPP_URL'].forEach(function (k) {
    Logger.log(k + ': ' + (getConfigOptional_(k, '') ? 'terisi' : 'BELUM DIISI'));
  });
  Logger.log('Mode pembayaran: ' + paymentEnv_());
  var token = getConfigOptional_('WEBHOOK_TOKEN', '');
  if (token && token.length < 24) Logger.log('PERINGATAN: WEBHOOK_TOKEN sebaiknya minimal 24 karakter acak.');
  Logger.log('Paket aktif: ' + getPlans_().map(function (p) { return p.planId + ' Rp' + p.price; }).join(', '));
}

/** Cetak token acak untuk WEBHOOK_TOKEN (salin ke Script Properties). */
function generateWebhookToken() {
  Logger.log(Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
}

/** Cek ulang satu transaksi ke Mayar. Ganti nilai TRX_ID lalu jalankan. */
function adminRecheckTransaction() {
  var TRX_ID = 'trx_xxxxxxxxxxxxxxxx';
  var trx = findOne_('transactions', 'trx_id', TRX_ID);
  if (!trx) return Logger.log('Transaksi tidak ditemukan');
  Logger.log(JSON.stringify(publicTrx_(syncTransaction_(trx, 'admin'))));
}

/**
 * Beri/perpanjang premium manual (mis. kompensasi). Ganti EMAIL dan DAYS lalu jalankan.
 * Tercatat di sheet transactions dengan amount 0 dan source "admin".
 */
function adminGrantPremium() {
  var EMAIL = 'nama@contoh.com';
  var DAYS = 30;
  var u = findOne_('users', 'email', EMAIL.toLowerCase());
  if (!u) return Logger.log('Pengguna tidak ditemukan');
  var trxId = newId_('trx');
  withLock_(function () {
    insert_('transactions', {
      trx_id: trxId, user_id: u.user_id, email: u.email, plan_id: 'ADMIN', plan_name: 'Pemberian manual ' + DAYS + ' hari',
      duration_days: DAYS, amount: 0, status: 'pending', created_at: nowIso_(), expires_at: '', processed: 'tidak'
    });
  });
  var t = fulfillTransaction_(trxId, 'admin');
  Logger.log('Premium ' + EMAIL + ' s.d. ' + t.premium_until);
}
