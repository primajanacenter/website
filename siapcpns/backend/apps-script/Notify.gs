/**
 * Notify.gs — Fase 10: pengingat lewat email — KHUSUS PENGGUNA PREMIUM (Fase 10.1).
 *
 * Pengguna gratis memakai pengingat di perangkat (assets/js/features/reminder-local.js): disimpan di
 * browser masing-masing, tanpa email dan tanpa data ke server. Email harian & Akbar hanya dikirim ke
 * pengguna yang Premium-nya aktif pada saat pengiriman; bila Premium berakhir, pengiriman berhenti otomatis.
 *
 * Jenis pengingat (semua bisa dimatikan pengguna; tautan berhenti langganan di setiap email):
 *  - daily   : pengingat belajar harian pada jam di profil (reminder_time), hanya bila hari itu BELUM latihan.
 *              Opt-in (default mati).
 *  - akbar   : Sabtu ± 19.00 WIB, sehari sebelum Tryout Akbar. Opt-in (default mati).
 *  - premium : Premium berakhir 3 hari lagi dan pada hari terakhir. Default menyala (informasi layanan).
 *
 * Pemicu: sendReminders() tiap jam (installReminderTrigger). Satu email per jenis per pengguna per hari/event
 * (dicatat di notif_log). Berhenti otomatis saat kuota email harian Apps Script hampir habis
 * (akun Gmail biasa ± 100 penerima/hari, Google Workspace ± 1.500).
 *
 * Script Properties: APP_BASE_URL (alamat situs, untuk tautan di email) dan WEBAPP_URL (URL /exec, untuk
 * tautan berhenti langganan). Pengirim = akun pemilik skrip, nama tampil "Siap CPNS".
 */

var NOTIF_KINDS = ['daily', 'akbar', 'premium'];
var NOTIF_DEFAULTS = { daily: false, akbar: false, premium: true };
var NOTIF_QUOTA_RESERVE = 5;      // sisakan kuota untuk email ringkasan admin
var NOTIF_MAX_PER_RUN = 80;       // jaga waktu eksekusi < 6 menit
var AKBAR_REMIND_HOUR = 19;       // Sabtu 19.00 WIB
var PREMIUM_REMIND_HOUR = 9;      // 09.00 WIB

/* ================= Preferensi ================= */

function notifPrefsRow_(userId) {
  return findOne_('notif_prefs', 'user_id', userId);
}

function toNotifPrefs_(row) {
  var out = {};
  NOTIF_KINDS.forEach(function (k) {
    out[k] = row && row[k] !== '' && row[k] !== undefined ? isTrue_(row[k]) : NOTIF_DEFAULTS[k];
  });
  return out;
}

function newUnsubToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/** getNotifPrefs (auth required) */
function handleGetNotifPrefs_(payload, user) {
  var row = notifPrefsRow_(user.userId);
  var profile = findOne_('profiles', 'user_id', user.userId);
  return {
    prefs: toNotifPrefs_(row),
    premium: user.plan === 'premium',
    email: user.email,
    reminderTime: profile ? String(profile.reminder_time || '') : '',
    emailEnabled: notifEmailEnabled_()
  };
}

/** saveNotifPrefs (auth required): { daily?, akbar?, premium?, reminderTime? } */
function handleSaveNotifPrefs_(payload, user) {
  var p = payload || {};
  var time = p.reminderTime === undefined ? null : String(p.reminderTime || '');
  if (time !== null && time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError_('BAD_REQUEST', 'Jam pengingat tidak valid (format JJ:MM).');
  }
  if (user.plan !== 'premium' && (p.daily === true || p.akbar === true)) {
    throw new AppError_('FORBIDDEN', 'Pengingat lewat email tersedia untuk pengguna Premium. Gunakan pengingat di perangkat ini (gratis).');
  }
  var profRow = findOne_('profiles', 'user_id', user.userId);
  if (time !== null && time !== '' && !profRow) {
    throw new AppError_('PROFILE_INCOMPLETE', 'Lengkapi profil belajar terlebih dahulu agar jam pengingat bisa disimpan.');
  }
  var saved = withLock_(function () {
    var row = notifPrefsRow_(user.userId);
    var cur = toNotifPrefs_(row);
    var patch = { user_id: user.userId, updated_at: nowIso_() };
    NOTIF_KINDS.forEach(function (k) { patch[k] = String(p[k] === undefined ? cur[k] : Boolean(p[k])); });
    if (row) { if (!row.token) patch.token = newUnsubToken_(); row = update_('notif_prefs', row._row, patch); }
    else { patch.token = newUnsubToken_(); patch.created_at = nowIso_(); insert_('notif_prefs', patch); row = patch; }
    if (time !== null) {
      var prof = findOne_('profiles', 'user_id', user.userId);
      if (prof) update_('profiles', prof._row, { reminder_time: time, updated_at: nowIso_() });
    }
    return row;
  });
  var res = handleGetNotifPrefs_({}, user);
  res.prefs = toNotifPrefs_(saved);
  if (res.prefs.daily && !res.reminderTime) res.warning = 'Isi jam pengingat agar pengingat harian bisa dikirim.';
  return res;
}

/** Buat baris preferensi default (dengan token) bila belum ada. */
function ensureNotifPrefs_(userId) {
  return withLock_(function () {
    var row = notifPrefsRow_(userId);
    if (row) return row;
    var r = { user_id: userId, daily: String(NOTIF_DEFAULTS.daily), akbar: String(NOTIF_DEFAULTS.akbar), premium: String(NOTIF_DEFAULTS.premium),
      token: newUnsubToken_(), created_at: nowIso_(), updated_at: nowIso_() };
    insert_('notif_prefs', r);
    return r;
  });
}

function notifEmailEnabled_() {
  return getConfigOptional_('NOTIF_EMAIL', 'on') !== 'off';
}

/* ================= Berhenti langganan (dari tautan email) ================= */

/** Dipanggil doGet: ?unsub=TOKEN&kind=daily|akbar|premium|all → halaman HTML sederhana. */
function handleUnsubscribe_(e) {
  var token = String(e.parameter.unsub || '').replace(/[^a-f0-9]/gi, '');
  var kind = String(e.parameter.kind || 'all');
  var msg;
  if (token.length < 30) {
    msg = 'Tautan tidak valid.';
  } else {
    var row = findOne_('notif_prefs', 'token', token);
    if (!row) {
      msg = 'Tautan tidak ditemukan atau sudah tidak berlaku.';
    } else {
      var patch = { updated_at: nowIso_() };
      (kind === 'all' || NOTIF_KINDS.indexOf(kind) < 0 ? NOTIF_KINDS : [kind]).forEach(function (k) { patch[k] = 'false'; });
      withLock_(function () { update_('notif_prefs', row._row, patch); });
      msg = kind === 'all' || NOTIF_KINDS.indexOf(kind) < 0
        ? 'Kamu tidak akan menerima email pengingat lagi.'
        : 'Pengingat "' + NOTIF_LABEL_[kind] + '" sudah dimatikan.';
    }
  }
  var base = appBaseUrl_();
  var html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Pengingat email — Siap CPNS</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;color:#14213d">' +
    '<h1 style="font-size:22px">Siap CPNS</h1><p>' + msg + '</p>' +
    (base ? '<p>Atur ulang kapan saja di <a href="' + base + '/pages/pengaturan.html">halaman Pengaturan</a>.</p>' : '') +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Pengingat email — Siap CPNS');
}

var NOTIF_LABEL_ = { daily: 'belajar harian', akbar: 'Tryout Akbar', premium: 'masa aktif Premium' };

function appBaseUrl_() {
  return String(getConfigOptional_('APP_BASE_URL', getConfigOptional_('ALLOWED_ORIGIN', '')) || '').replace(/\/+$/, '');
}

function unsubUrl_(token, kind) {
  var exec = String(getConfigOptional_('WEBAPP_URL', '') || '').replace(/\?.*$/, '');
  if (!exec || !token) return '';
  return exec + '?unsub=' + encodeURIComponent(token) + '&kind=' + encodeURIComponent(kind);
}

/* ================= Pengiriman ================= */

/** Pemicu tiap jam. Mengembalikan ringkasan untuk log/uji. */
function sendReminders(nowMs) {
  var now = nowMs || Date.now();
  var jkt = new Date(now + 7 * 3600000);
  var hour = jkt.getUTCHours(), dow = jkt.getUTCDay(), today = jkt.toISOString().slice(0, 10);
  var out = { daily: 0, akbar: 0, premium: 0, skipped: 0, quotaStop: false };
  if (!notifEmailEnabled_()) { out.disabled = true; return out; }

  var prefs = readAll_('notif_prefs');
  var users = {}; readAll_('users').forEach(function (u) { users[u.user_id] = u; });
  var budget = { left: Math.min(NOTIF_MAX_PER_RUN, remainingMailQuota_() - NOTIF_QUOTA_RESERVE) };

  // 1) harian: pengguna yang jam pengingatnya jatuh di jam ini dan belum latihan hari ini
  var isPrem = function (uid) { return users[uid] && isPremiumActive_(users[uid]); };
  var dailyUsers = prefs.filter(function (p) { return toNotifPrefs_(p).daily && isPrem(p.user_id); });
  if (dailyUsers.length) {
    var profiles = {}; readAll_('profiles').forEach(function (p) { profiles[p.user_id] = p; });
    dailyUsers.forEach(function (p) {
      var prof = profiles[p.user_id];
      var t = prof ? String(prof.reminder_time || '') : '';
      if (!/^\d{2}:\d{2}$/.test(t) || Number(t.slice(0, 2)) !== hour) return;
      if (practicedOn_(p.user_id, today)) { out.skipped++; return; }
      if (sendOnce_(budget, out, p, users[p.user_id], 'daily', 'daily:' + p.user_id + ':' + today, buildDailyMail_(users[p.user_id], prof, p))) out.daily++;
    });
  }

  // 2) Tryout Akbar: Sabtu jam 19 untuk event yang dibuka besok
  if (dow === 6 && hour === AKBAR_REMIND_HOUR) {
    var tomorrow = new Date(now + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
    var ev = akbarEvents_().filter(function (e) {
      return new Date(new Date(e.opens_at).getTime() + 7 * 3600000).toISOString().slice(0, 10) === tomorrow;
    })[0];
    if (ev) {
      prefs.filter(function (p) { return toNotifPrefs_(p).akbar && isPrem(p.user_id); }).forEach(function (p) {
        if (sendOnce_(budget, out, p, users[p.user_id], 'akbar', 'akbar:' + p.user_id + ':' + ev.event_id, buildAkbarMail_(users[p.user_id], ev, p))) out.akbar++;
      });
    }
  }

  // 3) Premium hampir habis: jam 09, sisa 3 hari dan hari terakhir (default menyala walau belum ada baris preferensi)
  if (hour === PREMIUM_REMIND_HOUR) {
    var prefBy = {}; prefs.forEach(function (p) { prefBy[p.user_id] = p; });
    Object.keys(users).forEach(function (uid) {
      var u = users[uid];
      if (!isPremiumActive_(u)) return;
      var p = prefBy[uid];
      if (p && !toNotifPrefs_(p).premium) return;
      var untilDay = new Date(new Date(u.premium_until).getTime() + 7 * 3600000).toISOString().slice(0, 10);
      var daysLeft = Math.round((Date.parse(untilDay) - Date.parse(today)) / 86400000);
      if (daysLeft !== 3 && daysLeft !== 0) return;
      if (!p) p = ensureNotifPrefs_(uid); // butuh token untuk tautan berhenti langganan
      if (sendOnce_(budget, out, p, u, 'premium', 'premium:' + p.user_id + ':' + untilDay + ':' + daysLeft, buildPremiumMail_(u, untilDay, daysLeft, p))) out.premium++;
    });
  }
  Logger.log('sendReminders ' + today + ' ' + hour + '.00 WIB: harian ' + out.daily + ', akbar ' + out.akbar + ', premium ' + out.premium +
    ', dilewati ' + out.skipped + (out.quotaStop ? ' · BERHENTI: kuota email habis' : ''));
  return out;
}

function remainingMailQuota_() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return 0; }
}

function practicedOn_(userId, date) {
  return findAll_('practice_answers', 'user_id', userId).some(function (h) { return String(h.date).slice(0, 10) === date; });
}

/** Kirim sekali per kunci (notif_log). true bila terkirim. */
function sendOnce_(budget, out, pref, user, kind, key, mail) {
  if (!user || !mail || !/@/.test(String(user.email)) || /@invalid$/.test(String(user.email))) return false;
  if (findOne_('notif_log', 'key', key)) return false;
  if (budget.left <= 0) { out.quotaStop = true; return false; }
  try {
    MailApp.sendEmail({ to: user.email, subject: mail.subject, body: mail.text, htmlBody: mail.html, name: 'Siap CPNS' });
    budget.left--;
    insert_('notif_log', { at: nowIso_(), user_id: user.user_id, kind: kind, key: key, status: 'sent' });
    return true;
  } catch (err) {
    insert_('notif_log', { at: nowIso_(), user_id: user.user_id, kind: kind, key: key + ':err', status: 'error: ' + cleanText_(err.message || '', 120) });
    if (/quota|limit|batas/i.test(String(err.message))) { out.quotaStop = true; budget.left = 0; }
    return false;
  }
}

/* ================= Isi email ================= */

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mailLayout_(title, paragraphs, cta, pref, kind) {
  var base = appBaseUrl_();
  var link = cta && base ? base + cta.path : '';
  var unsub = unsubUrl_(pref && pref.token, kind);
  var settings = base ? base + '/pages/pengaturan.html' : '';
  var html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#14213d;line-height:1.55">' +
    '<p style="font-size:13px;color:#5b6b85;margin:0 0 12px">Siap CPNS · oleh Primajana</p>' +
    '<h2 style="font-size:20px;margin:0 0 12px">' + esc_(title) + '</h2>' +
    paragraphs.map(function (p) { return '<p style="margin:0 0 12px">' + esc_(p) + '</p>'; }).join('') +
    (link ? '<p style="margin:18px 0"><a href="' + esc_(link) + '" style="background:#0f2d55;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">' + esc_(cta.label) + '</a></p>' : '') +
    '<hr style="border:none;border-top:1px solid #e3e8f0;margin:20px 0">' +
    '<p style="font-size:12px;color:#5b6b85;margin:0">Kamu menerima email ini karena mengaktifkan pengingat ' + esc_(NOTIF_LABEL_[kind]) + ' di Siap CPNS. ' +
    (unsub ? '<a href="' + esc_(unsub) + '" style="color:#5b6b85">Berhenti menerima pengingat ini</a>' : '') +
    (settings ? ' · <a href="' + esc_(settings) + '" style="color:#5b6b85">Pengaturan</a>' : '') + '.<br>Aplikasi latihan independen, tidak berafiliasi dengan BKN atau KemenPANRB.</p></div>';
  var text = 'Siap CPNS\n\n' + title + '\n\n' + paragraphs.join('\n\n') + (link ? '\n\n' + cta.label + ': ' + link : '') +
    '\n\n---\n' + (unsub ? 'Berhenti menerima pengingat ini: ' + unsub + '\n' : '') + (settings ? 'Pengaturan: ' + settings + '\n' : '');
  return { html: html, text: text };
}

function firstName_(u) {
  return String((u && u.name) || '').trim().split(/\s+/)[0] || 'Pejuang NIP';
}

function buildDailyMail_(u, prof, pref) {
  if (!u) return null;
  var days = prof && prof.test_date ? Math.ceil((Date.parse(String(prof.test_date).slice(0, 10) + 'T00:00:00+07:00') - Date.now()) / 86400000) : null;
  var minutes = prof && Number(prof.minutes_per_day) ? Number(prof.minutes_per_day) : 30;
  var paras = ['Halo ' + firstName_(u) + ', waktunya belajar hari ini. Cukup ' + minutes + ' menit: baca satu materi lalu kerjakan latihan 10 soal.'];
  if (days !== null && days > 0) paras.push('Perkiraan tes SKD-mu ' + days + ' hari lagi. Latihan kecil setiap hari lebih efektif daripada belajar banyak sekaligus.');
  var m = mailLayout_('Waktunya latihan hari ini', paras, { label: 'Mulai latihan', path: '/pages/latihan.html' }, pref, 'daily');
  m.subject = days !== null && days > 0 ? 'Latihan hari ini · ' + days + ' hari menuju SKD' : 'Waktunya latihan hari ini';
  return m;
}

function buildAkbarMail_(u, ev, pref) {
  if (!u) return null;
  var m = mailLayout_('Tryout Akbar dibuka besok',
    ['Halo ' + firstName_(u) + ', ' + (ev.title || 'Tryout Akbar') + ' dibuka ' + fmtJkt_(ev.opens_at) + ' sampai ' + fmtJkt_(ev.closes_at) + '.',
     '110 soal, 100 menit, tiket ' + rupiah_(productPrice_('akbar')) + '. Batas terakhir mulai ' + fmtJkt_(akbarLastStart_(ev)) + '. Peringkat nasional terbit ' + fmtJkt_(ev.results_at) + '.'],
    { label: 'Lihat Tryout Akbar', path: '/pages/tryout.html' }, pref, 'akbar');
  m.subject = 'Besok: ' + (ev.title || 'Tryout Akbar') + ' (peringkat nasional)';
  return m;
}

function buildPremiumMail_(u, untilDay, daysLeft, pref) {
  var d = new Date(untilDay + 'T00:00:00Z');
  var months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var tgl = d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  var m = mailLayout_(daysLeft === 0 ? 'Premium berakhir hari ini' : 'Premium berakhir 3 hari lagi',
    ['Halo ' + firstName_(u) + ', masa aktif Premium-mu berakhir ' + (daysLeft === 0 ? 'hari ini' : 'pada ' + tgl) + '.',
     'Setelah itu akun kembali ke paket Gratis. Progres, rapor, dan riwayatmu tetap tersimpan. Premium tidak diperpanjang otomatis; jika ingin melanjutkan, membeli lagi akan menambah masa aktif.'],
    { label: 'Lihat paket Premium', path: '/pages/premium.html' }, pref, 'premium');
  m.subject = daysLeft === 0 ? 'Premium Siap CPNS berakhir hari ini' : 'Premium Siap CPNS berakhir ' + tgl;
  return m;
}


function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  Logger.log('Pemicu sendReminders (tiap jam) terpasang. Sisa kuota email hari ini: ' + remainingMailQuota_());
}

/** Admin: kirim contoh ketiga email ke ADMIN_EMAIL untuk dicek tampilannya. */
function testReminderEmails() {
  var to = getConfig_('ADMIN_EMAIL');
  var fake = { user_id: 'contoh', email: to, name: 'Admin Contoh' };
  var pref = { token: '' };
  var ev = akbarEvents_().filter(function (e) { return new Date(e.closes_at).getTime() > Date.now(); })[0] ||
    { title: 'Tryout Akbar', opens_at: new Date(Date.now() + 86400000).toISOString(), closes_at: new Date(Date.now() + 2 * 86400000).toISOString(), results_at: new Date(Date.now() + 3 * 86400000).toISOString(), package_id: '' };
  [buildDailyMail_(fake, { test_date: '', minutes_per_day: 30 }, pref), buildAkbarMail_(fake, ev, pref), buildPremiumMail_(fake, jktDay_(3).date, 3, pref)]
    .forEach(function (m) { MailApp.sendEmail({ to: to, subject: '[CONTOH] ' + m.subject, body: m.text, htmlBody: m.html, name: 'Siap CPNS' }); });
  Logger.log('3 email contoh dikirim ke ' + to + '. Sisa kuota: ' + remainingMailQuota_());
}
