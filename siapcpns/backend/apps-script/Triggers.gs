/**
 * Triggers.gs — tugas terjadwal (Fase 5+).
 *
 *  - dailyExpireMemberships: setiap hari, turunkan users.plan ke "free" jika premium_until sudah lewat
 *    (cadangan seandainya webhook Mayar gagal terkirim).
 *  - Pasang sekali dengan menjalankan installTriggers() dari editor.
 */

// function dailyExpireMemberships() {}

// function installTriggers() {
//   ScriptApp.newTrigger('dailyExpireMemberships').timeBased().everyDays(1).atHour(2).create();
// }
