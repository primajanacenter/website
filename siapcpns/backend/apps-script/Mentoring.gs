/**
 * Mentoring.gs — Live Mentoring CPNS via Zoom & rekaman (Fase 13, menu D).
 *
 * Jadwal: sheet mentoring_sessions (satu baris = satu sesi). Default: setiap Jumat 19.00–21.00 WIB,
 * Rp25.000 per sesi, maksimal 30 peserta. Buat jadwal cepat dengan seedMentoringSeries().
 *
 * Perlindungan link (sederhana, sesuai pilihan pemilik):
 *  - Link & passcode Zoom TIDAK pernah dikirim ke browser kecuali kepada pemilik tiket, dan hanya mulai
 *    15 menit sebelum sesi sampai sesi selesai, lewat tombol "Gabung" di member area (joinLive).
 *  - Setiap klik Gabung dicatat (access_log) sehingga pembagian link bisa dilacak. Aktifkan Waiting Room
 *    di Zoom dan cocokkan nama peserta dengan daftar pembeli (Super User Dashboard).
 *  - Rekaman: video YouTube "Unlisted" (bukan Private) diputar di member area hanya untuk pembeli, dengan
 *    tanda air email pembeli. Tidak ada cara yang 100% mencegah orang merekam layar atau menyalin URL.
 */

var LIVE_JOIN_BEFORE_MIN = 15;
var MENTORING_DEFAULT_CAPACITY = 30;
var MENTORING_SERIES = [
  ['Kick-off: peta SKD terbaru & strategi skor aman', 'umum', 'Aturan SKD terbaru, kisi-kisi 2024, ambang batas, dan cara menyusun target skor per subtes.'],
  ['TWK: Pancasila & UUD 1945 — pola soal HOTS terbaru', 'twk', 'Membedah soal Pancasila & UUD bertipe kasus, pasal yang sering keluar, dan jebakan opsi.'],
  ['TIU: Figural — analogi, ketidaksamaan, serial gambar', 'tiu', 'Teknik membaca rotasi, pencerminan, dan pola ganda pada soal gambar terbaru.'],
  ['TKP: pelayanan publik & jejaring kerja — memilih jawaban bernilai 5', 'tkp', 'Pola skor TKP, ciri jawaban terbaik, dan latihan langsung dari kasus terbaru.'],
  ['TWK: nasionalisme, integritas & bela negara dalam kasus nyata', 'twk', 'Soal TWK berbasis kasus sehari-hari dan cara mengeliminasi opsi yang menjebak.'],
  ['TIU: silogisme & penalaran analitis cepat', 'tiu', 'Kontraposisi, negasi, dan teknik tabel untuk soal urutan/posisi dalam 90 detik.'],
  ['TKP: teknologi informasi & anti-radikalisme', 'tkp', 'Aspek TKP terbaru: literasi digital, keamanan data, dan sikap terhadap paham radikal.'],
  ['TIU: numerik — deret, perbandingan kuantitatif, soal cerita', 'tiu', 'Trik hitung cepat tanpa kalkulator dan pola deret yang paling sering muncul.'],
  ['TWK: NKRI, Bhinneka Tunggal Ika & bahasa negara', 'twk', 'Wawasan Nusantara, otonomi daerah, dan kaidah bahasa Indonesia dalam soal TWK.'],
  ['TKP: sosial budaya & profesionalisme', 'tkp', 'Menyikapi keberagaman dan dilema profesional ASN dengan jawaban bernilai tertinggi.'],
  ['Bedah Tryout Akbar: soal tersulit minggu ini', 'umum', 'Pembahasan langsung soal-soal dengan persentase benar terendah di Tryout Akbar terakhir.'],
  ['Manajemen waktu 100 menit & mental hari-H', 'umum', 'Urutan pengerjaan, alokasi waktu per subtes, dan persiapan teknis di lokasi tes.']
];

function mentoringSessions_() {
  if (_memo.mentoring) return _memo.mentoring;
  var list = [];
  try {
    list = readAll_('mentoring_sessions').filter(function (s) {
      if (!s.session_id) return false;
      if (isNaN(mDate_(s.starts_at))) { console.warn('mentoring ' + s.session_id + ': starts_at tidak terbaca, dilewati'); return false; }
      return true;
    });
  } catch (e) { list = []; }
  _memo.mentoring = list;
  return list;
}

function mentoringSession_(id) {
  return mentoringSessions_().filter(function (s) { return String(s.session_id) === String(id); })[0] || null;
}

function isRecordingPublished_(s) {
  return String(s.recording_status || '').toLowerCase() === 'published' && Boolean(youtubeId_(s.recording_url));
}

function mDate_(v) {
  var d = akbarDate_(v);
  return d ? d.getTime() : NaN;
}

/** Status tiket live untuk member area. */
function liveTicketView_(s, now) {
  var start = mDate_(s.starts_at), end = mDate_(s.ends_at) || start + 2 * 3600000;
  var joinFrom = start - LIVE_JOIN_BEFORE_MIN * 60000;
  var state = String(s.status) === 'cancelled' ? 'cancelled' : now > end ? 'ended' : now >= start ? 'live' : now >= joinFrom ? 'joinable' : 'upcoming';
  return {
    sessionId: s.session_id, title: s.title, subtest: s.subtest, description: s.description,
    startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), joinFrom: new Date(joinFrom).toISOString(),
    state: state, canJoin: state === 'joinable' || state === 'live',
    recordingAvailable: isRecordingPublished_(s)
  };
}

/** getMentoring (auth optional): jadwal live mendatang + katalog rekaman. */
function handleGetMentoring_(payload, user) {
  var now = Date.now();
  var all = mentoringSessions_();
  var live = all.filter(function (s) { return String(s.status) === 'scheduled' && (mDate_(s.ends_at) || mDate_(s.starts_at)) > now; })
    .sort(function (a, b) { return mDate_(a.starts_at) - mDate_(b.starts_at); })
    .map(function (s) {
      var cap = Number(s.capacity) || MENTORING_DEFAULT_CAPACITY;
      var started = mDate_(s.starts_at) <= now;
      var v = liveTicketView_(s, now);
      v.price = productPrice_('live', s.price);
      v.capacity = cap;
      v.seatsLeft = Math.max(0, cap - seatsTaken_('live', s.session_id, user ? user.userId : ''));
      v.owned = owns_(user, 'live', s.session_id);
      v.onSale = !started && v.seatsLeft > 0;
      return v;
    });
  var recordings = all.filter(isRecordingPublished_)
    .sort(function (a, b) { return mDate_(b.starts_at) - mDate_(a.starts_at); })
    .map(function (s) {
      return {
        sessionId: s.session_id, title: s.title, subtest: s.subtest, description: s.description,
        startsAt: new Date(mDate_(s.starts_at)).toISOString(), price: productPrice_('rec', s.recording_price), owned: owns_(user, 'rec', s.session_id)
      };
    });
  return { serverNow: nowIso_(), loggedIn: Boolean(user), joinBeforeMin: LIVE_JOIN_BEFORE_MIN, live: live, recordings: recordings };
}

/** joinLive (auth required): { sessionId } → link Zoom, hanya untuk pemilik tiket & hanya saat jendela gabung. */
function handleJoinLive_(payload, user) {
  var s = mentoringSession_(String(payload.sessionId || ''));
  if (!s || !owns_(user, 'live', s.session_id)) throw new AppError_('FORBIDDEN', 'Tiket sesi ini tidak ditemukan di akunmu.');
  var v = liveTicketView_(s, Date.now());
  if (v.state === 'cancelled') throw new AppError_('CLOSED', 'Sesi ini dibatalkan. Hubungi admin untuk penjadwalan ulang.');
  if (v.state === 'ended') throw new AppError_('CLOSED', 'Sesi ini sudah selesai.' + (v.recordingAvailable ? ' Rekamannya tersedia di menu Mentoring.' : ''));
  if (!v.canJoin) throw new AppError_('NOT_OPEN', 'Tombol Gabung aktif ' + LIVE_JOIN_BEFORE_MIN + ' menit sebelum sesi (' + fmtJkt_(v.startsAt) + ').');
  if (!s.zoom_url) throw new AppError_('NOT_OPEN', 'Link sesi sedang disiapkan admin. Coba lagi beberapa menit lagi.');
  logAccess_(user, 'live', s.session_id, payload.ua);
  return { url: String(s.zoom_url), passcode: String(s.zoom_passcode || ''), title: s.title, endsAt: v.endsAt, name: user.name || user.email };
}

/** getRecording (auth required): { sessionId } → ID video, hanya untuk pembeli rekaman. */
function handleGetRecording_(payload, user) {
  var s = mentoringSession_(String(payload.sessionId || ''));
  if (!s || !isRecordingPublished_(s)) throw new AppError_('NOT_FOUND', 'Rekaman tidak ditemukan.');
  if (!owns_(user, 'rec', s.session_id) && !isAdmin_(user)) throw new AppError_('PAYMENT_REQUIRED', 'Beli rekaman ini untuk menontonnya.');
  logAccess_(user, 'rec', s.session_id, payload.ua);
  return {
    sessionId: s.session_id, title: s.title, subtest: s.subtest, description: s.description,
    startsAt: new Date(mDate_(s.starts_at)).toISOString(), videoId: youtubeId_(s.recording_url), watermark: user.email
  };
}

function youtubeId_(url) {
  var u = String(url || '').trim();
  if (/^[\w-]{11}$/.test(u)) return u;
  var m = u.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/live\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : '';
}

function logAccess_(user, kind, refId, ua) {
  try { insert_('access_log', { at: nowIso_(), user_id: user.userId, kind: kind, ref_id: refId, ua: cleanText_(String(ua || ''), 160) }); }
  catch (e) { console.warn('access_log: ' + e.message); }
}

/* ================= Fungsi admin (jalankan dari editor) ================= */

/**
 * Buat jadwal Live Mentoring setiap Jumat 19.00–21.00 WIB untuk WEEKS minggu ke depan, memakai daftar topik
 * MENTORING_SERIES secara berurutan (melanjutkan dari sesi terakhir). Tanggal yang sudah ada dilewati.
 * Setelah itu isi kolom zoom_url & zoom_passcode di sheet mentoring_sessions.
 */
function seedMentoringSeries() {
  var WEEKS = 8;
  var existing = mentoringSessions_();
  var have = {};
  existing.forEach(function (s) { have[String(s.session_id)] = true; });
  var next = existing.length % MENTORING_SERIES.length;
  var made = 0;
  for (var k = 1; k <= 7 * WEEKS + 7 && made < WEEKS; k++) {
    var d = jktDay_(k);
    if (d.dow !== 5) continue;   // Jumat
    var id = 'MTR-' + d.date.replace(/-/g, '');
    if (have[id]) continue;
    var t = MENTORING_SERIES[next % MENTORING_SERIES.length]; next++;
    insert_('mentoring_sessions', {
      session_id: id, title: t[0], subtest: t[1], description: t[2],
      starts_at: d.date + 'T19:00:00+07:00', ends_at: d.date + 'T21:00:00+07:00',
      price: PRODUCT_DEFAULT_PRICE.live, capacity: MENTORING_DEFAULT_CAPACITY, zoom_url: '', zoom_passcode: '',
      status: 'scheduled', recording_url: '', recording_price: PRODUCT_DEFAULT_PRICE.rec, recording_status: 'draft', created_at: nowIso_()
    });
    made++;
  }
  delete _memo.mentoring;
  Logger.log(made + ' sesi mentoring dibuat. Isi zoom_url & zoom_passcode di sheet mentoring_sessions sebelum hari-H.');
}

/** Daftar pemegang tiket sebuah sesi (untuk mencocokkan nama di Waiting Room Zoom). Ganti SESSION_ID lalu jalankan. */
function listLiveAttendees() {
  var SESSION_ID = 'MTR-20261113';
  var ents = findAll_('entitlements', 'ref_id', SESSION_ID).filter(function (e) { return e.kind === 'live' && e.status === 'active'; });
  var lines = ents.map(function (e, i) { var u = findOne_('users', 'user_id', e.user_id) || {}; return (i + 1) + '. ' + (u.name || '-') + ' <' + (u.email || '-') + '>'; });
  Logger.log('Peserta ' + SESSION_ID + ' (' + ents.length + '):\n' + lines.join('\n'));
}
