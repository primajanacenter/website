/**
 * Setup.gs — jalankan SEKALI dari editor Apps Script setelah Script Properties diisi.
 *
 *   1. Pilih fungsi setupSheets → Run.
 *   2. Izinkan akses (Spreadsheet & URL Fetch) saat diminta.
 *
 * Fungsi ini aman dijalankan ulang: sheet yang sudah ada tidak dihapus,
 * hanya header baris 1 yang dipastikan sesuai SCHEMA.
 */
function setupSheets() {
  var ss = SpreadsheetApp.openById(getConfig_('SPREADSHEET_ID'));
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = SCHEMA[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e3ebf7');
    // Simpan semua sebagai teks agar tanggal/nomor HP tidak diubah otomatis oleh Spreadsheet.
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
    sh.setFrozenRows(1);
    Logger.log('Sheet siap: ' + name + ' (' + h.length + ' kolom)');
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  Logger.log('Selesai. Jalankan testBackend() untuk uji cepat.');
}

/** Uji cepat tanpa frontend: cek konfigurasi & koneksi ke Spreadsheet. */
function testBackend() {
  checkConfig();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = sheet_(name);
    Logger.log(name + ': ' + Math.max(0, sh.getLastRow() - 1) + ' baris data');
  });
  Logger.log('Ping: ' + JSON.stringify(handlePing_({})));
}
