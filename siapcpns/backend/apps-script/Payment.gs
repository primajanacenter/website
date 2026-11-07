/**
 * Payment.gs — integrasi Mayar.id API V2 (Fase 5).
 *
 * Catatan dari dokumentasi Mayar:
 *  - Gunakan V2 (/hl/v2/...). V1 dijadwalkan berhenti 1 Oktober 2026.
 *  - Auth: header Authorization: Bearer <MAYAR_API_KEY> (Script Properties).
 *  - Sandbox: https://api.mayar.io  ·  Production: https://api.mayar.id  (simpan di MAYAR_BASE_URL)
 *  - Rate limit: 50 permintaan/menit per API key → simpan status di Sheet, jangan cek ke Mayar terus-menerus.
 *  - Cek status: GET /hl/v2/transactions/{id} → data.status (paid, unpaid, created, expired).
 *
 * Aturan:
 *  - Harga & paket ditentukan di server, bukan dari frontend.
 *  - Catat transaksi di sheet "transactions" dengan status pending sebelum mengembalikan link bayar.
 */

// function handleCreateCheckout_(payload, user) {}
// function handleGetPaymentStatus_(payload, user) {}

/** Contoh pemanggil API Mayar (dipakai mulai Fase 5). */
function mayarRequest_(method, path, body) {
  var res = UrlFetchApp.fetch(getConfig_('MAYAR_BASE_URL') + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getConfig_('MAYAR_API_KEY') },
    payload: body ? JSON.stringify(body) : null,
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var json = JSON.parse(res.getContentText() || '{}');
  if (code === 429) throw new AppError_('RATE_LIMITED', 'Server pembayaran sedang sibuk. Coba lagi sebentar.');
  if (code >= 400) throw new AppError_('PAYMENT_ERROR', 'Gagal menghubungi layanan pembayaran.');
  return json;
}
