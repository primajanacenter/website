/**
 * Analytics.gs: data Google Analytics 4 untuk Super User Dashboard (Fase 14.4).
 *
 * Memakai layanan lanjutan Apps Script "Google Analytics Data API" (identifier: AnalyticsData).
 * Data dibaca dengan akun Google pemilik deploy Web App (executeAs USER_DEPLOYING), jadi akun itu
 * harus punya akses minimal Viewer ke properti GA4.
 *
 * Script Properties:
 *   GA_PROPERTY_ID  (wajib)    angka properti GA4, mis. 564371238 (bagian "p564371238" di URL GA)
 *   GA_REPORT_URL   (opsional) link laporan Realtime di GA untuk tombol "Buka di Google Analytics"
 *
 * Hanya admin (ADMIN_EMAILS). Hasil di-cache: realtime 60 detik, ringkasan 7 hari 10 menit.
 */

var GA_RT_CACHE_SEC = 60;
var GA_HIST_CACHE_SEC = 600;
var GA_APP_EVENTS = ['sign_up', 'login', 'cek_kesiapan_selesai', 'tryout_mulai', 'tryout_selesai', 'latihan_mulai',
  'materi_dibuka', 'akbar_daftar', 'wawancara_mulai', 'begin_checkout', 'purchase'];

/** adminAnalytics (auth required, admin): { force? } → data realtime + 7 hari. */
function handleAdminAnalytics_(payload, user) {
  requireAdmin_(user);
  var prop = String(getConfigOptional_('GA_PROPERTY_ID', '')).replace(/\D/g, '');
  var gaUrl = getConfigOptional_('GA_REPORT_URL', '') || (prop ? 'https://analytics.google.com/analytics/web/#/p' + prop + '/realtime/overview' : 'https://analytics.google.com/');
  if (!prop) return { configured: false, gaUrl: gaUrl, reason: 'Script Property GA_PROPERTY_ID belum diisi.' };
  if (typeof AnalyticsData === 'undefined') {
    return { configured: false, gaUrl: gaUrl, reason: 'Layanan "Google Analytics Data API" belum ditambahkan di editor Apps Script (menu Layanan / Services).' };
  }
  var out = { configured: true, gaUrl: gaUrl, generatedAt: new Date().toISOString() };
  try {
    var rt = !payload.force && cacheGetJson_('ga_rt_' + prop);
    if (!rt) { rt = gaRealtime_(prop); cachePutJson_('ga_rt_' + prop, rt, GA_RT_CACHE_SEC); }
    out.realtime = rt;
    var hist = cacheGetJson_('ga_hist_' + prop);
    if (!hist) { hist = gaHistory_(prop); cachePutJson_('ga_hist_' + prop, hist, GA_HIST_CACHE_SEC); }
    out.history = hist;
  } catch (e) {
    out.error = gaErrorText_(e);
  }
  return out;
}

function gaErrorText_(e) {
  var msg = String(e && e.message || e);
  if (/permission|PERMISSION_DENIED|403/i.test(msg)) return 'Akun pemilik Apps Script belum punya akses ke properti GA ini. Tambahkan email akun itu sebagai Viewer di GA (Admin › Property access management).';
  if (/not found|404|INVALID_ARGUMENT/i.test(msg)) return 'GA_PROPERTY_ID tidak dikenali. Isi dengan angka properti (mis. 564371238), bukan Measurement ID G-….';
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) return 'Kuota Google Analytics Data API sedang habis. Coba lagi beberapa menit lagi.';
  return 'Gagal membaca Google Analytics: ' + msg.slice(0, 200);
}

/* ---------------- helper laporan ---------------- */
function gaRows_(res, dims, mets) {
  return (res && res.rows || []).map(function (r) {
    var o = {};
    dims.forEach(function (d, i) { o[d] = r.dimensionValues[i].value; });
    mets.forEach(function (m, i) { o[m] = Number(r.metricValues[i].value) || 0; });
    return o;
  });
}
function gaTotal_(res, idx) {
  var t = res && res.totals && res.totals[0];
  return t ? Number(t.metricValues[idx || 0].value) || 0 : 0;
}
function gaRt_(prop, req) { return AnalyticsData.Properties.runRealtimeReport(req, 'properties/' + prop); }

/** 30 menit terakhir (data realtime GA). */
function gaRealtime_(prop) {
  var tot = gaRt_(prop, { metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }], metricAggregations: ['TOTAL'] });
  var last5 = gaRt_(prop, { metrics: [{ name: 'activeUsers' }], minuteRanges: [{ startMinutesAgo: 4, endMinutesAgo: 0 }], metricAggregations: ['TOTAL'] });
  var perMin = gaRows_(gaRt_(prop, { dimensions: [{ name: 'minutesAgo' }], metrics: [{ name: 'activeUsers' }], limit: 30 }), ['minutesAgo'], ['activeUsers']);
  var pages = gaRows_(gaRt_(prop, { dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 }), ['page'], ['users', 'views']);
  var devices = gaRows_(gaRt_(prop, { dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }] }), ['device'], ['users']);
  var cities = gaRows_(gaRt_(prop, { dimensions: [{ name: 'city' }], metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 }), ['city'], ['users']);
  var events = gaRows_(gaRt_(prop, { dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 12 }), ['event'], ['count']);

  var byMin = {}; perMin.forEach(function (r) { byMin[Number(r.minutesAgo)] = r.activeUsers; });
  var minutes = [];
  for (var m = 29; m >= 0; m--) minutes.push({ minutesAgo: m, users: byMin[m] || 0 });
  return {
    activeUsers: gaTotal_(tot, 0), pageViews: gaTotal_(tot, 1), events: gaTotal_(tot, 2), activeUsers5: gaTotal_(last5, 0),
    minutes: minutes, pages: pages, devices: devices, cities: cities, eventList: events,
  };
}

/** Hari ini dan 7/14 hari terakhir (data standar GA, ada jeda proses beberapa jam). */
function gaHistory_(prop) {
  var res = AnalyticsData.Properties.batchRunReports({
    requests: [
      { dateRanges: [{ startDate: 'today', endDate: 'today' }, { startDate: '6daysAgo', endDate: 'today' }],
        metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }] },
      { dateRanges: [{ startDate: '13daysAgo', endDate: 'today' }], dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }], orderBys: [{ dimension: { dimensionName: 'date' } }] },
      { dateRanges: [{ startDate: '6daysAgo', endDate: 'today' }], dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
      { dateRanges: [{ startDate: '6daysAgo', endDate: 'today' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: GA_APP_EVENTS } } } },
      { dateRanges: [{ startDate: '6daysAgo', endDate: 'today' }], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }] },
    ],
  }, 'properties/' + prop);
  var r = res.reports || [];
  // Laporan pertama: baris per rentang tanggal (dimensi otomatis dateRange).
  var sumRange = function (idx) {
    var row = (r[0] && r[0].rows || []).filter(function (x) { return x.dimensionValues && x.dimensionValues[0].value === 'date_range_' + idx; })[0];
    var v = function (i) { return row ? Number(row.metricValues[i].value) || 0 : 0; };
    return { activeUsers: v(0), newUsers: v(1), sessions: v(2), pageViews: v(3) };
  };
  var daily = gaRows_(r[1], ['date'], ['activeUsers', 'sessions']).map(function (x) {
    return { date: x.date.slice(0, 4) + '-' + x.date.slice(4, 6) + '-' + x.date.slice(6, 8), activeUsers: x.activeUsers, sessions: x.sessions };
  });
  var ev = {}; gaRows_(r[3], ['event'], ['count', 'users']).forEach(function (x) { ev[x.event] = { count: x.count, users: x.users }; });
  return {
    today: sumRange(0), week: sumRange(1), daily: daily,
    sources: gaRows_(r[2], ['source'], ['sessions', 'users']),
    appEvents: GA_APP_EVENTS.map(function (n) { return { event: n, count: (ev[n] || {}).count || 0, users: (ev[n] || {}).users || 0 }; }),
    devices: gaRows_(r[4], ['device'], ['users']),
  };
}

/**
 * Jalankan SEKALI dari editor Apps Script setelah menambahkan layanan Google Analytics Data API,
 * untuk memberi izin baca GA. Log menampilkan jumlah pengguna aktif saat ini.
 */
function testAnalytics() {
  var prop = String(getConfigOptional_('GA_PROPERTY_ID', '')).replace(/\D/g, '');
  if (!prop) throw new Error('Isi Script Property GA_PROPERTY_ID dulu (mis. 564371238).');
  var rt = gaRealtime_(prop);
  Logger.log('GA OK. Pengguna aktif 30 menit terakhir: ' + rt.activeUsers + ' (5 menit: ' + rt.activeUsers5 + ')');
  var h = gaHistory_(prop);
  Logger.log('Hari ini: ' + h.today.activeUsers + ' pengguna, 7 hari: ' + h.week.activeUsers + ' pengguna, ' + h.week.sessions + ' sesi.');
}
