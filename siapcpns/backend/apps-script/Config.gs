/**
 * Config.gs — semua konfigurasi & rahasia dibaca dari Script Properties.
 *
 * JANGAN PERNAH menulis nilai rahasia langsung di file ini (repo publik!).
 * Isi lewat: Apps Script editor > Project Settings > Script Properties.
 *
 * Properti yang dibutuhkan (diisi bertahap):
 *   Fase 2: SPREADSHEET_ID, GOOGLE_CLIENT_ID, ALLOWED_ORIGIN
 *   Fase 3: QUESTIONS_FOLDER_ID (folder Drive, 1 file = 1 paket) dan/atau QUESTIONS_SPREADSHEET_ID
 *   Fase 5: MAYAR_API_KEY, MAYAR_BASE_URL, WEBHOOK_TOKEN
 */

var REQUIRED_KEYS = {
  2: ['SPREADSHEET_ID', 'GOOGLE_CLIENT_ID'],
  3: ['QUESTIONS_FOLDER_ID atau QUESTIONS_SPREADSHEET_ID'],
  5: ['MAYAR_API_KEY', 'MAYAR_BASE_URL', 'WEBHOOK_TOKEN']
};

/** Ambil satu properti. Lempar error jelas jika belum diisi. */
function getConfig_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new AppError_('CONFIG_MISSING', 'Script Property "' + key + '" belum diisi.');
  return value;
}

/** Ambil properti opsional. */
function getConfigOptional_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value || fallback;
}

/**
 * Jalankan manual dari editor untuk mengecek properti mana yang belum diisi.
 * Hasilnya tampil di Execution log, nilainya TIDAK ditampilkan.
 */
function checkConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(REQUIRED_KEYS).forEach(function (phase) {
    REQUIRED_KEYS[phase].forEach(function (key) {
      var ok = key.split(' atau ').some(function (k) { return props[k]; });
      Logger.log('Fase ' + phase + ' · ' + key + ': ' + (ok ? 'terisi' : 'BELUM DIISI'));
    });
  });
}
