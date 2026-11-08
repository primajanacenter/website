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
var SUBTEST_LABEL = { twk: 'Tes Wawasan Kebangsaan', tiu: 'Tes Intelegensia Umum', tkp: 'Tes Karakteristik Pribadi' };
var GRACE_SEC = 180;           // toleransi keterlambatan kirim jawaban (detik)
var FREE_REVIEW_LIMIT = 5;     // jumlah pembahasan untuk pengguna gratis
var PKG_CACHE_SEC = 600;

var TOPICS = {
  'twk-pancasila': { subtest: 'twk', name: 'Pancasila' },
  'twk-uud': { subtest: 'twk', name: 'UUD 1945' },
  'twk-nkri': { subtest: 'twk', name: 'NKRI' },
  'twk-bhinneka': { subtest: 'twk', name: 'Bhinneka Tunggal Ika' },
  'twk-nasionalisme': { subtest: 'twk', name: 'Nasionalisme' },
  'twk-integritas': { subtest: 'twk', name: 'Integritas' },
  'twk-belanegara': { subtest: 'twk', name: 'Bela negara' },
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

/* ================================================================== */
/* Paket & soal (dengan cache)                                         */
/* ================================================================== */

function getPackages_() {
  var cached = cacheGetJson_('pkgs');
  if (cached) return cached;
  var list = readAll_('packages')
    .filter(function (p) { return String(p.status).toLowerCase() === 'live' && p.package_id; })
    .map(function (p) {
      return {
        packageId: String(p.package_id),
        title: String(p.title),
        type: String(p.type || 'diagnostic'),
        description: String(p.description || ''),
        durationMin: Number(p.duration_min) || 100,
        pg: {
          twk: p.pg_twk !== '' ? Number(p.pg_twk) : DEFAULT_PG.twk,
          tiu: p.pg_tiu !== '' ? Number(p.pg_tiu) : DEFAULT_PG.tiu,
          tkp: p.pg_tkp !== '' ? Number(p.pg_tkp) : DEFAULT_PG.tkp
        },
        freeAttempts: p.free_attempts === '' ? null : Number(p.free_attempts),
        order: Number(p.order) || 99
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
  cachePutJson_('pkgs', list, PKG_CACHE_SEC);
  return list;
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
  var letters = ['a', 'b', 'c', 'd', 'e'];
  var list = readAll_('questions')
    .filter(function (q) { return String(q.package_id) === packageId && String(q.status || 'live').toLowerCase() === 'live'; })
    .map(function (q) {
      var subtest = String(q.subtest).toLowerCase();
      var opts = [];
      letters.forEach(function (l) {
        var t = String(q['option_' + l] || '');
        if (t) opts.push({ key: l, text: t, score: q['score_' + l] === '' ? null : Number(q['score_' + l]) });
      });
      return {
        id: String(q.question_id),
        number: Number(q.number) || 0,
        subtest: subtest,
        topicId: String(q.topic_id || ''),
        text: String(q.text),
        context: String(q.context || ''),
        options: opts,
        answer: String(q.answer || '').toLowerCase(),
        explanation: String(q.explanation || '')
      };
    })
    .sort(function (a, b) { return a.number - b.number; });
  if (!list.length) throw new AppError_('NOT_FOUND', 'Soal untuk paket ini belum tersedia.');
  cachePutJson_(key, list, PKG_CACHE_SEC);
  return list;
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
  var c = CacheService.getScriptCache();
  c.remove('pkgs');
  if (packageId) {
    c.remove('pq_' + packageId);
    for (var i = 0; i < 10; i++) c.remove('pq_' + packageId + '__' + i);
  }
}

/** Jalankan dari editor setelah mengubah soal/paket di Spreadsheet agar perubahan langsung aktif. */
function refreshQuestionCache() {
  getPackages_().forEach(function (p) { clearPackageCache_(p.packageId); });
  CacheService.getScriptCache().remove('pkgs');
  Logger.log('Cache paket & soal dibersihkan.');
}

/* ================================================================== */
/* Handler                                                             */
/* ================================================================== */

/** Daftar paket + status percobaan pengguna. */
function handleGetTryoutInfo_(payload, user) {
  var attempts = finalizeExpiredAttempts_(user);
  var packages = getPackages_().map(function (p) {
    var mine = attempts.filter(function (a) { return a.package_id === p.packageId; });
    var done = mine.filter(function (a) { return a.status === 'submitted'; });
    var running = mine.filter(function (a) { return a.status === 'in_progress'; })[0];
    var gate = canStart_(p, user, done.length);
    var qCount = 0;
    try { qCount = getPackageQuestions_(p.packageId).length; } catch (e) { qCount = 0; }
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
  return buildReport_(row, user);
}

/* ================================================================== */
/* Penilaian                                                           */
/* ================================================================== */

function gradeAndStore_(row, questions, answers, mode) {
  var pkg = getPackage_(row.package_id);
  var g = grade_(questions, answers);
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

/**
 * TWK & TIU: benar 5, salah/kosong 0.
 * TKP: nilai opsi 1–5 sesuai kunci skor, kosong 0.
 */
function grade_(questions, answers) {
  var sub = {};
  ['twk', 'tiu', 'tkp'].forEach(function (s) { sub[s] = { score: 0, max: 0, total: 0, answered: 0, correct: 0 }; });
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

  var subtests = ['twk', 'tiu', 'tkp'].map(function (id) {
    var s = sub[id] || { score: 0, max: 0, total: 0, answered: 0, correct: 0 };
    return {
      id: id, label: SUBTEST_LABEL[id], score: s.score, max: s.max, passingGrade: pkg.pg[id],
      passed: s.score >= pkg.pg[id], answered: s.answered, total: s.total, correct: s.correct
    };
  });

  // Topik diurutkan dari yang paling lemah
  var topics = Object.keys(topicStats).map(function (id) {
    var t = topicStats[id];
    var meta = TOPICS[id] || { subtest: '', name: id };
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
      number: q.number, subtest: q.subtest, topic: (TOPICS[q.topicId] || {}).name || q.topicId,
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
    passedAll: isTrue_(row.passed_all),
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
function cachePutJson_(key, obj, ttl) {
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
  try { return JSON.parse(s); } catch (e) { return null; }
}
