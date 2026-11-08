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

/**
 * Siapkan file BANK SOAL (QUESTIONS_SPREADSHEET_ID): sheet packages & questions.
 * Jalankan sekali setelah Script Property QUESTIONS_SPREADSHEET_ID diisi.
 */
function setupQuestionSheets() {
  var ss = SpreadsheetApp.openById(getConfig_('QUESTIONS_SPREADSHEET_ID'));
  Object.keys(QSCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = QSCHEMA[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#fbf0d9');
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
    sh.setFrozenRows(1);
    Logger.log('Sheet bank soal siap: ' + name);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/**
 * Masukkan paket DEMO-01 (15 soal contoh) ke bank soal. Aman dijalankan ulang:
 * paket & soal DEMO-01 lama akan diganti.
 */
function importDemoPackage() {
  var data = getDemoPackageData_();
  var pkg = data.package;
  withLock_(function () {
    var existing = findOne_('packages', 'package_id', pkg.package_id);
    if (existing) update_('packages', existing._row, pkg); else insert_('packages', pkg);

    var sh = sheet_('questions');
    findAll_('questions', 'package_id', pkg.package_id).map(function (q) { return q._row; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (r) { sh.deleteRow(r); });

    data.questions.forEach(function (q) {
      var letters = ['a', 'b', 'c', 'd', 'e'];
      var row = {
        question_id: pkg.package_id + '-' + ('00' + q.number).slice(-3),
        package_id: pkg.package_id, number: q.number, subtest: q.subtest, topic_id: q.topic_id,
        level: q.level, text: q.text, context: q.context || '', answer: q.answer || '',
        explanation: q.explanation, status: 'live', source: 'demo'
      };
      letters.forEach(function (l, i) {
        row['option_' + l] = q.options[i] || '';
        row['score_' + l] = q.scores ? q.scores[i] : '';
      });
      insert_('questions', row);
    });
  });
  clearPackageCache_(pkg.package_id);
  Logger.log('Paket ' + pkg.package_id + ' dimasukkan: ' + data.questions.length + ' soal.');
}
