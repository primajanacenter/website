/**
 * PostSkd.gs — Fase 8: input skor SKD asli + analisis langkah berikutnya.
 *
 * Peserta memasukkan skor resmi TWK/TIU/TKP setelah tes. Server menilai ambang batas
 * (DEFAULT_PG), membandingkan dengan tryout di aplikasi, dan menghitung kontribusi SKD ke
 * nilai akhir (umumnya SKD 40% + SKB 60%, Permenpanrb 6/2024 — cek pengumuman instansi).
 * Data ini milik pengguna; tidak ditampilkan ke pengguna lain.
 */

var SKD_MAX = { twk: 150, tiu: 175, tkp: 225 };
var SKD_WEIGHT = 0.4;
var SKB_WEIGHT = 0.6;

/** saveSkdResult (auth required): { testDate, twk, tiu, tkp, formation?, skbDate? } */
function handleSaveSkdResult_(payload, user) {
  var d = validateSkd_(payload || {});
  var now = nowIso_();
  var saved = withLock_(function () {
    var mine = findAll_('skd_results', 'user_id', user.userId);
    var same = mine.filter(function (r) { return String(r.test_date).slice(0, 10) === d.test_date; })[0];
    var row = {
      user_id: user.userId, test_date: d.test_date, twk: d.twk, tiu: d.tiu, tkp: d.tkp, total: d.total,
      passed_all: String(d.passed), formation: d.formation, skb_date: d.skb_date, updated_at: now
    };
    if (same) return update_('skd_results', same._row, row);
    if (mine.length >= 10) throw new AppError_('RATE_LIMITED', 'Riwayat skor SKD sudah penuh (10 data).');
    row.created_at = now;
    insert_('skd_results', row);
    return row;
  });
  return buildPostSkd_(user, saved);
}

/** getPostSkd (auth required): skor SKD terakhir + analisis (null bila belum diisi). */
function handleGetPostSkd_(payload, user) {
  var mine = findAll_('skd_results', 'user_id', user.userId)
    .sort(function (a, b) { return String(a.test_date) < String(b.test_date) ? -1 : 1; });
  return buildPostSkd_(user, mine[mine.length - 1] || null, mine);
}

function validateSkd_(p) {
  var date = String(p.testDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00+07:00').getTime())) {
    throw new AppError_('BAD_REQUEST', 'Tanggal tes tidak valid.');
  }
  var t = new Date(date + 'T00:00:00+07:00').getTime();
  if (t > Date.now() + 86400000) throw new AppError_('BAD_REQUEST', 'Tanggal tes belum lewat. Isi skor setelah kamu mengikuti SKD.');
  if (t < Date.now() - 3 * 365 * 86400000) throw new AppError_('BAD_REQUEST', 'Tanggal tes terlalu lama.');
  var out = { test_date: date };
  ['twk', 'tiu', 'tkp'].forEach(function (k) {
    var v = Number(p[k]);
    if (p[k] === '' || p[k] === null || p[k] === undefined || !isFinite(v) || Math.round(v) !== v || v < 0 || v > SKD_MAX[k]) {
      throw new AppError_('BAD_REQUEST', 'Skor ' + k.toUpperCase() + ' harus bilangan bulat 0–' + SKD_MAX[k] + '.');
    }
    out[k] = v;
  });
  out.total = out.twk + out.tiu + out.tkp;
  out.passed = out.twk >= DEFAULT_PG.twk && out.tiu >= DEFAULT_PG.tiu && out.tkp >= DEFAULT_PG.tkp;
  out.formation = cleanText_(String(p.formation || '').replace(/[<>]/g, ''), 120);
  var skb = String(p.skbDate || '').trim();
  out.skb_date = /^\d{4}-\d{2}-\d{2}$/.test(skb) ? skb : '';
  return out;
}

function buildPostSkd_(user, row, history) {
  var profileRow = findOne_('profiles', 'user_id', user.userId);
  var testDate = profileRow ? String(profileRow.test_date || '').slice(0, 10) : '';
  var out = {
    premium: user.plan === 'premium',
    profileTestDate: testDate,
    testPassed: Boolean(testDate) && new Date(testDate + 'T23:59:59+07:00').getTime() < Date.now(),
    result: null, analysis: null,
    history: (history || []).map(function (r) {
      return { testDate: String(r.test_date).slice(0, 10), total: Number(r.total) || 0, passedAll: isTrue_(r.passed_all) };
    }).reverse()
  };
  if (!row) return out;
  var r = {
    testDate: String(row.test_date).slice(0, 10), twk: Number(row.twk) || 0, tiu: Number(row.tiu) || 0, tkp: Number(row.tkp) || 0,
    formation: String(row.formation || ''), skbDate: String(row.skb_date || '').slice(0, 10)
  };
  r.total = r.twk + r.tiu + r.tkp;
  r.passedAll = r.twk >= DEFAULT_PG.twk && r.tiu >= DEFAULT_PG.tiu && r.tkp >= DEFAULT_PG.tkp;
  out.result = r;
  out.analysis = analyzeSkd_(user, r);
  return out;
}

function analyzeSkd_(user, r) {
  var subtests = ['twk', 'tiu', 'tkp'].map(function (k) {
    return { id: k, score: r[k], max: SKD_MAX[k], pg: DEFAULT_PG[k], gap: r[k] - DEFAULT_PG[k], passed: r[k] >= DEFAULT_PG[k] };
  });
  // pembanding: 5 tryout SKD terakhir di aplikasi (diagnostik/akbar, bukan SKB/latihan)
  var tries = findAll_('attempts', 'user_id', user.userId).filter(function (a) {
    return a.status === 'submitted' && a.type !== 'skb' && a.type !== 'latihan' && Number(a.total) > 0;
  }).slice(-5);
  var tryout = null;
  if (tries.length) {
    var avg = function (k) { return Math.round(tries.reduce(function (s, a) { return s + (Number(a[k]) || 0); }, 0) / tries.length); };
    tryout = { n: tries.length, total: avg('total'), twk: avg('twk'), tiu: avg('tiu'), tkp: avg('tkp'),
      best: tries.reduce(function (m, a) { return Math.max(m, Number(a.total) || 0); }, 0) };
    tryout.diff = r.total - tryout.total;
  }
  var skdPart = Math.round(r.total / 550 * SKD_WEIGHT * 100 * 100) / 100; // dari 40
  var scenarios = [60, 70, 80, 90].map(function (skb) {
    return { skb: skb, final: Math.round((skdPart + skb * SKB_WEIGHT) * 100) / 100 };
  });
  var weakest = subtests.slice().sort(function (a, b) { return (a.score / a.pg) - (b.score / b.pg); })[0];
  var steps = [];
  if (r.passedAll) {
    steps.push({ id: 'skb', title: 'Siapkan SKB sekarang', text: 'SKB umumnya berbobot 60% dari nilai akhir, lebih besar dari SKD. Mulai dari panduan dan tryout SKB.', href: 'skb.html' });
    steps.push({ id: 'pengumuman', title: 'Pantau pengumuman peserta SKB', text: 'Lolos ambang batas belum otomatis lolos ke SKB. Peserta SKB dipilih berdasarkan peringkat skor SKD di formasi yang sama (umumnya maksimal 3× jumlah kebutuhan formasi). Cek pengumuman resmi instansi.', href: '' });
    steps.push({ id: 'dokumen', title: 'Siapkan dokumen & jadwal', text: 'Catat jadwal, lokasi, dan syarat SKB (kartu ujian, KTP, dokumen tambahan). Beberapa instansi menambah wawancara, psikotes, atau praktik kerja.', href: 'panduan.html' });
  } else {
    steps.push({ id: 'fokus', title: 'Fokus ke ' + weakest.id.toUpperCase(), text: weakest.id.toUpperCase() + ' paling jauh dari ambang batas (' + weakest.score + ' dari ambang ' + weakest.pg + '). Satu subtes di bawah ambang batas sudah membuat peserta gugur.', href: 'materi.html' });
    steps.push({ id: 'rencana', title: 'Susun ulang rencana belajar', text: 'Perbarui tanggal tes di profil ke perkiraan seleksi berikutnya, lalu ikuti rencana dan latihan harian.', href: 'rencana.html' });
    steps.push({ id: 'akbar', title: 'Ikut Tryout Akbar mingguan', text: 'Ukur kemajuan tiap minggu dan bandingkan dengan peserta lain.', href: 'akbar.html' });
  }
  return {
    subtests: subtests, weakest: weakest.id, tryout: tryout,
    skdPart: skdPart, skdWeight: SKD_WEIGHT * 100, skbWeight: SKB_WEIGHT * 100, scenarios: scenarios,
    steps: steps,
    note: 'Perhitungan nilai akhir memakai bobot umum SKD 40% dan SKB 60%. Bobot dan komponen SKB bisa berbeda per instansi; ikuti pengumuman resmi.'
  };
}
