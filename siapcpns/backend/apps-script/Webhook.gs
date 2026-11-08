/**
 * Webhook.gs — menerima webhook Mayar (Fase 5).
 *
 * URL yang didaftarkan di Mayar:  <URL Web App /exec>?hook=mayar&token=<WEBHOOK_TOKEN>
 * (Apps Script tidak bisa membaca header, dan Mayar tidak menyediakan tanda tangan webhook,
 *  sehingga token rahasia diletakkan di query string.)
 *
 * Prinsip:
 *  1. Token tidak cocok → abaikan tanpa memberi petunjuk.
 *  2. Isi webhook hanya PEMICU. Status lunas selalu dicek ulang ke API Mayar (verifyMayarPayment_).
 *  3. Idempoten: transaksi yang sudah diproses tidak diproses lagi.
 *  4. Semua webhook dicatat di sheet "webhook_log" (dipotong 4.000 karakter).
 *
 * Catatan: Apps Script membalas POST dengan redirect 302. Riwayat webhook di dashboard Mayar bisa tercatat
 * gagal meskipun skrip sudah memprosesnya. Hal ini aman karena pembayaran juga diverifikasi lewat halaman
 * status dan pengecekan otomatis setiap 15 menit (reconcilePayments).
 */

function handleMayarWebhook_(e) {
  var expected = getConfigOptional_('WEBHOOK_TOKEN', '');
  var given = String((e.parameter && e.parameter.token) || '');
  if (!expected || !safeEqual_(given, expected)) return { received: false };

  var raw = (e.postData && e.postData.contents) || '';
  var body = {};
  try { body = JSON.parse(raw); } catch (err) { body = {}; }
  var event = String(body.event || body.type || '');
  var d = body.data || {};
  var result = 'ignored';
  var trxRef = '';

  try {
    if (/^payment\./.test(event) || d.transactionStatus || d.status) {
      var trx = matchTransaction_(d);
      if (!trx) {
        result = 'no_match';
      } else {
        trxRef = trx.trx_id;
        if (trx.processed === 'ya') {
          result = 'already_processed';
        } else {
          var after = syncTransaction_(trx, 'webhook');
          result = after.processed === 'ya' ? 'fulfilled' : 'not_paid:' + after.status;
        }
      }
    }
  } catch (err) {
    result = 'error:' + (err.code || '') + ' ' + String(err.message || err).slice(0, 120);
    console.error(err && err.stack ? err.stack : err);
  }

  try {
    insert_('webhook_log', {
      received_at: nowIso_(), event: cleanText_(event, 60), trx_id: trxRef,
      mayar_ref: cleanText_(String(d.transactionId || d.id || ''), 80), result: cleanText_(result, 200),
      raw_json: cleanText_(raw, 4000)
    });
  } catch (err) { console.error('Gagal mencatat webhook: ' + err); }

  return { received: true };
}

/** Cocokkan webhook dengan transaksi kita: id transaksi Mayar → id payment request → email + nominal. */
function matchTransaction_(d) {
  var ids = [d.transactionId, d.id, d.paymentLinkTransactionId].filter(Boolean).map(String);
  for (var i = 0; i < ids.length; i++) {
    var t = findOne_('transactions', 'mayar_trx_id', ids[i]);
    if (t) return t;
  }
  var refs = [d.productId, d.paymentLinkId, d.paymentRequestId, d.id].filter(Boolean).map(String);
  for (var j = 0; j < refs.length; j++) {
    var t2 = findOne_('transactions', 'mayar_id', refs[j]);
    if (t2) return t2;
  }
  // Cadangan terakhir: transaksi pending terbaru dengan email & nominal yang sama
  var email = String(d.customerEmail || '').toLowerCase();
  if (email) {
    var cands = findAll_('transactions', 'email', email).filter(function (t) {
      return t.status === 'pending' && Number(t.amount) === Number(d.amount) && t.mayar_id;
    });
    if (cands.length) return cands[cands.length - 1];
  }
  return null;
}

/** Bandingkan string tanpa berhenti di karakter pertama yang berbeda. */
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
