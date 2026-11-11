/**
 * Consult.gs — Konsultasi CPNS via chat di dalam aplikasi (Fase 13, menu E).
 *
 * - Jadwal: sheet consult_slots, diisi admin (satu baris = satu slot 60 menit untuk 1 pembeli).
 *   Kolom wajib: slot_id, starts_at (mis. 2026-11-16T19:00:00+07:00), consultant_name, consultant_email,
 *   status = open. ends_at kosong = starts_at + 60 menit. price kosong = Rp30.000.
 *   Bantuan cepat: seedConsultSlots().
 * - Setelah dibayar, slot menjadi booked dan ruang chat terbuka 10 menit sebelum sampai akhir sesi.
 * - Konsultan (email di kolom consultant_email) atau admin membalas dari halaman Konsultasi.
 * - Pesan disimpan di sheet consult_messages; percakapan disajikan dari cache agar polling ringan.
 */

var CONSULT_MINUTES = 60;
var CONSULT_OPEN_BEFORE_MIN = 10;
var CONSULT_MSG_MAX = 1000;
var CONSULT_MSG_PER_MIN = 20;
var CONSULT_CACHE_SEC = 3600;

function consultSlots_() {
  if (_memo.cslots) return _memo.cslots;
  var cached = cacheGetJson_('cslots');
  if (!cached) {
    cached = [];
    try { cached = readAll_('consult_slots').filter(function (s) { return s.slot_id && !isNaN(mDate_(s.starts_at)); }); } catch (e) { cached = []; }
    cachePutJson_('cslots', cached, 60);
  }
  _memo.cslots = cached;
  return cached;
}

/** Baris slot terbaru langsung dari sheet (untuk perubahan status). */
function consultSlot_(id) {
  var row = null;
  try { row = findOne_('consult_slots', 'slot_id', String(id)); } catch (e) { row = null; }
  return row;
}

function clearConsultCache_() {
  delete _memo.cslots;
  CacheService.getScriptCache().remove('cslots');
}

function slotTimes_(s) {
  var start = mDate_(s.starts_at);
  var end = mDate_(s.ends_at);
  if (isNaN(end)) end = start + CONSULT_MINUTES * 60000;
  return { start: start, end: end, openFrom: start - CONSULT_OPEN_BEFORE_MIN * 60000 };
}

function consultView_(s, now, extra) {
  var t = slotTimes_(s);
  var state = String(s.status) === 'cancelled' ? 'cancelled' : now > t.end ? 'ended' : now >= t.openFrom ? 'open' : 'upcoming';
  return Object.assign({
    slotId: s.slot_id, startsAt: new Date(t.start).toISOString(), endsAt: new Date(t.end).toISOString(),
    openFrom: new Date(t.openFrom).toISOString(), consultantName: String(s.consultant_name || 'Konsultan Siap CPNS'),
    state: state, chatOpen: state === 'open'
  }, extra || {});
}

/** getConsultSlots (auth optional): jadwal kosong yang bisa dipesan + konsultasi milik pengguna. */
function handleGetConsultSlots_(payload, user) {
  var now = Date.now();
  var slots = consultSlots_();
  var open = slots.filter(function (s) {
    return String(s.status) === 'open' && slotTimes_(s).start > now + 15 * 60000;
  }).sort(function (a, b) { return mDate_(a.starts_at) - mDate_(b.starts_at); }).slice(0, 120);
  // slot yang sedang ditahan checkout orang lain tidak ditampilkan
  var holds = {};
  try {
    adminCols_('transactions', ['kind', 'ref_id', 'status', 'expires_at', 'user_id']).forEach(function (t) {
      if (t.kind === 'consult' && t.status === 'pending' && !isExpired_(t) && (!user || t.user_id !== user.userId)) holds[String(t.ref_id)] = true;
    });
  } catch (e) { /* abaikan */ }
  var mine = [];
  if (user) {
    mine = userEntitlements_(user.userId).filter(function (e) { return e.kind === 'consult'; }).map(function (e) {
      var sl = slots.filter(function (x) { return String(x.slot_id) === String(e.ref_id); })[0];
      return sl ? consultView_(sl, now) : null;
    }).filter(Boolean).sort(function (a, b) { return a.startsAt < b.startsAt ? -1 : 1; });
  }
  return {
    serverNow: nowIso_(), loggedIn: Boolean(user), minutes: CONSULT_MINUTES,
    isConsultant: Boolean(user && (isAdmin_(user) || slots.some(function (s) { return String(s.consultant_email).toLowerCase() === String(user.email).toLowerCase(); }))),
    slots: open.filter(function (s) { return !holds[String(s.slot_id)]; }).map(function (s) {
      return Object.assign(consultView_(s, now), { price: productPrice_('consult', s.price) });
    }),
    mine: mine
  };
}

/** Peran pengguna di sebuah slot: client (pembeli), consultant, atau null. */
function consultRole_(slot, user) {
  if (!slot || !user) return null;
  if (String(slot.consultant_email).toLowerCase() === String(user.email).toLowerCase() || isAdmin_(user)) return 'consultant';
  if (owns_(user, 'consult', slot.slot_id) && String(slot.booked_by) === String(user.userId)) return 'client';
  return null;
}

function consultMessages_(slotId) {
  var key = 'cm_' + slotId;
  var cached = cacheGetJson_(key);
  if (cached) return cached;
  var list = [];
  try {
    list = findAll_('consult_messages', 'slot_id', slotId).map(function (m) {
      return { id: String(m.msg_id), sender: String(m.sender), text: String(m.text), at: toIso_(m.at) };
    });
  } catch (e) { list = []; }
  cachePutJson_(key, list, CONSULT_CACHE_SEC);
  return list;
}

/** getConsultChat (auth required): { slotId, after? } → pesan baru sejak id `after`. Dipanggil berkala (±5 detik). */
function handleGetConsultChat_(payload, user) {
  var slot = consultSlot_(payload.slotId);
  var role = consultRole_(slot, user);
  if (!role) throw new AppError_('FORBIDDEN', 'Ruang konsultasi ini bukan milikmu.');
  var msgs = consultMessages_(slot.slot_id);
  var after = String(payload.after || '');
  var idx = after ? msgs.map(function (m) { return m.id; }).indexOf(after) : -1;
  var out = idx >= 0 ? msgs.slice(idx + 1) : msgs;
  var client = role === 'consultant' && slot.booked_by ? findOne_('users', 'user_id', slot.booked_by) : null;
  return {
    serverNow: nowIso_(), role: role,
    slot: consultView_(slot, Date.now(), { clientName: client ? String(client.name || client.email) : null, booked: String(slot.status) === 'booked' }),
    messages: out, full: idx < 0
  };
}

/** sendConsultMessage (auth required): { slotId, text } */
function handleSendConsultMessage_(payload, user) {
  var slot = consultSlot_(payload.slotId);
  var role = consultRole_(slot, user);
  if (!role) throw new AppError_('FORBIDDEN', 'Ruang konsultasi ini bukan milikmu.');
  var v = consultView_(slot, Date.now());
  if (!v.chatOpen) {
    throw new AppError_(v.state === 'upcoming' ? 'NOT_OPEN' : 'CLOSED',
      v.state === 'upcoming' ? 'Ruang chat dibuka ' + CONSULT_OPEN_BEFORE_MIN + ' menit sebelum sesi (' + fmtJkt_(v.startsAt) + ').' : 'Sesi konsultasi sudah berakhir.');
  }
  var text = String(payload.text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new AppError_('BAD_REQUEST', 'Pesan kosong.');
  if (text.length > CONSULT_MSG_MAX) throw new AppError_('BAD_REQUEST', 'Pesan terlalu panjang (maksimal ' + CONSULT_MSG_MAX + ' karakter).');
  var cache = CacheService.getScriptCache();
  var rk = 'cmr_' + user.userId + '_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(rk) || 0);
  if (n >= CONSULT_MSG_PER_MIN) throw new AppError_('RATE_LIMITED', 'Terlalu banyak pesan dalam satu menit.');
  cache.put(rk, String(n + 1), 90);

  return withLock_(function () {
    var msg = { msg_id: newId_('m'), slot_id: slot.slot_id, sender: role, user_id: user.userId, text: text, at: nowIso_() };
    var cached = cacheGetJson_('cm_' + slot.slot_id);
    insert_('consult_messages', msg);
    if (cached) cachePutJson_('cm_' + slot.slot_id, cached.concat([{ id: msg.msg_id, sender: role, text: text, at: msg.at }]), CONSULT_CACHE_SEC);
    else consultMessages_(slot.slot_id);   // cache kosong: muat ulang dari sheet (sudah berisi pesan ini)
    return { id: msg.msg_id, sender: role, text: text, at: msg.at };
  });
}

/** getConsultDesk (auth required): daftar sesi untuk konsultan (email di consult_slots) atau admin. */
function handleGetConsultDesk_(payload, user) {
  var admin = isAdmin_(user);
  var me = String(user.email).toLowerCase();
  var now = Date.now();
  var mine = consultSlots_().filter(function (s) { return admin || String(s.consultant_email).toLowerCase() === me; });
  if (!mine.length && !admin) throw new AppError_('FORBIDDEN', 'Halaman ini khusus konsultan.');
  var from = now - 3 * 86400000, to = now + 14 * 86400000;
  var list = mine.filter(function (s) { var t = mDate_(s.starts_at); return t >= from && t <= to; })
    .sort(function (a, b) { return mDate_(a.starts_at) - mDate_(b.starts_at); })
    .map(function (s) {
      var u = s.booked_by ? findOne_('users', 'user_id', s.booked_by) : null;
      return consultView_(s, now, {
        status: String(s.status), consultantEmail: String(s.consultant_email || ''),
        clientName: u ? String(u.name || '') : '', clientEmail: u ? String(u.email || '') : ''
      });
    });
  return { serverNow: nowIso_(), admin: admin, slots: list };
}

/* ================= Fungsi admin (jalankan dari editor) ================= */

/**
 * Buat slot konsultasi untuk DAYS hari ke depan pada jam-jam HOURS (WIB). Slot yang sudah ada dilewati.
 * Isi nama & email konsultan di bawah (email harus akun Google yang dipakai untuk masuk ke aplikasi).
 */
function seedConsultSlots() {
  var DAYS = 14;
  var HOURS = ['09:00', '13:00', '19:00'];
  var CONSULTANT_NAME = 'Konsultan Siap CPNS';
  var CONSULTANT_EMAIL = getConfigOptional_('ADMIN_EMAIL', '') || adminEmails_()[0] || '';
  if (!CONSULTANT_EMAIL) return Logger.log('Isi CONSULTANT_EMAIL di fungsi ini atau Script Property ADMIN_EMAIL dulu.');
  var have = {};
  consultSlots_().forEach(function (s) { have[String(s.slot_id)] = true; });
  var made = 0;
  for (var k = 1; k <= DAYS; k++) {
    var d = jktDay_(k).date;
    HOURS.forEach(function (h) {
      var id = 'KSL-' + d.replace(/-/g, '') + '-' + h.replace(':', '');
      if (have[id]) return;
      insert_('consult_slots', {
        slot_id: id, starts_at: d + 'T' + h + ':00+07:00', ends_at: '', consultant_name: CONSULTANT_NAME, consultant_email: CONSULTANT_EMAIL,
        price: PRODUCT_DEFAULT_PRICE.consult, status: 'open', booked_by: '', trx_id: '', note: '', created_at: nowIso_()
      });
      made++;
    });
  }
  clearConsultCache_();
  Logger.log(made + ' slot konsultasi dibuat (' + DAYS + ' hari × ' + HOURS.join(', ') + ' WIB) untuk ' + CONSULTANT_EMAIL + '.');
}

/** Jalankan setelah mengubah sheet consult_slots secara manual agar langsung terbaca. */
function refreshConsultCache() {
  clearConsultCache_();
  Logger.log('Slot konsultasi terbaca: ' + consultSlots_().length);
}
