/**
 * Ops.gs — Fase 9: operasional & siap rilis.
 *
 *  - buildAdminDashboard()  : sheet "admin_dashboard" (ringkasan KPI) + 1 baris/hari di "metrics_daily".
 *  - backupDaily()          : salinan Spreadsheet database ke folder BACKUP_FOLDER_ID, simpan BACKUP_KEEP_DAYS hari.
 *  - error_log              : galat server (otomatis dari Router) & galat browser (action logClientError).
 *  - dailyOps()             : dijalankan pemicu harian 05.xx WIB → dashboard + backup + email ringkasan (ADMIN_EMAIL).
 *  - healthCheck()          : cek konfigurasi, sheet, paket, event Akbar, pemicu, dan galat 24 jam terakhir.
 *  - adminDeleteUser()      : hapus/anonimkan data seorang pengguna atas permintaannya (UU PDP).
 *
 * Script Properties tambahan (opsional): BACKUP_FOLDER_ID, ADMIN_EMAIL.
 * Dashboard hanya berisi angka agregat — tanpa email/nama pengguna.
 */

var BACKUP_KEEP_DAYS = 14;
var ERROR_LOG_MAX_PER_DAY = 300;   // pengaman agar error_log tidak membengkak
var CLIENT_ERR_MAX_PER_MIN = 30;

/* ================= Error log ================= */

/** Dipanggil Router untuk galat yang bukan AppError_. Tidak boleh melempar. */
function logServerError_(action, err) {
  try {
    if (!errLogQuota_()) return;
    insert_('error_log', {
      at: nowIso_(), kind: 'server', action: cleanText_(action || '', 40), code: 'SERVER_ERROR',
      message: cleanText_(String(err && err.message || err), 300),
      detail: cleanText_(String(err && err.stack || '').split('\n').slice(0, 4).join(' | '), 500), page: '', ua: ''
    });
  } catch (e) { /* jangan sampai logging menggagalkan respons */ }
}

function errLogQuota_() {
  var cache = CacheService.getScriptCache();
  var key = 'errq_' + jktDay_(0).date;
  var n = Number(cache.get(key) || 0);
  if (n >= ERROR_LOG_MAX_PER_DAY) return false;
  cache.put(key, String(n + 1), 86400);
  return true;
}

/** logClientError (auth none): { message, source, line, page, ua } dari browser. Selalu membalas ok. */
function handleLogClientError_(payload) {
  var cache = CacheService.getScriptCache();
  var minuteKey = 'cerr_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(minuteKey) || 0);
  if (n >= CLIENT_ERR_MAX_PER_MIN) return { logged: false };
  cache.put(minuteKey, String(n + 1), 120);
  if (!errLogQuota_()) return { logged: false };
  var p = payload || {};
  var msg = cleanText_(String(p.message || ''), 300);
  if (!msg) return { logged: false };
  insert_('error_log', {
    at: nowIso_(), kind: 'client', action: cleanText_(String(p.action || ''), 40), code: cleanText_(String(p.code || ''), 30),
    message: msg, detail: cleanText_(String(p.source || '') + (p.line ? ':' + Number(p.line) : ''), 300),
    page: cleanText_(String(p.page || '').replace(/[?#].*$/, ''), 120), ua: cleanText_(String(p.ua || ''), 160)
  });
  return { logged: true };
}

/* ================= Dashboard ================= */

/** Nilai satu kolom (tanpa membaca seluruh baris) — untuk sheet besar. */
function colValues_(name, field) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var col = headers_(name).indexOf(field) + 1;
  return sh.getRange(2, col, last - 1, 1).getValues().map(function (r) { return r[0]; });
}

function jktDateOf_(v) {
  if (!v) return '';
  var d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 10);
  return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

/** Hitung KPI agregat. Dipakai dashboard, laporan harian, dan healthCheck. */
function computeMetrics_() {
  var today = jktDay_(0).date, d7 = jktDay_(-6).date, d30 = jktDay_(-29).date;
  var users = readAll_('users');
  var created = users.map(function (u) { return jktDateOf_(u.created_at); });
  var lastLogin = users.map(function (u) { return jktDateOf_(u.last_login_at); });
  var premiumActive = users.filter(isPremiumActive_).length;
  var profilesComplete = readAll_('profiles').filter(function (p) { return p.education && p.minutes_per_day; }).length;

  var trx = readAll_('transactions');
  var paid = trx.filter(function (t) { return t.status === 'paid'; });
  var sum = function (list) { return list.reduce(function (s, t) { return s + (Number(t.amount) || 0); }, 0); };
  var paidOn = function (from) { return paid.filter(function (t) { return jktDateOf_(t.paid_at) >= from; }); };
  var payers = {}; paid.forEach(function (t) { payers[t.user_id] = true; });

  var attemptsDate = colValues_('attempts', 'submitted_at').map(jktDateOf_);
  var attemptsType = colValues_('attempts', 'type');
  var practiceDate = colValues_('practice_answers', 'date').map(function (v) { return jktDateOf_(v) || String(v).slice(0, 10); });

  var refs = readAll_('referrals');
  var skd = readAll_('skd_results');
  var np = readAll_('notif_prefs').map(toNotifPrefs_);
  var sentLog = readAll_('notif_log').filter(function (n) { return n.status === 'sent' && jktDateOf_(n.at) >= d7; });
  var errs = readAll_('error_log').filter(function (e) { return new Date(e.at).getTime() > Date.now() - 86400000; });

  var since = function (arr, from) { return arr.filter(function (d) { return d && d >= from; }).length; };
  var byType = {};
  attemptsDate.forEach(function (d, i) { if (d && d >= d30) { var t = attemptsType[i] || '?'; byType[t] = (byType[t] || 0) + 1; } });

  var plans = {}; paidOn(d30).forEach(function (t) { plans[t.plan_id] = (plans[t.plan_id] || 0) + 1; });

  return {
    generatedAt: nowIso_(), today: today,
    users: {
      total: users.length, newToday: since(created, today), new7: since(created, d7), new30: since(created, d30),
      active7: since(lastLogin, d7), active30: since(lastLogin, d30), profilesComplete: profilesComplete
    },
    premium: { active: premiumActive, payersTotal: Object.keys(payers).length,
      conversionPct: users.length ? Math.round(Object.keys(payers).length / users.length * 1000) / 10 : 0 },
    revenue: { today: sum(paidOn(today)), d7: sum(paidOn(d7)), d30: sum(paidOn(d30)), total: sum(paid),
      paidToday: paidOn(today).length, paid30: paidOn(d30).length, plans30: plans,
      pendingOpen: trx.filter(function (t) { return t.status === 'pending' && !isExpired_(t); }).length,
      discount30: paidOn(d30).reduce(function (s, t) { return s + (Number(t.discount) || 0); }, 0) },
    learning: { attemptsToday: since(attemptsDate, today), attempts7: since(attemptsDate, d7), attempts30ByType: byType,
      practiceToday: since(practiceDate, today), practice7: since(practiceDate, d7) },
    skd: { results: skd.length, passed: skd.filter(function (r) { return isTrue_(r.passed_all); }).length },
    referral: { joined: refs.length, rewarded: refs.filter(function (r) { return r.status === 'rewarded'; }).length,
      capped: refs.filter(function (r) { return r.status === 'capped'; }).length },
    reminders: { daily: np.filter(function (x) { return x.daily; }).length, akbar: np.filter(function (x) { return x.akbar; }).length,
      premiumOff: np.filter(function (x) { return !x.premium; }).length, sent7: sentLog.length },
    akbar: akbarEvents_().slice(-5).map(function (e) {
      return { eventId: e.event_id, packageId: e.package_id, opensAt: e.opens_at, status: e.status || 'scheduled', participants: Number(e.participants) || 0 };
    }),
    errors24h: { total: errs.length, server: errs.filter(function (e) { return e.kind === 'server'; }).length,
      client: errs.filter(function (e) { return e.kind === 'client'; }).length,
      top: topCounts_(errs.map(function (e) { return (e.kind || '') + ' · ' + (e.action || e.page || '-') + ' · ' + String(e.message).slice(0, 60); }), 5) }
  };
}

function topCounts_(arr, n) {
  var c = {}; arr.forEach(function (k) { c[k] = (c[k] || 0) + 1; });
  return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, n).map(function (k) { return { key: k, n: c[k] }; });
}

/** Tulis ulang sheet admin_dashboard dan tambah/ganti baris hari ini di metrics_daily. */
function buildAdminDashboard() {
  var m = computeMetrics_();
  var ss = db_();
  var sh = ss.getSheetByName('admin_dashboard') || ss.insertSheet('admin_dashboard', 0);
  sh.clear();
  var rp = function (n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); };
  var rows = [
    ['Dasbor Siap CPNS', 'Diperbarui ' + new Date(m.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'],
    ['', ''],
    ['PENGGUNA', ''],
    ['Total pengguna', m.users.total], ['Baru hari ini', m.users.newToday], ['Baru 7 hari', m.users.new7], ['Baru 30 hari', m.users.new30],
    ['Aktif 7 hari (login)', m.users.active7], ['Aktif 30 hari (login)', m.users.active30], ['Profil lengkap', m.users.profilesComplete],
    ['', ''],
    ['PREMIUM & PENDAPATAN', ''],
    ['Premium aktif', m.premium.active], ['Pernah membeli', m.premium.payersTotal], ['Konversi pengguna → pembeli', m.premium.conversionPct + '%'],
    ['Pendapatan hari ini', rp(m.revenue.today)], ['Pendapatan 7 hari', rp(m.revenue.d7)], ['Pendapatan 30 hari', rp(m.revenue.d30)],
    ['Pendapatan total', rp(m.revenue.total)], ['Transaksi lunas 30 hari', m.revenue.paid30],
    ['Per paket 30 hari', Object.keys(m.revenue.plans30).map(function (k) { return k + ': ' + m.revenue.plans30[k]; }).join(' · ') || '-'],
    ['Diskon ajakan 30 hari', rp(m.revenue.discount30)], ['Pembayaran pending (belum kedaluwarsa)', m.revenue.pendingOpen],
    ['', ''],
    ['BELAJAR', ''],
    ['Tryout selesai hari ini', m.learning.attemptsToday], ['Tryout selesai 7 hari', m.learning.attempts7],
    ['Tryout 30 hari per jenis', Object.keys(m.learning.attempts30ByType).map(function (k) { return k + ': ' + m.learning.attempts30ByType[k]; }).join(' · ') || '-'],
    ['Soal latihan hari ini', m.learning.practiceToday], ['Soal latihan 7 hari', m.learning.practice7],
    ['Skor SKD resmi diisi', m.skd.results], ['… di antaranya lolos ambang batas', m.skd.passed],
    ['', ''],
    ['AJAK TEMAN', ''],
    ['Teman bergabung lewat kode', m.referral.joined], ['Bonus diberikan', m.referral.rewarded], ['Bonus terkena batas', m.referral.capped],
    ['', ''],
    ['PENGINGAT EMAIL', ''],
    ['Pengingat harian aktif', m.reminders.daily], ['Pengingat Tryout Akbar aktif', m.reminders.akbar],
    ['Mematikan pengingat Premium', m.reminders.premiumOff], ['Email pengingat terkirim 7 hari', m.reminders.sent7],
    ['', ''],
    ['TRYOUT AKBAR (5 terakhir)', '']
  ];
  m.akbar.forEach(function (e) { rows.push([e.eventId + ' · ' + e.packageId, (e.status || 'scheduled') + ' · ' + e.participants + ' peserta']); });
  rows.push(['', ''], ['GALAT 24 JAM', ''], ['Total', m.errors24h.total], ['Server', m.errors24h.server], ['Browser', m.errors24h.client]);
  m.errors24h.top.forEach(function (t) { rows.push([t.key, t.n]); });
  sh.getRange(1, 1, rows.length, 2).setValues(rows.map(function (r) { return [String(r[0]), r[1]]; }));
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  rows.forEach(function (r, i) { if (r[1] === '' && r[0] && i > 1) sh.getRange(i + 1, 1).setFontWeight('bold').setBackground('#e3ebf7'); });
  sh.setColumnWidth(1, 320); sh.setColumnWidth(2, 360);

  // metrics_daily: satu baris per tanggal (diganti bila dijalankan ulang di hari yang sama)
  var daily = {
    date: m.today, users_total: m.users.total, new_users: m.users.newToday, active_7d: m.users.active7, premium_active: m.premium.active,
    paid_trx: m.revenue.paidToday, revenue: m.revenue.today, revenue_30d: m.revenue.d30, attempts: m.learning.attemptsToday,
    practice: m.learning.practiceToday, skd_results: m.skd.results, referrals_rewarded: m.referral.rewarded, errors_24h: m.errors24h.total
  };
  withLock_(function () {
    var ex = findOne_('metrics_daily', 'date', m.today);
    if (ex) update_('metrics_daily', ex._row, daily); else insert_('metrics_daily', daily);
  });
  Logger.log('Dasbor diperbarui: ' + m.users.total + ' pengguna, ' + m.premium.active + ' premium aktif, pendapatan 30 hari ' + rp(m.revenue.d30));
  return m;
}

/* ================= Backup ================= */

function backupDaily() {
  var folderId = getConfigOptional_('BACKUP_FOLDER_ID', '');
  if (!folderId) { Logger.log('BACKUP_FOLDER_ID belum diisi — backup dilewati.'); return { skipped: true }; }
  var folder = DriveApp.getFolderById(folderId);
  var date = jktDay_(0).date;
  var name = 'Backup Siap CPNS ' + date;
  var existing = folder.getFilesByName(name);
  if (existing.hasNext()) { Logger.log('Backup hari ini sudah ada.'); return { skipped: true, name: name }; }
  var src = DriveApp.getFileById(getConfig_('SPREADSHEET_ID'));
  src.makeCopy(name, folder);
  // hapus (ke Sampah) backup yang lebih tua dari BACKUP_KEEP_DAYS
  var cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000, trashed = 0;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (/^Backup Siap CPNS \d{4}-\d{2}-\d{2}$/.test(f.getName()) && f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); trashed++; }
  }
  Logger.log('Backup dibuat: ' + name + (trashed ? ' · ' + trashed + ' backup lama dipindah ke Sampah' : ''));
  return { name: name, trashed: trashed };
}

/* ================= Tugas harian ================= */

function dailyOps() {
  var out = {};
  try { out.metrics = buildAdminDashboard(); } catch (e) { out.dashboardError = e.message; console.error(e); }
  try { out.backup = backupDaily(); } catch (e) { out.backupError = e.message; console.error(e); }
  var to = getConfigOptional_('ADMIN_EMAIL', '');
  if (to && out.metrics) {
    var m = out.metrics;
    var rp = function (n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); };
    var lines = [
      'Ringkasan harian Siap CPNS — ' + m.today, '',
      'Pengguna: ' + m.users.total + ' (baru kemarin–hari ini ' + m.users.newToday + ', aktif 7 hari ' + m.users.active7 + ')',
      'Premium aktif: ' + m.premium.active + ' · konversi ' + m.premium.conversionPct + '%',
      'Pendapatan: hari ini ' + rp(m.revenue.today) + ' · 30 hari ' + rp(m.revenue.d30),
      'Tryout 7 hari: ' + m.learning.attempts7 + ' · latihan 7 hari: ' + m.learning.practice7,
      'Ajak teman: ' + m.referral.joined + ' bergabung, ' + m.referral.rewarded + ' bonus',
      'Galat 24 jam: ' + m.errors24h.total + ' (server ' + m.errors24h.server + ', browser ' + m.errors24h.client + ')'
    ];
    m.errors24h.top.forEach(function (t) { lines.push('  - ' + t.n + '× ' + t.key); });
    lines.push('', 'Backup: ' + (out.backup && out.backup.name ? out.backup.name : (out.backupError ? 'GAGAL — ' + out.backupError : 'dilewati')));
    if (out.dashboardError) lines.push('Dasbor: GAGAL — ' + out.dashboardError);
    try {
      MailApp.sendEmail({ to: to, subject: '[Siap CPNS] Ringkasan ' + m.today + (m.errors24h.server ? ' · ' + m.errors24h.server + ' galat server' : ''), body: lines.join('\n') });
    } catch (e) { console.warn('Email ringkasan gagal: ' + e.message); }
  }
  return out;
}

/** Pasang pemicu harian dailyOps sekitar 05.00 WIB. */
function installOpsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyOps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyOps').timeBased().everyDays(1).atHour(5).inTimezone('Asia/Jakarta').create();
  Logger.log('Pemicu dailyOps (harian ± 05.00 WIB) terpasang.');
}

/* ================= Health check ================= */

var EXPECTED_TRIGGERS = {
  reconcilePayments: 'installPaymentTrigger', warmQuestionCache: 'installQuestionTrigger',
  publishAkbarResults: 'installAkbarTrigger', dailyOps: 'installOpsTrigger', sendReminders: 'installReminderTrigger'
};

function healthCheck() {
  var report = [], warn = 0;
  var line = function (ok, text) { if (!ok) warn++; report.push((ok ? '✅ ' : '⚠️ ') + text); };
  var props = PropertiesService.getScriptProperties().getProperties();
  ['SPREADSHEET_ID', 'GOOGLE_CLIENT_ID', 'MAYAR_API_KEY', 'MAYAR_BASE_URL', 'WEBHOOK_TOKEN', 'MATERIALS_SPREADSHEET_ID'].forEach(function (k) {
    line(Boolean(props[k]), 'Script Property ' + k + (props[k] ? ' terisi' : ' BELUM diisi'));
  });
  line(Boolean(props.QUESTIONS_FOLDER_ID || props.QUESTIONS_SPREADSHEET_ID), 'Sumber bank soal (QUESTIONS_FOLDER_ID/QUESTIONS_SPREADSHEET_ID)');
  line(Boolean(props.BACKUP_FOLDER_ID), 'BACKUP_FOLDER_ID ' + (props.BACKUP_FOLDER_ID ? 'terisi' : 'belum diisi (backup harian nonaktif)'));
  line(Boolean(props.ADMIN_EMAIL), 'ADMIN_EMAIL ' + (props.ADMIN_EMAIL ? 'terisi' : 'belum diisi (tidak ada email ringkasan)'));
  line(!props.LOADTEST_TOKEN, 'LOADTEST_TOKEN ' + (props.LOADTEST_TOKEN ? 'MASIH TERISI — kosongkan setelah uji beban' : 'kosong'));
  var env = paymentEnv_();
  line(env === 'production', 'Pembayaran: ' + env + (env === 'production' ? '' : ' (ganti ke https://api.mayar.id saat rilis)'));

  var ss = db_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return line(false, 'Sheet ' + name + ' belum ada — jalankan setupSheets');
    var head = sh.getRange(1, 1, 1, SCHEMA[name].length).getValues()[0].map(String);
    var same = SCHEMA[name].every(function (h, i) { return head[i] === h; });
    line(same, 'Sheet ' + name + (same ? '' : ' — judul kolom tidak sesuai, jalankan setupSheets'));
  });

  try {
    var pk = getPackages_(), by = {};
    pk.forEach(function (p) { by[p.type] = (by[p.type] || 0) + 1; });
    line(pk.length > 0, 'Paket live: ' + Object.keys(by).map(function (k) { return k + ' ' + by[k]; }).join(', '));
    line(Boolean(by.diagnostic), 'Ada paket diagnostik untuk lobi tryout');
    line(Boolean(by.latihan), 'Ada bank latihan harian');
  } catch (e) { line(false, 'Bank soal tidak terbaca: ' + e.message); }

  try {
    var upcoming = akbarEvents_().filter(function (e) { return new Date(e.closes_at).getTime() > Date.now(); });
    line(upcoming.length >= 2, 'Tryout Akbar terjadwal ke depan: ' + upcoming.length + (upcoming.length < 2 ? ' — unggah paket AKBAR baru & jalankan scheduleAkbarEvents' : ''));
  } catch (e) { line(false, 'akbar_events tidak terbaca: ' + e.message); }

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  Object.keys(EXPECTED_TRIGGERS).forEach(function (h) {
    var n = handlers.filter(function (x) { return x === h; }).length;
    line(n === 1, 'Pemicu ' + h + (n === 1 ? '' : n ? ' terpasang ' + n + '× (dobel) — jalankan ' + EXPECTED_TRIGGERS[h] : ' belum ada — jalankan ' + EXPECTED_TRIGGERS[h]));
  });

  try {
    var errs = readAll_('error_log').filter(function (e) { return new Date(e.at).getTime() > Date.now() - 86400000; });
    line(errs.filter(function (e) { return e.kind === 'server'; }).length === 0, 'Galat server 24 jam: ' + errs.filter(function (e) { return e.kind === 'server'; }).length + ' · galat browser: ' + errs.filter(function (e) { return e.kind === 'client'; }).length);
  } catch (e) { line(false, 'error_log tidak terbaca'); }

  report.push('', warn ? warn + ' hal perlu dicek.' : 'Semua pemeriksaan lolos.');
  Logger.log(report.join('\n'));
  return { warnings: warn, report: report };
}

/* ================= Permintaan hapus data (UU PDP) ================= */

/**
 * Hapus data pribadi seorang pengguna atas permintaannya.
 * 1) Isi EMAIL. 2) Jalankan dengan DRY_RUN = true untuk melihat jumlah data. 3) Ubah ke false lalu jalankan lagi.
 * - Dihapus: profil, hasil Cek Kesiapan, jawaban latihan, skor SKD, attempt tryout, hasil Akbar, data ajakan sebagai teman.
 * - Dianonimkan: baris users (email/nama/foto) dan email di transaksi (catatan transaksi disimpan untuk keperluan keuangan).
 */
function adminDeleteUser() {
  var EMAIL = 'isi-email@contoh.com';
  var DRY_RUN = true;
  var res = deleteUserData_(EMAIL, DRY_RUN);
  Logger.log(JSON.stringify(res, null, 2));
}

function deleteUserData_(email, dryRun) {
  var user = findOne_('users', 'email', String(email || '').trim().toLowerCase());
  if (!user) return { found: false };
  var uid = user.user_id;
  var plan = [['profiles', 'user_id'], ['assessments', 'user_id'], ['practice_answers', 'user_id'], ['skd_results', 'user_id'],
    ['attempts', 'user_id'], ['akbar_results', 'user_id'], ['referrals', 'referee_id'], ['notif_prefs', 'user_id'], ['notif_log', 'user_id']];
  var counts = {};
  plan.forEach(function (p) { counts[p[0]] = findAll_(p[0], p[1], uid).length; });
  var trx = findAll_('transactions', 'user_id', uid);
  counts.transactions_anonymized = trx.length;
  if (dryRun) return { found: true, userId: uid, dryRun: true, counts: counts };
  withLock_(function () {
    plan.forEach(function (p) {
      var sh = sheet_(p[0]);
      findAll_(p[0], p[1], uid).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
        .forEach(function (r) { sh.deleteRow(r); });
    });
    trx.forEach(function (t) { update_('transactions', t._row, { email: 'dihapus' }); });
    update_('users', user._row, { email: 'deleted+' + uid + '@invalid', name: 'Pengguna dihapus', picture: '', phone: '', ref_code: '' });
  });
  return { found: true, userId: uid, dryRun: false, counts: counts, note: 'Papan peringkat Akbar ter-cache akan diperbarui saat terbit ulang (adminRepublishAkbar) atau dalam 6 jam.' };
}

/**
 * Fase 10.2: setelah MENGEDIT LANGSUNG baris sheet users (mis. mengubah premium_until di Spreadsheet),
 * isi EMAIL lalu jalankan agar perubahan langsung terbaca (tanpa ini berlaku otomatis dalam ≤ 5 menit).
 * Perubahan lewat aplikasi/fungsi admin (adminGrantPremium, pembayaran) tidak perlu langkah ini.
 */
function adminClearUserCache() {
  var EMAIL = 'nama@contoh.com';
  invalidateUserCache_(EMAIL.toLowerCase());
  Logger.log('Cache pengguna ' + EMAIL + ' dihapus.');
}
