/**
 * Webhook.gs — menerima webhook Mayar (Fase 5).
 *
 * URL yang didaftarkan di Mayar:  <URL Web App>?hook=mayar&token=<WEBHOOK_TOKEN>
 * (Apps Script tidak bisa membaca header, jadi token rahasia ditaruh di query string.)
 *
 * Langkah wajib:
 *  1. Cocokkan token dengan WEBHOOK_TOKEN. Tidak cocok → abaikan.
 *  2. Catat isi mentah ke sheet "webhook_log".
 *  3. JANGAN percaya isi webhook: cek ulang status ke GET /hl/v2/transactions/{id}.
 *  4. Idempoten: jika transactions.processed sudah "ya", jangan proses lagi.
 *  5. Jika paid → update transactions & users.plan/premium_until (pakai LockService).
 *  Event lain: membership.memberExpired, membership.memberUnsubscribed → plan kembali "free".
 */

function handleMayarWebhook_(e) {
  // TODO (Fase 5): implementasi.
  return { received: false, reason: 'NOT_IMPLEMENTED' };
}
