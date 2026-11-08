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
    'mayar_member_id', 'created_at', 'last_login_at'
  ],
  profiles: [
    'user_id', 'education', 'major', 'target_formation', 'target_province', 'test_date',
    'target_type', 'minutes_per_day', 'days_per_week', 'reminder_time', 'updated_at'
  ],
  assessments: [
    'assessment_id', 'user_id', 'version', 'total', 'level_id', 'alur', 'dokumen',
    'kemampuan', 'waktu', 'duration_sec', 'answers_json', 'source', 'created_at'
  ],
  waitlist: ['email', 'source', 'created_at']
};

var _ssCache = null;

function db_() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(getConfig_('SPREADSHEET_ID'));
  return _ssCache;
}

function sheet_(name) {
  var sh = db_().getSheetByName(name);
  if (!sh) throw new AppError_('CONFIG_MISSING', 'Sheet "' + name + '" belum ada. Jalankan setupSheets().');
  return sh;
}

function headers_(name) {
  return SCHEMA[name];
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
  var h = headers_(name);
  var row = h.map(function (k) { return obj[k] === undefined || obj[k] === null ? '' : obj[k]; });
  sheet_(name).appendRow(row);
  return obj;
}

/** Perbarui sebagian kolom pada baris tertentu. */
function update_(name, rowIndex, patch) {
  var sh = sheet_(name);
  var h = headers_(name);
  var range = sh.getRange(rowIndex, 1, 1, h.length);
  var values = range.getValues()[0];
  Object.keys(patch).forEach(function (k) {
    var i = h.indexOf(k);
    if (i >= 0) values[i] = patch[k] === null || patch[k] === undefined ? '' : patch[k];
  });
  range.setValues([values]);
  return rowToObj_(name, values, rowIndex);
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
