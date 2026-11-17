/**
 * Affiliate.gs: program affiliate berkomisi uang (Fase 15).
 *
 * Alur:
 *  1. Pengguna mengajukan diri (applyAffiliate) dengan data rekening/e-wallet. Status "pending".
 *  2. Admin menyetujui di Super User Dashboard (adminAffiliateAction). Status "approved".
 *  3. Link affiliate = link ajak teman yang sama (?ref=KODE). Pembeli baru yang masuk lewat link itu:
 *       - tetap mendapat diskon Ajak Teman untuk Premium pertamanya (Referral.gs);
 *       - SEMUA pembelian lunasnya selama AFF_WINDOW_DAYS sejak bergabung memberi komisi AFF_RATE_PCT %
 *         (maksimal AFF_MAX_RATE_PCT % per produk, termasuk tarif khusus per affiliate)
 *         dari nominal yang benar-benar dibayar (Premium, SKB, tryout, Akbar, mentoring, rekaman, konsultasi).
 *     Affiliate yang disetujui menerima komisi uang sebagai pengganti bonus +7 hari Premium.
 *  4. Komisi tertahan AFF_HOLD_DAYS hari (masa cek pembatalan), lalu bisa dicairkan.
 *  5. Pencairan (requestPayout) minimal AFF_MIN_PAYOUT dari saldo tersedia; potongan transfer AFF_PAYOUT_FEE
 *     per pencairan. Admin mentransfer manual (bank, e-wallet, atau saldo Mayar) lalu menandai "Sudah ditransfer".
 *
 * Script Properties opsional (angka): AFF_RATE_PCT (5), AFF_MAX_RATE_PCT (5), AFF_MIN_PAYOUT (100000), AFF_PAYOUT_FEE (3000),
 * AFF_HOLD_DAYS (7), AFF_WINDOW_DAYS (90).
 *
 * Data rekening hanya terlihat oleh pemiliknya dan admin. Tidak pernah dikirim ke Google Analytics.
 */

function affCfg_() {
  var n = function (k, d) {
    var raw = getConfigOptional_(k, '');
    if (raw === '' || raw === null || raw === undefined) return d;
    var v = Number(raw);
    return isNaN(v) || v < 0 ? d : v;
  };
  return {
    maxRatePct: Math.min(90, n('AFF_MAX_RATE_PCT', 5)),
    ratePct: Math.min(n('AFF_RATE_PCT', 5), Math.min(90, n('AFF_MAX_RATE_PCT', 5))),
    minPayout: n('AFF_MIN_PAYOUT', 100000),
    fee: n('AFF_PAYOUT_FEE', 3000),
    holdDays: n('AFF_HOLD_DAYS', 7),
    windowDays: n('AFF_WINDOW_DAYS', 90)
  };
}

var AFF_PROVIDERS = {
  bank: ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'BTN', 'Bank Jago', 'SeaBank', 'Bank lain'],
  ewallet: ['DANA', 'OVO', 'GoPay', 'ShopeePay', 'LinkAja']
};

function affiliateRow_(userId) { return findOne_('affiliates', 'user_id', userId); }

function isApprovedAffiliate_(userId) {
  var a = affiliateRow_(userId);
  return Boolean(a && a.status === 'approved');
}

function affRate_(aff) {
  var cfg = affCfg_();
  var r = Number(aff && aff.rate_pct);
  return Math.min(r > 0 ? r : cfg.ratePct, cfg.maxRatePct);   // tidak pernah melebihi batas maksimal
}

function maskAccount_(no) {
  var s = String(no || '');
  return s.length <= 4 ? s : new Array(s.length - 3).join('•') + s.slice(-4);
}

/** Validasi data pembayaran dari formulir. */
function affPaymentFields_(p) {
  var method = p.method === 'ewallet' ? 'ewallet' : 'bank';
  var provider = cleanText_(p.provider, 40);
  if (!provider) throw new AppError_('BAD_REQUEST', method === 'bank' ? 'Pilih nama bank.' : 'Pilih e-wallet.');
  var accountNo = String(p.accountNo || '').replace(/[^0-9]/g, '');
  if (accountNo.length < 6 || accountNo.length > 20) throw new AppError_('BAD_REQUEST', method === 'bank' ? 'Nomor rekening tidak valid.' : 'Nomor e-wallet tidak valid.');
  var accountName = cleanText_(p.accountName, 80);
  if (accountName.length < 3) throw new AppError_('BAD_REQUEST', 'Isi nama pemilik rekening sesuai buku tabungan/aplikasi.');
  var phone = String(p.phone || '').replace(/[^0-9+]/g, '');
  if (phone.replace(/\D/g, '').length < 9) throw new AppError_('BAD_REQUEST', 'Isi nomor WhatsApp aktif.');
  return { method: method, provider: provider, account_no: "'" + accountNo, account_name: accountName, phone: "'" + phone };
}

function cleanNo_(v) { return String(v || '').replace(/^'/, ''); }

/* ------------------------------------------------------------------ */
/* Komisi: dipanggil di dalam lock fulfillTransaction_                 */
/* ------------------------------------------------------------------ */

/**
 * Catat komisi untuk transaksi lunas bila pembeli bergabung lewat link affiliate yang disetujui
 * dan pembelian terjadi dalam AFF_WINDOW_DAYS sejak bergabung. Idempoten per trx_id.
 */
function creditAffiliateLocked_(trx) {
  if (!trx || trx.status !== 'paid') return null;
  var amount = Number(trx.amount) || 0;
  if (amount <= 0) return null;
  var ref = findOne_('referrals', 'referee_id', trx.user_id);
  if (!ref || !ref.referrer_id || ref.referrer_id === trx.user_id) return null;
  var aff = affiliateRow_(ref.referrer_id);
  if (!aff || aff.status !== 'approved') return null;
  var cfg = affCfg_();
  var joined = new Date(ref.created_at).getTime();
  var paidAt = new Date(trx.paid_at || Date.now()).getTime();
  if (!(joined > 0) || paidAt - joined > cfg.windowDays * 86400000) return null;
  if (findOne_('commissions', 'trx_id', trx.trx_id)) return null;
  var rate = affRate_(aff);
  var row = {
    commission_id: newId_('com'), affiliate_id: aff.user_id, referee_id: trx.user_id, trx_id: trx.trx_id,
    kind: isPremiumTrx_(trx) ? 'premium' : String(trx.kind), product: String(trx.plan_name || ''),
    amount: amount, rate_pct: rate, commission: Math.floor(amount * rate / 100),
    status: 'earned', created_at: nowIso_(), available_at: new Date(Date.now() + cfg.holdDays * 86400000).toISOString(),
    payout_id: '', note: ''
  };
  insert_('commissions', row);
  return row;
}

/** Status tampilan sebuah komisi: holding | available | requested | paid | void */
function commissionState_(c, now) {
  if (c.status === 'void') return 'void';
  if (c.status === 'paid') return 'paid';
  if (c.payout_id) return 'requested';
  return new Date(c.available_at).getTime() <= (now || Date.now()) ? 'available' : 'holding';
}

function affSummary_(coms, now) {
  var s = { count: 0, sales: 0, total: 0, holding: 0, available: 0, requested: 0, paid: 0, voided: 0 };
  coms.forEach(function (c) {
    var st = commissionState_(c, now), v = Number(c.commission) || 0;
    if (st === 'void') { s.voided += v; return; }
    s.count++; s.sales += Number(c.amount) || 0; s.total += v; s[st] += v;
  });
  return s;
}

/* ------------------------------------------------------------------ */
/* Endpoint pengguna                                                   */
/* ------------------------------------------------------------------ */

function publicCommission_(c, now) {
  return {
    id: c.commission_id, at: toIso_(c.created_at), kind: c.kind, product: c.product,
    amount: Number(c.amount) || 0, ratePct: Number(c.rate_pct) || 0, commission: Number(c.commission) || 0,
    state: commissionState_(c, now), availableAt: toIso_(c.available_at)
  };
}

function publicPayout_(p, admin) {
  var o = {
    id: p.payout_id, status: p.status, gross: Number(p.gross) || 0, fee: Number(p.fee) || 0, net: Number(p.net) || 0,
    requestedAt: toIso_(p.requested_at), processedAt: toIso_(p.processed_at),
    method: p.method, provider: p.provider, accountMasked: maskAccount_(cleanNo_(p.account_no)), accountName: p.account_name,
    paidVia: p.paid_via || '', refNo: p.ref_no || '', note: p.admin_note || ''
  };
  if (admin) { o.accountNo = cleanNo_(p.account_no); o.userId = p.affiliate_id; o.email = p.email; o.name = p.name; o.phone = cleanNo_(p.phone); o.count = Number(p.count) || 0; }
  return o;
}

/** getAffiliate (auth required): status, link, saldo, riwayat. */
function handleGetAffiliate_(payload, user) {
  var cfg = affCfg_();
  var code = ensureRefCode_(user);
  var aff = affiliateRow_(user.userId);
  var out = {
    program: { ratePct: cfg.ratePct, maxRatePct: cfg.maxRatePct, minPayout: cfg.minPayout, fee: cfg.fee, holdDays: cfg.holdDays, windowDays: cfg.windowDays, providers: AFF_PROVIDERS },
    code: code, status: aff ? String(aff.status) : 'none'
  };
  if (!aff) return out;
  out.ratePct = affRate_(aff);
  out.adminNote = aff.status === 'rejected' || aff.status === 'suspended' ? String(aff.admin_note || '') : '';
  out.appliedAt = toIso_(aff.applied_at);
  out.payment = {
    method: aff.method, provider: aff.provider, accountMasked: maskAccount_(cleanNo_(aff.account_no)),
    accountName: aff.account_name, phone: cleanNo_(aff.phone), channel: aff.channel
  };
  var now = Date.now();
  var coms = findAll_('commissions', 'affiliate_id', user.userId);
  var refs = findAll_('referrals', 'referrer_id', user.userId);
  var buyers = {};
  coms.forEach(function (c) { if (c.status !== 'void') buyers[c.referee_id] = 1; });
  var s = affSummary_(coms, now);
  s.referred = refs.length;
  s.buyers = Object.keys(buyers).length;
  out.stats = s;
  out.commissions = coms.slice(-30).reverse().map(function (c) { return publicCommission_(c, now); });
  var payouts = findAll_('payouts', 'affiliate_id', user.userId);
  out.payouts = payouts.slice(-12).reverse().map(function (p) { return publicPayout_(p, false); });
  var open = payouts.some(function (p) { return p.status === 'requested'; });
  out.canRequest = aff.status === 'approved' && !open && s.available >= cfg.minPayout;
  out.openRequest = open;
  return out;
}

/** applyAffiliate (auth required): ajukan diri / ajukan ulang setelah ditolak. */
function handleApplyAffiliate_(payload, user) {
  if (!payload.agree) throw new AppError_('BAD_REQUEST', 'Setujui ketentuan program affiliate terlebih dahulu.');
  var pay = affPaymentFields_(payload);
  var channel = cleanText_(payload.channel, 300);
  if (channel.length < 5) throw new AppError_('BAD_REQUEST', 'Ceritakan singkat di mana kamu akan mempromosikan (mis. akun IG, grup WA, channel YouTube).');
  var name = cleanText_(payload.name || user.name, 80);
  var res = withLock_(function () {
    var cur = affiliateRow_(user.userId);
    if (cur && (cur.status === 'approved' || cur.status === 'pending')) throw new AppError_('ALREADY_DONE', cur.status === 'approved' ? 'Kamu sudah terdaftar sebagai affiliate.' : 'Pengajuanmu sedang ditinjau admin.');
    if (cur && cur.status === 'suspended') throw new AppError_('FORBIDDEN', 'Akun affiliate-mu dinonaktifkan. Hubungi admin.');
    var patch = Object.assign({ name: name, email: user.email, channel: channel, status: 'pending', applied_at: nowIso_(), admin_note: '' }, pay);
    if (cur) { update_('affiliates', cur._row, patch); return 'reapplied'; }
    insert_('affiliates', Object.assign({ user_id: user.userId, rate_pct: '', approved_at: '' }, patch));
    return 'applied';
  });
  ensureRefCode_(user);
  affNotifyAdmin_('Pengajuan affiliate baru', name + ' (' + user.email + ') mengajukan diri sebagai affiliate.\nPromosi: ' + channel);
  return { status: 'pending', result: res };
}

/** updateAffiliatePayment (auth required): ganti data rekening (pengajuan yang sedang berjalan tidak berubah). */
function handleUpdateAffiliatePayment_(payload, user) {
  var pay = affPaymentFields_(payload);
  return withLock_(function () {
    var cur = affiliateRow_(user.userId);
    if (!cur) throw new AppError_('NOT_FOUND', 'Kamu belum terdaftar sebagai affiliate.');
    update_('affiliates', cur._row, pay);
    return { updated: true };
  });
}

/** requestPayout (auth required): cairkan SELURUH saldo tersedia (min AFF_MIN_PAYOUT). */
function handleRequestPayout_(payload, user) {
  var cfg = affCfg_();
  var out = withLock_(function () {
    var aff = affiliateRow_(user.userId);
    if (!aff || aff.status !== 'approved') throw new AppError_('FORBIDDEN', 'Pencairan hanya untuk affiliate yang aktif.');
    var payouts = findAll_('payouts', 'affiliate_id', user.userId);
    if (payouts.some(function (p) { return p.status === 'requested'; })) throw new AppError_('ALREADY_DONE', 'Masih ada pencairan yang sedang diproses.');
    var now = Date.now();
    var avail = findAll_('commissions', 'affiliate_id', user.userId).filter(function (c) { return commissionState_(c, now) === 'available'; });
    var gross = avail.reduce(function (s, c) { return s + (Number(c.commission) || 0); }, 0);
    if (gross < cfg.minPayout) throw new AppError_('BAD_REQUEST', 'Saldo tersedia minimal ' + rupiah_(cfg.minPayout) + ' untuk dicairkan.');
    var id = newId_('po');
    var row = {
      payout_id: id, affiliate_id: user.userId, email: user.email, name: aff.name, phone: aff.phone,
      gross: gross, fee: cfg.fee, net: gross - cfg.fee, count: avail.length, status: 'requested', requested_at: nowIso_(),
      method: aff.method, provider: aff.provider, account_no: aff.account_no, account_name: aff.account_name,
      processed_at: '', processed_by: '', paid_via: '', ref_no: '', admin_note: ''
    };
    insert_('payouts', row);
    avail.forEach(function (c) { update_('commissions', c._row, { payout_id: id }); });
    return publicPayout_(row, false);
  });
  affNotifyAdmin_('Permintaan pencairan komisi', out.accountName + ' meminta pencairan ' + rupiah_(out.gross) + ' (diterima ' + rupiah_(out.net) + ') ke ' + out.provider + ' ' + out.accountMasked + '.');
  return out;
}

/* ------------------------------------------------------------------ */
/* Endpoint admin                                                      */
/* ------------------------------------------------------------------ */

/** adminAffiliates (admin): semua affiliate + ringkasan + antrean pencairan. */
function handleAdminAffiliates_(payload, user) {
  requireAdmin_(user);
  var cfg = affCfg_(), now = Date.now();
  var affs = readAll_('affiliates');
  var coms = readAll_('commissions');
  var pays = readAll_('payouts');
  var refs = adminCols_('referrals', ['referrer_id']);
  var refCount = {};
  refs.forEach(function (r) { refCount[r.referrer_id] = (refCount[r.referrer_id] || 0) + 1; });
  var byAff = {};
  coms.forEach(function (c) { (byAff[c.affiliate_id] = byAff[c.affiliate_id] || []).push(c); });
  var users = {};
  affs.forEach(function (a) { var u = findOne_('users', 'user_id', a.user_id); if (u) users[a.user_id] = u; });
  var list = affs.map(function (a) {
    var s = affSummary_(byAff[a.user_id] || [], now);
    var u = users[a.user_id] || {};
    return {
      userId: a.user_id, name: a.name, email: a.email || u.email || '', phone: cleanNo_(a.phone), status: a.status,
      code: String(u.ref_code || ''), ratePct: affRate_(a), customRate: Number(a.rate_pct) > 0, channel: a.channel,
      method: a.method, provider: a.provider, accountNo: cleanNo_(a.account_no), accountName: a.account_name,
      appliedAt: toIso_(a.applied_at), approvedAt: toIso_(a.approved_at), adminNote: a.admin_note || '',
      referred: refCount[a.user_id] || 0, stats: s
    };
  });
  var order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
  list.sort(function (x, y) { return (order[x.status] - order[y.status]) || (y.stats.total - x.stats.total); });
  var monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  var totals = affSummary_(coms, now);
  totals.affiliates = list.filter(function (a) { return a.status === 'approved'; }).length;
  totals.pending = list.filter(function (a) { return a.status === 'pending'; }).length;
  totals.paidThisMonth = pays.filter(function (p) { return p.status === 'paid' && new Date(p.processed_at).getTime() >= monthStart.getTime(); })
    .reduce(function (s, p) { return s + (Number(p.net) || 0); }, 0);
  totals.feesCollected = pays.filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + (Number(p.fee) || 0); }, 0);
  return {
    program: cfg, totals: totals, affiliates: list,
    payouts: pays.slice().reverse().slice(0, 100).map(function (p) { return publicPayout_(p, true); }),
    commissions: coms.slice().reverse().slice(0, 100).map(function (c) {
      var o = publicCommission_(c, now); o.affiliateId = c.affiliate_id; o.trxId = c.trx_id; o.note = c.note || '';
      var a = affs.filter(function (x) { return x.user_id === c.affiliate_id; })[0]; o.affiliateName = a ? a.name : '';
      return o;
    })
  };
}

/** adminAffiliateAction (admin): { userId, action: approve|reject|suspend|reactivate|rate, ratePct?, note? } */
function handleAdminAffiliateAction_(payload, user) {
  requireAdmin_(user);
  var action = String(payload.action || '');
  var note = cleanText_(payload.note, 300);
  return withLock_(function () {
    var a = affiliateRow_(String(payload.userId || ''));
    if (!a) throw new AppError_('NOT_FOUND', 'Affiliate tidak ditemukan.');
    var patch = {};
    if (action === 'approve') {
      if (a.status !== 'pending' && a.status !== 'rejected') throw new AppError_('BAD_REQUEST', 'Hanya pengajuan yang bisa disetujui.');
      patch = { status: 'approved', approved_at: nowIso_(), admin_note: note };
    } else if (action === 'reject') {
      if (a.status !== 'pending') throw new AppError_('BAD_REQUEST', 'Hanya pengajuan yang menunggu yang bisa ditolak.');
      patch = { status: 'rejected', admin_note: note || 'Pengajuan belum bisa disetujui.' };
    } else if (action === 'suspend') {
      if (a.status !== 'approved') throw new AppError_('BAD_REQUEST', 'Hanya affiliate aktif yang bisa dinonaktifkan.');
      patch = { status: 'suspended', admin_note: note };
    } else if (action === 'reactivate') {
      if (a.status !== 'suspended') throw new AppError_('BAD_REQUEST', 'Affiliate ini tidak sedang dinonaktifkan.');
      patch = { status: 'approved', admin_note: note };
    } else if (action === 'rate') {
      var r = payload.ratePct === '' || payload.ratePct === null || payload.ratePct === undefined ? '' : Number(payload.ratePct);
      var max = affCfg_().maxRatePct;
      if (r !== '' && !(r > 0 && r <= max)) throw new AppError_('BAD_REQUEST', 'Komisi harus lebih dari 0 dan maksimal ' + max + ' persen (kosongkan untuk tarif standar).');
      patch = { rate_pct: r };
    } else {
      throw new AppError_('BAD_REQUEST', 'Aksi tidak dikenal.');
    }
    var row = update_('affiliates', a._row, patch);
    return { userId: row.user_id, status: row.status, ratePct: affRate_(row) };
  });
}

/** adminPayoutAction (admin): { payoutId, action: paid|reject, paidVia?, refNo?, note? } */
function handleAdminPayoutAction_(payload, user) {
  requireAdmin_(user);
  var action = String(payload.action || '');
  return withLock_(function () {
    var p = findOne_('payouts', 'payout_id', String(payload.payoutId || ''));
    if (!p) throw new AppError_('NOT_FOUND', 'Pencairan tidak ditemukan.');
    if (p.status !== 'requested') throw new AppError_('ALREADY_DONE', 'Pencairan ini sudah diproses.');
    var coms = findAll_('commissions', 'payout_id', p.payout_id);
    if (action === 'paid') {
      var via = ['bank', 'ewallet', 'mayar'].indexOf(payload.paidVia) >= 0 ? payload.paidVia : 'bank';
      var row = update_('payouts', p._row, { status: 'paid', processed_at: nowIso_(), processed_by: user.email, paid_via: via, ref_no: cleanText_(payload.refNo, 80), admin_note: cleanText_(payload.note, 300) });
      coms.forEach(function (c) { update_('commissions', c._row, { status: 'paid' }); });
      return publicPayout_(row, true);
    }
    if (action === 'reject') {
      var note = cleanText_(payload.note, 300);
      if (!note) throw new AppError_('BAD_REQUEST', 'Tulis alasan penolakan (mis. nama rekening tidak sesuai).');
      var row2 = update_('payouts', p._row, { status: 'rejected', processed_at: nowIso_(), processed_by: user.email, admin_note: note });
      coms.forEach(function (c) { update_('commissions', c._row, { payout_id: '' }); });   // saldo kembali tersedia
      return publicPayout_(row2, true);
    }
    throw new AppError_('BAD_REQUEST', 'Aksi tidak dikenal.');
  });
}

/** adminCommissionVoid (admin): { commissionId, note } batalkan komisi (mis. transaksi di-refund). */
function handleAdminCommissionVoid_(payload, user) {
  requireAdmin_(user);
  var note = cleanText_(payload.note, 300);
  if (!note) throw new AppError_('BAD_REQUEST', 'Tulis alasan pembatalan komisi.');
  return withLock_(function () {
    var c = findOne_('commissions', 'commission_id', String(payload.commissionId || ''));
    if (!c) throw new AppError_('NOT_FOUND', 'Komisi tidak ditemukan.');
    if (c.status === 'paid' || c.status === 'void') throw new AppError_('BAD_REQUEST', 'Komisi yang sudah dibayar atau dibatalkan tidak bisa diubah.');
    if (c.payout_id) throw new AppError_('BAD_REQUEST', 'Komisi ini sedang dalam pengajuan pencairan. Tolak pencairannya dulu.');
    update_('commissions', c._row, { status: 'void', note: note });
    return { id: c.commission_id, state: 'void' };
  });
}

/** Email singkat ke admin (gagal kirim tidak membatalkan proses). */
function affNotifyAdmin_(subject, text) {
  try {
    var to = adminEmails_();
    if (!to.length || typeof MailApp === 'undefined') return;
    if (MailApp.getRemainingDailyQuota() < 5) return;
    MailApp.sendEmail({ to: to.join(','), subject: '[Siap CPNS] ' + subject, body: text + '\n\nBuka Super User Dashboard › tab Affiliate untuk memproses.', name: 'Siap CPNS' });
  } catch (e) { console.warn('Email admin affiliate gagal: ' + (e && e.message)); }
}
