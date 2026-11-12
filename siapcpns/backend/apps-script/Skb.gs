/**
 * Skb.gs — Paket SKB per instansi (Fase 14).
 *
 * Isi menu "G. Paket SKB":
 *   - Pilih instansi (disimpan di users.skb_instansi).
 *   - Per instansi: Tryout SKB (paket type "skb" dengan kolom instansi), Materi SKB (sheet materials,
 *     topic_id instansi, level 1–4), Latihan Soal SKB (paket virtual "LTS-<topik>", 50 soal dari bank
 *     "SKBLAT-<KODE>"), Latihan Wawancara (sheet interview), dan Info seleksi.
 *   - Premium SKB: Rp85.000 / 30 hari, membuka semua instansi (users.skb_until). Terpisah dari Premium SKD.
 *   - Gratis per instansi: topik pertama (materi + latihan) dan 1 sesi wawancara.
 *
 * Sumber konten (rahasia, TIDAK di repo):
 *   - Paket tryout & bank latihan SKB : file di folder QUESTIONS_FOLDER_ID (format sama dengan paket SKD,
 *     sheet packages punya kolom tambahan "instansi").
 *   - Materi & bank wawancara        : file MATERIALS_SPREADSHEET_ID, sheet "materials" dan "interview".
 */

var SKB_PRICE_DEFAULT = 85000;
var SKB_PLAN_DAYS = 30;
var SKB_PLAN_REF = 'SKB1M';
var SKB_TOPIC_SIZE = 50;
var SKB_TOPIC_MIN = 45;
var SKB_MATERIAL_LEVELS = [1, 2, 3, 4];
var INTERVIEW_FREE = 1;
var INTERVIEW_RESUME_HOURS = 3;
var INTERVIEW_CACHE_SEC = 3600;

/**
 * Katalog instansi. Nama mengikuti istilah yang umum dipakai pelamar; catatan menjelaskan perubahan
 * kelembagaan terbaru agar pengguna mengecek nama instansi di pengumuman resmi.
 */
var SKB_INSTANSI = [
  {
    id: 'kemenag', code: 'KEMENAG', short: 'Kemenag', name: 'Kementerian Agama',
    note: 'Sejak 2024–2025 urusan jaminan produk halal dipegang BPJPH (lembaga langsung di bawah Presiden) dan urusan haji & umrah dipindahkan ke Kementerian Haji dan Umrah. Materi SKB Kemenag di sini berfokus pada tugas yang tetap di Kemenag.',
    topics: [
      ['kmg-moderasi', 'Moderasi beragama'],
      ['kmg-lembaga', 'Kelembagaan & budaya kerja Kemenag'],
      ['kmg-pendidikan', 'Pendidikan agama, madrasah & pesantren'],
      ['kmg-bimas', 'Layanan nikah, zakat & wakaf'],
      ['kmg-kerukunan', 'Kerukunan umat beragama & FKUB'],
      ['kmg-pelayanan', 'Pelayanan publik & tata kelola Kemenag']
    ]
  },
  {
    id: 'kemendikbud', code: 'DIKBUD', short: 'Kemendikbudristek', name: 'Kemendikbudristek',
    note: 'Sejak Oktober 2024 Kemendikbudristek dipecah menjadi Kemendikdasmen, Kemendiktisaintek, dan Kementerian Kebudayaan. Materi di sini mencakup bidang ketiganya.',
    topics: [
      ['dik-sisdiknas', 'Sistem pendidikan nasional'],
      ['dik-guru', 'Guru, dosen & tenaga kependidikan'],
      ['dik-kurikulum', 'Kurikulum & asesmen'],
      ['dik-pembelajaran', 'Pedagogi & pembelajaran'],
      ['dik-dikti', 'Pendidikan tinggi & riset'],
      ['dik-budaya', 'Pemajuan kebudayaan'],
      ['dik-layanan', 'Tata kelola & layanan pendidikan']
    ]
  },
  {
    id: 'kejagung', code: 'KEJAGUNG', short: 'Kejaksaan', name: 'Kejaksaan Agung RI',
    note: 'Materi mengikuti UU Kejaksaan (UU 16/2004 jo. UU 11/2021) dan KUHP baru (UU 1/2023, berlaku 2 Januari 2026). Cek pembaruan hukum acara pidana di pengumuman resmi.',
    topics: [
      ['jak-kejaksaan', 'Kedudukan & kewenangan Kejaksaan'],
      ['jak-acara', 'Hukum acara pidana'],
      ['jak-kuhp', 'Hukum pidana (KUHP)'],
      ['jak-tipikor', 'Tindak pidana korupsi'],
      ['jak-datun', 'Perdata & tata usaha negara'],
      ['jak-restoratif', 'Keadilan restoratif'],
      ['jak-intelijen', 'Intelijen & pengamanan pembangunan']
    ]
  },
  {
    id: 'kemenkes', code: 'KEMENKES', short: 'Kemenkes', name: 'Kementerian Kesehatan',
    note: 'Materi berpijak pada UU 17/2023 tentang Kesehatan (omnibus) dan aturan turunannya.',
    topics: [
      ['kes-uu', 'UU Kesehatan & tenaga kesehatan'],
      ['kes-sistem', 'Sistem & transformasi kesehatan'],
      ['kes-jkn', 'Jaminan kesehatan nasional'],
      ['kes-kesmas', 'Kesehatan masyarakat & promosi kesehatan'],
      ['kes-gizi', 'Gizi, KIA & stunting'],
      ['kes-p2p', 'Pencegahan & pengendalian penyakit'],
      ['kes-mutu', 'Mutu layanan & keselamatan pasien']
    ]
  },
  {
    id: 'pupr', code: 'PUPR', short: 'PUPR', name: 'Kementerian PUPR',
    note: 'Sejak Oktober 2024 Kementerian PUPR dipecah menjadi Kementerian Pekerjaan Umum dan Kementerian Perumahan dan Kawasan Permukiman. Materi di sini mencakup keduanya.',
    topics: [
      ['pu-konstruksi', 'Jasa konstruksi'],
      ['pu-sda', 'Sumber daya air'],
      ['pu-jalan', 'Jalan & jembatan'],
      ['pu-bangunan', 'Bangunan gedung'],
      ['pu-perumahan', 'Perumahan & kawasan permukiman'],
      ['pu-pbj', 'Pengadaan barang/jasa pemerintah'],
      ['pu-k3', 'Keselamatan konstruksi']
    ]
  },
  {
    id: 'umum', code: 'UMUM', short: 'SKB Umum ASN', name: 'SKB Umum ASN', general: true,
    note: 'Materi umum yang sering muncul di SKB banyak jabatan administrasi: manajemen ASN, pelayanan publik, administrasi pemerintahan, akuntabilitas, integritas.',
    topics: [
      ['skb-asn', 'Manajemen ASN & disiplin'],
      ['skb-pelayanan', 'Standar pelayanan publik'],
      ['skb-adminpem', 'Administrasi pemerintahan'],
      ['skb-kinerja', 'Akuntabilitas kinerja & anggaran'],
      ['skb-integritas', 'Integritas & keterbukaan informasi']
    ]
  }
];

/** Info seleksi yang sama untuk semua instansi (ditambah catatan khusus di skbInfo_). */
var SKB_INFO_COMMON = [
  'Nilai akhir umumnya = 40% nilai SKD + 60% nilai SKB (skala 100). Bobot persis tercantum di pengumuman instansi.',
  'SKB CAT berisi soal kompetensi teknis sesuai jabatan yang dilamar. Kisi-kisi resmi diumumkan instansi menjelang tes.',
  'Banyak instansi menambah tes non-CAT: wawancara, psikotes, praktik kerja, kesehatan, atau kesamaptaan.',
  'Selalu cocokkan jadwal, materi, dan bobot dengan pengumuman resmi instansi dan SSCASN. Aplikasi ini latihan independen.'
];
var SKB_INFO_EXTRA = {
  kemenag: ['Formasi guru madrasah, penghulu, penyuluh agama, dan dosen PTKN biasanya memakai kisi-kisi per jabatan. Pelajari juga wawasan moderasi beragama.'],
  kemendikbud: ['Formasi dosen, pamong budaya, pengembang teknologi pembelajaran, dan analis kebijakan memakai kisi-kisi berbeda. Formasi dosen sering memakai microteaching dan wawancara.'],
  kejagung: ['Formasi jaksa/ calon jaksa dan pengawal tahanan umumnya menambah tes kesehatan, kesamaptaan (jasmani), psikotes, dan wawancara dengan nilai minimal.'],
  kemenkes: ['Tenaga kesehatan biasanya diuji sesuai profesi (dokter, perawat, bidan, apoteker, sanitarian, dsb.). Siapkan STR/SIP bila diminta pada tahap berkas.'],
  pupr: ['Formasi teknik (sipil, SDA, arsitektur, lingkungan) diuji kompetensi teknis jabatan. Beberapa formasi meminta sertifikat kompetensi kerja konstruksi.'],
  umum: ['Cocok untuk jabatan pelaksana/administrasi di instansi pusat maupun daerah.']
};

/* ================= Katalog & metadata ================= */

function skbInstansi_(id) {
  return SKB_INSTANSI.filter(function (x) { return x.id === id; })[0] || null;
}

/** Metadata topik SKB instansi → { subtest:'skb', name, instansi, index } atau null. */
function skbTopic_(topicId) {
  var key = 'skbt:' + topicId;
  if (_memo.hasOwnProperty(key)) return _memo[key];
  var out = null;
  SKB_INSTANSI.forEach(function (ins) {
    ins.topics.forEach(function (t, i) { if (!out && t[0] === topicId) out = { subtest: 'skb', name: t[1], instansi: ins.id, index: i }; });
  });
  _memo[key] = out;
  return out;
}

/** Nama/subtes topik apa pun (SKD, SKB umum lama, SKB instansi). */
function topicMeta_(id) {
  return TOPICS[id] || SKB_TOPICS[id] || skbTopic_(id) || null;
}

/** Topik pertama tiap instansi terbuka gratis (materi + latihan). */
function isFreeSkbTopic_(topicId) {
  var m = skbTopic_(topicId);
  return Boolean(m && m.index === 0);
}

function allSkbTopicIds_() {
  var out = [];
  SKB_INSTANSI.forEach(function (ins) { ins.topics.forEach(function (t) { out.push(t[0]); }); });
  return out;
}

/** Premium SKB aktif? */
function hasSkb_(user) {
  return Boolean(user && user.skbUntil && new Date(user.skbUntil + 'T23:59:59+07:00').getTime() > Date.now());
}

function isSkbRowActive_(row) {
  return Boolean(row && row.skb_until && new Date(row.skb_until).getTime() > Date.now());
}

/** Instansi sebuah paket tryout SKB (kosong → SKB Umum ASN). */
function pkgInstansi_(p) {
  var v = String(p.instansi || '').trim().toLowerCase();
  return v && skbInstansi_(v) ? v : 'umum';
}

function skbTryouts_(instansiId) {
  return getPackages_().filter(function (p) { return p.type === 'skb' && pkgInstansi_(p) === instansiId; });
}

/** Paket bank latihan SKB sebuah instansi (type "skblat", package_id SKBLAT-<KODE>). */
function skbBankPackage_(instansiId) {
  var ins = skbInstansi_(instansiId);
  if (!ins) return null;
  return getPackages_().filter(function (p) { return p.type === 'skblat' && (pkgInstansi_(p) === instansiId || p.packageId === 'SKBLAT-' + ins.code); })[0] || null;
}

/** Jumlah soal per topik di bank latihan SKB (di-cache bersama cache paket). */
function skbBankCounts_(instansiId) {
  var key = 'sbc_' + instansiId;
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var out = {};
  var bank = skbBankPackage_(instansiId);
  if (bank) {
    try { getPackageQuestions_(bank.packageId).forEach(function (q) { out[q.topicId] = (out[q.topicId] || 0) + 1; }); }
    catch (e) { console.warn('Bank SKB ' + bank.packageId + ': ' + e.message); }
  }
  cachePutJson_(key, out, PKG_CACHE_SEC);
  return out;
}

/* ================= Paket virtual Latihan Soal SKB ================= */

/** "LTS-<topik>": 50 soal satu topik SKB dari bank instansi, 45 menit, kerjakan semua lalu kirim. */
function skbTopicPackage_(packageId) {
  var topicId = String(packageId).replace(/^LTS-/, '');
  var meta = skbTopic_(topicId);
  if (!meta || meta.instansi === 'umum') throw new AppError_('NOT_FOUND', 'Topik latihan SKB tidak ditemukan.');
  var ins = skbInstansi_(meta.instansi);
  return {
    packageId: 'LTS-' + topicId, title: 'Latihan SKB ' + ins.short + ': ' + meta.name, type: 'skbtopik', topicId: topicId, subtest: 'skb',
    instansi: meta.instansi,
    description: SKB_TOPIC_SIZE + ' soal SKB ' + ins.short + ' topik ' + meta.name + ', dari mudah ke sulit.',
    durationMin: Number(getConfigOptional_('SKB_TOPIC_MIN', '')) || SKB_TOPIC_MIN,
    pg: { twk: null, tiu: null, tkp: null }, freeAttempts: null, order: 800 + meta.index, questionCount: null
  };
}

function skbTopicQuestions_(topicId) {
  var meta = skbTopic_(topicId);
  var bank = meta ? skbBankPackage_(meta.instansi) : null;
  if (!bank) return [];
  var qs = getPackageQuestions_(bank.packageId).filter(function (q) { return q.topicId === topicId; })
    .map(function (q) { return Object.assign({}, q); });
  qs.sort(function (a, b) { return (a.level || 0) - (b.level || 0) || a.number - b.number; });
  var n = qs.length;
  if (n > SKB_TOPIC_SIZE) {
    var keep = [];
    for (var i = 0; i < SKB_TOPIC_SIZE; i++) keep.push(qs[Math.floor(i * n / SKB_TOPIC_SIZE)]);
    qs = keep;
  }
  return qs.map(function (q, i) { q.number = i + 1; return q; });
}

function clearSkbCache_() {
  var c = CacheService.getScriptCache();
  allSkbTopicIds_().forEach(function (t) {
    c.remove('pq_LTS-' + t);
    for (var i = 0; i < 4; i++) c.remove('pq_LTS-' + t + '__' + i);
  });
  SKB_INSTANSI.forEach(function (ins) { c.remove('sbc_' + ins.id); });
  c.remove('ivq_v1');
}

/** Boleh mengerjakan paket SKB? (dipanggil dari packageAccess_) */
function skbPackageAccess_(pkg, user) {
  if (pkg.type === 'skbtopik') {
    if (isFreeSkbTopic_(pkg.topicId) || hasSkb_(user)) return { ok: true };
    return { ok: false, reason: 'SKB_REQUIRED', message: 'Latihan soal topik ini khusus Premium SKB (' + rupiah_(productPrice_('skb')) + '/bulan, semua instansi).' };
  }
  // type skb
  if (pkgInstansi_(pkg) === 'umum') return { ok: true };   // SKB Umum ASN lama: kuota gratis per paket (canStart_)
  if (hasSkb_(user)) return { ok: true };
  return { ok: false, reason: 'SKB_REQUIRED', message: 'Tryout SKB instansi khusus Premium SKB (' + rupiah_(productPrice_('skb')) + '/bulan): 3 tryout, semua materi & latihan, wawancara tanpa batas.' };
}

/* ================= Handler: katalog & instansi ================= */

/** getSkbCatalog (auth optional): daftar instansi + status Premium SKB + instansi pilihan. */
function handleGetSkbCatalog_(payload, user) {
  var mats = loadMaterials_();
  var bank = loadInterviewBank_();
  var row = user ? findOne_('users', 'user_id', user.userId) : null;
  return {
    loggedIn: Boolean(user),
    skb: { active: hasSkb_(user), until: user ? user.skbUntil || '' : '' },
    price: productPrice_('skb'), days: SKB_PLAN_DAYS,
    selected: row && skbInstansi_(String(row.skb_instansi || '')) ? String(row.skb_instansi) : '',
    instansi: SKB_INSTANSI.map(function (ins) {
      var counts = ins.general ? {} : skbBankCounts_(ins.id);
      var matTopics = ins.topics.filter(function (t) { return mats[t[0] + '|1'] || mats[t[0] + '|2']; }).length;
      var latTopics = ins.topics.filter(function (t) { return (counts[t[0]] || 0) > 0; }).length;
      var tryouts = skbTryouts_(ins.id).length;
      var iv = bank.filter(function (q) { return q.instansi === ins.id; }).length;
      return {
        id: ins.id, short: ins.short, name: ins.name, note: ins.note, general: Boolean(ins.general),
        topics: ins.topics.length, materi: matTopics, latihan: latTopics, tryouts: tryouts, interview: iv,
        ready: matTopics + latTopics + tryouts + iv > 0
      };
    })
  };
}

/** setSkbInstansi (auth required): simpan instansi pilihan di profil. */
function handleSetSkbInstansi_(payload, user) {
  var id = String(payload.instansi || '');
  if (!skbInstansi_(id)) throw new AppError_('BAD_REQUEST', 'Instansi tidak dikenal.');
  withLock_(function () {
    var row = findOne_('users', 'user_id', user.userId);
    update_('users', row._row, { skb_instansi: id });
  });
  return { selected: id };
}

/** getSkbInstansi (auth optional): isi lengkap satu instansi (kotak Tryout · Materi · Latihan · Wawancara · Info). */
function handleGetSkbInstansi_(payload, user) {
  var ins = skbInstansi_(String(payload.instansi || ''));
  if (!ins) throw new AppError_('BAD_REQUEST', 'Instansi tidak dikenal.');
  var skb = hasSkb_(user);
  var attempts = user ? finalizeExpiredAttempts_(user) : [];
  var mats = loadMaterials_();
  var counts = ins.general ? {} : skbBankCounts_(ins.id);

  function attemptView(pid) {
    var mine = attempts.filter(function (a) { return a.package_id === pid && !a.event_id; });
    var done = mine.filter(function (a) { return a.status === 'submitted'; });
    var run = mine.filter(function (a) { return a.status === 'in_progress'; })[0];
    var last = done[done.length - 1];
    return {
      attempts: done.length,
      last: last ? { attemptId: last.attempt_id, total: Number(last.total) || 0, submittedAt: toIso_(last.submitted_at) } : null,
      best: done.length ? Math.max.apply(null, done.map(function (a) { return Number(a.total) || 0; })) : null,
      inProgress: run ? { attemptId: run.attempt_id, endsAt: toIso_(run.ends_at) } : null
    };
  }

  var tryouts = skbTryouts_(ins.id).map(function (p) {
    var v = attemptView(p.packageId);
    var acc = skbPackageAccess_(p, user);
    var qn = packageQuestionCount_(p);
    var gate = acc.ok ? canStart_(p, user, v.attempts) : acc;
    return Object.assign({
      packageId: p.packageId, title: p.title, description: p.description, durationMin: p.durationMin, questionCount: qn, max: qn * 5,
      locked: !acc.ok, canStart: Boolean(v.inProgress) || gate.ok, lockReason: v.inProgress ? null : (gate.ok ? null : gate.reason)
    }, v);
  });

  var topics = ins.topics.map(function (t, i) {
    var id = t[0];
    var free = i === 0 || Boolean(ins.general);
    var hasMat = SKB_MATERIAL_LEVELS.some(function (l) { return mats[id + '|' + l]; });
    var out = {
      topicId: id, name: t[1], free: free, locked: !free && !skb,
      materi: hasMat, materiTitles: SKB_MATERIAL_LEVELS.map(function (l) { return mats[id + '|' + l] ? mats[id + '|' + l].title : null; }).filter(Boolean)
    };
    if (!ins.general) {
      out.questions = Math.min(SKB_TOPIC_SIZE, counts[id] || 0);
      out.packageId = 'LTS-' + id;
      Object.assign(out, attemptView('LTS-' + id));
    }
    return out;
  });

  var ivBank = loadInterviewBank_().filter(function (q) { return q.instansi === ins.id; });
  var ivRows = user ? userInterviews_(user, ins.id) : [];
  var ivDone = ivRows.filter(function (r) { return r.status === 'submitted'; });
  var ivUsed = ivRows.length;
  return {
    serverNow: nowIso_(), loggedIn: Boolean(user),
    skb: { active: skb, until: user ? user.skbUntil || '' : '' }, price: productPrice_('skb'), days: SKB_PLAN_DAYS,
    instansi: { id: ins.id, short: ins.short, name: ins.name, note: ins.note, general: Boolean(ins.general) },
    tryouts: tryouts,
    topics: topics,
    topicSize: SKB_TOPIC_SIZE, topicMin: Number(getConfigOptional_('SKB_TOPIC_MIN', '')) || SKB_TOPIC_MIN,
    interview: {
      available: ivBank.length > 0 && !ins.general,
      questions: ivBank.length,
      free: INTERVIEW_FREE, freeLeft: skb ? null : Math.max(0, INTERVIEW_FREE - ivUsed),
      canStart: ivBank.length > 0 && (skb || ivUsed < INTERVIEW_FREE || ivRows.some(isInterviewResumable_)),
      history: ivDone.slice(-5).reverse().map(function (r) {
        return { sessionId: r.session_id, score: Number(r.score) || 0, band: Number(r.band) || 0, submittedAt: toIso_(r.submitted_at) };
      })
    },
    info: SKB_INFO_COMMON.concat(SKB_INFO_EXTRA[ins.id] || [])
  };
}

/** getSkbMateri (auth optional): { topicId } → materi level 1–4 (terkunci bila bukan topik gratis & bukan Premium SKB). */
function handleGetSkbMateri_(payload, user) {
  var topicId = String(payload.topicId || '');
  var meta = skbTopic_(topicId);
  if (!meta) throw new AppError_('BAD_REQUEST', 'Topik materi SKB tidak valid.');
  var ins = skbInstansi_(meta.instansi);
  var mats = loadMaterials_();
  var levels = SKB_MATERIAL_LEVELS.map(function (l) { return mats[topicId + '|' + l]; }).filter(Boolean);
  var free = meta.index === 0 || Boolean(ins.general);
  var head = { topicId: topicId, name: meta.name, instansi: { id: ins.id, short: ins.short, name: ins.name }, free: free };
  if (!levels.length) return Object.assign(head, { locked: false, levels: [], empty: true });
  if (!free && !hasSkb_(user)) {
    return Object.assign(head, {
      locked: true, reason: user ? 'SKB' : 'LOGIN', price: productPrice_('skb'),
      teaser: { titles: levels.map(function (m) { return m.title; }), pointCount: levels.reduce(function (s, m) { return s + m.poinKunci.length; }, 0) }
    });
  }
  return Object.assign(head, { locked: false, levels: levels });
}

/* ================= Latihan Wawancara (gaya mock test) ================= */

var INTERVIEW_PARTS = {
  1: { label: 'Bagian 1 · Perkenalan & motivasi', count: 3, prep: 10, answer: 60 },
  2: { label: 'Bagian 2 · Presentasi singkat', count: 1, prep: 60, answer: 120 },
  3: { label: 'Bagian 3 · Wawasan instansi & situasi kerja', count: 3, prep: 15, answer: 90 }
};
var IV_FILLERS = ['eee', 'ee', 'eh', 'em', 'emm', 'hmm', 'mmm', 'anu', 'apa ya', 'apa namanya', 'gitu', 'kayak', 'gimana ya'];
var IV_INFORMAL = ['gue', 'gua', 'gw', 'lu', 'lo', 'elu', 'banget', 'doang', 'bokap', 'nyokap', 'kepo', 'santuy', 'wkwk'];
var IV_CONNECTORS = ['pertama', 'kedua', 'ketiga', 'selanjutnya', 'kemudian', 'karena', 'sebab', 'sehingga', 'oleh karena itu', 'misalnya',
  'contohnya', 'sebagai contoh', 'selain itu', 'namun', 'akan tetapi', 'kesimpulannya', 'dengan demikian', 'jadi', 'akhirnya', 'pada akhirnya', 'maka'];
var IV_SELF = ['Menjawab inti pertanyaan', 'Memberi contoh nyata', 'Mengaitkan dengan tugas instansi', 'Menutup dengan kesimpulan'];

/** Bank wawancara dari sheet "interview" (file materi, rahasia). Kunci & jawaban model hanya di server. */
function loadInterviewBank_() {
  if (_memo.ivbank) return _memo.ivbank;
  var cached = cacheGetJson_('ivq_v1');
  if (cached) return (_memo.ivbank = cached);
  var id = getConfigOptional_('MATERIALS_SPREADSHEET_ID', '');
  var out = [];
  if (id) {
    var rows = [];
    try { rows = readTable_(SpreadsheetApp.openById(id), 'interview'); } catch (e) { console.warn('Sheet interview: ' + e.message); }
    rows.forEach(function (r) {
      if (String(r.status || 'live').toLowerCase() !== 'live') return;
      var ins = String(r.instansi || '').trim().toLowerCase();
      var part = Number(r.part);
      if (!(ins === 'semua' || skbInstansi_(ins)) || !INTERVIEW_PARTS[part] || !String(r.question || '').trim()) return;
      out.push({
        qId: String(r.q_id), instansi: ins, part: part, category: String(r.category || ''),
        question: String(r.question).trim(),
        prepSec: Number(r.prep_sec) || INTERVIEW_PARTS[part].prep, answerSec: Number(r.answer_sec) || INTERVIEW_PARTS[part].answer,
        keywords: String(r.keywords || '').split(';').map(function (g) {
          return g.split('|').map(function (x) { return normText_(x); }).filter(String);
        }).filter(function (g) { return g.length; }),
        model: String(r.model_answer || ''), tips: String(r.tips || '')
      });
    });
  }
  cachePutJson_('ivq_v1', out, INTERVIEW_CACHE_SEC);
  return (_memo.ivbank = out);
}

/** Pertanyaan untuk sebuah instansi (termasuk pertanyaan "semua" untuk Bagian 1). */
function interviewPool_(instansiId) {
  return loadInterviewBank_().filter(function (q) { return q.instansi === instansiId || q.instansi === 'semua'; });
}

function userInterviews_(user, instansiId) {
  var rows = [];
  try { rows = findAll_('interviews', 'user_id', user.userId); } catch (e) { rows = []; }
  return instansiId ? rows.filter(function (r) { return r.instansi === instansiId; }) : rows;
}

function isInterviewResumable_(r) {
  return r.status === 'in_progress' && Date.now() - new Date(r.started_at).getTime() < INTERVIEW_RESUME_HOURS * 3600000;
}

function publicInterviewQ_(q, i) {
  var p = INTERVIEW_PARTS[q.part];
  return { qId: q.qId, number: i + 1, part: q.part, partLabel: p.label, category: q.category, text: q.question, prepSec: q.prepSec, answerSec: q.answerSec };
}

/** Acak deterministik sederhana (seed dari string). */
function seededShuffle_(arr, seedStr) {
  var h = 2166136261;
  for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul ? Math.imul(h, 16777619) : (h * 16777619) | 0; }
  var a = arr.slice();
  for (var j = a.length - 1; j > 0; j--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    var k = h % (j + 1);
    var t = a[j]; a[j] = a[k]; a[k] = t;
  }
  return a;
}

/** startInterview (auth required): { instansi } → sesi baru (atau sesi yang masih berjalan). */
function handleStartInterview_(payload, user) {
  var ins = skbInstansi_(String(payload.instansi || ''));
  if (!ins || ins.general) throw new AppError_('BAD_REQUEST', 'Instansi tidak dikenal.');
  var pool = interviewPool_(ins.id);
  if (!pool.some(function (q) { return q.instansi === ins.id; })) throw new AppError_('NOT_FOUND', 'Bank wawancara instansi ini belum tersedia.');
  var byId = {};
  pool.forEach(function (q) { byId[q.qId] = q; });

  var row = withLock_(function () {
    var mine = userInterviews_(user, ins.id);
    var run = mine.filter(isInterviewResumable_).pop();
    if (run) return run;
    if (!hasSkb_(user) && mine.length >= INTERVIEW_FREE) {
      throw new AppError_('SKB_REQUIRED', 'Sesi wawancara gratis untuk instansi ini sudah dipakai. Premium SKB (' + rupiah_(productPrice_('skb')) + '/bulan) membuka latihan wawancara tanpa batas untuk semua instansi.');
    }
    // Hindari pertanyaan sesi sebelumnya bila bank masih cukup
    var seen = {};
    mine.slice(-2).forEach(function (r) { String(r.q_ids || '').split(',').forEach(function (x) { seen[x] = true; }); });
    var sid = newId_('iv');
    var picked = [];
    [1, 2, 3].forEach(function (part) {
      var need = INTERVIEW_PARTS[part].count;
      var cand = pool.filter(function (q) { return q.part === part; });
      // Bagian 2 & 3 diutamakan pertanyaan khusus instansi
      if (part > 1) { var own = cand.filter(function (q) { return q.instansi === ins.id; }); if (own.length >= need) cand = own; }
      // Pertanyaan yang belum muncul di 2 sesi terakhir didahulukan, sisanya diisi dari yang sudah pernah muncul
      var fresh = seededShuffle_(cand.filter(function (q) { return !seen[q.qId]; }), sid + part);
      var old = seededShuffle_(cand.filter(function (q) { return seen[q.qId]; }), sid + part + 'o');
      picked = picked.concat(fresh.concat(old).slice(0, need));
    });
    var r = {
      session_id: sid, user_id: user.userId, instansi: ins.id, status: 'in_progress', started_at: nowIso_(), submitted_at: '',
      q_ids: picked.map(function (q) { return q.qId; }).join(','), score: '', band: '', mode: '', detail_json: ''
    };
    insert_('interviews', r);
    return r;
  });

  var qs = String(row.q_ids).split(',').map(function (id) { return byId[id]; }).filter(Boolean);
  return {
    sessionId: row.session_id, instansi: { id: ins.id, short: ins.short, name: ins.name }, startedAt: toIso_(row.started_at),
    questions: qs.map(publicInterviewQ_), selfChecks: IV_SELF, premium: hasSkb_(user)
  };
}

function normText_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9À-ɏ\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

function countPhrase_(padded, phrase) {
  var n = 0, needle = ' ' + phrase + ' ', i = padded.indexOf(needle);
  while (i >= 0) { n++; i = padded.indexOf(needle, i + needle.length - 1); }
  return n;
}

/** Kata kunci cocok bila muncul sebagai awal kata (mis. "melayani" cocok untuk "melayan", "pelayanan" untuk "pelayanan"). */
function hasKeyword_(padded, alt) {
  return padded.indexOf(' ' + alt) >= 0;
}

/**
 * Rubrik otomatis (tanpa AI). Skor 0–100:
 *   Isi & relevansi 40 · Struktur 15 · Kelancaran & bahasa 20 · Waktu/panjang 15 · Penilaian diri 10
 */
function scoreInterviewAnswer_(q, a) {
  var text = normText_(a.transcript).slice(0, 4000);
  var padded = ' ' + text + ' ';
  var words = text ? text.split(' ').length : 0;
  var mode = a.mode === 'voice' ? 'voice' : 'text';
  var dur = Math.max(0, Math.min(q.answerSec * 2, Number(a.durationSec) || 0));
  var self = Array.isArray(a.self) ? a.self.filter(function (x, i) { return x === true && i < IV_SELF.length; }).length : 0;
  if (words < 3) {
    return { score: 0, words: words, aspects: { isi: 0, struktur: 0, kelancaran: 0, waktu: 0, diri: 0 }, hit: [], missing: q.keywords.map(function (g) { return g[0]; }), fillers: 0, informal: [], wpm: null, empty: true };
  }
  var hit = [], missing = [];
  q.keywords.forEach(function (g) { (g.some(function (alt) { return hasKeyword_(padded, alt); }) ? hit : missing).push(g[0]); });
  var cov = q.keywords.length ? hit.length / q.keywords.length : 0.6;
  var isi = Math.min(1, cov / 0.7);

  var conn = IV_CONNECTORS.filter(function (c) { return padded.indexOf(' ' + c + ' ') >= 0; }).length;
  var sentences = String(a.transcript || '').split(/[.!?]+/).filter(function (s) { return s.trim().split(/\s+/).length >= 3; }).length;
  var struktur = Math.min(1, conn / 3) * 0.8 + (mode === 'text' ? Math.min(1, sentences / 3) * 0.2 : (words >= 40 ? 0.2 : 0.1));

  var fillers = IV_FILLERS.reduce(function (s, f) { return s + countPhrase_(padded, f); }, 0);
  var informal = IV_INFORMAL.filter(function (w) { return countPhrase_(padded, w) > 0; });
  var minutes = mode === 'voice' && dur > 0 ? dur / 60 : Math.max(0.5, words / 120);
  var fpm = fillers / minutes;
  var wpm = mode === 'voice' && dur >= 5 ? Math.round(words / (dur / 60)) : null;
  var kel = 1 - Math.min(1, fpm / 8) * 0.6 - Math.min(0.25, informal.length * 0.08);
  if (wpm !== null) kel -= wpm < 70 ? Math.min(0.3, (70 - wpm) / 100) : wpm > 175 ? Math.min(0.3, (wpm - 175) / 100) : 0;
  kel = Math.max(0, kel);

  var waktu;
  if (mode === 'voice') {
    var r = dur / q.answerSec;
    waktu = r < 0.5 ? r / 0.5 : r <= 1.1 ? 1 : Math.max(0, 1 - (r - 1.1) * 2);
  } else {
    var target = q.answerSec * 2;   // ± 120 kata per menit bicara
    var rr = words / target;
    waktu = rr < 0.35 ? rr / 0.35 : rr <= 1.3 ? 1 : Math.max(0.4, 1 - (rr - 1.3));
  }
  var diri = self / IV_SELF.length;
  var aspects = { isi: Math.round(isi * 40), struktur: Math.round(struktur * 15), kelancaran: Math.round(kel * 20), waktu: Math.round(waktu * 15), diri: Math.round(diri * 10) };
  var score = aspects.isi + aspects.struktur + aspects.kelancaran + aspects.waktu + aspects.diri;
  return { score: Math.min(100, score), words: words, aspects: aspects, hit: hit, missing: missing, fillers: fillers, informal: informal, wpm: wpm, connectors: conn };
}

/** Skor 0–100 → band 1–9 (kelipatan 0,5), gaya mock test. */
function interviewBand_(score) {
  return Math.max(1, Math.min(9, Math.round((1 + score / 100 * 8) * 2) / 2));
}

function interviewLevel_(score) {
  return score >= 85 ? 'Sangat baik' : score >= 70 ? 'Baik' : score >= 55 ? 'Cukup' : 'Perlu latihan';
}

function interviewTips_(r, q) {
  var t = [];
  if (r.empty) return ['Jawaban belum terekam. Coba lagi dan bicara lebih dekat ke mikrofon, atau ketik jawabanmu.'];
  if (r.missing.length) t.push('Tambahkan poin: ' + r.missing.slice(0, 4).join(', ') + '.');
  if (r.aspects.struktur < 9) t.push('Pakai alur yang jelas: pembuka → 2–3 poin (pertama, kedua) → contoh → kesimpulan.');
  if (r.fillers >= 4) t.push('Kurangi kata pengisi ("eee", "anu", "gitu"): berhenti sejenak lebih baik daripada mengisi jeda.');
  if (r.informal.length) t.push('Hindari kata tidak baku: ' + r.informal.join(', ') + '.');
  if (r.wpm !== null && r.wpm < 70) t.push('Tempo bicara terlalu lambat (' + r.wpm + ' kata/menit). Targetkan 100–150.');
  if (r.wpm !== null && r.wpm > 175) t.push('Tempo bicara terlalu cepat (' + r.wpm + ' kata/menit). Beri jeda antarpoin.');
  if (r.aspects.waktu < 10) t.push('Manfaatkan waktu lebih baik: jawaban ideal ' + Math.round(q.answerSec * 0.5) + '–' + q.answerSec + ' detik.');
  if (!t.length) t.push('Jawaban sudah lengkap dan runtut. Pertahankan, lalu latih variasi contoh pengalaman.');
  return t;
}

/** submitInterview (auth required): { sessionId, answers:[{ qId, transcript, durationSec, mode, self:[bool×4], edited }] } */
function handleSubmitInterview_(payload, user) {
  var row = findOne_('interviews', 'session_id', String(payload.sessionId || ''));
  if (!row || row.user_id !== user.userId) throw new AppError_('NOT_FOUND', 'Sesi wawancara tidak ditemukan.');
  if (row.status === 'submitted') return interviewResult_(row);
  var byId = {};
  interviewPool_(row.instansi).forEach(function (q) { byId[q.qId] = q; });
  var ids = String(row.q_ids).split(',');
  var given = {};
  (Array.isArray(payload.answers) ? payload.answers : []).forEach(function (a) { if (a && a.qId) given[String(a.qId)] = a; });
  var modes = {};
  var detail = ids.map(function (id) {
    var q = byId[id];
    if (!q) return null;
    var a = given[id] || {};
    var res = scoreInterviewAnswer_(q, a);
    modes[a.mode === 'voice' ? 'voice' : 'text'] = true;
    return {
      qId: id, transcript: String(a.transcript || '').slice(0, 2500), durationSec: Math.round(Number(a.durationSec) || 0),
      mode: a.mode === 'voice' ? 'voice' : 'text', edited: Boolean(a.edited), self: (Array.isArray(a.self) ? a.self : []).slice(0, IV_SELF.length).map(Boolean),
      score: res.score, aspects: res.aspects, words: res.words, wpm: res.wpm, fillers: res.fillers, informal: res.informal, hit: res.hit, missing: res.missing,
      tips: interviewTips_(res, q)
    };
  }).filter(Boolean);
  var score = detail.length ? Math.round(detail.reduce(function (s, d) { return s + d.score; }, 0) / detail.length) : 0;
  var saved = withLock_(function () {
    var cur = findOne_('interviews', 'session_id', row.session_id);
    if (cur.status === 'submitted') return cur;
    return update_('interviews', cur._row, {
      status: 'submitted', submitted_at: nowIso_(), score: score, band: interviewBand_(score),
      mode: Object.keys(modes).join('+'), detail_json: JSON.stringify(detail)
    });
  });
  return interviewResult_(saved);
}

function interviewResult_(row) {
  var byId = {};
  interviewPool_(row.instansi).forEach(function (q) { byId[q.qId] = q; });
  var ins = skbInstansi_(row.instansi) || { id: row.instansi, short: row.instansi, name: row.instansi };
  var detail = safeParse_(row.detail_json, []);
  var score = Number(row.score) || 0;
  var aspectAvg = {};
  ['isi', 'struktur', 'kelancaran', 'waktu', 'diri'].forEach(function (k) {
    aspectAvg[k] = detail.length ? Math.round(detail.reduce(function (s, d) { return s + (d.aspects[k] || 0); }, 0) / detail.length) : 0;
  });
  return {
    sessionId: row.session_id, instansi: { id: ins.id, short: ins.short, name: ins.name },
    submittedAt: toIso_(row.submitted_at), score: score, band: Number(row.band) || interviewBand_(score), level: interviewLevel_(score),
    aspects: aspectAvg, aspectMax: { isi: 40, struktur: 15, kelancaran: 20, waktu: 15, diri: 10 },
    answers: detail.map(function (d, i) {
      var q = byId[d.qId] || {};
      return Object.assign({}, d, {
        number: i + 1, part: q.part, partLabel: q.part ? INTERVIEW_PARTS[q.part].label : '', question: q.question || '(pertanyaan sudah tidak tersedia)',
        answerSec: q.answerSec, model: q.model || '', modelTips: q.tips || ''
      });
    })
  };
}

/** getInterviewResult (auth required): { sessionId } */
function handleGetInterviewResult_(payload, user) {
  var row = findOne_('interviews', 'session_id', String(payload.sessionId || ''));
  if (!row || row.user_id !== user.userId) throw new AppError_('NOT_FOUND', 'Sesi wawancara tidak ditemukan.');
  if (row.status !== 'submitted') throw new AppError_('NOT_FINISHED', 'Sesi wawancara ini belum selesai.');
  return interviewResult_(row);
}

/* ================= Fungsi admin (jalankan dari editor) ================= */

/** Bersihkan cache SKB setelah mengubah bank latihan, materi, atau sheet interview. */
function refreshSkbCache() {
  clearSkbCache_();
  CacheService.getScriptCache().remove('mats_v1');
  var bank = loadInterviewBank_();
  SKB_INSTANSI.forEach(function (ins) {
    if (ins.general) return;
    var c = skbBankCounts_(ins.id);
    var n = Object.keys(c).reduce(function (s, k) { return s + c[k]; }, 0);
    Logger.log(ins.short + ': tryout ' + skbTryouts_(ins.id).length + ' · bank latihan ' + n + ' soal · wawancara ' +
      bank.filter(function (q) { return q.instansi === ins.id; }).length + ' pertanyaan');
  });
  Logger.log('Pertanyaan wawancara umum (semua instansi): ' + bank.filter(function (q) { return q.instansi === 'semua'; }).length);
}

/** Beri Premium SKB manual (kompensasi/undangan). Ganti nilai lalu jalankan. */
function adminGrantSkb() {
  var EMAIL = 'nama@contoh.com';
  var DAYS = 30;
  var u = findOne_('users', 'email', EMAIL.toLowerCase());
  if (!u) return Logger.log('Pengguna tidak ditemukan');
  var until = withLock_(function () { return extendSkbLocked_(u, DAYS, 'ADMIN', 'pemberian manual'); });
  Logger.log('Premium SKB ' + EMAIL + ' s.d. ' + until);
}

/** Perpanjang Premium SKB (dipanggil di dalam lock). → ISO tanggal berakhir */
function extendSkbLocked_(userRow, days, trxId, note) {
  var now = Date.now();
  var cur = userRow.skb_until ? new Date(userRow.skb_until).getTime() : 0;
  var base = cur > now ? cur : now;
  var until = new Date(base + Number(days || SKB_PLAN_DAYS) * 86400000).toISOString();
  update_('users', userRow._row, { skb_until: until });
  insert_('entitlements', { ent_id: newId_('ent'), user_id: userRow.user_id, kind: 'skb', ref_id: SKB_PLAN_REF, trx_id: trxId, status: 'active', created_at: nowIso_(), note: note || ('s.d. ' + until) });
  delete _memo['ent_' + userRow.user_id];
  return until;
}
