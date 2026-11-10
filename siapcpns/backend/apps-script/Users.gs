/**
 * Users.gs — login, profil, hasil Cek Kesiapan, daftar tunggu (Fase 2).
 */

var EDUCATION_OPTIONS = ['SMA/SMK', 'D3', 'D4/S1', 'S2', 'S3'];
var TARGET_TYPES = ['passing_grade', 'kompetitif'];
var MINUTES_OPTIONS = [15, 30, 45, 60, 90];
var LEVEL_IDS = ['baru-mulai', 'sedang-bersiap', 'hampir-siap'];
var ASPECT_MAX = { alur: 25, dokumen: 15, kemampuan: 40, waktu: 20 };
var ANON_DAILY_LIMIT = 3000; // batas simpan hasil anonim per hari (pengaman spam)

/* ------------------------------------------------------------------ */
/* login: dipanggil setelah Google Sign-In berhasil                    */
/* payload: { assessment?: {...hasil Cek Kesiapan yang tersimpan lokal} } */
/* ------------------------------------------------------------------ */
function handleLogin_(payload, user) {
  update_('users', user._row, { last_login_at: nowIso_() });

  var attached = null;
  if (payload && payload.assessment) {
    try {
      attached = saveAssessmentRow_(payload.assessment, user.userId, 'login');
    } catch (err) {
      // Hasil lokal yang rusak tidak boleh menggagalkan login.
      console.warn('Gagal menautkan assessment: ' + (err && err.message));
    }
  }

  // Fase 8: kode ajakan dari tautan ?ref= (diam-diam; kode tidak valid/tidak berlaku diabaikan)
  var refClaimed = false;
  if (payload && payload.ref) {
    try { claimReferral_(user, payload.ref); refClaimed = true; } catch (err) { refClaimed = false; }
  }

  var me = buildMe_(user);
  me.isNew = user.isNew;
  me.referralClaimed = refClaimed;
  me.attachedAssessmentId = attached ? attached.assessment_id : null;
  return me;
}

function handleGetMe_(payload, user) {
  return buildMe_(user);
}

function buildMe_(user) {
  var profileRow = findOne_('profiles', 'user_id', user.userId);
  var profile = profileRow ? toProfile_(profileRow) : null;
  var lastAssessment = findLast_('assessments', 'user_id', user.userId);
  var lastAttempt = null;
  try {
    var mineA = findAll_('attempts', 'user_id', user.userId).filter(function (x) { return x.type !== 'akbar' && x.type !== 'skb'; });
    var a = mineA[mineA.length - 1];
    if (a) {
      lastAttempt = a.status === 'submitted'
        ? { attemptId: a.attempt_id, status: 'submitted', packageId: a.package_id, total: Number(a.total) || 0, passedAll: isTrue_(a.passed_all), submittedAt: String(a.submitted_at) }
        : { attemptId: a.attempt_id, status: a.status, packageId: a.package_id, endsAt: String(a.ends_at) };
    }
  } catch (e) {
    lastAttempt = null; // sheet attempts belum dibuat (jalankan setupSheets)
  }
  return {
    user: publicUser_(user),
    profile: profile,
    profileComplete: isProfileComplete_(profile),
    latestAssessment: lastAssessment ? toAssessment_(lastAssessment) : null,
    latestAttempt: lastAttempt
  };
}

/* ------------------------------------------------------------------ */
/* saveProfile                                                         */
/* ------------------------------------------------------------------ */
function handleSaveProfile_(payload, user) {
  var p = validateProfile_(payload || {});
  p.user_id = user.userId;
  p.updated_at = nowIso_();

  var saved = withLock_(function () {
    var existing = findOne_('profiles', 'user_id', user.userId);
    if (existing) return update_('profiles', existing._row, p);
    insert_('profiles', p);
    return findOne_('profiles', 'user_id', user.userId);
  });

  var profile = toProfile_(saved);
  return { profile: profile, profileComplete: isProfileComplete_(profile) };
}

function validateProfile_(d) {
  var out = {};

  if (EDUCATION_OPTIONS.indexOf(d.education) < 0) throw new AppError_('BAD_REQUEST', 'Pilih jenjang pendidikan.');
  out.education = d.education;

  out.major = cleanText_(d.major, 120);
  if (!out.major) throw new AppError_('BAD_REQUEST', 'Isi program studi atau jurusan.');

  out.target_formation = cleanText_(d.targetFormation, 120);
  out.target_province = cleanText_(d.targetProvince, 60);

  if (d.testDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.testDate)) throw new AppError_('BAD_REQUEST', 'Format tanggal tes tidak valid.');
    out.test_date = d.testDate;
  } else {
    out.test_date = '';
  }

  out.target_type = TARGET_TYPES.indexOf(d.targetType) >= 0 ? d.targetType : 'passing_grade';

  var minutes = Number(d.minutesPerDay);
  if (MINUTES_OPTIONS.indexOf(minutes) < 0) throw new AppError_('BAD_REQUEST', 'Pilih waktu belajar per hari.');
  out.minutes_per_day = minutes;

  var days = Number(d.daysPerWeek);
  if (!(days >= 1 && days <= 7)) throw new AppError_('BAD_REQUEST', 'Pilih jumlah hari belajar per minggu.');
  out.days_per_week = Math.round(days);

  if (d.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.reminderTime)) {
    throw new AppError_('BAD_REQUEST', 'Format jam pengingat tidak valid.');
  }
  out.reminder_time = d.reminderTime || '';

  return out;
}

function toProfile_(row) {
  return {
    education: row.education,
    major: row.major,
    targetFormation: row.target_formation,
    targetProvince: row.target_province,
    testDate: row.test_date ? toIsoDate_(row.test_date) : '',
    targetType: row.target_type || 'passing_grade',
    minutesPerDay: Number(row.minutes_per_day) || 0,
    daysPerWeek: Number(row.days_per_week) || 0,
    reminderTime: String(row.reminder_time || ''),
    updatedAt: row.updated_at ? String(row.updated_at) : ''
  };
}

function isProfileComplete_(p) {
  return Boolean(p && p.education && p.major && p.minutesPerDay && p.daysPerWeek);
}

/* ------------------------------------------------------------------ */
/* saveAssessment (login opsional)                                     */
/* ------------------------------------------------------------------ */
function handleSaveAssessment_(payload, user) {
  if (!user) {
    var cache = CacheService.getScriptCache();
    var key = 'anon_' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
    var count = Number(cache.get(key) || 0);
    if (count >= ANON_DAILY_LIMIT) return { saved: false, reason: 'DAILY_LIMIT' };
    cache.put(key, String(count + 1), 21600);
  }
  var row = saveAssessmentRow_(payload, user ? user.userId : '', user ? 'login' : 'anon');
  return { saved: true, id: row.assessment_id };
}

function saveAssessmentRow_(a, userId, source) {
  var v = validateAssessment_(a);
  var row = {
    assessment_id: newId_('a'),
    user_id: userId || '',
    version: v.version,
    total: v.total,
    level_id: v.levelId,
    alur: v.aspects.alur,
    dokumen: v.aspects.dokumen,
    kemampuan: v.aspects.kemampuan,
    waktu: v.aspects.waktu,
    duration_sec: v.durationSec,
    answers_json: JSON.stringify(v.answers),
    source: source,
    created_at: a.completedAt && !isNaN(new Date(a.completedAt).getTime()) ? new Date(a.completedAt).toISOString() : nowIso_()
  };
  insert_('assessments', row);
  return row;
}

function validateAssessment_(a) {
  if (!a || typeof a !== 'object') throw new AppError_('BAD_REQUEST', 'Data hasil tidak valid.');
  var total = Number(a.total);
  if (!(total >= 0 && total <= 100)) throw new AppError_('BAD_REQUEST', 'Skor tidak valid.');
  if (LEVEL_IDS.indexOf(a.levelId) < 0) throw new AppError_('BAD_REQUEST', 'Level tidak valid.');

  var aspects = {};
  var sum = 0;
  (a.aspects || []).forEach(function (x) {
    if (x && ASPECT_MAX.hasOwnProperty(x.id)) {
      var s = Number(x.score);
      if (!(s >= 0 && s <= ASPECT_MAX[x.id])) throw new AppError_('BAD_REQUEST', 'Skor aspek tidak valid.');
      aspects[x.id] = s;
      sum += s;
    }
  });
  Object.keys(ASPECT_MAX).forEach(function (k) { if (aspects[k] === undefined) throw new AppError_('BAD_REQUEST', 'Aspek tidak lengkap.'); });
  if (Math.abs(Math.round(sum) - total) > 1) throw new AppError_('BAD_REQUEST', 'Total skor tidak sesuai.');

  var answers = {};
  var src = a.answers || {};
  Object.keys(src).slice(0, 20).forEach(function (k) {
    if (/^q\d{1,2}$/.test(k) && /^[a-e]$/.test(String(src[k]))) answers[k] = src[k];
  });

  var dur = Math.round(Number(a.durationSec) || 0);
  return {
    version: cleanText_(a.version, 20),
    total: Math.round(total),
    levelId: a.levelId,
    aspects: aspects,
    answers: answers,
    durationSec: dur >= 0 && dur <= 7200 ? dur : 0
  };
}

function toAssessment_(row) {
  return {
    id: row.assessment_id,
    total: Number(row.total),
    levelId: row.level_id,
    aspects: [
      { id: 'alur', score: Number(row.alur) },
      { id: 'dokumen', score: Number(row.dokumen) },
      { id: 'kemampuan', score: Number(row.kemampuan) },
      { id: 'waktu', score: Number(row.waktu) }
    ],
    completedAt: String(row.created_at)
  };
}

/* ------------------------------------------------------------------ */
/* joinWaitlist                                                        */
/* ------------------------------------------------------------------ */
function handleJoinWaitlist_(payload) {
  var email = String((payload && payload.email) || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new AppError_('INVALID_EMAIL', 'Format email belum benar.');
  }
  return withLock_(function () {
    if (!findOne_('waitlist', 'email', email)) {
      insert_('waitlist', { email: email, source: cleanText_(payload.source, 40), created_at: nowIso_() });
    }
    return { email: email };
  });
}
