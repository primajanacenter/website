/**
 * Practice.gs — latihan harian, level per topik, dan ringkasan "hari ini" (Fase 4).
 *
 * Bank latihan = paket dengan type "latihan" (file di folder paket soal, format template yang sama).
 * Paket latihan tidak tampil di daftar tryout.
 *
 * Aturan:
 *  - Pengguna gratis: FREE_PRACTICE_DAILY soal per hari (zona waktu Asia/Jakarta). Premium: tanpa batas harian.
 *  - Soal dipilih: (1) soal yang pernah salah dan sudah ≥ 1 hari, (2) soal baru dari topik fokus,
 *    (3) soal baru lainnya, (4) soal lama yang paling lama tidak dikerjakan.
 *  - Setiap jawaban langsung dinilai server dan dicatat di sheet practice_answers.
 */

var FREE_PRACTICE_DAILY = 10;
var PRACTICE_SESSION_SIZE = 10;
var SESSION_TTL = 21600; // 6 jam
var DEFAULT_FOCUS = ['tiu-deret', 'twk-pancasila', 'tkp-pelayanan'];
var TZ = 'Asia/Jakarta';

function todayStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/* ------------------------------------------------------------------ */
/* Bank latihan                                                        */
/* ------------------------------------------------------------------ */
function getPracticeBank_() {
  var bank = [];
  getPackages_().filter(function (p) { return p.type === 'latihan'; }).forEach(function (p) {
    try {
      getPackageQuestions_(p.packageId).forEach(function (q) {
        bank.push(Object.assign({ packageId: p.packageId }, q));
      });
    } catch (e) {
      console.warn('Bank latihan ' + p.packageId + ': ' + e.message);
    }
  });
  return bank;
}

function practiceHistory_(user) {
  return findAll_('practice_answers', 'user_id', user.userId).map(function (r) {
    return {
      date: String(r.date).slice(0, 10), questionId: String(r.question_id), topicId: String(r.topic_id),
      subtest: String(r.subtest), points: Number(r.points) || 0, at: String(r.answered_at)
    };
  });
}

/* ------------------------------------------------------------------ */
/* Statistik topik: gabungan tryout terakhir + riwayat latihan         */
/* ------------------------------------------------------------------ */
function topicStats_(user, history) {
  var stats = {};
  function add(topic, pts, max) {
    if (!topic) return;
    var s = stats[topic] || (stats[topic] = { points: 0, max: 0, n: 0 });
    s.points += pts; s.max += max; s.n++;
  }
  // tryout terakhir yang sudah dinilai
  var attempts = findAll_('attempts', 'user_id', user.userId).filter(function (a) { return a.status === 'submitted'; });
  var last = attempts[attempts.length - 1];
  if (last) {
    var t = safeParse_(last.topic_json, {});
    Object.keys(t).forEach(function (k) {
      var s = stats[k] || (stats[k] = { points: 0, max: 0, n: 0 });
      s.points += t[k].points; s.max += t[k].max; s.n += t[k].total;
    });
  }
  // 60 jawaban latihan terakhir
  history.slice(-60).forEach(function (h) { add(h.topicId, h.points, 5); });

  var out = {};
  Object.keys(stats).forEach(function (k) {
    var s = stats[k];
    var pct = s.max ? Math.round((s.points / s.max) * 100) : 0;
    out[k] = { pct: pct, n: s.n, level: levelFromPct_(pct) };
  });
  return out;
}

function levelFromPct_(pct) {
  if (pct < 40) return 1;
  if (pct < 70) return 2;
  if (pct <= 85) return 3;
  return 4;
}

function focusTopics_(stats) {
  var ranked = Object.keys(stats)
    .filter(function (k) { return TOPICS[k] && stats[k].n >= 1; })
    .sort(function (a, b) { return stats[a].pct - stats[b].pct; });
  var focus = ranked.slice(0, 3);
  DEFAULT_FOCUS.forEach(function (t) { if (focus.length < 3 && focus.indexOf(t) < 0) focus.push(t); });
  return focus;
}

function streak_(history) {
  var days = {};
  history.forEach(function (h) { days[h.date] = true; });
  var d = new Date();
  var count = 0;
  // jika hari ini belum latihan, hitung mulai kemarin
  if (!days[Utilities.formatDate(d, TZ, 'yyyy-MM-dd')]) d = new Date(d.getTime() - 86400000);
  while (days[Utilities.formatDate(d, TZ, 'yyyy-MM-dd')]) {
    count++;
    d = new Date(d.getTime() - 86400000);
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* getToday                                                            */
/* ------------------------------------------------------------------ */
function handleGetToday_(payload, user) {
  var history = practiceHistory_(user);
  var today = todayStr_();
  var doneToday = history.filter(function (h) { return h.date === today; });
  var stats = topicStats_(user, history);
  var focus = focusTopics_(stats);
  var premium = user.plan === 'premium';
  var profileRow = findOne_('profiles', 'user_id', user.userId);
  var attempts = findAll_('attempts', 'user_id', user.userId);
  var hasTryout = attempts.some(function (a) { return a.status === 'submitted'; });

  var topicLevels = {};
  Object.keys(stats).forEach(function (k) {
    if (TOPICS[k]) topicLevels[k] = { level: stats[k].level, pct: stats[k].pct, n: stats[k].n };
  });

  return {
    date: today,
    profile: profileRow ? toProfile_(profileRow) : null,
    focusTopics: focus.map(function (k) { return { topicId: k, name: (TOPICS[k] || {}).name || k, subtest: (TOPICS[k] || {}).subtest || '' }; }),
    topicLevels: topicLevels,
    practice: {
      doneToday: doneToday.length,
      correctToday: doneToday.filter(function (h) { return h.points >= 4; }).length,
      byTopicToday: doneToday.reduce(function (m, h) { m[h.topicId] = (m[h.topicId] || 0) + 1; return m; }, {}),
      dailyLimit: premium ? null : FREE_PRACTICE_DAILY,
      remaining: premium ? PRACTICE_SESSION_SIZE : Math.max(0, FREE_PRACTICE_DAILY - doneToday.length),
      bankSize: getPracticeBank_().length
    },
    streak: streak_(history),
    hasTryout: hasTryout,
    plan: user.plan
  };
}

/* ------------------------------------------------------------------ */
/* startPractice                                                       */
/* ------------------------------------------------------------------ */
function handleStartPractice_(payload, user) {
  var bank = getPracticeBank_();
  if (!bank.length) throw new AppError_('NOT_FOUND', 'Bank latihan belum tersedia.');
  var premium = user.plan === 'premium';
  var history = practiceHistory_(user);
  var today = todayStr_();
  var doneToday = history.filter(function (h) { return h.date === today; }).length;
  var remaining = premium ? PRACTICE_SESSION_SIZE : Math.max(0, FREE_PRACTICE_DAILY - doneToday);
  if (remaining <= 0) {
    throw new AppError_('DAILY_LIMIT', 'Kuota latihan gratis hari ini sudah habis. Lanjutkan besok, atau pelajari materi sambil menunggu.');
  }

  var topicFilter = payload.topicId && TOPICS[payload.topicId] ? String(payload.topicId) : '';
  var pool = topicFilter ? bank.filter(function (q) { return q.topicId === topicFilter; }) : bank;
  if (!pool.length) throw new AppError_('NOT_FOUND', 'Belum ada soal latihan untuk topik ini.');

  var focus = topicFilter ? [topicFilter] : focusTopics_(topicStats_(user, history));
  var last = {};
  history.forEach(function (h) { last[h.questionId] = h; }); // jawaban terakhir per soal

  var nowMs = Date.now();
  function score(q) {
    var h = last[q.id];
    var focusBonus = focus.indexOf(q.topicId) >= 0 ? 10 : 0;
    if (h && h.points < 4) {
      var ageDays = (nowMs - new Date(h.at).getTime()) / 86400000;
      if (ageDays >= 1) return 100 + focusBonus;      // ulangi soal yang salah
      return -50;                                       // salah hari ini: tunda dulu
    }
    if (!h) return 50 + focusBonus + Math.random();     // soal baru
    var age = (nowMs - new Date(h.at).getTime()) / 86400000;
    return Math.min(30, age) + Math.random();          // pernah benar: yang paling lama
  }
  var chosen = pool
    .map(function (q) { return { q: q, s: score(q) }; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, Math.min(remaining, PRACTICE_SESSION_SIZE))
    .map(function (x) { return x.q; });

  var sessionId = newId_('p');
  CacheService.getScriptCache().put('ps_' + sessionId, JSON.stringify({
    userId: user.userId,
    questions: chosen.map(function (q) { return { id: q.id, packageId: q.packageId }; }),
    answered: {}
  }), SESSION_TTL);

  return {
    sessionId: sessionId,
    topicId: topicFilter || null,
    questions: publicQuestions_(chosen),
    remainingToday: premium ? null : remaining,
    dailyLimit: premium ? null : FREE_PRACTICE_DAILY
  };
}

/* ------------------------------------------------------------------ */
/* answerPractice                                                      */
/* ------------------------------------------------------------------ */
function handleAnswerPractice_(payload, user) {
  var cache = CacheService.getScriptCache();
  var key = 'ps_' + String(payload.sessionId || '');
  var session = safeParse_(cache.get(key), null);
  if (!session || session.userId !== user.userId) {
    throw new AppError_('SESSION_EXPIRED', 'Sesi latihan sudah berakhir. Mulai sesi latihan baru.');
  }
  var ref = session.questions.filter(function (q) { return q.id === payload.questionId; })[0];
  if (!ref) throw new AppError_('BAD_REQUEST', 'Soal tidak termasuk dalam sesi ini.');
  var q = getPackageQuestions_(ref.packageId).filter(function (x) { return x.id === ref.id; })[0];
  if (!q) throw new AppError_('NOT_FOUND', 'Soal tidak ditemukan.');

  var answer = String(payload.answer || '').toLowerCase();
  if (!q.options.some(function (o) { return o.key === answer; })) throw new AppError_('BAD_REQUEST', 'Pilih salah satu jawaban.');

  var premium = user.plan === 'premium';
  var result = withLock_(function () {
    var fresh = safeParse_(cache.get(key), session);
    if (fresh.answered[q.id]) return { duplicate: true, points: fresh.answered[q.id] };
    var today = todayStr_();
    if (!premium) {
      var used = findAll_('practice_answers', 'user_id', user.userId).filter(function (r) { return String(r.date).slice(0, 10) === today; }).length;
      if (used >= FREE_PRACTICE_DAILY) throw new AppError_('DAILY_LIMIT', 'Kuota latihan gratis hari ini sudah habis.');
    }
    var points = q.subtest === 'tkp'
      ? ((q.options.filter(function (o) { return o.key === answer; })[0] || {}).score || 0)
      : (answer === q.answer ? 5 : 0);
    insert_('practice_answers', {
      user_id: user.userId, date: today, question_id: q.id, package_id: ref.packageId, topic_id: q.topicId,
      subtest: q.subtest, answer: answer, points: points, answered_at: nowIso_()
    });
    fresh.answered[q.id] = points;
    cache.put(key, JSON.stringify(fresh), SESSION_TTL);
    return { duplicate: false, points: points };
  });

  var best = q.subtest === 'tkp'
    ? q.options.reduce(function (a, b) { return (b.score || 0) > (a.score || 0) ? b : a; }, q.options[0])
    : q.options.filter(function (o) { return o.key === q.answer; })[0];

  return {
    questionId: q.id,
    answer: answer,
    points: result.points,
    correct: q.subtest === 'tkp' ? result.points >= 4 : result.points === 5,
    bestAnswer: best ? best.key : '',
    optionScores: q.subtest === 'tkp' ? q.options.map(function (o) { return { key: o.key, score: o.score }; }) : null,
    explanation: q.explanation,
    topic: (TOPICS[q.topicId] || {}).name || q.topicId
  };
}
