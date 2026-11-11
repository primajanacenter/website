/**
 * Db.gs — helper akses Google Spreadsheet sebagai database.
 *
 * Aturan:
 *  - Baris 1 setiap sheet = nama kolom (lihat SCHEMA di bawah dan docs/sheet-schema.md).
 *  - Semua penulisan lewat insert_/update_ dan dibungkus withLock_() bila ada risiko bentrok.
 *  - Pencarian memakai TextFinder pada satu kolom agar tidak membaca seluruh sheet.
 */

/** Struktur kolom tiap sheet di database utama (SPREADSHEET_ID). */
var SCHEMA = {
  users: [
    'user_id', 'email', 'name', 'picture', 'phone', 'plan', 'premium_until',
    'mayar_member_id', 'created_at', 'last_login_at', 'ref_code'
  ],
  profiles: [
    'user_id', 'education', 'major', 'target_formation', 'target_province', 'test_date',
    'target_type', 'minutes_per_day', 'days_per_week', 'reminder_time', 'updated_at'
  ],
  assessments: [
    'assessment_id', 'user_id', 'version', 'total', 'level_id', 'alur', 'dokumen',
    'kemampuan', 'waktu', 'duration_sec', 'answers_json', 'source', 'created_at'
  ],
  waitlist: ['email', 'source', 'created_at'],
  attempts: [
    'attempt_id', 'user_id', 'package_id', 'type', 'status', 'started_at', 'ends_at', 'submitted_at',
    'twk', 'tiu', 'tkp', 'total', 'passed_twk', 'passed_tiu', 'passed_tkp', 'passed_all',
    'answered', 'correct_json', 'topic_json', 'answers_json', 'duration_sec', 'finish_mode', 'event_id'
  ],
  practice_answers: [
    'user_id', 'date', 'question_id', 'package_id', 'topic_id', 'subtest', 'answer', 'points', 'answered_at'
  ],
  // Fase 5: pembayaran
  plans: ['plan_id', 'name', 'duration_days', 'price', 'price_before', 'badge', 'description', 'status', 'order'],
  transactions: [
    'trx_id', 'user_id', 'email', 'plan_id', 'plan_name', 'duration_days', 'amount', 'status',
    'mayar_id', 'mayar_trx_id', 'payment_url', 'created_at', 'expires_at', 'paid_at', 'processed',
    'premium_until', 'source', 'note', 'ref_code', 'discount',
    // Fase 13: pembelian satuan. kind kosong/"premium" = langganan Premium.
    'kind', 'ref_id'
  ],
  webhook_log: ['received_at', 'event', 'trx_id', 'mayar_ref', 'result', 'raw_json'],
  // Fase 7: Tryout Akbar
  akbar_events: ['event_id', 'package_id', 'title', 'opens_at', 'closes_at', 'results_at', 'status', 'participants', 'created_at'],
  akbar_results: [
    'event_id', 'user_id', 'attempt_id', 'rank', 'total', 'twk', 'tiu', 'tkp', 'passed_all', 'percentile',
    'duration_sec', 'province', 'province_rank', 'province_total', 'education', 'display_name', 'published_at'
  ],
  loadtest_log: ['at', 'probe_id', 'note'],
  // Fase 8: pasca-SKD & referral
  skd_results: [
    'user_id', 'test_date', 'twk', 'tiu', 'tkp', 'total', 'passed_all', 'formation', 'skb_date',
    'created_at', 'updated_at'
  ],
  referrals: ['referee_id', 'referrer_id', 'code', 'status', 'trx_id', 'bonus_days', 'created_at', 'rewarded_at'],
  // Fase 9: operasional
  error_log: ['at', 'kind', 'action', 'code', 'message', 'detail', 'page', 'ua'],
  metrics_daily: [
    'date', 'users_total', 'new_users', 'active_7d', 'premium_active', 'paid_trx', 'revenue', 'revenue_30d',
    'attempts', 'practice', 'skd_results', 'referrals_rewarded', 'errors_24h'
  ],
  // Fase 10: pengingat email
  notif_prefs: ['user_id', 'daily', 'akbar', 'premium', 'token', 'created_at', 'updated_at'],
  notif_log: ['at', 'user_id', 'kind', 'key', 'status'],
  // Fase 13: produk satuan, mentoring, konsultasi
  entitlements: ['ent_id', 'user_id', 'kind', 'ref_id', 'trx_id', 'status', 'created_at', 'note'],
  mentoring_sessions: [
    'session_id', 'title', 'subtest', 'description', 'starts_at', 'ends_at', 'price', 'capacity',
    'zoom_url', 'zoom_passcode', 'status', 'recording_url', 'recording_price', 'recording_status', 'created_at'
  ],
  consult_slots: [
    'slot_id', 'starts_at', 'ends_at', 'consultant_name', 'consultant_email', 'price', 'status',
    'booked_by', 'trx_id', 'note', 'created_at'
  ],
  consult_messages: ['msg_id', 'slot_id', 'sender', 'user_id', 'text', 'at'],
  access_log: ['at', 'user_id', 'kind', 'ref_id', 'ua']
};

/** Struktur sheet di file BANK SOAL (QUESTIONS_SPREADSHEET_ID). Hanya bisa dibaca server. */
var QSCHEMA = {
  packages: [
    'package_id', 'title', 'type', 'description', 'duration_min', 'pg_twk', 'pg_tiu', 'pg_tkp',
    'free_attempts', 'status', 'order'
  ],
  questions: [
    'question_id', 'package_id', 'number', 'subtest', 'topic_id', 'level', 'text', 'context',
    'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'answer',
    'score_a', 'score_b', 'score_c', 'score_d', 'score_e', 'explanation', 'status', 'source'
  ]
};

var _ssCache = null;
var _qsCache = null;

function db_() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(getConfig_('SPREADSHEET_ID'));
  return _ssCache;
}

function qdb_() {
  if (!_qsCache) _qsCache = SpreadsheetApp.openById(getConfig_('QUESTIONS_SPREADSHEET_ID'));
  return _qsCache;
}

function sheet_(name) {
  var isQ = QSCHEMA.hasOwnProperty(name);
  var sh = (isQ ? qdb_() : db_()).getSheetByName(name);
  if (!sh) {
    throw new AppError_('CONFIG_MISSING', 'Sheet "' + name + '" belum ada. Jalankan ' + (isQ ? 'setupQuestionSheets()' : 'setupSheets()') + '.');
  }
  return sh;
}

function headers_(name) {
  return SCHEMA[name] || QSCHEMA[name];
}

/** Baca semua baris sebuah sheet sebagai array objek (untuk sheet kecil/menengah). */
function readAll_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = headers_(name);
  var values = sh.getRange(2, 1, last - 1, h.length).getValues();
  return values.map(function (v, i) { return rowToObj_(name, v, i + 2); });
}

/** Semua baris dengan nilai persis di satu kolom (memakai TextFinder). */
function findAll_(name, field, value) {
  if (!value) return [];
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var h = headers_(name);
  var col = h.indexOf(field) + 1;
  var cells = sh.getRange(2, col, last - 1, 1)
    .createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findAll();
  return cells.map(function (c) {
    var r = c.getRow();
    return rowToObj_(name, sh.getRange(r, 1, 1, h.length).getValues()[0], r);
  });
}

/** Ubah satu baris (array) menjadi objek sesuai header. */
function rowToObj_(name, values, rowIndex) {
  var h = headers_(name);
  var o = { _row: rowIndex };
  for (var i = 0; i < h.length; i++) o[h[i]] = values[i] === undefined ? '' : values[i];
  return o;
}

/** Cari satu baris berdasarkan nilai persis di satu kolom. Mengembalikan objek atau null. */
function findOne_(name, field, value) {
  if (value === null || value === undefined || value === '') return null;
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var col = headers_(name).indexOf(field) + 1;
  if (col < 1) throw new Error('Kolom ' + field + ' tidak ada di ' + name);
  var cell = sh.getRange(2, col, last - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  if (!cell) return null;
  var r = cell.getRow();
  var values = sh.getRange(r, 1, 1, headers_(name).length).getValues()[0];
  return rowToObj_(name, values, r);
}

/** Cari baris TERAKHIR (terbaru) dengan nilai persis di satu kolom. */
function findLast_(name, field, value) {
  if (!value) return null;
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var col = headers_(name).indexOf(field) + 1;
  var cells = sh.getRange(2, col, last - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .matchCase(true)
    .findAll();
  if (!cells.length) return null;
  var r = cells[cells.length - 1].getRow();
  var values = sh.getRange(r, 1, 1, headers_(name).length).getValues()[0];
  return rowToObj_(name, values, r);
}

/** Tambah baris baru dari objek. Kolom yang tidak ada di objek dibiarkan kosong. */
function insert_(name, obj) {
  if (name === 'practice_answers' && typeof _memo !== 'undefined') delete _memo['ph:' + obj.user_id];
  var h = headers_(name);
  var row = h.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : obj[k]; });
  sheet_(name).appendRow(row);
  return obj;
}

/** Tambah banyak baris sekaligus (satu kali tulis). */
function insertMany_(name, objs) {
  if (!objs.length) return 0;
  var h = headers_(name);
  var sh = sheet_(name);
  var rows = objs.map(function (obj) { return h.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : obj[k]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, h.length).setValues(rows);
  return rows.length;
}

/** Perbarui sebagian kolom pada baris tertentu. */
function update_(name, rowIndex, patch) {
  var sh = sheet_(name);
  var h = headers_(name);
  var range = sh.getRange(rowIndex, 1, 1, h.length);
  var values = range.getValues()[0];
  var oldEmail = name === 'users' ? values[h.indexOf('email')] : '';
  Object.keys(patch).forEach(function (k) {
    var i = h.indexOf(k);
    if (i >= 0) values[i] = patch[k] === null || patch[k] === undefined ? '' : patch[k];
  });
  range.setValues([values]);
  if (name === 'users') { invalidateUserCache_(oldEmail); invalidateUserCache_(values[h.indexOf('email')]); }
  return rowToObj_(name, values, rowIndex);
}

/** Hapus cache baris pengguna (lihat findOrCreateUser_) setelah baris users berubah. */
function invalidateUserCache_(email) {
  try { if (email) CacheService.getScriptCache().remove(userCacheKey_(email)); } catch (e) { /* abaikan */ }
}

/** Jalankan fn dengan kunci script agar penulisan bersamaan tidak saling menimpa. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new AppError_('BUSY', 'Server sedang sibuk. Coba lagi sebentar.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function nowIso_() {
  return new Date().toISOString();
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

/** Batasi teks dari pengguna: buang spasi berlebih dan potong panjangnya. */
function cleanText_(value, maxLen) {
  var s = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  // Cegah formula injection di Spreadsheet.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, maxLen || 200);
}
