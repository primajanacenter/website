/**
 * Auth.gs — verifikasi login (Fase 2).
 *
 * Rencana implementasi:
 *  1. Frontend mengirim Google ID token (dari Sign in with Google).
 *  2. Verifikasi token: cek tanda tangan via endpoint tokeninfo Google
 *     (https://oauth2.googleapis.com/tokeninfo?id_token=...), lalu pastikan
 *     aud == GOOGLE_CLIENT_ID, iss dari Google, exp belum lewat, email_verified true.
 *  3. Simpan hasil verifikasi di CacheService beberapa menit agar tidak memanggil Google terus.
 *  4. Kembalikan { userId, email, name } — email HANYA dari token, bukan dari payload.
 */

function verifyUser_(token) {
  if (!token) throw new AppError_('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
  // TODO (Fase 2): implementasi verifikasi token.
  throw new AppError_('NOT_IMPLEMENTED', 'Login belum tersedia.');
}
