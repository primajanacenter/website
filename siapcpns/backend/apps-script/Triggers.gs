/**
 * Triggers.gs — tugas terjadwal.
 *
 *  - reconcilePayments : setiap 15 menit, cek ulang transaksi pending ke Mayar (cadangan bila webhook
 *                        tidak sampai) dan tandai link yang kedaluwarsa.
 *  - Status premium dihitung dari users.premium_until setiap kali pengguna memanggil API
 *    (isPremiumActive_), sehingga tidak perlu tugas harian untuk menurunkan paket.
 *
 * Pasang sekali: jalankan installPaymentTrigger() dari editor.
 * (Pemicu bank soal per jam dipasang terpisah lewat installQuestionTrigger() di Tryout.gs.)
 */

var RECONCILE_MAX_PER_RUN = 20;      // jaga di bawah batas 50 permintaan/menit Mayar
var RECONCILE_LOOKBACK_DAYS = 3;

function reconcilePayments() {
  var cutoff = Date.now() - RECONCILE_LOOKBACK_DAYS * 86400000;
  var pending = readAll_('transactions').filter(function (t) {
    return t.status === 'pending' && new Date(t.created_at).getTime() > cutoff;
  });
  var checked = 0, fulfilled = 0, expired = 0, errors = 0;
  pending.slice(0, RECONCILE_MAX_PER_RUN).forEach(function (t) {
    try {
      var after = syncTransaction_(t, 'reconcile');
      checked++;
      if (after.processed === 'ya') fulfilled++;
      if (after.status === 'expired') expired++;
    } catch (err) {
      errors++;
      console.warn('reconcile ' + t.trx_id + ': ' + (err.message || err));
      if (err.code === 'RATE_LIMITED') return;
    }
  });
  // Transaksi pending yang sangat lama: tandai kedaluwarsa tanpa memanggil Mayar
  readAll_('transactions').forEach(function (t) {
    if (t.status === 'pending' && new Date(t.created_at).getTime() <= cutoff && isExpired_(t)) {
      update_('transactions', t._row, { status: 'expired', note: 'kedaluwarsa (rekonsiliasi)' });
      expired++;
    }
  });
  Logger.log('reconcilePayments: dicek ' + checked + ', aktif ' + fulfilled + ', kedaluwarsa ' + expired + ', galat ' + errors);
  return { checked: checked, fulfilled: fulfilled, expired: expired, errors: errors };
}

function installPaymentTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'reconcilePayments') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('reconcilePayments').timeBased().everyMinutes(15).create();
  Logger.log('Pemicu reconcilePayments (15 menit) terpasang.');
}
