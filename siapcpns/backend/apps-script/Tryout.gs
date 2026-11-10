/**
 * Tryout.gs — tryout CAT (Fase 3).
 *
 * Prinsip keamanan:
 *  - Soal dikirim TANPA kunci jawaban & skor TKP.
 *  - Kunci hanya ada di file bank soal (QUESTIONS_SPREADSHEET_ID) dan cache server.
 *  - Waktu ujian ditentukan server (ends_at). Frontend hanya menampilkan hitung mundur.
 *  - Penilaian dilakukan di server saat submitAttempt.
 *
 * Alur panggilan: getTryoutInfo → startAttempt → (saveProgress berkala) → submitAttempt → getReport
 */

var DEFAULT_PG = { twk: 65, tiu: 80, tkp: 166 };
var SUBTEST_LABEL = { twk: 'Tes Wawasan Kebangsaan', tiu: 'Tes Intelegensia Umum', tkp: 'Tes Karakteristik Pribadi', skb: 'Seleksi Kompetensi Bidang' };
/** Paket bertipe khusus yang tidak tampil di lobi tryout SKD. */
var NON_LOBBY_TYPES = ['latihan', 'akbar', 'skb'];
var GRACE_SEC = 180;           // toleransi keterlambatan kirim jawaban (detik)
var FREE_REVIEW_LIMIT = 5;     // jumlah pembahasan untuk pengguna gratis
var PKG_CACHE_SEC = 21600;   // cache daftar paket & soal (6 jam, maksimum CacheService); ditimpa pemicu per jam

var TOPICS = {
  'twk-pancasila': { subtest: 'twk', name: 'Pancasila' },
  'twk-uud': { subtest: 'twk', name: 'UUD 1945' },
  'twk-nkri': { subtest: 'twk', name: 'NKRI' },
  'twk-bhinneka': { subtest: 'twk', name: 'Bhinneka Tunggal Ika' },
  'twk-nasionalisme': { subtest: 'twk', name: 'Nasionalisme' },
  'twk-integritas': { subtest: 'twk', name: 'Integritas' },
  'twk-belanegara': { subtest: 'twk', name: 'Bela negara' },
  'twk-bahasa': { subtest: 'twk', name: 'Bahasa negara' },
  'tiu-analogi': { subtest: 'tiu', name: 'Analogi' },
  'tiu-silogisme': { subtest: 'tiu', name: 'Silogisme' },
  'tiu-analitis': { subtest: 'tiu', name: 'Penalaran analitis' },
  'tiu-deret': { subtest: 'tiu', name: 'Deret angka' },
  'tiu-hitung': { subtest: 'tiu', name: 'Hitungan & perbandingan' },
  'tiu-cerita': { subtest: 'tiu', name: 'Soal cerita' },
  'tiu-figural': { subtest: 'tiu', name: 'Figural' },
  'tkp-pelayanan': { subtest: 'tkp', name: 'Pelayanan publik' },
  'tkp-jejaring': { subtest: 'tkp', name: 'Jejaring kerja' },
  'tkp-sosbud': { subtest: 'tkp', name: 'Sosial budaya' },
  'tkp-tik': { subtest: 'tkp', name: 'Teknologi informasi' },
  'tkp-profesionalisme': { subtest: 'tkp', name: 'Profesionalisme' },
  'tkp-antiradikalisme': { subtest: 'tkp', name: 'Anti-radikalisme' }
};

/** Fase 8: topik SKB (terpisah dari TOPICS agar tidak masuk rencana/latihan SKD). */
var SKB_TOPICS = {
  'skb-asn': { subtest: 'skb', name: 'Manajemen ASN & disiplin' },
  'skb-pelayanan': { subtest: 'skb', name: 'Standar pelayanan publik' },
  'skb-adminpem': { subtest: 'skb', name: 'Administrasi pemerintahan' },
  'skb-kinerja': { subtest: 'skb', name: 'Akuntabilitas kinerja & anggaran' },
  'skb-integritas': { subtest: 'skb', name: 'Integritas & keterbukaan informasi' }
};

/* ================================================================== */
/* Paket & soal (dengan cache)                                         */
/* ================================================================== */

/*
 * SUMBER PAKET SOAL — dua cara, boleh dipakai bersamaan:
 *  1. QUESTIONS_SPREADSHEET_ID : satu file bank soal berisi banyak paket (cara Fase 3 awal).
 *  2. QUESTIONS_FOLDER_ID      : satu folder Google Drive, SATU FILE SPREADSHEET = SATU PAKET.
 *     Setiap file berisi sheet "packages" (1 baris) dan "questions" (format template).
 *     File baru di folder otomatis terbaca. Paket tampil jika status = live.
 * Kolom dibaca berdasarkan NAMA di baris judul, jadi urutan kolom boleh berbeda.
 */

/** Daftar paket live dari semua sumber (di-cache). Berisi fileId — jangan dikirim ke browser. */
function getPackages_() {
  var cached = cacheGetJson_('pkgs');
  if (cached) return cached;
  // Jalur lambat (cache kosong): hanya daftar paket. Pemicu warmQuestionCache biasanya mencegah ini terjadi.
  var list = buildPackageList_(loadPackageSources_(false));
  cachePutJson_('pkgs', list, PKG_CACHE_SEC);
  return list;
}

function buildPackageList_(sources) {
  var seen = {};
  var list = [];
  sources.forEach(function (src) {
    src.packages.forEach(function (p) {
      var id = String(p.package_id || '').trim();
      if (!id || String(p.status).toLowerCase() !== 'live') return;
      if (seen[id]) {
        console.warn('package_id ganda "' + id + '" di ' + src.label + ' diabaikan (sudah ada di ' + seen[id] + ')');
        return;
      }
      seen[id] = src.label;
      list.push({
        packageId: id,
        title: String(p.title || id),
        type: String(p.type || 'diagnostic'),
        description: String(p.description || ''),
        durationMin: Number(p.duration_min) || 100,
        pg: {
          twk: isBlank_(p.pg_twk) ? DEFAULT_PG.twk : Number(p.pg_twk),
          tiu: isBlank_(p.pg_tiu) ? DEFAULT_PG.tiu : Number(p.pg_tiu),
          tkp: isBlank_(p.pg_tkp) ? DEFAULT_PG.tkp : Number(p.pg_tkp)
        },
        freeAttempts: isBlank_(p.free_attempts) ? null : Number(p.free_attempts),
        order: Number(p.order) || 99,
        fileId: src.fileId,
        questionCount: null
      });
    });
  });
  list.sort(function (a, b) { return a.order - b.order || (a.packageId < b.packageId ? -1 : 1); });
  return list;
}

/**
 * Bangun ulang SEMUA cache paket dalam satu kali baca per file (packages + questions sekaligus),
 * lalu menimpa cache lama. Tidak pernah mengosongkan cache lebih dulu, jadi pengguna tidak pernah
 * mendapat "cache dingin" saat pembaruan berjalan.
 */
function rebuildPackageCache_() {
  var t0 = Date.now();
  var sources = loadPackageSources_(true);
  var list = buildPackageList_(sources);
  var bySrc = {};
  sources.forEach(function (s) { bySrc[s.fileId] = s; });
  var bankIndex = [];
  list.forEach(function (p) {
    try {
      var qs = parseQuestions_(bySrc[p.fileId].questions || [], p.packageId);
      p.questionCount = qs.length;
      if (qs.length) cachePutJson_('pq_' + p.packageId, qs, PKG_CACHE_SEC);
      if (p.type === 'latihan') qs.forEach(function (q) { bankIndex.push([q.id, p.packageId, q.topicId]); });
    } catch (e) { console.warn(p.packageId + ': ' + e.message); }
  });
  cachePutJson_('pkgs', list, PKG_CACHE_SEC);
  cachePutJson_('pbx', bankIndex, PKG_CACHE_SEC);
  Logger.log('Cache paket dibangun ulang: ' + list.length + ' paket, ' + bankIndex.length + ' soal latihan, ' + Math.round((Date.now() - t0) / 1000) + ' detik.');
  return list;
}

/** Jumlah soal sebuah paket tanpa memuat seluruh soal (dari daftar paket bila sudah dihitung). */
function packageQuestionCount_(p) {
  if (p.questionCount !== null && p.questionCount !== undefined) return p.questionCount;
  try { return getPackageQuestions_(p.packageId).length; } catch (e) { return 0; }
}

/** Baca sheet "packages" (dan bila diminta, "questions") dari semua sumber. */
function loadPackageSources_(withQuestions) {
  var sources = [];
  var add = function (ss, fileId, label) {
    var src = { fileId: fileId, label: label, packages: readTable_(ss, 'packages') };
    if (withQuestions) src.questions = readTable_(ss, 'questions');
    sources.push(src);
  };
  var single = getConfigOptional_('QUESTIONS_SPREADSHEET_ID', '');
  if (single) add(SpreadsheetApp.openById(single), single, 'bank soal utama');
  var folderId = getConfigOptional_('QUESTIONS_FOLDER_ID', '');
  if (folderId) {
    var files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      var f = files.next();
      if (f.isTrashed && f.isTrashed()) continue;
      try {
        add(SpreadsheetApp.openById(f.getId()), f.getId(), 'file "' + f.getName() + '"');
      } catch (e) {
        console.warn('Lewati file "' + f.getName() + '": ' + e.message);
      }
    }
  }
  if (!single && !folderId) {
    throw new AppError_('CONFIG_MISSING', 'Isi Script Property QUESTIONS_FOLDER_ID atau QUESTIONS_SPREADSHEET_ID.');
  }
  return sources;
}

/**
 * Baca sebuah sheet sebagai array objek dengan kunci = nama kolom di baris 1 (huruf kecil).
 * Sheet tidak ada → array kosong.
 */
function readTable_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var o = {};
    var empty = true;
    for (var c = 0; c < head.length; c++) {
      if (!head[c]) continue;
      var v = values[r][c];
      o[head[c]] = v === null || v === undefined ? '' : v;
      if (o[head[c]] !== '') empty = false;
    }
    if (!empty) out.push(o);
  }
  return out;
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined;
}

function getPackage_(packageId) {
  var p = getPackages_().filter(function (x) { return x.packageId === packageId; })[0];
  if (!p) throw new AppError_('NOT_FOUND', 'Paket tryout tidak ditemukan atau belum dibuka.');
  return p;
}

/** Soal lengkap (dengan kunci) untuk satu paket. HANYA untuk dipakai di server. */
function getPackageQuestions_(packageId) {
  var key = 'pq_' + packageId;
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var pkg = getPackage_(packageId);
  var list = parseQuestions_(readTable_(SpreadsheetApp.openById(pkg.fileId), 'questions'), packageId);
  if (!list.length) throw new AppError_('NOT_FOUND', 'Soal untuk paket ini belum tersedia.');
  cachePutJson_(key, list, PKG_CACHE_SEC);
  return list;
}

function parseQuestions_(rows, packageId) {
  var letters = ['a', 'b', 'c', 'd', 'e'];
  return rows
    .filter(function (q) {
      return String(q.package_id).trim() === packageId && q.question_id !== '' &&
        String(q.status || 'live').toLowerCase() === 'live';
    })
    .map(function (q) {
      var opts = [];
      letters.forEach(function (l) {
        var t = String(q['option_' + l] === undefined ? '' : q['option_' + l]);
        if (t) opts.push({ key: l, text: t, score: isBlank_(q['score_' + l]) ? null : Number(q['score_' + l]) });
      });
      return {
        id: String(q.question_id),
        number: Number(q.number) || 0,
        subtest: String(q.subtest).trim().toLowerCase(),
        topicId: String(q.topic_id || '').trim(),
        text: String(q.text),
        context: String(q.context || ''),
        options: opts,
        answer: String(q.answer || '').trim().toLowerCase(),
        explanation: String(q.explanation || '')
      };
    })
    .sort(function (a, b) { return a.number - b.number; });
}

/** Versi aman untuk dikirim ke peserta (tanpa kunci & skor). */
function publicQuestions_(questions) {
  return questions.map(function (q) {
    return {
      id: q.id, number: q.number, subtest: q.subtest, topicId: q.topicId,
      text: q.text, context: q.context,
      options: q.options.map(function (o) { return { key: o.key, text: o.text }; })
    };
  });
}

function clearPackageCache_(packageId) {
  resetMemo_();
  var c = CacheService.getScriptCache();
  c.remove('pbx');
  c.remove('pkgs');
  if (packageId) {
    c.remove('pq_' + packageId);
    for (var i = 0; i < 10; i++) c.remove('pq_' + packageId + '__' + i);
  }
}

/** Jalankan dari editor setelah mengubah soal/paket agar perubahan langsung aktif. */
function refreshQuestionCache() {
  var list = rebuildPackageCache_();
  Logger.log('Paket live: ' + list.map(function (p) { return p.packageId + ' (' + p.questionCount + ')'; }).join(', '));
}

/**
 * Periksa semua file paket (folder & bank soal utama) dan tulis laporannya di Execution log:
 * jumlah soal per subtes dan baris yang belum lengkap. Tidak mengubah data.
 */
function checkQuestionFolder() {
  var target = { twk: 30, tiu: 35, tkp: 45 };
  loadPackageSources_().forEach(function (src) {
    var ss = SpreadsheetApp.openById(src.fileId);
    var rows = readTable_(ss, 'questions');
    if (!src.packages.length) { Logger.log('⚠ ' + src.label + ': sheet "packages" kosong/tidak ada'); return; }
    src.packages.forEach(function (p) {
      var id = String(p.package_id);
      var qs = rows.filter(function (q) { return String(q.package_id).trim() === id; });
      var count = { twk: 0, tiu: 0, tkp: 0 };
      var problems = [];
      qs.forEach(function (q) {
        var sub = String(q.subtest).trim().toLowerCase();
        if (count[sub] === undefined) { problems.push(q.question_id + ': subtest tidak dikenal'); return; }
        count[sub]++;
        var opts = ['a', 'b', 'c', 'd', 'e'].filter(function (l) { return !isBlank_(q['option_' + l]); });
        if (isBlank_(q.text)) problems.push(q.question_id + ': soal kosong');
        else if (opts.length < 5) problems.push(q.question_id + ': opsi kurang dari 5');
        else if (sub === 'tkp') {
          var sc = ['a', 'b', 'c', 'd', 'e'].map(function (l) { return Number(q['score_' + l]); });
          if (sc.some(function (x) { return !(x >= 1 && x <= 5); })) problems.push(q.question_id + ': skor TKP harus 1-5');
          else if (sc.filter(function (x) { return x === 5; }).length !== 1) problems.push(q.question_id + ': TKP harus tepat 1 opsi bernilai 5');
        } else if (['a', 'b', 'c', 'd', 'e'].indexOf(String(q.answer).trim().toLowerCase()) < 0) {
          problems.push(q.question_id + ': kunci jawaban kosong/tidak valid');
        }
        if (isBlank_(q.explanation)) problems.push(q.question_id + ': pembahasan kosong');
      });
      var full = count.twk === target.twk && count.tiu === target.tiu && count.tkp === target.tkp;
      Logger.log((problems.length ? '⚠ ' : '✓ ') + id + ' (' + src.label + ') status=' + p.status +
        ' · TWK ' + count.twk + ' · TIU ' + count.tiu + ' · TKP ' + count.tkp + (full ? ' · lengkap 110' : ' · bukan paket penuh') +
        (problems.length ? ' · ' + problems.length + ' masalah' : ''));
      if (!full && (isBlank_(p.pg_twk) || isBlank_(p.pg_tiu) || isBlank_(p.pg_tkp))) {
        Logger.log('    - Paket bukan 110 soal tetapi pg_twk/pg_tiu/pg_tkp kosong → ambang batas 65/80/166 akan dipakai. Isi angka yang sesuai.');
      }
      problems.slice(0, 15).forEach(function (m) { Logger.log('    - ' + m); });
      if (problems.length > 15) Logger.log('    … dan ' + (problems.length - 15) + ' lainnya');
    });
  });
}

/** Dipanggil trigger per jam: membangun ulang daftar paket agar file baru di folder otomatis muncul. */
function warmQuestionCache() {
  rebuildPackageCache_();
}

/** Jalankan SEKALI dari editor: pasang trigger per jam untuk warmQuestionCache. */
function installQuestionTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'warmQuestionCache') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('warmQuestionCache').timeBased().everyHours(1).create();
  Logger.log('Trigger per jam terpasang. File paket baru akan muncul paling lambat ± 1 jam (atau jalankan refreshQuestionCache untuk langsung).');
}

/* ================================================================== */
/* Handler                                                             */
/* ================================================================== */

/** Daftar paket + status percobaan pengguna. */
function handleGetTryoutInfo_(payload, user) {
  var attempts = finalizeExpiredAttempts_(user);
  // payload.type = "skb" → hanya paket SKB (halaman skb.html); selain itu lobi tryout SKD
  var wantSkb = payload && payload.type === 'skb';
  var packages = getPackages_().filter(function (p) {
    return wantSkb ? p.type === 'skb' : NON_LOBBY_TYPES.indexOf(p.type) < 0;
  }).map(function (p) {
    var mine = attempts.filter(function (a) { return a.package_id === p.packageId; });
    var done = mine.filter(function (a) { return a.status === 'submitted'; });
    var running = mine.filter(function (a) { return a.status === 'in_progress'; })[0];
    var gate = canStart_(p, user, done.length);
    var qCount = 0;
    qCount = packageQuestionCount_(p);
    return {
      packageId: p.packageId, title: p.title, type: p.type, description: p.description,
      durationMin: p.durationMin, pg: p.pg, questionCount: qCount,
      attempts: done.map(attemptSummary_).reverse(),
      inProgress: running ? { attemptId: running.attempt_id, endsAt: toIso_(running.ends_at) } : null,
      canStart: Boolean(running) || gate.ok,
      lockReason: running ? null : gate.reason
    };
  });
  return { packages: packages, plan: user.plan, serverNow: nowIso_() };
}

function handleStartAttempt_(payload, user) {
  var packageId = String(payload.packageId || '');
  var pkg = getPackage_(packageId);
  if (pkg.type === 'latihan' || pkg.type === 'akbar') throw new AppError_('NOT_FOUND', 'Paket tryout tidak ditemukan atau belum dibuka.'); // skb boleh
  var questions = getPackageQuestions_(packageId);

  var attempt = withLock_(function () {
    var mine = finalizeExpiredAttempts_(user).filter(function (a) { return a.package_id === packageId; });
    var running = mine.filter(function (a) { return a.status === 'in_progress'; })[0];
    if (running) return running;

    var done = mine.filter(function (a) { return a.status === 'submitted'; }).length;
    var gate = canStart_(pkg, user, done);
    if (!gate.ok) throw new AppError_('FORBIDDEN', gate.message);

    var now = new Date();
    var row = {
      attempt_id: newId_('t'),
      user_id: user.userId,
      package_id: packageId,
      type: pkg.type,
      status: 'in_progress',
      started_at: now.toISOString(),
      ends_at: new Date(now.getTime() + pkg.durationMin * 60000).toISOString(),
      answers_json: '{}'
    };
    insert_('attempts', row);
    return row;
  });

  return {
    attemptId: attempt.attempt_id,
    packageId: packageId,
    title: pkg.title,
    durationMin: pkg.durationMin,
    startedAt: toIso_(attempt.started_at),
    endsAt: toIso_(attempt.ends_at),
    serverNow: nowIso_(),
    questions: publicQuestions_(questions),
    answers: safeParse_(attempt.answers_json, {})
  };
}

/** Simpan jawaban sementara (dipanggil berkala oleh frontend). */
function handleSaveProgress_(payload, user) {
  var row = getOwnAttempt_(payload.attemptId, user);
  if (row.status !== 'in_progress') return { saved: false, status: row.status };
  if (Date.now() > new Date(row.ends_at).getTime() + GRACE_SEC * 1000) return { saved: false, status: 'expired' };
  var questions = getPackageQuestions_(row.package_id);
  var answers = sanitizeAnswers_(payload.answers, questions);
  update_('attempts', row._row, { answers_json: JSON.stringify(answers) });
  return { saved: true, count: Object.keys(answers).length, savedAt: nowIso_() };
}

function handleSubmitAttempt_(payload, user) {
  var result = withLock_(function () {
    var row = getOwnAttempt_(payload.attemptId, user);
    if (row.status === 'submitted') return row; // idempoten: kirim ulang tidak menilai ulang

    var questions = getPackageQuestions_(row.package_id);
    var late = Date.now() > new Date(row.ends_at).getTime() + GRACE_SEC * 1000;
    // Lewat batas toleransi: pakai jawaban terakhir yang tersimpan di server.
    var answers = late ? safeParse_(row.answers_json, {}) : sanitizeAnswers_(payload.answers, questions);
    var mode = late ? 'late' : (payload.finishMode === 'timeout' ? 'timeout' : 'manual');
    return gradeAndStore_(row, questions, answers, mode);
  });
  return { attemptId: result.attempt_id, status: 'submitted' };
}

function handleGetReport_(payload, user) {
  var row = getOwnAttempt_(payload.attemptId, user);
  if (row.status === 'in_progress') {
    if (Date.now() > new Date(row.ends_at).getTime() + GRACE_SEC * 1000) {
      row = withLock_(function () {
        return gradeAndStore_(row, getPackageQuestions_(row.package_id), safeParse_(row.answers_json, {}), 'auto');
      });
    } else {
      throw new AppError_('NOT_FINISHED', 'Tryout ini masih berlangsung.');
    }
  }
  if (row.type === 'akbar') {
    // Kunci jawaban & skor Tryout Akbar baru dibuka setelah hasil terbit (mencegah bocoran saat event berjalan)
    var ev = findOne_('akbar_events', 'event_id', row.event_id);
    if (!ev || ev.status !== 'published') {
      throw new AppError_('RESULTS_PENDING', 'Jawabanmu sudah tersimpan. Skor, rapor, dan peringkat terbit ' + (ev ? fmtJkt_(ev.results_at) : 'setelah event selesai') + '.');
    }
  }
  return buildReport_(row, user);
}

/* ================================================================== */
/* Penilaian                                                           */
/* ================================================================== */

function gradeAndStore_(row, questions, answers, mode) {
  var pkg = getPackage_(row.package_id);
  var g = grade_(questions, answers);
  if (pkg.type === 'skb') return storeSkbGrade_(row, g, answers, mode);
  var passed = {
    twk: g.sub.twk.score >= pkg.pg.twk,
    tiu: g.sub.tiu.score >= pkg.pg.tiu,
    tkp: g.sub.tkp.score >= pkg.pg.tkp
  };
  var submittedAt = new Date();
  var duration = Math.round((Math.min(submittedAt.getTime(), new Date(row.ends_at).getTime()) - new Date(row.started_at).getTime()) / 1000);
  return update_('attempts', row._row, {
    status: 'submitted',
    submitted_at: submittedAt.toISOString(),
    twk: g.sub.twk.score, tiu: g.sub.tiu.score, tkp: g.sub.tkp.score,
    total: g.sub.twk.score + g.sub.tiu.score + g.sub.tkp.score,
    passed_twk: String(passed.twk), passed_tiu: String(passed.tiu), passed_tkp: String(passed.tkp),
    passed_all: String(passed.twk && passed.tiu && passed.tkp),
    answered: g.answered,
    correct_json: JSON.stringify(g.sub),
    topic_json: JSON.stringify(g.topics),
    answers_json: JSON.stringify(answers),
    duration_sec: Math.max(0, duration),
    finish_mode: mode
  });
}

/** Simpan nilai paket SKB: tidak ada ambang batas SKD; total = skor SKB (benar × 5). */
function storeSkbGrade_(row, g, answers, mode) {
  var submittedAt = new Date();
  var duration = Math.round((Math.min(submittedAt.getTime(), new Date(row.ends_at).getTime()) - new Date(row.started_at).getTime()) / 1000);
  return update_('attempts', row._row, {
    status: 'submitted', submitted_at: submittedAt.toISOString(),
    twk: '', tiu: '', tkp: '', total: g.sub.skb.score,
    passed_twk: '', passed_tiu: '', passed_tkp: '', passed_all: '',
    answered: g.answered, correct_json: JSON.stringify(g.sub), topic_json: JSON.stringify(g.topics),
    answers_json: JSON.stringify(answers), duration_sec: Math.max(0, duration), finish_mode: mode
  });
}

/**
 * TWK, TIU & SKB: benar 5, salah/kosong 0.
 * TKP: nilai opsi 1–5 sesuai kunci skor, kosong 0.
 */
function grade_(questions, answers) {
  var sub = {};
  ['twk', 'tiu', 'tkp', 'skb'].forEach(function (s) { sub[s] = { score: 0, max: 0, total: 0, answered: 0, correct: 0 }; });
  var topics = {};
  var answered = 0;

  questions.forEach(function (q) {
    var s = sub[q.subtest];
    if (!s) return;
    var ans = answers[q.id];
    var points = 0;
    var maxPts = 5;
    s.total++;
    s.max += maxPts;
    if (ans) {
      answered++;
      s.answered++;
      if (q.subtest === 'tkp') {
        var opt = q.options.filter(function (o) { return o.key === ans; })[0];
        points = opt && opt.score ? opt.score : 0;
        if (points >= 4) s.correct++;
      } else if (ans === q.answer) {
        points = 5;
        s.correct++;
      }
    }
    s.score += points;
    var t = topics[q.topicId] || (topics[q.topicId] = { points: 0, max: 0, total: 0, answered: 0 });
    t.points += points;
    t.max += maxPts;
    t.total++;
    if (ans) t.answered++;
  });

  return { sub: sub, topics: topics, answered: answered };
}

/* ================================================================== */
/* Rapor                                                               */
/* ================================================================== */

function buildReport_(row, user) {
  var pkg = getPackage_(row.package_id);
  var premium = user.plan === 'premium';
  var sub = safeParse_(row.correct_json, {});
  var topicStats = safeParse_(row.topic_json, {});
  var answers = safeParse_(row.answers_json, {});
  var questions = getPackageQuestions_(row.package_id);

  var isSkb = pkg.type === 'skb';
  var subtests = (isSkb ? ['skb'] : ['twk', 'tiu', 'tkp']).map(function (id) {
    var s = sub[id] || { score: 0, max: 0, total: 0, answered: 0, correct: 0 };
    var pgv = isSkb ? null : pkg.pg[id];
    return {
      id: id, label: SUBTEST_LABEL[id], score: s.score, max: s.max, passingGrade: pgv,
      passed: isSkb ? null : s.score >= pgv, answered: s.answered, total: s.total, correct: s.correct
    };
  });

  // Topik diurutkan dari yang paling lemah
  var topics = Object.keys(topicStats).map(function (id) {
    var t = topicStats[id];
    var meta = TOPICS[id] || SKB_TOPICS[id] || { subtest: '', name: id };
    return { topicId: id, name: meta.name, subtest: meta.subtest, pct: t.max ? Math.round((t.points / t.max) * 100) : 0, answered: t.answered, total: t.total };
  }).sort(function (a, b) { return a.pct - b.pct; });

  var visibleTopics = topics.map(function (t, i) {
    if (premium || i === 0) return t; // gratis: hanya topik terlemah yang terbuka
    return { topicId: t.topicId, name: t.name, subtest: t.subtest, locked: true };
  });

  // Pembahasan: gratis 5 soal dari topik terlemah, premium semua soal
  var weakOrder = {};
  topics.forEach(function (t, i) { weakOrder[t.topicId] = i; });
  var reviewPool = questions.map(function (q) {
    var ans = answers[q.id] || '';
    var opt = q.options.filter(function (o) { return o.key === ans; })[0];
    var pts = q.subtest === 'tkp' ? (opt && opt.score ? opt.score : 0) : (ans && ans === q.answer ? 5 : 0);
    var best = q.subtest === 'tkp'
      ? q.options.reduce(function (a, b) { return (b.score || 0) > (a.score || 0) ? b : a; }, q.options[0])
      : q.options.filter(function (o) { return o.key === q.answer; })[0];
    return {
      number: q.number, subtest: q.subtest, topic: (TOPICS[q.topicId] || SKB_TOPICS[q.topicId] || {}).name || q.topicId,
      text: q.text, context: q.context,
      options: q.options.map(function (o) { return { key: o.key, text: o.text, score: q.subtest === 'tkp' ? o.score : null }; }),
      yourAnswer: ans, bestAnswer: best ? best.key : '', points: pts, explanation: q.explanation,
      _weak: weakOrder[q.topicId] || 0
    };
  });
  var review = premium
    ? reviewPool
    : reviewPool.filter(function (r) { return r.points < 5; })
      .sort(function (a, b) { return a._weak - b._weak || a.number - b.number; })
      .slice(0, FREE_REVIEW_LIMIT)
      .sort(function (a, b) { return a.number - b.number; });
  review.forEach(function (r) { delete r._weak; });

  var wrongCount = reviewPool.filter(function (r) { return r.points < 5; }).length;

  return {
    attemptId: row.attempt_id,
    package: { packageId: pkg.packageId, title: pkg.title, type: pkg.type, durationMin: pkg.durationMin },
    startedAt: toIso_(row.started_at),
    submittedAt: toIso_(row.submitted_at),
    durationSec: Number(row.duration_sec) || 0,
    finishMode: String(row.finish_mode || ''),
    total: Number(row.total) || 0,
    maxTotal: subtests.reduce(function (a, s) { return a + s.max; }, 0),
    passedAll: isSkb ? null : isTrue_(row.passed_all),
    score100: isSkb && subtests[0].max ? Math.round(subtests[0].score / subtests[0].max * 100) : null,
    answered: Number(row.answered) || 0,
    questionCount: questions.length,
    subtests: subtests,
    topics: visibleTopics,
    topicsLocked: !premium && topics.length > 1,
    review: review,
    reviewLocked: !premium,
    reviewTotal: wrongCount,
    premium: premium
  };
}

/* ================================================================== */
/* Utilitas                                                            */
/* ================================================================== */

function canStart_(pkg, user, doneCount) {
  if (pkg.freeAttempts !== null && user.plan !== 'premium' && doneCount >= pkg.freeAttempts) {
    return { ok: false, reason: 'FREE_LIMIT', message: 'Kuota gratis untuk paket ini sudah dipakai. Lihat rapormu atau tunggu paket premium.' };
  }
  return { ok: true, reason: null };
}

/** Ambil semua attempt milik user; attempt yang waktunya sudah habis dinilai otomatis. */
function finalizeExpiredAttempts_(user) {
  var rows = findAll_('attempts', 'user_id', user.userId);
  var now = Date.now();
  return rows.map(function (r) {
    if (r.status === 'in_progress' && now > new Date(r.ends_at).getTime() + GRACE_SEC * 1000) {
      try {
        return gradeAndStore_(r, getPackageQuestions_(r.package_id), safeParse_(r.answers_json, {}), 'auto');
      } catch (e) {
        console.warn('Gagal menilai otomatis ' + r.attempt_id + ': ' + e.message);
      }
    }
    return r;
  });
}

function getOwnAttempt_(attemptId, user) {
  var row = findOne_('attempts', 'attempt_id', String(attemptId || ''));
  // Pesan sama untuk "tidak ada" dan "bukan milikmu" agar tidak membocorkan informasi.
  if (!row || row.user_id !== user.userId) throw new AppError_('NOT_FOUND', 'Data tryout tidak ditemukan.');
  return row;
}

function sanitizeAnswers_(raw, questions) {
  var out = {};
  if (!raw || typeof raw !== 'object') return out;
  var valid = {};
  questions.forEach(function (q) { valid[q.id] = q.options.map(function (o) { return o.key; }); });
  Object.keys(raw).forEach(function (k) {
    var v = String(raw[k] || '').toLowerCase();
    if (valid[k] && valid[k].indexOf(v) >= 0) out[k] = v;
  });
  return out;
}

function attemptSummary_(r) {
  return {
    attemptId: r.attempt_id,
    total: Number(r.total) || 0,
    passedAll: isTrue_(r.passed_all),
    twk: Number(r.twk) || 0, tiu: Number(r.tiu) || 0, tkp: Number(r.tkp) || 0,
    submittedAt: toIso_(r.submitted_at)
  };
}

function isTrue_(v) {
  return String(v).toLowerCase() === 'true';
}

function safeParse_(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

function toIso_(v) {
  if (!v) return '';
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/* Cache JSON besar dipecah per 90 KB (batas CacheService 100 KB per nilai). */
/* Memo per eksekusi: daftar paket & soal dibaca dari CacheService sekali saja per permintaan. */
var _memo = {};
function resetMemo_() { _memo = {}; }

function cachePutJson_(key, obj, ttl) {
  _memo['cj:' + key] = obj;
  var c = CacheService.getScriptCache();
  var s = JSON.stringify(obj);
  var size = 90000;
  var parts = Math.ceil(s.length / size);
  if (parts > 10) return; // terlalu besar, jangan di-cache
  var map = {};
  map[key] = String(parts);
  for (var i = 0; i < parts; i++) map[key + '__' + i] = s.substr(i * size, size);
  c.putAll(map, ttl);
}

function cacheGetJson_(key) {
  if (_memo.hasOwnProperty('cj:' + key)) return _memo['cj:' + key];
  var c = CacheService.getScriptCache();
  var n = Number(c.get(key) || 0);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '__' + i);
  var got = c.getAll(keys);
  var s = '';
  for (var j = 0; j < n; j++) {
    if (got[keys[j]] === undefined || got[keys[j]] === null) return null;
    s += got[keys[j]];
  }
  try { var v = JSON.parse(s); _memo['cj:' + key] = v; return v; } catch (e) { return null; }
}
