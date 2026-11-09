/**
 * Materi.gs — materi pendalaman level 2–4 (Fase 6, Premium).
 *
 * - Level 1 bersifat publik dan disajikan statis dari repo (assets/data/materi-level1.json).
 * - Level 2–4 disimpan di spreadsheet terpisah (Script Property MATERIALS_SPREADSHEET_ID, sheet "materials")
 *   dan HANYA dikirim lengkap kepada pengguna Premium aktif. Pengguna lain hanya menerima cuplikan.
 * - Jangan meletakkan file materi di folder paket soal.
 */

var MATERIAL_CACHE_SEC = 3600;
var MATERIAL_LEVELS = [2, 3, 4];

function loadMaterials_() {
  var cached = cacheGetJson_('mats_v1');
  if (cached) return cached;
  var id = getConfigOptional_('MATERIALS_SPREADSHEET_ID', '');
  if (!id) return {};
  var rows = readTable_(SpreadsheetApp.openById(id), 'materials');
  var out = {};
  rows.forEach(function (r) {
    if (String(r.status).toLowerCase() !== 'live') return;
    var topic = String(r.topic_id || '').trim();
    var level = Number(r.level);
    if (!TOPICS[topic] || MATERIAL_LEVELS.indexOf(level) < 0) return;
    var key = topic + '|' + level;
    if (out[key]) { console.warn('Materi ganda ' + key + ' diabaikan'); return; }
    var lines = function (v) { return String(v || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(String); };
    var opts = ['a', 'b', 'c', 'd', 'e'].map(function (k) { return String(r['opsi_' + k] || ''); });
    var kunci = String(r.kunci || '').toLowerCase().trim();
    out[key] = {
      materialId: String(r.material_id || key), topicId: topic, level: level,
      title: String(r.title || ''), minutes: Number(r.minutes) || 8,
      ringkasan: String(r.ringkasan || ''), poinKunci: lines(r.poin_kunci),
      contoh: opts.every(String) && 'abcde'.indexOf(kunci) >= 0 && kunci ? {
        soal: String(r.contoh_soal || ''), pilihan: opts, jawaban: 'abcde'.indexOf(kunci), pembahasan: String(r.pembahasan || '')
      } : null,
      tips: lines(r.strategi), jebakan: lines(r.jebakan)
    };
  });
  cachePutJson_('mats_v1', out, MATERIAL_CACHE_SEC);
  return out;
}

/** Jalankan dari editor setelah mengubah isi sheet materials. */
function refreshMaterialCache() {
  CacheService.getScriptCache().remove('mats_v1');
  var m = loadMaterials_();
  var byLevel = { 2: 0, 3: 0, 4: 0 };
  Object.keys(m).forEach(function (k) { byLevel[m[k].level]++; });
  Logger.log('Materi live: ' + Object.keys(m).length + ' (Lv2 ' + byLevel[2] + ' · Lv3 ' + byLevel[3] + ' · Lv4 ' + byLevel[4] + ')');
}

/** Level materi yang disarankan untuk dipelajari: satu tingkat di atas level saat ini (maks. 4). */
function recommendedLevel_(stat) {
  if (!stat) return 1;
  return Math.min(4, stat.level + 1);
}

/** getMaterialIndex (auth optional): daftar materi yang tersedia + rekomendasi level per topik. */
function handleGetMaterialIndex_(payload, user) {
  var mats = loadMaterials_();
  var available = {};
  Object.keys(mats).forEach(function (k) {
    var m = mats[k];
    (available[m.topicId] = available[m.topicId] || []).push({ level: m.level, title: m.title, minutes: m.minutes });
  });
  Object.keys(available).forEach(function (t) { available[t].sort(function (a, b) { return a.level - b.level; }); });
  var out = { premium: Boolean(user && user.plan === 'premium'), loggedIn: Boolean(user), available: available, recommended: {} };
  if (user) {
    var stats = topicStats_(user, practiceHistory_(user));
    Object.keys(TOPICS).forEach(function (t) { out.recommended[t] = recommendedLevel_(stats[t]); });
  }
  return out;
}

/** getMaterial (auth optional): { topicId, level } → isi lengkap (Premium) atau cuplikan (terkunci). */
function handleGetMaterial_(payload, user) {
  var topicId = String(payload.topicId || '');
  var level = Number(payload.level);
  if (!TOPICS[topicId] || MATERIAL_LEVELS.indexOf(level) < 0) throw new AppError_('BAD_REQUEST', 'Topik atau level materi tidak valid.');
  var m = loadMaterials_()[topicId + '|' + level];
  if (!m) throw new AppError_('NOT_FOUND', 'Materi level ini belum tersedia.');
  if (!user || user.plan !== 'premium') {
    return {
      locked: true, reason: user ? 'PREMIUM' : 'LOGIN',
      teaser: {
        topicId: topicId, level: level, title: m.title, minutes: m.minutes, pointCount: m.poinKunci.length,
        intro: m.ringkasan.length > 170 ? m.ringkasan.slice(0, 170).replace(/\s+\S*$/, '') + '…' : m.ringkasan
      }
    };
  }
  return { locked: false, material: m };
}
