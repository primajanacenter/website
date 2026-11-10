/**
 * Plan.gs — rencana belajar adaptif (Fase 6, Premium).
 *
 * Disusun ulang setiap kali diminta dari data terbaru:
 *  - profil (menit/hari, hari/minggu, tanggal tes, target),
 *  - level per topik (latihan + tryout terakhir),
 *  - selisih skor tryout terakhir terhadap ambang batas per subtes,
 *  - kepatuhan 7 hari terakhir (soal latihan yang dikerjakan vs. target).
 * Struktur keluaran sama dengan rencana dasar di frontend (plan.js) ditambah data adaptif.
 */

var STUDY_DAYS_BY_COUNT = { 1: [6], 2: [2, 6], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
var DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var SUB_SHORT_ = { twk: 'TWK', tiu: 'TIU', tkp: 'TKP' };
var SEC_PER_QUESTION = 90;

/** Tanggal di zona Asia/Jakarta (UTC+7) dengan offset hari. */
function jktDay_(offsetDays) {
  var d = new Date(Date.now() + 7 * 3600000 + (offsetDays || 0) * 86400000);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
}

function clamp_(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function handleGetPlan_(payload, user) {
  if (user.plan !== 'premium') throw new AppError_('FORBIDDEN', 'Rencana adaptif tersedia untuk pengguna Premium.');
  var profRow = findOne_('profiles', 'user_id', user.userId);
  if (!profRow) throw new AppError_('PROFILE_INCOMPLETE', 'Lengkapi profil belajar terlebih dahulu.');
  var profile = toProfile_(profRow);
  return buildAdaptivePlan_(user, profile);
}

function buildAdaptivePlan_(user, profile) {
  var minutes = clamp_(Number(profile.minutesPerDay) || 30, 15, 240);
  var days = clamp_(Number(profile.daysPerWeek) || 5, 1, 7);
  var studyDays = STUDY_DAYS_BY_COUNT[days];
  var target = profile.targetType === 'kompetitif' ? 4 : 3;
  var today = jktDay_(0);

  var daysToTest = null;
  if (profile.testDate) {
    daysToTest = Math.round((new Date(String(profile.testDate).slice(0, 10) + 'T00:00:00Z') - new Date(today.date + 'T00:00:00Z')) / 86400000);
  }

  var history = practiceHistory_(user);
  var stats = topicStats_(user, history);

  // ---- Tryout terakhir & selisih terhadap ambang batas ----
  var attempts = findAll_('attempts', 'user_id', user.userId).filter(function (a) { return a.status === 'submitted' && a.type !== 'skb'; });
  var last = attempts[attempts.length - 1] || null;
  var gaps = null, gapW = { twk: 1, tiu: 1, tkp: 1 };
  if (last) {
    var pkg = null;
    try { pkg = getPackages_().filter(function (p) { return p.packageId === last.package_id; })[0]; } catch (e) { pkg = null; }
    var pg = pkg ? pkg.pg : DEFAULT_PG;
    gaps = {};
    ['twk', 'tiu', 'tkp'].forEach(function (s) {
      var score = Number(last[s]) || 0;
      var g = Math.max(0, pg[s] - score);
      gaps[s] = { score: score, pg: pg[s], gap: g, passed: score >= pg[s] };
      gapW[s] = g > 0 ? 1 + 2 * (g / pg[s]) : 0.85;
    });
  }
  var lastTryoutDate = last ? String(last.submitted_at || last.started_at).slice(0, 10) : null;
  var daysSinceTryout = lastTryoutDate ? Math.round((new Date(today.date + 'T00:00:00Z') - new Date(lastTryoutDate + 'T00:00:00Z')) / 86400000) : null;

  // ---- Prioritas topik ----
  var priorities = Object.keys(TOPICS).filter(function (t) { return t !== 'tiu-figural'; }).map(function (t) {
    var st = stats[t];
    var sub = TOPICS[t].subtest;
    var level = st ? st.level : 1;
    var measured = Boolean(st && st.n >= 3);
    var deficit = Math.max(0, target - level) + (measured ? 0 : 0.75);
    var score = deficit * gapW[sub] * (st && st.n < 5 ? 1.1 : 1);
    var reason;
    if (!measured) reason = 'Belum cukup data — kerjakan latihan topik ini untuk mengukur levelmu';
    else if (level >= target) reason = 'Sudah mencapai target level ' + target + ' — cukup dipertahankan';
    else reason = 'Level ' + level + ' (' + st.pct + '%), target level ' + target;
    if (gaps && !gaps[sub].passed) reason += ' · ' + SUB_SHORT_[sub] + ' masih ' + gaps[sub].gap + ' poin di bawah ambang batas';
    return {
      topicId: t, name: TOPICS[t].name, subtest: sub, level: st ? st.level : null, pct: st ? st.pct : null,
      n: st ? st.n : 0, targetLevel: target, recommendedLevel: recommendedLevel_(st), score: Math.round(score * 100) / 100, reason: reason
    };
  }).sort(function (a, b) { return b.score - a.score || (a.pct === null ? -1 : a.pct) - (b.pct === null ? -1 : b.pct); });

  // ---- Kepatuhan 7 hari terakhir ----
  var basePerDay = clamp_(Math.round((minutes * 0.55 * 60) / SEC_PER_QUESTION), 10, 40);
  var weekAgo = jktDay_(-7).date;
  var doneLast7 = history.filter(function (h) { return h.date >= weekAgo && h.date < today.date; }).length;
  var studyLast7 = 0;
  for (var i = 1; i <= 7; i++) if (studyDays.indexOf(jktDay_(-i).dow) >= 0) studyLast7++;
  var plannedLast7 = studyLast7 * basePerDay;
  var adherencePct = history.length && plannedLast7 ? Math.round((doneLast7 / plannedLast7) * 100) : null;
  var intensity = adherencePct === null ? 1 : adherencePct < 50 ? 0.8 : adherencePct > 110 ? 1.15 : 1;
  var perDayQ = clamp_(Math.round((basePerDay * intensity) / 10) * 10, 10, 40);
  var sessions = perDayQ / 10;
  var matMin = clamp_(Math.round(minutes * 0.3), 8, 20);
  var sprint = daysToTest !== null && daysToTest > 0 && daysToTest <= 14;

  // ---- Tryout minggu ini ----
  var cadence = daysToTest !== null && daysToTest > 0 && daysToTest <= 45 ? 7 : 14;
  var needTryout = !last || daysSinceTryout >= cadence;

  // ---- Susun 7 hari (Senin–Minggu minggu ini) ----
  var mondayOffset = -((today.dow + 6) % 7);
  var week = [];
  var upcomingStudy = [];
  for (var k = 0; k < 7; k++) {
    var d = jktDay_(mondayOffset + k);
    week.push({ date: d.date, dayName: DAY_NAMES_ID[d.dow], isToday: d.date === today.date, study: studyDays.indexOf(d.dow) >= 0, tasks: [], dow: d.dow });
    if (week[k].study && d.date >= today.date) upcomingStudy.push(k);
  }
  var tryoutIdx = -1;
  if (needTryout && upcomingStudy.length) {
    var weekend = upcomingStudy.filter(function (k2) { return week[k2].dow === 6 || week[k2].dow === 0; });
    tryoutIdx = weekend.length ? weekend[0] : upcomingStudy[upcomingStudy.length - 1];
  }
  var lastStudyIdx = -1;
  week.forEach(function (w, idx) { if (w.study) lastStudyIdx = idx; });

  var rotation = priorities.slice(0, Math.min(6, priorities.length));
  var p = 0;
  week.forEach(function (w, idx) {
    if (!w.study) return;
    if (idx === tryoutIdx) {
      w.tasks.push({ type: 'tryout', label: last ? 'Tryout ulang (pantau kemajuan)' : 'Tryout diagnostik pertama', minutes: 100, href: 'tryout.html' });
      if (minutes >= 120) w.tasks.push({ type: 'evaluasi', label: 'Baca rapor & tandai topik terlemah', minutes: 10, href: 'tryout.html' });
      return;
    }
    var t = rotation[p++ % rotation.length];
    var lvl = sprint ? 4 : Math.max(2, t.recommendedLevel);
    w.tasks.push({ type: 'materi', topicId: t.topicId, level: lvl, label: 'Materi Lv' + lvl + ': ' + t.name, minutes: matMin, href: 'materi.html?topik=' + t.topicId + '&level=' + lvl });
    w.tasks.push({ type: 'latihan-topik', topicId: t.topicId, count: 10, label: 'Latihan topik ' + t.name + ' (10 soal)', minutes: 15, href: 'latihan.html?topik=' + t.topicId });
    if (sessions > 1) {
      var extra = (sessions - 1) * 10;
      w.tasks.push({ type: 'latihan', count: perDayQ, label: (sprint ? 'Latihan campuran ala tes' : 'Latihan campuran') + ' (' + extra + ' soal)', minutes: Math.round(extra * SEC_PER_QUESTION / 60), href: 'latihan.html' });
    }
    if (idx === lastStudyIdx) w.tasks.push({ type: 'evaluasi', label: 'Evaluasi mingguan: cek kemajuan level di Rencana', minutes: 5, href: 'rencana.html' });
  });
  week.forEach(function (w) { delete w.dow; });

  // ---- Catatan pendamping ----
  var notes = [];
  if (!last) notes.push('Belum ada tryout. Kerjakan tryout diagnostik minggu ini agar prioritas topik lebih akurat.');
  if (gaps) ['twk', 'tiu', 'tkp'].forEach(function (s) {
    if (!gaps[s].passed) notes.push(SUB_SHORT_[s] + ' masih ' + gaps[s].gap + ' poin di bawah ambang batas (' + gaps[s].score + '/' + gaps[s].pg + '). Porsi topik ' + SUB_SHORT_[s] + ' dinaikkan.');
  });
  if (gaps && gaps.twk.passed && gaps.tiu.passed && gaps.tkp.passed) notes.push('Semua subtes sudah di atas ambang batas pada tryout terakhir. Fokus menaikkan skor total agar lebih kompetitif.');
  if (adherencePct !== null && adherencePct < 50) notes.push('Minggu lalu kamu menyelesaikan ' + doneLast7 + ' dari ' + plannedLast7 + ' soal target. Target harian disesuaikan agar lebih realistis.');
  if (adherencePct !== null && adherencePct > 110) notes.push('Konsisten! Kamu melampaui target minggu lalu (' + adherencePct + '%). Target harian dinaikkan.');
  var unmeasured = priorities.filter(function (x) { return x.n < 3; }).length;
  if (unmeasured >= 5) notes.push(unmeasured + ' topik belum terukur. Latihan per topik di rencana ini sekaligus memetakan levelmu.');
  if (sprint) notes.push('Masa akhir menjelang tes: utamakan materi Lv4 (strategi), latihan campuran, dan tryout.');
  if (daysToTest !== null && daysToTest <= 0) notes.push('Tanggal tes di profil sudah lewat. Perbarui perkiraan tanggal tes agar rencana tetap tepat.');

  var weeklyMinutes = minutes * days;
  var weeksLeft = daysToTest && daysToTest > 0 ? Math.max(1, Math.floor(daysToTest / 7)) : null;
  return {
    adaptive: true,
    generatedAt: nowIso_(),
    weekly: { minutes: weeklyMinutes, hours: Math.round(weeklyMinutes / 6) / 10, perDay: minutes, days: days },
    daysToTest: daysToTest,
    totalHours: weeksLeft ? Math.round((weeklyMinutes * weeksLeft) / 60) : null,
    targetLevel: target,
    targets: { practicePerDay: perDayQ, practicePerWeek: perDayQ * days, tryoutThisWeek: tryoutIdx >= 0, cadenceDays: cadence, intensity: intensity },
    adherence: { done: doneLast7, planned: plannedLast7, pct: adherencePct },
    gaps: gaps,
    priorities: priorities,
    notes: notes,
    week: week,
    today: week.filter(function (w) { return w.isToday; })[0] || null
  };
}
