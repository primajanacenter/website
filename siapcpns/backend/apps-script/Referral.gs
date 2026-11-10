/**
 * Referral.gs — Fase 8: ajak teman.
 *
 * - Setiap pengguna punya kode ajakan (kolom users.ref_code, dibuat saat pertama dibutuhkan).
 * - Teman yang memakai kode (lewat tautan ?ref=KODE saat login, atau mengisi manual) dan BELUM
 *   pernah membeli Premium mendapat diskon REF_DISCOUNT_PCT % untuk pembelian pertamanya.
 * - Saat pembelian pertama teman lunas (fulfillTransaction_), pengajak mendapat +REF_BONUS_DAYS
 *   hari Premium. Maksimal REF_MAX_REWARDS_30D bonus per 30 hari per pengajak (pengaman penyalahgunaan).
 * - Tidak ada komisi uang.
 */

var REF_BONUS_DAYS = 7;
var REF_DISCOUNT_PCT = 10;
var REF_MAX_REWARDS_30D = 20;
var REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar tidak tertukar

function normalizeRefCode_(code) {
  var c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{6,12}$/.test(c) ? c : '';
}

/** Pastikan user punya kode ajakan. Mengembalikan kode. */
function ensureRefCode_(user) {
  var row = findOne_('users', 'user_id', user.userId);
  if (row && row.ref_code) return String(row.ref_code);
  return withLock_(function () {
    var again = findOne_('users', 'user_id', user.userId);
    if (again.ref_code) return String(again.ref_code);
    var code;
    for (var i = 0; i < 20; i++) {
      var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + user.userId);
      code = 'SC';
      for (var j = 0; j < 6; j++) code += REF_ALPHABET.charAt(((bytes[j] % 256) + 256) % 256 % REF_ALPHABET.length);
      if (!findOne_('users', 'ref_code', code)) break;
    }
    update_('users', again._row, { ref_code: code });
    return code;
  });
}

function hasPaidTransaction_(userId) {
  return findAll_('transactions', 'user_id', userId).some(function (t) { return t.status === 'paid'; });
}

/** Referral milik pengguna sebagai teman yang diajak (null bila tidak ada). */
function myReferral_(userId) {
  return findOne_('referrals', 'referee_id', userId);
}

/** Diskon referral (%) yang berlaku untuk checkout pengguna ini, 0 bila tidak ada. */
function referralDiscountFor_(user) {
  var ref = myReferral_(user.userId);
  if (!ref || ref.status !== 'joined') return 0;
  if (hasPaidTransaction_(user.userId)) return 0;
  return REF_DISCOUNT_PCT;
}

function discountedPrice_(price, pct) {
  if (!pct) return price;
  return Math.max(1000, Math.round(price * (100 - pct) / 100 / 100) * 100);
}

/** getReferral (auth required): kode, tautan, statistik ajakan, status diskon sendiri. */
function handleGetReferral_(payload, user) {
  var code = ensureRefCode_(user);
  var invited = findAll_('referrals', 'referrer_id', user.userId);
  var rewarded = invited.filter(function (r) { return r.status === 'rewarded'; });
  var mine = myReferral_(user.userId);
  return {
    code: code,
    bonusDays: REF_BONUS_DAYS, discountPct: REF_DISCOUNT_PCT,
    invited: invited.length,
    purchased: invited.filter(function (r) { return r.status === 'rewarded' || r.status === 'capped'; }).length,
    rewarded: rewarded.length,
    bonusDaysEarned: rewarded.reduce(function (s, r) { return s + (Number(r.bonus_days) || 0); }, 0),
    recent: invited.slice(-10).reverse().map(function (r) {
      return { status: r.status, joinedAt: toIso_(r.created_at), rewardedAt: toIso_(r.rewarded_at) };
    }),
    myReferral: mine ? { code: String(mine.code), status: mine.status, discountActive: referralDiscountFor_(user) > 0 } : null,
    canClaim: !mine && !hasPaidTransaction_(user.userId)
  };
}

/** claimReferral (auth required): { code } — pakai kode ajakan teman. */
function handleClaimReferral_(payload, user) {
  var res = claimReferral_(user, payload && payload.code);
  return { claimed: true, code: res.code, discountPct: REF_DISCOUNT_PCT };
}

function claimReferral_(user, rawCode) {
  var code = normalizeRefCode_(rawCode);
  if (!code) throw new AppError_('BAD_REQUEST', 'Kode ajakan tidak valid.');
  var owner = findOne_('users', 'ref_code', code);
  if (!owner) throw new AppError_('NOT_FOUND', 'Kode ajakan tidak ditemukan.');
  if (owner.user_id === user.userId) throw new AppError_('BAD_REQUEST', 'Kode ajakan milikmu sendiri tidak bisa dipakai.');
  return withLock_(function () {
    if (myReferral_(user.userId)) throw new AppError_('ALREADY_DONE', 'Kamu sudah memakai kode ajakan sebelumnya.');
    if (hasPaidTransaction_(user.userId)) throw new AppError_('BAD_REQUEST', 'Kode ajakan hanya untuk pengguna yang belum pernah membeli Premium.');
    var row = { referee_id: user.userId, referrer_id: owner.user_id, code: code, status: 'joined', created_at: nowIso_() };
    insert_('referrals', row);
    return row;
  });
}

/**
 * Dipanggil DI DALAM lock fulfillTransaction_ setelah premium pembeli aktif.
 * Memberi bonus kepada pengajak sekali saja (status joined → rewarded/capped).
 */
function rewardReferralLocked_(trx) {
  var ref = findOne_('referrals', 'referee_id', trx.user_id);
  if (!ref || ref.status !== 'joined') return null;
  // hanya pembelian pertama yang lunas
  var paidBefore = findAll_('transactions', 'user_id', trx.user_id).filter(function (t) { return t.status === 'paid' && t.trx_id !== trx.trx_id; });
  if (paidBefore.length) { update_('referrals', ref._row, { status: 'void', trx_id: trx.trx_id }); return null; }
  var since = Date.now() - 30 * 86400000;
  var recent = findAll_('referrals', 'referrer_id', ref.referrer_id).filter(function (r) {
    return r.status === 'rewarded' && new Date(r.rewarded_at).getTime() > since;
  }).length;
  if (recent >= REF_MAX_REWARDS_30D) {
    update_('referrals', ref._row, { status: 'capped', trx_id: trx.trx_id, rewarded_at: nowIso_(), bonus_days: 0 });
    return null;
  }
  var owner = findOne_('users', 'user_id', ref.referrer_id);
  if (!owner) return null;
  var now = Date.now();
  var cur = owner.premium_until ? new Date(owner.premium_until).getTime() : 0;
  var base = isPremiumActive_(owner) && cur > now ? cur : now;
  var until = new Date(base + REF_BONUS_DAYS * 86400000).toISOString();
  update_('users', owner._row, { plan: 'premium', premium_until: until });
  update_('referrals', ref._row, { status: 'rewarded', trx_id: trx.trx_id, bonus_days: REF_BONUS_DAYS, rewarded_at: nowIso_() });
  return { referrerId: owner.user_id, until: until };
}
