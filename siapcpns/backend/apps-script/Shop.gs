/**
 * Shop.gs — produk satuan & hak akses (Fase 13).
 *
 * Produk (dibayar lewat Mayar, alur sama dengan Premium — lihat Payment.gs):
 *   tryout  : satu paket tryout (DIAG-xx / paket Akbar yang sudah lewat)  · default Rp10.000 · bebas diulang
 *   akbar   : tiket satu event Tryout Akbar                              · default Rp10.000
 *   live    : tiket satu sesi Live Mentoring (Zoom)                        · harga per sesi (default Rp25.000) · kuota kursi
 *   rec     : akses satu rekaman mentoring                                · default Rp10.000
 *   consult : satu slot Konsultasi CPNS via chat (60 menit)               · default Rp30.000 · 1 slot = 1 orang
 * Premium (sheet plans) membuka Paket Materi & Paket Latihan Soal per Materi.
 *
 * Hak akses disimpan di sheet entitlements (satu baris per pembelian lunas). Aktivasi idempoten.
 * Harga bisa diubah lewat Script Properties: PRICE_TRYOUT, PRICE_AKBAR, PRICE_LIVE, PRICE_REC, PRICE_CONSULT.
 */

var PRODUCT_KINDS = ['tryout', 'akbar', 'live', 'rec', 'consult'];
var PRODUCT_LABEL = { tryout: 'Paket Tryout', akbar: 'Tiket Tryout Akbar', live: 'Tiket Live Mentoring', rec: 'Rekaman Mentoring', consult: 'Konsultasi CPNS' };
var PRODUCT_CODE = { tryout: 'TRYOUT', akbar: 'AKBAR', live: 'LIVE', rec: 'REKAMAN', consult: 'KONSUL' };
var PRODUCT_DEFAULT_PRICE = { tryout: 10000, akbar: 10000, live: 25000, rec: 10000, consult: 30000 };
var PRODUCT_HOLD_MIN = { tryout: 1440, akbar: 60, live: 60, rec: 1440, consult: 30 };   // masa berlaku link bayar
var DEFAULT_PRICING_V2_FROM = '2026-11-12T00:00:00+07:00';
var SELLABLE_TRYOUT_TYPES = ['diagnostic', 'premium'];

/** Topik yang terbuka gratis (judul teratas tiap subtes) di Paket Materi & Paket Latihan Soal. */
var TOPIC_ORDER = [
  'twk-nasionalisme', 'twk-integritas', 'twk-belanegara', 'twk-pancasila', 'twk-uud', 'twk-nkri', 'twk-bhinneka', 'twk-bahasa',
  'tiu-analogi', 'tiu-silogisme', 'tiu-analitis', 'tiu-deret', 'tiu-hitung', 'tiu-cerita', 'tiu-figural',
  'tkp-pelayanan', 'tkp-jejaring', 'tkp-sosbud', 'tkp-tik', 'tkp-profesionalisme', 'tkp-antiradikalisme'
];
var FREE_TOPICS = ['twk-nasionalisme', 'tiu-analogi', 'tkp-pelayanan'];

function isFreeTopic_(topicId) { return FREE_TOPICS.indexOf(topicId) >= 0; }

function productPrice_(kind, fromSheet) {
  var n = Number(fromSheet);
  if (n > 0) return Math.round(n);
  var prop = Number(getConfigOptional_('PRICE_' + kind.toUpperCase(), ''));
  return prop > 0 ? Math.round(prop) : PRODUCT_DEFAULT_PRICE[kind];
}

/* ================= Hak akses ================= */

/** Semua hak akses aktif milik pengguna (memo per permintaan). */
function userEntitlements_(userId) {
  var key = 'ent_' + userId;
  if (_memo[key]) return _memo[key];
  var list = [];
  try { list = findAll_('entitlements', 'user_id', userId).filter(function (e) { return String(e.status || 'active') === 'active'; }); }
  catch (e) { list = []; }   // sheet belum dibuat (jalankan setupSheets)
  _memo[key] = list;
  return list;
}

function owns_(user, kind, refId) {
  if (!user) return false;
  return userEntitlements_(user.userId).some(function (e) { return e.kind === kind && String(e.ref_id) === String(refId); });
}

/** Premium aktif yang dibeli sebelum harga baru: hak lama (paket tryout reguler terbuka) tetap berlaku sampai habis. */
function isLegacyPremium_(user) {
  if (!user || user.plan !== 'premium') return false;
  var key = 'legacy_' + user.userId;
  if (_memo.hasOwnProperty(key)) return _memo[key];
  var cut = new Date(getConfigOptional_('PRICING_V2_FROM', DEFAULT_PRICING_V2_FROM)).getTime();
  var legacy = findAll_('transactions', 'user_id', user.userId).some(function (t) {
    return t.status === 'paid' && isPremiumTrx_(t) && new Date(t.paid_at || t.created_at).getTime() < cut;
  });
  _memo[key] = legacy;
  return legacy;
}

/** Paket tryout yang dijual satuan: DIAG/premium, dan paket Akbar setelah semua event-nya terbit. */
function isSellableTryout_(pkg) {
  if (SELLABLE_TRYOUT_TYPES.indexOf(pkg.type) >= 0) return true;
  if (pkg.type !== 'akbar') return false;
  var evs = akbarEvents_().filter(function (e) { return e.package_id === pkg.packageId; });
  return evs.length > 0 && evs.every(function (e) { return e.status === 'published'; });
}

/** Boleh mengerjakan paket? → { ok, reason, message, price } */
function packageAccess_(pkg, user) {
  if (pkg.type === 'demo') return { ok: true };
  if (pkg.type === 'topik') {
    if (isFreeTopic_(pkg.topicId) || (user && user.plan === 'premium')) return { ok: true };
    return { ok: false, reason: 'PREMIUM_REQUIRED', message: 'Latihan soal topik ini khusus Premium. Berlangganan untuk membuka semua materi & latihan soal TWK, TIU, TKP.' };
  }
  if (pkg.type === 'skb') return { ok: true };
  if (isSellableTryout_(pkg)) {
    if (owns_(user, 'tryout', pkg.packageId) || ownsAkbarOfPackage_(user, pkg.packageId) || isLegacyPremium_(user)) return { ok: true };
    return { ok: false, reason: 'PAYMENT_REQUIRED', message: 'Beli paket ini (' + rupiah_(productPrice_('tryout')) + ') untuk mengerjakannya. Setelah dibeli, bebas diulang.', price: productPrice_('tryout') };
  }
  return { ok: false, reason: 'NOT_FOUND', message: 'Paket tryout tidak ditemukan atau belum dibuka.' };
}

/** Pemilik tiket Akbar otomatis memiliki paketnya setelah event selesai. */
function ownsAkbarOfPackage_(user, packageId) {
  if (!user) return false;
  var mine = userEntitlements_(user.userId).filter(function (e) { return e.kind === 'akbar'; });
  if (!mine.length) return false;
  var evIds = akbarEvents_().filter(function (e) { return e.package_id === packageId; }).map(function (e) { return e.event_id; });
  return mine.some(function (e) { return evIds.indexOf(String(e.ref_id)) >= 0; });
}

function rupiah_(n) { return 'Rp' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

/* ================= Produk & checkout ================= */

/** Data produk dari server (harga TIDAK pernah dari browser). */
function productInfo_(kind, refId) {
  var now = Date.now();
  if (kind === 'tryout') {
    var pkg = getPackage_(refId);
    if (!isSellableTryout_(pkg)) throw new AppError_('BAD_REQUEST', 'Paket ini tidak dijual satuan.');
    return { name: pkg.title, amount: productPrice_('tryout'), desc: 'Paket tryout ' + pkg.title + ' (bebas diulang)' };
  }
  if (kind === 'akbar') {
    var ev = akbarEvents_().filter(function (e) { return e.event_id === refId; })[0];
    if (!ev) throw new AppError_('NOT_FOUND', 'Tryout Akbar tidak ditemukan.');
    var st = akbarState_(ev, now);
    if (st !== 'upcoming' && st !== 'open') throw new AppError_('CLOSED', 'Pendaftaran Tryout Akbar ini sudah ditutup.');
    return { name: 'Tiket ' + (ev.title || 'Tryout Akbar') + ' · ' + fmtJkt_(ev.opens_at), amount: productPrice_('akbar'), desc: 'Tiket Tryout Akbar ' + fmtJkt_(ev.opens_at) };
  }
  if (kind === 'live') {
    var s = mentoringSession_(refId);
    if (!s || s.status !== 'scheduled') throw new AppError_('NOT_FOUND', 'Sesi mentoring tidak ditemukan.');
    if (new Date(s.starts_at).getTime() <= now) throw new AppError_('CLOSED', 'Sesi ini sudah dimulai.');
    var cap = Number(s.capacity) || 30;
    return {
      name: 'Live Mentoring: ' + s.title, amount: productPrice_('live', s.price), desc: 'Tiket Live Mentoring ' + fmtJkt_(s.starts_at),
      capacity: cap
    };
  }
  if (kind === 'rec') {
    var r = mentoringSession_(refId);
    if (!r || !isRecordingPublished_(r)) throw new AppError_('NOT_FOUND', 'Rekaman tidak ditemukan.');
    return { name: 'Rekaman: ' + r.title, amount: productPrice_('rec', r.recording_price), desc: 'Akses rekaman mentoring ' + r.title };
  }
  if (kind === 'consult') {
    var slot = consultSlot_(refId);
    if (!slot || slot.status !== 'open') throw new AppError_('CLOSED', 'Jadwal konsultasi ini sudah tidak tersedia.');
    if (new Date(slot.starts_at).getTime() <= now + 15 * 60000) throw new AppError_('CLOSED', 'Jadwal ini terlalu dekat. Pilih jadwal lain.');
    return { name: 'Konsultasi CPNS ' + fmtJkt_(slot.starts_at), amount: productPrice_('consult', slot.price), desc: 'Konsultasi CPNS via chat 60 menit, ' + fmtJkt_(slot.starts_at), capacity: 1 };
  }
  throw new AppError_('BAD_REQUEST', 'Produk tidak dikenal.');
}

/** Kursi/slot yang terpakai: lunas + checkout yang masih berlaku (menahan kursi sementara). */
function seatsTaken_(kind, refId, exceptUserId) {
  var paid = 0;
  try { paid = findAll_('entitlements', 'ref_id', refId).filter(function (e) { return e.kind === kind && String(e.status || 'active') === 'active'; }).length; }
  catch (e) { paid = 0; }
  var holds = findAll_('transactions', 'ref_id', refId).filter(function (t) {
    return t.kind === kind && t.status === 'pending' && !isExpired_(t) && t.user_id !== exceptUserId;
  }).length;
  return paid + holds;
}

function handleProductCheckout_(payload, user) {
  var kind = String(payload.kind || '');
  var refId = String(payload.refId || '').trim();
  if (PRODUCT_KINDS.indexOf(kind) < 0 || !refId) throw new AppError_('BAD_REQUEST', 'Produk tidak dikenal.');
  if (owns_(user, kind, refId)) throw new AppError_('ALREADY_OWNED', 'Kamu sudah memiliki ' + PRODUCT_LABEL[kind].toLowerCase() + ' ini.');
  var info = productInfo_(kind, refId);
  var mine = findAll_('transactions', 'user_id', user.userId);
  var reuse = mine.filter(function (t) {
    return t.status === 'pending' && t.kind === kind && String(t.ref_id) === refId && t.payment_url && !isExpired_(t) && Number(t.amount) === info.amount;
  }).pop();
  if (reuse) return { trxId: reuse.trx_id, paymentUrl: reuse.payment_url, expiresAt: reuse.expires_at, reused: true };
  checkPayRate_(mine);
  return startPayment_(user, {
    plan_id: PRODUCT_CODE[kind], plan_name: info.name, duration_days: 0, amount: info.amount, kind: kind, ref_id: refId,
    description: info.desc, expireMinutes: PRODUCT_HOLD_MIN[kind],
    beforeInsert: info.capacity ? function () {
      if (seatsTaken_(kind, refId, user.userId) >= info.capacity) {
        throw new AppError_('SOLD_OUT', kind === 'consult' ? 'Jadwal ini baru saja dipesan orang lain. Pilih jadwal lain.' : 'Kursi sesi ini sudah penuh.');
      }
    } : null
  });
}

/** Dipanggil di dalam lock fulfillTransaction_ untuk transaksi produk. Idempoten. */
function fulfillProductLocked_(trx, source) {
  var kind = String(trx.kind), ref = String(trx.ref_id);
  var exists = findAll_('entitlements', 'user_id', trx.user_id).some(function (e) { return e.kind === kind && String(e.ref_id) === ref && e.trx_id === trx.trx_id; });
  var note = '';
  if (kind === 'consult') {
    var slot = consultSlot_(ref);
    if (slot && slot.status === 'open') { update_('consult_slots', slot._row, { status: 'booked', booked_by: trx.user_id, trx_id: trx.trx_id }); clearConsultCache_(); }
    else if (slot && slot.booked_by !== trx.user_id) { note = 'BENTROK: slot sudah dipesan pengguna lain — hubungi pembeli untuk jadwal ulang/refund'; console.warn(note + ' ' + trx.trx_id); }
  }
  if (!exists) {
    insert_('entitlements', { ent_id: newId_('ent'), user_id: trx.user_id, kind: kind, ref_id: ref, trx_id: trx.trx_id, status: 'active', created_at: nowIso_(), note: note });
  }
  delete _memo['ent_' + trx.user_id];
  return update_('transactions', trx._row, { status: 'paid', paid_at: nowIso_(), processed: 'ya', source: source || '', note: note || trx.note || '' });
}

/* ================= Member area ================= */

/** getMyItems (auth required): semua yang sudah dibeli + status Premium + riwayat pembayaran. */
function handleGetMyItems_(payload, user) {
  var ents = userEntitlements_(user.userId);
  var now = Date.now();
  var by = function (k) { return ents.filter(function (e) { return e.kind === k; }); };
  var trx = findAll_('transactions', 'user_id', user.userId).reverse();

  var tryouts = by('tryout').map(function (e) {
    try { var p = getPackage_(e.ref_id); return { packageId: p.packageId, title: p.title, boughtAt: toIso_(e.created_at) }; } catch (err) { return null; }
  }).filter(Boolean);
  var events = akbarEvents_();
  var akbar = by('akbar').map(function (e) {
    var ev = events.filter(function (x) { return x.event_id === e.ref_id; })[0];
    return ev ? { eventId: ev.event_id, title: ev.title || 'Tryout Akbar', opensAt: toIso_(ev.opens_at), closesAt: toIso_(ev.closes_at), state: akbarState_(ev, now) } : null;
  }).filter(Boolean);
  var live = by('live').map(function (e) {
    var s = mentoringSession_(e.ref_id);
    return s ? liveTicketView_(s, now) : null;
  }).filter(Boolean).sort(function (a, b) { return a.startsAt < b.startsAt ? -1 : 1; });
  var recs = by('rec').map(function (e) {
    var s = mentoringSession_(e.ref_id);
    return s ? { sessionId: s.session_id, title: s.title, subtest: s.subtest, startsAt: toIso_(s.starts_at), available: isRecordingPublished_(s) } : null;
  }).filter(Boolean);
  var consults = by('consult').map(function (e) {
    var sl = consultSlot_(e.ref_id);
    return sl ? consultView_(sl, now, { conflict: Boolean(e.note) }) : null;
  }).filter(Boolean).sort(function (a, b) { return a.startsAt < b.startsAt ? -1 : 1; });

  return {
    serverNow: nowIso_(),
    premium: { active: user.plan === 'premium', until: user.premiumUntil, legacy: isLegacyPremium_(user) },
    tryouts: tryouts, akbar: akbar, live: live, recordings: recs, consults: consults,
    pending: trx.filter(function (t) { return t.status === 'pending' && !isExpired_(t) && t.payment_url; }).slice(0, 5).map(publicTrx_),
    history: trx.slice(0, 20).map(publicTrx_)
  };
}

/* ================= Fungsi admin (jalankan dari editor) ================= */

/**
 * Terapkan harga Premium baru (30 rb / 75 rb / 150 rb) di sheet plans & catat waktu peralihan.
 * Premium yang dibeli sebelum waktu ini tetap mendapat hak lama (paket tryout reguler) sampai habis.
 */
function applyPricingV2() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PRICING_V2_FROM')) props.setProperty('PRICING_V2_FROM', nowIso_());
  var rows = readAll_('plans');
  DEFAULT_PLANS.forEach(function (d) {
    var r = rows.filter(function (x) { return String(x.plan_id) === d.plan_id; })[0];
    if (r) update_('plans', r._row, { name: d.name, duration_days: d.duration_days, price: d.price, price_before: d.price_before, badge: d.badge, description: d.description, status: 'active' });
    else insert_('plans', d);
  });
  rows.forEach(function (r) {
    if (!DEFAULT_PLANS.some(function (d) { return d.plan_id === String(r.plan_id); }) && String(r.status) === 'active') update_('plans', r._row, { status: 'inactive' });
  });
  CacheService.getScriptCache().remove('plans_v1');
  Logger.log('Harga Premium baru aktif: ' + getPlans_().map(function (p) { return p.name + ' ' + rupiah_(p.price); }).join(' · ') +
    '. Peralihan harga: ' + props.getProperty('PRICING_V2_FROM'));
}

/** Beri akses produk manual (kompensasi/undangan). Ganti nilai lalu jalankan. */
function adminGrantProduct() {
  var EMAIL = 'nama@contoh.com';
  var KIND = 'rec';            // tryout | akbar | live | rec | consult
  var REF_ID = 'MTR-20261113'; // packageId / eventId / session_id / slot_id
  var u = findOne_('users', 'email', EMAIL.toLowerCase());
  if (!u) return Logger.log('Pengguna tidak ditemukan');
  withLock_(function () {
    insert_('entitlements', { ent_id: newId_('ent'), user_id: u.user_id, kind: KIND, ref_id: REF_ID, trx_id: 'ADMIN', status: 'active', created_at: nowIso_(), note: 'pemberian manual' });
  });
  Logger.log('Akses ' + KIND + ' ' + REF_ID + ' diberikan ke ' + EMAIL);
}
