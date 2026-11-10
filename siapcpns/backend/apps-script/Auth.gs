/**
 * Auth.gs — verifikasi login Google (Fase 2).
 *
 * Frontend mengirim Google ID token (JWT dari "Sign in with Google").
 * Server memverifikasinya ke endpoint tokeninfo Google lalu memastikan:
 *   - aud  == GOOGLE_CLIENT_ID (token memang dibuat untuk aplikasi ini)
 *   - iss  == accounts.google.com
 *   - exp  belum lewat
 *   - email_verified == true
 * Hasil verifikasi di-cache beberapa menit agar tidak memanggil Google di setiap permintaan.
 *
 * PENTING: identitas pengguna HANYA diambil dari token yang sudah diverifikasi,
 * tidak pernah dari payload yang dikirim frontend.
 */

var TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

/**
 * @returns {{userId:string,email:string,name:string,picture:string,plan:string,premiumUntil:string,_row:number,isNew:boolean}}
 */
function verifyUser_(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
    throw new AppError_('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
  }
  var claims = verifyGoogleToken_(token);
  return findOrCreateUser_(claims);
}

function verifyGoogleToken_(token) {
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)
  ).slice(0, 40);

  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  var res = UrlFetchApp.fetch(TOKENINFO_URL + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new AppError_('UNAUTHENTICATED', 'Sesi login tidak valid atau sudah berakhir. Silakan masuk lagi.');
  }
  var c = JSON.parse(res.getContentText());

  var now = Math.floor(Date.now() / 1000);
  var validIss = c.iss === 'accounts.google.com' || c.iss === 'https://accounts.google.com';
  if (c.aud !== getConfig_('GOOGLE_CLIENT_ID') || !validIss) {
    throw new AppError_('UNAUTHENTICATED', 'Token login bukan untuk aplikasi ini.');
  }
  if (!c.exp || Number(c.exp) < now) {
    throw new AppError_('UNAUTHENTICATED', 'Sesi login sudah berakhir. Silakan masuk lagi.');
  }
  if (String(c.email_verified) !== 'true') {
    throw new AppError_('UNAUTHENTICATED', 'Email akun Google belum terverifikasi.');
  }

  var claims = { sub: c.sub, email: String(c.email).toLowerCase(), name: c.name || '', picture: c.picture || '' };
  // Fase 10.2: cache sampai token kedaluwarsa (token Google berlaku ± 1 jam) → tokeninfo cukup dipanggil
  // sekali per sesi login, bukan setiap 10 menit. Tetap tidak melewati masa berlaku token.
  var ttl = Math.min(3600, Number(c.exp) - now - 30);
  if (ttl > 30) cache.put(key, JSON.stringify(claims), ttl);
  return claims;
}

var USER_CACHE_SEC = 300; // baris users di-cache 5 menit; dihapus otomatis setiap kali baris itu diubah (update_)

function userCacheKey_(email) {
  return 'usr_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email).toLowerCase())).slice(0, 32);
}

function findOrCreateUser_(claims) {
  var cache = CacheService.getScriptCache();
  var ck = userCacheKey_(claims.email);
  var hit = cache.get(ck);
  if (hit) {
    try { return toUser_(JSON.parse(hit), false); } catch (e) { /* lanjut baca sheet */ }
  }
  var existing = findOne_('users', 'email', claims.email);
  if (existing) {
    cache.put(ck, JSON.stringify(existing), USER_CACHE_SEC);
    return toUser_(existing, false);
  }
  return withLock_(function () {
    // Cek ulang di dalam lock (bisa saja dibuat oleh permintaan lain sesaat sebelumnya)
    var again = findOne_('users', 'email', claims.email);
    if (again) return toUser_(again, false);
    var now = nowIso_();
    var row = {
      user_id: newId_('u'),
      email: claims.email,
      name: cleanText_(claims.name, 120),
      picture: cleanText_(claims.picture, 500),
      plan: 'free',
      created_at: now,
      last_login_at: now
    };
    insert_('users', row);
    var created = findOne_('users', 'email', claims.email);
    return toUser_(created, true);
  });
}

function toUser_(row, isNew) {
  return {
    _row: row._row,
    isNew: Boolean(isNew),
    userId: row.user_id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    plan: isPremiumActive_(row) ? 'premium' : 'free',
    premiumUntil: row.premium_until ? toIsoDate_(row.premium_until) : ''
  };
}

function isPremiumActive_(row) {
  if (row.plan !== 'premium' || !row.premium_until) return false;
  return new Date(row.premium_until).getTime() > Date.now();
}

function toIsoDate_(v) {
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
}

/** Data user yang aman dikirim ke frontend. */
function publicUser_(user) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    picture: user.picture,
    plan: user.plan,
    premiumUntil: user.premiumUntil
  };
}
