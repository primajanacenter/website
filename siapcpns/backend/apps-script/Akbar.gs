/**
 * Akbar.gs — Tryout Akbar mingguan dengan peringkat nasional (Fase 7).
 *
 * Format: jendela satu hari (default Minggu 06.00–21.00 WIB). Peserta boleh mulai kapan saja sampai
 * "batas mulai" (= tutup − durasi), satu kali per event. Hasil, rapor, dan peringkat terbit pada
 * results_at (default Senin 06.00 WIB) lewat pemicu publishAkbarResults.
 *
 * Akses: gratis untuk semua pengguna login. Premium mendapat peringkat per provinsi, analisis
 * dibanding 10% teratas, dan pembahasan semua soal (aturan rapor yang sudah ada).
 *
 * Paket soal: file paket dengan type "akbar" di folder paket soal. Paket akbar tidak tampil di lobi
 * Tryout dan tidak dipakai latihan harian. Jadwal dibuat dengan scheduleAkbarEvents().
 */

var AKBAR_OPEN = '06:00';
var AKBAR_CLOSE = '21:00';
var AKBAR_RESULTS_DELAY_H = 9;   // tutup 21.00 + 9 jam = Senin 06.00
var AKBAR_TOP_N = 50;
var AKBAR_PROVINCE_TOP_N = 20;

/* ================= Jadwal ================= */

/**
 * Baca tanggal dari sel akbar_events dengan toleran: objek Date (sel berformat tanggal), ISO
 * (2026-11-15T06:00:00+07:00), "2026-11-15 06:00", atau "15/11/2026 06.00". Tanpa zona waktu = WIB.
 * Mengembalikan Date atau null bila tidak bisa dibaca.
 */
function akbarDate_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  var y, mo, d, h, mi, se, tz;
  if (m) { y = m[1]; mo = m[2]; d = m[3]; h = m[4]; mi = m[5]; se = m[6]; tz = m[7]; }
  else {
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/);
    if (!m) { var t = new Date(s); return isNaN(t.getTime()) ? null : t; }
    d = m[1]; mo = m[2]; y = m[3]; h = m[4]; mi = m[5]; se = m[6];
  }
  var pad = function (x) { x = String(x || '0'); return x.length < 2 ? '0' + x : x; };
  if (!tz) tz = '+07:00';
  else if (/^[+-]\d{4}$/.test(tz)) tz = tz.slice(0, 3) + ':' + tz.slice(3);
  var iso = y + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(h) + ':' + pad(mi) + ':' + pad(se) + (tz.toUpperCase() === 'Z' ? 'Z' : tz);
  var out = new Date(iso);
  return isNaN(out.getTime()) ? null : out;
}

/** Event aktif (bukan cancelled) dengan tanggal yang sudah dinormalkan ke ISO. Baris rusak dilewati (lihat checkAkbarEvents). */
function akbarEvents_() {
  var out = [];
  readAll_('akbar_events').forEach(function (e) {
    if (!e.event_id || String(e.status).trim().toLowerCase() === 'cancelled') return;
    var o = akbarDate_(e.opens_at), c = akbarDate_(e.closes_at), r = akbarDate_(e.results_at);
    if (!o || !c) { console.warn('akbar_events baris ' + e._row + ' (' + e.event_id + ') dilewati: opens_at/closes_at tidak terbaca.'); return; }
    if (c <= o) { console.warn('akbar_events baris ' + e._row + ' (' + e.event_id + ') dilewati: closes_at tidak setelah opens_at.'); return; }
    if (!r) r = new Date(c.getTime() + AKBAR_RESULTS_DELAY_H * 3600000);
    e.event_id = String(e.event_id).trim(); e.package_id = String(e.package_id).trim();
    e.status = String(e.status || '').trim().toLowerCase();
    e.opens_at = o.toISOString(); e.closes_at = c.toISOString(); e.results_at = r.toISOString();
    out.push(e);
  });
  return out.sort(function (a, b) { return new Date(a.opens_at) - new Date(b.opens_at); });
}

/** Admin: periksa sheet akbar_events dan tampilkan cara server membaca tiap baris. */
function checkAkbarEvents() {
  var pk = {}; getPackages_().forEach(function (p) { pk[p.packageId] = p; });
  readAll_('akbar_events').forEach(function (e) {
    var o = akbarDate_(e.opens_at), c = akbarDate_(e.closes_at), r = akbarDate_(e.results_at);
    var p = pk[String(e.package_id).trim()];
    var problems = [];
    if (!e.event_id) problems.push('event_id kosong');
    if (!o) problems.push('opens_at tidak terbaca: "' + e.opens_at + '"');
    if (!c) problems.push('closes_at tidak terbaca: "' + e.closes_at + '"');
    if (!r) problems.push('results_at kosong/tidak terbaca (dipakai closes_at + 9 jam)');
    if (o && c && c <= o) problems.push('closes_at harus setelah opens_at');
    if (!p) problems.push('paket ' + e.package_id + ' tidak ditemukan / belum live (jalankan refreshQuestionCache)');
    else if (p.type !== 'akbar') problems.push('paket ' + e.package_id + ' bertipe ' + p.type + ', harus akbar');
    var st = (o && c && p) ? akbarState_({ opens_at: o.toISOString(), closes_at: c.toISOString(), package_id: p.packageId, status: String(e.status).trim().toLowerCase() }) : '-';
    Logger.log((problems.length ? '⚠️ ' : '✅ ') + 'baris ' + e._row + ' ' + e.event_id + ' · ' + e.package_id +
      ' · buka ' + (o ? fmtJkt_(o) : '?') + ' · tutup ' + (c ? fmtJkt_(c) : '?') + ' · terbit ' + (r ? fmtJkt_(r) : '?') +
      ' · status ' + (e.status || '-') + ' · keadaan ' + st + (problems.length ? '\n     → ' + problems.join('; ') : ''));
  });
}

function akbarLastStart_(ev) {
  var dur = 100;
  try { dur = Number(getPackage_(ev.package_id).durationMin) || 100; } catch (e) { /* paket belum live: pakai 100 menit */ }
  return new Date(new Date(ev.closes_at).getTime() - dur * 60000);
}

function akbarState_(ev, now) {
  now = now || Date.now();
  if (ev.status === 'published') return 'published';
  if (now < new Date(ev.opens_at).getTime()) return 'upcoming';
  if (now < akbarLastStart_(ev).getTime()) return 'open';
  if (now < new Date(ev.closes_at).getTime()) return 'closing';
  return 'scoring';
}

/**
 * Buat jadwal untuk paket bertipe "akbar" yang belum terjadwal, satu paket per hari Minggu berikutnya.
 * Aman dijalankan ulang. Ubah jam/tanggal langsung di sheet akbar_events bila perlu.
 */
function scheduleAkbarEvents() {
  var events = readAll_('akbar_events');
  var scheduled = {}; var taken = {};
  events.forEach(function (e) { scheduled[e.package_id] = true; taken[String(e.opens_at).slice(0, 10)] = true; });
  var pkgs = getPackages_().filter(function (p) { return p.type === 'akbar' && !scheduled[p.packageId]; });
  var dayOffset = 1, made = 0;
  pkgs.forEach(function (p) {
    var date;
    do {
      var d = jktDay_(dayOffset++);
      date = d.dow === 0 && !taken[d.date] ? d.date : null;
    } while (!date && dayOffset < 400);
    taken[date] = true;
    var opens = new Date(date + 'T' + AKBAR_OPEN + ':00+07:00');
    var closes = new Date(date + 'T' + AKBAR_CLOSE + ':00+07:00');
    insert_('akbar_events', {
      event_id: 'AK-' + date.replace(/-/g, ''), package_id: p.packageId, title: p.title,
      opens_at: opens.toISOString(), closes_at: closes.toISOString(),
      results_at: new Date(closes.getTime() + AKBAR_RESULTS_DELAY_H * 3600000).toISOString(),
      status: 'scheduled', participants: '', created_at: nowIso_()
    });
    made++;
    Logger.log('Terjadwal: ' + p.packageId + ' → Minggu ' + date + ' 06.00–21.00 WIB');
  });
  Logger.log(made ? made + ' event dibuat.' : 'Tidak ada paket akbar baru untuk dijadwalkan.');
}

/* ================= Handler ================= */

/** getAkbarInfo (auth optional): event berjalan/berikutnya, status peserta, riwayat. */
function handleGetAkbarInfo_(payload, user) {
  var events = akbarEvents_();
  var now = Date.now();
  var mine = user ? findAll_('attempts', 'user_id', user.userId).filter(function (a) { return a.type === 'akbar'; }) : [];
  var myResults = user ? findAll_('akbar_results', 'user_id', user.userId) : [];

  var current = events.filter(function (e) { return ['upcoming', 'open', 'closing', 'scoring'].indexOf(akbarState_(e, now)) >= 0; })[0] || null;
  var past = events.filter(function (e) { return e.status === 'published'; }).reverse().slice(0, 6);

  function pub(e) {
    var pkg = getPackage_(e.package_id);
    var att = mine.filter(function (a) { return a.event_id === e.event_id; })[0];
    var res = myResults.filter(function (r) { return r.event_id === e.event_id; })[0];
    var qCount = 0;
    qCount = packageQuestionCount_(pkg);
    return {
      eventId: e.event_id, title: e.title || pkg.title, opensAt: toIso_(e.opens_at), closesAt: toIso_(e.closes_at),
      lastStartAt: akbarLastStart_(e).toISOString(), resultsAt: toIso_(e.results_at), state: akbarState_(e, now),
      durationMin: pkg.durationMin, questionCount: qCount, participants: Number(e.participants) || null,
      my: att ? {
        attemptId: att.attempt_id, status: att.status,
        endsAt: att.status === 'in_progress' ? toIso_(att.ends_at) : null,
        rank: res ? Number(res.rank) : null, total: res ? Number(res.total) : null,
        percentile: res ? Number(res.percentile) : null, passedAll: res ? isTrue_(res.passed_all) : null
      } : null
    };
  }
  // satu event bermasalah (mis. paket belum live) tidak boleh membuat seluruh halaman gagal
  function safePub(e) {
    try { return pub(e); } catch (err) { console.warn('getAkbarInfo: event ' + e.event_id + ' dilewati: ' + (err && err.message)); return null; }
  }
  return {
    serverNow: nowIso_(), loggedIn: Boolean(user), premium: Boolean(user && user.plan === 'premium'),
    current: current ? safePub(current) : null,
    next: events.filter(function (e) { return akbarState_(e, now) === 'upcoming' && (!current || e.event_id !== current.event_id); }).slice(0, 3).map(function (e) {
      return { eventId: e.event_id, title: e.title, opensAt: toIso_(e.opens_at), closesAt: toIso_(e.closes_at) };
    }),
    past: past.map(safePub).filter(Boolean)
  };
}

/** joinAkbar (auth required): { eventId } → data ujian (format sama dengan startAttempt). */
function handleJoinAkbar_(payload, user) {
  var ev = akbarEvents_().filter(function (e) { return e.event_id === String(payload.eventId || ''); })[0];
  if (!ev) throw new AppError_('NOT_FOUND', 'Tryout Akbar tidak ditemukan.');
  var pkg = getPackage_(ev.package_id);
  var questions = getPackageQuestions_(ev.package_id);

  var attempt = withLock_(function () {
    var mine = finalizeExpiredAttempts_(user).filter(function (a) { return a.event_id === ev.event_id; });
    var running = mine.filter(function (a) { return a.status === 'in_progress'; })[0];
    if (running) return running;
    if (mine.length) throw new AppError_('ALREADY_DONE', 'Kamu sudah mengikuti Tryout Akbar ini. Hasil dan peringkat terbit ' + fmtJkt_(ev.results_at) + '.');
    var state = akbarState_(ev);
    if (state === 'upcoming') throw new AppError_('NOT_OPEN', 'Tryout Akbar dibuka ' + fmtJkt_(ev.opens_at) + '.');
    if (state !== 'open') throw new AppError_('CLOSED', 'Batas mulai Tryout Akbar sudah lewat.');
    var now = new Date();
    var row = {
      attempt_id: newId_('t'), user_id: user.userId, package_id: ev.package_id, type: 'akbar', status: 'in_progress',
      started_at: now.toISOString(), ends_at: new Date(now.getTime() + pkg.durationMin * 60000).toISOString(),
      answers_json: '{}', event_id: ev.event_id
    };
    insert_('attempts', row);
    return row;
  });

  return {
    attemptId: attempt.attempt_id, packageId: ev.package_id, eventId: ev.event_id, title: ev.title || pkg.title,
    durationMin: pkg.durationMin, startedAt: toIso_(attempt.started_at), endsAt: toIso_(attempt.ends_at),
    serverNow: nowIso_(), resultsAt: toIso_(ev.results_at),
    questions: publicQuestions_(questions), answers: safeParse_(attempt.answers_json, {})
  };
}

/** getAkbarRanking (auth optional): { eventId, scope: "national" | "province" } */
function handleGetAkbarRanking_(payload, user) {
  var ev = akbarEvents_().filter(function (e) { return e.event_id === String(payload.eventId || ''); })[0];
  if (!ev) throw new AppError_('NOT_FOUND', 'Tryout Akbar tidak ditemukan.');
  if (ev.status !== 'published') throw new AppError_('RESULTS_PENDING', 'Peringkat terbit ' + fmtJkt_(ev.results_at) + '.');
  var premium = Boolean(user && user.plan === 'premium');
  var scope = payload.scope === 'province' ? 'province' : 'national';
  var board = akbarBoard_(ev.event_id);

  var me = null, myRow = null;
  if (user) {
    myRow = findAll_('akbar_results', 'user_id', user.userId).filter(function (r) { return r.event_id === ev.event_id; })[0] || null;
    if (myRow) me = {
      rank: Number(myRow.rank), percentile: Number(myRow.percentile), total: Number(myRow.total),
      twk: Number(myRow.twk), tiu: Number(myRow.tiu), tkp: Number(myRow.tkp), passedAll: isTrue_(myRow.passed_all),
      province: myRow.province, provinceRank: Number(myRow.province_rank) || null, provinceTotal: Number(myRow.province_total) || null,
      attemptId: myRow.attempt_id
    };
  }

  var out = { event: { eventId: ev.event_id, title: ev.title, resultsAt: toIso_(ev.results_at) }, scope: scope, premium: premium,
    stats: board.stats, me: me, top: board.top };
  if (scope === 'province') {
    if (!premium) throw new AppError_('FORBIDDEN', 'Peringkat per provinsi tersedia untuk Premium.');
    var prov = String(payload.province || (me && me.province) || '');
    var pb = board.byProvince[prov] || { n: 0, top: [] };
    out.province = prov; out.top = pb.top; out.provinceCount = pb.n;
  }
  if (premium && me) {
    out.analysis = ['twk', 'tiu', 'tkp'].map(function (s) {
      return { subtest: s, mine: me[s], median: board.stats.median[s], top10: board.stats.top10[s], pg: board.stats.pg[s] };
    });
  }
  return out;
}

/* ================= Penilaian & peringkat ================= */

function rankCompare_(a, b) {
  return b.total - a.total || b.tkp - a.tkp || b.tiu - a.tiu || b.twk - a.twk || a.duration - b.duration;
}

function maskName_(name) {
  var parts = String(name || 'Peserta').trim().split(/\s+/);
  return parts[0].slice(0, 16) + (parts[1] ? ' ' + parts[1].charAt(0).toUpperCase() + '.' : '');
}

/** Pemicu (tiap jam): terbitkan hasil event yang sudah melewati results_at. */
function publishAkbarResults() {
  var now = Date.now();
  akbarEvents_().forEach(function (ev) {
    if (ev.status === 'published' || now < new Date(ev.results_at).getTime()) return;
    var res = publishAkbarEvent_(ev);
    Logger.log('Terbit ' + ev.event_id + ': ' + res.n + ' peserta');
  });
}

function publishAkbarEvent_(ev) {
  var questions = getPackageQuestions_(ev.package_id);
  var pkg = getPackage_(ev.package_id);
  // nilai otomatis attempt yang masih berjalan (waktunya pasti sudah habis)
  var rows = readAll_('attempts').filter(function (a) { return a.event_id === ev.event_id; }).map(function (a) {
    if (a.status === 'in_progress') {
      try { return gradeAndStore_(a, questions, safeParse_(a.answers_json, {}), 'auto'); } catch (e) { return a; }
    }
    return a;
  }).filter(function (a) { return a.status === 'submitted'; });

  var users = {}; readAll_('users').forEach(function (u) { users[u.user_id] = u; });
  var profs = {}; readAll_('profiles').forEach(function (p) { profs[p.user_id] = p; });
  var list = rows.map(function (a) {
    var p = profs[a.user_id] || {};
    return {
      user_id: a.user_id, attempt_id: a.attempt_id, total: Number(a.total) || 0,
      twk: Number(a.twk) || 0, tiu: Number(a.tiu) || 0, tkp: Number(a.tkp) || 0,
      passed_all: isTrue_(a.passed_all), duration: Number(a.duration_sec) || 0,
      province: String(p.target_province || ''), education: String(p.education || ''),
      display_name: maskName_((users[a.user_id] || {}).name)
    };
  }).sort(rankCompare_);

  var n = list.length;
  var provCount = {}, provSeen = {};
  list.forEach(function (r) { provCount[r.province] = (provCount[r.province] || 0) + 1; });
  var published = nowIso_();
  var out = list.map(function (r, i) {
    provSeen[r.province] = (provSeen[r.province] || 0) + 1;
    return {
      event_id: ev.event_id, user_id: r.user_id, attempt_id: r.attempt_id, rank: i + 1, total: r.total,
      twk: r.twk, tiu: r.tiu, tkp: r.tkp, passed_all: String(r.passed_all),
      percentile: n > 1 ? Math.round(((n - (i + 1)) / (n - 1)) * 100) : 100,
      duration_sec: r.duration, province: r.province, province_rank: r.province ? provSeen[r.province] : '',
      province_total: r.province ? provCount[r.province] : '', education: r.education,
      display_name: r.display_name, published_at: published
    };
  });
  withLock_(function () {
    // hapus hasil lama event ini bila diterbitkan ulang
    var sh = sheet_('akbar_results');
    var old = findAll_('akbar_results', 'event_id', ev.event_id).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
    old.forEach(function (r) { sh.deleteRow(r); });
    insertMany_('akbar_results', out);
    var evRow = findOne_('akbar_events', 'event_id', ev.event_id);
    update_('akbar_events', evRow._row, { status: 'published', participants: n });
  });
  CacheService.getScriptCache().remove('akr_' + ev.event_id);
  akbarBoard_(ev.event_id, pkg.pg);
  return { n: n };
}

/** Ringkasan papan peringkat (di-cache). */
function akbarBoard_(eventId, pg) {
  var key = 'akr_' + eventId;
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var ev = findOne_('akbar_events', 'event_id', eventId);
  if (!pg) { try { pg = getPackage_(ev.package_id).pg; } catch (e) { pg = DEFAULT_PG; } }
  var rows = findAll_('akbar_results', 'event_id', eventId).map(function (r) {
    return { rank: Number(r.rank), name: r.display_name, province: r.province, total: Number(r.total),
      twk: Number(r.twk), tiu: Number(r.tiu), tkp: Number(r.tkp), passedAll: isTrue_(r.passed_all) };
  }).sort(function (a, b) { return a.rank - b.rank; });
  var n = rows.length;
  function q(arr, p) { if (!arr.length) return 0; var s = arr.slice().sort(function (a, b) { return a - b; }); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
  var top10 = rows.slice(0, Math.max(1, Math.ceil(n * 0.1)));
  var avg = function (arr, k) { return arr.length ? Math.round(arr.reduce(function (s, r) { return s + r[k]; }, 0) / arr.length) : 0; };
  var stats = {
    n: n, passRate: n ? Math.round(rows.filter(function (r) { return r.passedAll; }).length / n * 100) : 0,
    median: { total: q(rows.map(function (r) { return r.total; }), 0.5), twk: q(rows.map(function (r) { return r.twk; }), 0.5), tiu: q(rows.map(function (r) { return r.tiu; }), 0.5), tkp: q(rows.map(function (r) { return r.tkp; }), 0.5) },
    top10: { total: avg(top10, 'total'), twk: avg(top10, 'twk'), tiu: avg(top10, 'tiu'), tkp: avg(top10, 'tkp') },
    pg: pg
  };
  var byProvince = {};
  rows.forEach(function (r) {
    if (!r.province) return;
    var b = byProvince[r.province] || (byProvince[r.province] = { n: 0, top: [] });
    b.n++;
    if (b.top.length < AKBAR_PROVINCE_TOP_N) b.top.push(Object.assign({}, r, { provinceRank: b.n }));
  });
  var board = { stats: stats, top: rows.slice(0, AKBAR_TOP_N), byProvince: byProvince };
  cachePutJson_(key, board, 21600);
  return board;
}

/* ================= Utilitas ================= */

function fmtJkt_(iso) {
  var base = akbarDate_(iso);
  if (!base) return 'segera';
  var d = new Date(base.getTime() + 7 * 3600000);
  var days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var pad = function (x) { return (x < 10 ? '0' : '') + x; };
  return days[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + pad(d.getUTCHours()) + '.' + pad(d.getUTCMinutes()) + ' WIB';
}

function installAkbarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publishAkbarResults') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('publishAkbarResults').timeBased().everyHours(1).create();
  Logger.log('Pemicu publishAkbarResults (tiap jam) terpasang.');
}

/** Terbitkan ulang hasil satu event secara manual (ubah EVENT_ID). */
function adminRepublishAkbar() {
  var EVENT_ID = 'AK-YYYYMMDD';
  var ev = akbarEvents_().filter(function (e) { return e.event_id === EVENT_ID; })[0];
  if (!ev) return Logger.log('Event tidak ditemukan');
  Logger.log(JSON.stringify(publishAkbarEvent_(ev)));
}

/* ================= Uji beban ================= */

/**
 * loadProbe (auth none, butuh payload.key = Script Property LOADTEST_TOKEN).
 * Meniru biaya permintaan peserta: baca soal dari cache, cari 1 baris, tulis 1 baris di bawah lock.
 * Hapus/kosongkan LOADTEST_TOKEN setelah uji selesai.
 */
function handleLoadProbe_(payload) {
  var token = getConfigOptional_('LOADTEST_TOKEN', '');
  if (!token || String(payload.key || '') !== token) throw new AppError_('UNKNOWN_ACTION', 'Action "loadProbe" tidak dikenal.');
  var t0 = Date.now();
  var pkg = getPackages_().filter(function (p) { return p.type === 'akbar'; })[0] || getPackages_()[0];
  var qn = pkg ? getPackageQuestions_(pkg.packageId).length : 0;
  findOne_('users', 'email', 'loadtest@probe.invalid');
  withLock_(function () {
    insert_('loadtest_log', { at: nowIso_(), probe_id: cleanText_(payload.probeId || '', 40), note: 'q=' + qn });
  });
  return { ms: Date.now() - t0, questions: qn };
}
