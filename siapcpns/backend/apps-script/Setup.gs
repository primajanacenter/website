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
  if (seedPlans_()) Logger.log('Sheet plans diisi 3 paket awal (ubah harga langsung di sheet, lalu jalankan refreshPlanCache).');
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

/** Versi isi paket demo (ikut ID soal agar rapor lama tidak tertukar). v2 = dengan soal figural. */
var DEMO_VERSION = 'v3';

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
        question_id: pkg.package_id + '-' + DEMO_VERSION + '-' + ('00' + q.number).slice(-3),
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

/**
 * Mode folder: buat file Spreadsheet "Paket DEMO-01" di folder QUESTIONS_FOLDER_ID
 * berisi sheet packages & questions (15 soal contoh). Jalankan sekali bila perlu.
 */
function createDemoPackageFile() {
  var folder = DriveApp.getFolderById(getConfig_('QUESTIONS_FOLDER_ID'));
  var data = getDemoPackageData_();
  var ss = SpreadsheetApp.create('Paket ' + data.package.package_id + ' – ' + data.package.title);
  var pk = ss.getSheets()[0].setName('packages');
  var ph = QSCHEMA.packages;
  pk.getRange(1, 1, 1, ph.length).setValues([ph]).setFontWeight('bold');
  pk.getRange(2, 1, 1, ph.length).setValues([ph.map(function (k) { return data.package[k] === undefined ? '' : data.package[k]; })]);
  var qs = ss.insertSheet('questions');
  var qh = QSCHEMA.questions;
  var rows = data.questions.map(function (q) {
    var row = {
      question_id: data.package.package_id + '-' + DEMO_VERSION + '-' + ('00' + q.number).slice(-3), package_id: data.package.package_id,
      number: q.number, subtest: q.subtest, topic_id: q.topic_id, level: q.level, text: q.text, context: q.context || '',
      answer: q.answer || '', explanation: q.explanation, status: 'live', source: 'demo'
    };
    ['a', 'b', 'c', 'd', 'e'].forEach(function (l, i) {
      row['option_' + l] = q.options[i] || '';
      row['score_' + l] = q.scores ? q.scores[i] : '';
    });
    return qh.map(function (k) { return row[k] === undefined ? '' : row[k]; });
  });
  qs.getRange(1, 1, 1, qh.length).setValues([qh]).setFontWeight('bold');
  qs.getRange(2, 1, rows.length, qh.length).setValues(rows);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  refreshQuestionCache();
  Logger.log('File demo dibuat di folder: ' + ss.getUrl());
}
