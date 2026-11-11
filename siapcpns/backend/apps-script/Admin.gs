/**
 * Admin.gs — Super User Dashboard (Fase 12).
 *
 * Akses HANYA untuk email di Script Property ADMIN_EMAILS (dipisah koma), atau ADMIN_EMAIL bila ADMIN_EMAILS kosong.
 * Semua action di sini hanya-baca: angka bisnis dihitung dari sheet transactions (hasil webhook/rekonsiliasi Mayar),
 * sehingga admin tidak perlu membuka dasbor Mayar untuk memantau penjualan.
 */

var ADMIN_CACHE_SEC = 300;
var ADMIN_RANGES = [7, 30, 90];

function adminEmails_() {
  var raw = getConfigOptional_('ADMIN_EMAILS', '') || getConfigOptional_('ADMIN_EMAIL', '');
  return String(raw).split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(String);
}

function isAdmin_(user) {
  if (!user || !user.email) return false;
  return adminEmails_().indexOf(String(user.email).toLowerCase()) >= 0;
}

function requireAdmin_(user) {
  if (!isAdmin_(user)) throw new AppError_('FORBIDDEN', 'Halaman ini khusus admin.');
}

/* ------------------------------------------------------------------ */
/* Utilitas                                                           */
/* ------------------------------------------------------------------ */

/** Beberapa kolom sekaligus dari satu sheet → array objek (tanpa membaca kolom besar seperti answers_json). */
function adminCols_(name, fields) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var head = headers_(name);
  var idx = fields.map(function (f) { return head.indexOf(f); });
  var lo = Math.min.apply(null, idx.filter(function (i) { return i >= 0; }));
  var hi = Math.max.apply(null, idx);
  if (!(lo >= 0)) return [];
  var vals = sh.getRange(2, lo + 1, last - 1, hi - lo + 1).getValues();
  return vals.map(function (r) {
    var o = {};
    fields.forEach(function (f, k) { o[f] = idx[k] >= 0 ? r[idx[k] - lo] : ''; });
    return o;
  });
}

function dayList_(from, to) {
  var out = [], d = new Date(from + 'T00:00:00Z'), end = new Date(to + 'T00:00:00Z');
  while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); }
  return out;
}

function addDays_(date, n) {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
}

function pct_(a, b) { return b ? Math.round(a / b * 1000) / 10 : null; }
function avg_(arr) { return arr.length ? Math.round(arr.reduce(function (s, x) { return s + x; }, 0) / arr.length * 10) / 10 : null; }
function num_(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

/* ------------------------------------------------------------------ */
/* getAdminDashboard                                                   */
/* ------------------------------------------------------------------ */

function handleGetAdminDashboard_(payload, user) {
  requireAdmin_(user);
  var days = ADMIN_RANGES.indexOf(Number(payload.days)) >= 0 ? Number(payload.days) : 30;
  var key = 'adm_dash_' + days;
  if (!payload.force) {
    var hit = cacheGetJson_(key);
    if (hit) { hit.cached = true; return hit; }
  }
  var data = computeAdminDashboard_(days);
  cachePutJson_(key, data, ADMIN_CACHE_SEC);
  data.cached = false;
  return data;
}

function computeAdminDashboard_(days) {
  var today = jktDay_(0).date;
  var from = jktDay_(-(days - 1)).date;
  var prevFrom = jktDay_(-(2 * days - 1)).date, prevTo = jktDay_(-days).date;
  var d7 = jktDay_(-6).date, d30 = jktDay_(-29).date;
  var inR = function (d) { return d && d >= from && d <= today; };
  var inPrev = function (d) { return d && d >= prevFrom && d <= prevTo; };
  var series = dayList_(from, today);

  /* ---------- data mentah ---------- */
  var users = readAll_('users');
  var userById = {}; users.forEach(function (u) { userById[u.user_id] = u; });
  var profiles = readAll_('profiles');
  var profById = {}; profiles.forEach(function (p) { profById[p.user_id] = p; });
  var trx = readAll_('transactions');
  var att = adminCols_('attempts', ['attempt_id', 'user_id', 'package_id', 'type', 'status', 'submitted_at', 'twk', 'tiu', 'tkp', 'total', 'passed_all', 'event_id']);
  var prac = adminCols_('practice_answers', ['user_id', 'date', 'topic_id', 'subtest', 'points']);
  var assess = adminCols_('assessments', ['user_id', 'created_at']);
  var refs = readAll_('referrals');
  var skd = readAll_('skd_results');

  var created = {}; users.forEach(function (u) { created[u.user_id] = jktDateOf_(u.created_at); });

  /* ---------- BISNIS ---------- */
  var paid = trx.filter(function (t) { return t.status === 'paid'; });
  var paidReal = paid.filter(function (t) { return num_(t.amount) > 0; });     // tanpa hadiah/grant manual Rp0
  var paidDate = function (t) { return jktDateOf_(t.paid_at || t.created_at); };
  var sumAmt = function (list) { return list.reduce(function (s, t) { return s + num_(t.amount); }, 0); };
  var paidRange = paidReal.filter(function (t) { return inR(paidDate(t)); });
  var paidPrev = paidReal.filter(function (t) { return inPrev(paidDate(t)); });
  var createdRange = trx.filter(function (t) { return inR(jktDateOf_(t.created_at)); });
  var statusCounts = {};
  createdRange.forEach(function (t) {
    var s = t.status === 'pending' && isExpired_(t) ? 'expired' : (t.status || 'unknown');
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  var pendingOpen = trx.filter(function (t) { return t.status === 'pending' && !isExpired_(t) && num_(t.amount) > 0; });

  var byDay = {}; series.forEach(function (d) { byDay[d] = { date: d, revenue: 0, paid: 0, signups: 0, learners: 0, attempts: 0, practice: 0 }; });
  paidRange.forEach(function (t) { var b = byDay[paidDate(t)]; if (b) { b.revenue += num_(t.amount); b.paid++; } });

  var plans = {};
  paidRange.forEach(function (t) {
    var p = plans[t.plan_id] || (plans[t.plan_id] = { planId: t.plan_id, name: t.plan_name || t.plan_id, count: 0, revenue: 0 });
    p.count++; p.revenue += num_(t.amount);
  });
  var payCount = {}; paidReal.forEach(function (t) { payCount[t.user_id] = (payCount[t.user_id] || 0) + 1; });
  var payers = Object.keys(payCount);
  var repeat = payers.filter(function (k) { return payCount[k] > 1; }).length;

  var now = Date.now();
  var premiumActive = users.filter(isPremiumActive_);
  var expiring = premiumActive.filter(function (u) { return new Date(u.premium_until).getTime() - now <= 7 * 86400000; })
    .sort(function (a, b) { return new Date(a.premium_until) - new Date(b.premium_until); });

  var recentTrx = trx.slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 25)
    .map(adminTrxView_);

  /* ---------- PENGGUNA ---------- */
  var activity = {};   // user_id -> {tanggal: true}
  var mark = function (uid, d) { if (!uid || !d) return; (activity[uid] || (activity[uid] = {}))[d] = true; };
  prac.forEach(function (p) { mark(p.user_id, jktDateOf_(p.date) || String(p.date).slice(0, 10)); });
  att.forEach(function (a) { if (a.status === 'submitted') mark(a.user_id, jktDateOf_(a.submitted_at)); });
  var learnersByDay = {};
  Object.keys(activity).forEach(function (uid) {
    Object.keys(activity[uid]).forEach(function (d) { if (byDay[d]) learnersByDay[d] = (learnersByDay[d] || 0) + 1; });
  });
  series.forEach(function (d) { byDay[d].learners = learnersByDay[d] || 0; });
  users.forEach(function (u) { var b = byDay[created[u.user_id]]; if (b) b.signups++; });

  var learnersIn = function (a, b) {
    return Object.keys(activity).filter(function (uid) { return Object.keys(activity[uid]).some(function (d) { return d >= a && d <= b; }); }).length;
  };
  var newRange = users.filter(function (u) { return inR(created[u.user_id]); });
  var newPrev = users.filter(function (u) { return inPrev(created[u.user_id]); }).length;
  var lastLogin = users.map(function (u) { return jktDateOf_(u.last_login_at); });

  // Corong: pengguna yang mendaftar dalam rentang
  var setOf = function (list, f) { var s = {}; list.forEach(function (x) { if (x[f]) s[x[f]] = true; }); return s; };
  var hasAssess = setOf(assess, 'user_id');
  var hasTryout = {}; att.forEach(function (a) { if (a.status === 'submitted') hasTryout[a.user_id] = true; });
  var hasPrac = setOf(prac, 'user_id');
  var ids = newRange.map(function (u) { return u.user_id; });
  var cnt = function (pred) { return ids.filter(pred).length; };
  var funnel = [
    { key: 'daftar', label: 'Mendaftar', n: ids.length },
    { key: 'profil', label: 'Profil lengkap', n: cnt(function (id) { var p = profById[id]; return p && p.education && p.minutes_per_day; }) },
    { key: 'cek', label: 'Cek kesiapan', n: cnt(function (id) { return hasAssess[id]; }) },
    { key: 'tryout', label: 'Selesai tryout', n: cnt(function (id) { return hasTryout[id]; }) },
    { key: 'latihan', label: 'Latihan harian', n: cnt(function (id) { return hasPrac[id]; }) },
    { key: 'premium', label: 'Membeli Premium', n: cnt(function (id) { return payCount[id]; }) }
  ];

  // Kohort mingguan (minggu dimulai Senin, WIB): % yang aktif lagi di minggu ke-1..4 setelah mendaftar
  var cohorts = [];
  var t0 = new Date(today + 'T00:00:00Z'); var dow = (t0.getUTCDay() + 6) % 7;
  var thisMonday = addDays_(today, -dow);
  for (var w = 5; w >= 0; w--) {
    var ws = addDays_(thisMonday, -7 * w), we = addDays_(ws, 6);
    var members = users.filter(function (u) { var c = created[u.user_id]; return c && c >= ws && c <= we; }).map(function (u) { return u.user_id; });
    var row = { week: ws, size: members.length, weeks: [] };
    for (var k = 1; k <= 4; k++) {
      var a = addDays_(ws, 7 * k), b = addDays_(a, 6);
      if (a > today) { row.weeks.push(null); continue; }
      var back = members.filter(function (uid) { var act = activity[uid] || {}; return Object.keys(act).some(function (d) { return d >= a && d <= b; }); }).length;
      row.weeks.push(members.length ? pct_(back, members.length) : null);
    }
    cohorts.push(row);
  }

  var eduC = {}, provC = {};
  profiles.forEach(function (p) { if (p.education) eduC[p.education] = (eduC[p.education] || 0) + 1; if (p.target_province) provC[p.target_province] = (provC[p.target_province] || 0) + 1; });
  var top = function (o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n).map(function (k) { return { key: k, n: o[k] }; }); };

  /* ---------- BELAJAR ---------- */
  var subAtt = att.filter(function (a) { return a.status === 'submitted' && inR(jktDateOf_(a.submitted_at)); });
  subAtt.forEach(function (a) { var b = byDay[jktDateOf_(a.submitted_at)]; if (b) b.attempts++; });
  var types = {};
  subAtt.forEach(function (a) {
    var t = types[a.type] || (types[a.type] = { type: a.type, n: 0, totals: [], passed: 0, twk: [], tiu: [], tkp: [] });
    t.n++;
    if (a.type !== 'skb') {
      t.totals.push(num_(a.total)); if (isTrue_(a.passed_all)) t.passed++;
      t.twk.push(num_(a.twk)); t.tiu.push(num_(a.tiu)); t.tkp.push(num_(a.tkp));
    }
  });
  var attemptsByType = Object.keys(types).map(function (k) {
    var t = types[k];
    return { type: k, n: t.n, avgTotal: avg_(t.totals), passPct: t.totals.length ? pct_(t.passed, t.totals.length) : null,
      avgTwk: avg_(t.twk), avgTiu: avg_(t.tiu), avgTkp: avg_(t.tkp) };
  }).sort(function (a, b) { return b.n - a.n; });

  var pr = prac.filter(function (p) { return inR(jktDateOf_(p.date) || String(p.date).slice(0, 10)); });
  pr.forEach(function (p) { var b = byDay[jktDateOf_(p.date) || String(p.date).slice(0, 10)]; if (b) b.practice++; });
  var tp = {};
  pr.forEach(function (p) { var t = tp[p.topic_id] || (tp[p.topic_id] = { n: 0, pts: 0 }); t.n++; t.pts += num_(p.points); });
  var topics = Object.keys(tp).filter(function (k) { return TOPICS[k]; }).map(function (k) {
    return { topicId: k, name: TOPICS[k].name, subtest: TOPICS[k].subtest, n: tp[k].n, pct: pct_(tp[k].pts, tp[k].n * 5) };
  }).sort(function (a, b) { return a.pct - b.pct; });
  var nonTkp = pr.filter(function (p) { return String(p.subtest).toLowerCase() !== 'tkp'; });

  var ares = adminCols_('akbar_results', ['event_id', 'total', 'passed_all']);
  var akbar = akbarEvents_().slice(-8).reverse().map(function (e) {
    var rs = ares.filter(function (r) { return r.event_id === e.event_id; });
    var joined = att.filter(function (a) { return a.event_id === e.event_id; }).length;
    return {
      eventId: e.event_id, packageId: e.package_id, title: e.title, opensAt: toIsoDate_(e.opens_at) || String(e.opens_at),
      status: akbarState_(e, now), joined: joined, ranked: rs.length,
      avg: avg_(rs.map(function (r) { return num_(r.total); })), top: rs.length ? Math.max.apply(null, rs.map(function (r) { return num_(r.total); })) : null,
      passPct: rs.length ? pct_(rs.filter(function (r) { return isTrue_(r.passed_all); }).length, rs.length) : null
    };
  });

  /* ---------- OPERASIONAL ---------- */
  var ops = adminOps_();

  return {
    generatedAt: nowIso_(),
    range: { days: days, from: from, to: today, prevFrom: prevFrom, prevTo: prevTo },
    env: paymentEnv_(),
    kpi: {
      revenue: sumAmt(paidRange), revenuePrev: sumAmt(paidPrev),
      paid: paidRange.length, paidPrev: paidPrev.length,
      aov: paidRange.length ? Math.round(sumAmt(paidRange) / paidRange.length) : 0,
      newUsers: newRange.length, newUsersPrev: newPrev,
      learners: learnersIn(from, today), learnersPrev: learnersIn(prevFrom, prevTo),
      premiumActive: premiumActive.length, usersTotal: users.length,
      conversionPct: pct_(payers.length, users.length)
    },
    business: {
      revenueToday: sumAmt(paidReal.filter(function (t) { return paidDate(t) === today; })),
      revenue7: sumAmt(paidReal.filter(function (t) { return paidDate(t) >= d7; })),
      revenue30: sumAmt(paidReal.filter(function (t) { return paidDate(t) >= d30; })),
      revenueTotal: sumAmt(paidReal),
      pending: { count: pendingOpen.length, amount: sumAmt(pendingOpen) },
      statusCounts: statusCounts,
      checkoutToPaidPct: pct_(statusCounts.paid || 0, createdRange.filter(function (t) { return num_(t.amount) > 0; }).length),
      byPlan: Object.keys(plans).map(function (k) { return plans[k]; }).sort(function (a, b) { return b.revenue - a.revenue; }),
      byKind: (function () {
        var o = {};
        paidRange.forEach(function (t) {
          var k = isPremiumTrx_(t) ? 'premium' : String(t.kind);
          var x = o[k] || (o[k] = { kind: k, label: k === 'premium' ? 'Premium (Materi + Latihan)' : (PRODUCT_LABEL[k] || k), count: 0, revenue: 0 });
          x.count++; x.revenue += num_(t.amount);
        });
        return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.revenue - a.revenue; });
      })(),
      services: adminServices_(),
      payers: payers.length, repeatPct: pct_(repeat, payers.length),
      discountRange: paidRange.reduce(function (s, t) { return s + num_(t.discount); }, 0),
      grantsRange: paid.filter(function (t) { return num_(t.amount) === 0 && inR(paidDate(t)); }).length,
      referral: {
        joined: refs.filter(function (r) { return inR(jktDateOf_(r.created_at)); }).length,
        rewarded: refs.filter(function (r) { return r.status === 'rewarded' && inR(jktDateOf_(r.rewarded_at)); }).length,
        joinedTotal: refs.length
      },
      expiring: expiring.slice(0, 15).map(function (u) { return { email: u.email, name: u.name, premiumUntil: toIsoDate_(u.premium_until) }; }),
      expiringCount: expiring.length,
      recent: recentTrx
    },
    users: {
      total: users.length,
      newToday: users.filter(function (u) { return created[u.user_id] === today; }).length,
      new7: users.filter(function (u) { return created[u.user_id] >= d7; }).length,
      new30: users.filter(function (u) { return created[u.user_id] >= d30; }).length,
      login7: lastLogin.filter(function (d) { return d >= d7; }).length,
      learners7: learnersIn(d7, today), learners30: learnersIn(d30, today),
      profilesComplete: profiles.filter(function (p) { return p.education && p.minutes_per_day; }).length,
      funnel: funnel, cohorts: cohorts,
      education: top(eduC, 6), provinces: top(provC, 8)
    },
    learning: {
      attempts: subAtt.length, attemptsByType: attemptsByType,
      practice: pr.length, practiceAccPct: pct_(nonTkp.filter(function (p) { return num_(p.points) >= 5; }).length, nonTkp.length),
      practiceUsers: Object.keys(setOf(pr, 'user_id')).length,
      topicsWeak: topics.slice(0, 6), topicsStrong: topics.slice(-3).reverse(),
      akbar: akbar,
      skd: { n: skd.length, passPct: pct_(skd.filter(function (r) { return isTrue_(r.passed_all); }).length, skd.length),
        avgTotal: avg_(skd.map(function (r) { return num_(r.total); })) }
    },
    daily: series.map(function (d) { return byDay[d]; }),
    ops: ops
  };
}

function adminTrxView_(t) {
  var status = t.status === 'pending' && isExpired_(t) ? 'expired' : String(t.status || '');
  return {
    trxId: t.trx_id, createdAt: String(t.created_at || ''), paidAt: String(t.paid_at || ''), email: String(t.email || ''),
    planId: t.plan_id, planName: t.plan_name, amount: num_(t.amount), discount: num_(t.discount), status: status,
    refCode: String(t.ref_code || ''), source: String(t.source || ''), mayarId: String(t.mayar_trx_id || t.mayar_id || '')
  };
}

function adminOps_() {
  var out = {};
  try { var h = healthCheck(); out.health = { warnings: h.warnings, report: h.report.filter(String) }; }
  catch (e) { out.health = { warnings: 1, report: ['⚠️ healthCheck gagal: ' + e.message] }; }
  var errs = readAll_('error_log').filter(function (e) { return new Date(e.at).getTime() > Date.now() - 86400000; });
  out.errors24h = {
    total: errs.length,
    server: errs.filter(function (e) { return e.kind === 'server'; }).length,
    client: errs.filter(function (e) { return e.kind === 'client'; }).length,
    top: topCounts_(errs.map(function (e) { return (e.kind || '') + ' · ' + (e.action || e.page || '-') + ' · ' + String(e.message).slice(0, 80); }), 6)
  };
  var wh = adminCols_('webhook_log', ['received_at', 'event', 'result']);
  var wh7 = wh.filter(function (w) { return new Date(w.received_at).getTime() > Date.now() - 7 * 86400000; });
  out.webhook = {
    last: wh.length ? String(wh[wh.length - 1].received_at) : '',
    count7: wh7.length,
    problems7: wh7.filter(function (w) { return /^error|no_match|not_paid/.test(String(w.result)); }).length
  };
  var nl = adminCols_('notif_log', ['at', 'kind', 'status']).filter(function (n) { return new Date(n.at).getTime() > Date.now() - 7 * 86400000; });
  out.reminders = { sent7: nl.filter(function (n) { return n.status === 'sent'; }).length, failed7: nl.filter(function (n) { return n.status !== 'sent'; }).length };
  out.lastBackup = '';
  try {
    var fid = getConfigOptional_('BACKUP_FOLDER_ID', '');
    if (fid) {
      var it = DriveApp.getFolderById(fid).getFiles(), best = '';
      while (it.hasNext()) { var n = it.next().getName(); var m = n.match(/^Backup Siap CPNS (\d{4}-\d{2}-\d{2})$/); if (m && m[1] > best) best = m[1]; }
      out.lastBackup = best;
    }
  } catch (e) { out.lastBackup = 'gagal dibaca'; }
  return out;
}

/* ------------------------------------------------------------------ */
/* adminTransactions — daftar transaksi untuk tabel & unduh CSV        */
/* ------------------------------------------------------------------ */

function handleAdminTransactions_(payload, user) {
  requireAdmin_(user);
  var from = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.from)) ? payload.from : jktDay_(-29).date;
  var to = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.to)) ? payload.to : jktDay_(0).date;
  var status = String(payload.status || '');
  var list = readAll_('transactions').map(adminTrxView_).filter(function (t) {
    var d = jktDateOf_(t.paidAt || t.createdAt);
    return d >= from && d <= to && (!status || t.status === status);
  }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  return { from: from, to: to, total: list.length, truncated: list.length > 3000, items: list.slice(0, 3000) };
}

/* ------------------------------------------------------------------ */
/* adminLookupUser — cari pengguna untuk dukungan pelanggan            */
/* ------------------------------------------------------------------ */

function handleAdminLookupUser_(payload, user) {
  requireAdmin_(user);
  var q = String(payload.q || '').trim().toLowerCase();
  if (q.length < 3) throw new AppError_('BAD_REQUEST', 'Ketik minimal 3 huruf email atau nama.');
  var users = readAll_('users');
  var hits = users.filter(function (u) {
    return String(u.email).toLowerCase().indexOf(q) >= 0 || String(u.name).toLowerCase().indexOf(q) >= 0 || String(u.ref_code).toLowerCase() === q;
  });
  var list = hits.slice(0, 20).map(function (u) {
    return { userId: u.user_id, email: u.email, name: u.name, plan: isPremiumActive_(u) ? 'premium' : 'free', createdAt: toIsoDate_(u.created_at) };
  });
  var exact = hits.length === 1 ? hits[0] : hits.filter(function (u) { return String(u.email).toLowerCase() === q; })[0];
  return { total: hits.length, list: list, detail: exact ? adminUserDetail_(exact) : null };
}

function adminUserDetail_(u) {
  var p = findOne_('profiles', 'user_id', u.user_id);
  var att = findAll_('attempts', 'user_id', u.user_id).filter(function (a) { return a.status === 'submitted'; });
  var prac = adminCols_('practice_answers', ['user_id', 'date', 'points']).filter(function (x) { return x.user_id === u.user_id; });
  var trx = findAll_('transactions', 'user_id', u.user_id).map(adminTrxView_).reverse();
  var skd = findOne_('skd_results', 'user_id', u.user_id);
  var refs = findAll_('referrals', 'referrer_id', u.user_id);
  var lastPrac = prac.reduce(function (m, x) { var d = jktDateOf_(x.date) || String(x.date).slice(0, 10); return d > m ? d : m; }, '');
  return {
    userId: u.user_id, email: u.email, name: u.name,
    plan: isPremiumActive_(u) ? 'premium' : 'free', premiumUntil: toIsoDate_(u.premium_until),
    createdAt: toIsoDate_(u.created_at), lastLoginAt: toIsoDate_(u.last_login_at), refCode: String(u.ref_code || ''),
    profile: p ? { education: p.education, major: p.major, province: p.target_province, formation: p.target_formation, testDate: toIsoDate_(p.test_date) } : null,
    attempts: att.slice(-10).reverse().map(function (a) {
      return { packageId: a.package_id, type: a.type, total: num_(a.total), passedAll: isTrue_(a.passed_all), submittedAt: toIsoDate_(a.submitted_at) };
    }),
    attemptsTotal: att.length,
    practice: { answers: prac.length, last: lastPrac, accPct: pct_(prac.filter(function (x) { return num_(x.points) >= 5; }).length, prac.length) },
    transactions: trx.slice(0, 15),
    referrals: { invited: refs.length, rewarded: refs.filter(function (r) { return r.status === 'rewarded'; }).length },
    skd: skd ? { total: num_(skd.total), passedAll: isTrue_(skd.passed_all), testDate: toIsoDate_(skd.test_date) } : null
  };
}

/** Ringkasan layanan (Fase 13): kursi Live Mentoring & slot konsultasi mendatang. */
function adminServices_() {
  var now = Date.now();
  var out = { live: [], consult: { open: 0, booked: 0, next: [] }, recordings: 0 };
  try {
    var ents = adminCols_('entitlements', ['kind', 'ref_id', 'status']).filter(function (e) { return String(e.status || 'active') === 'active'; });
    var cnt = function (kind, ref) { return ents.filter(function (e) { return e.kind === kind && String(e.ref_id) === String(ref); }).length; };
    mentoringSessions_().forEach(function (s) {
      var end = mDate_(s.ends_at) || mDate_(s.starts_at);
      if (end > now - 7 * 86400000 && String(s.status) !== 'cancelled') {
        out.live.push({ sessionId: s.session_id, title: s.title, startsAt: new Date(mDate_(s.starts_at)).toISOString(), sold: cnt('live', s.session_id),
          capacity: Number(s.capacity) || MENTORING_DEFAULT_CAPACITY, zoomReady: Boolean(s.zoom_url), recordingSold: cnt('rec', s.session_id) });
      }
      if (isRecordingPublished_(s)) out.recordings++;
    });
    out.live.sort(function (a, b) { return a.startsAt < b.startsAt ? -1 : 1; });
    consultSlots_().forEach(function (s) {
      var t = slotTimes_(s);
      if (t.end < now) return;
      if (String(s.status) === 'open') out.consult.open++;
      if (String(s.status) === 'booked') {
        out.consult.booked++;
        var u = findOne_('users', 'user_id', s.booked_by);
        out.consult.next.push({ slotId: s.slot_id, startsAt: new Date(t.start).toISOString(), consultant: String(s.consultant_name || ''), client: u ? String(u.name || u.email) : '' });
      }
    });
    out.consult.next.sort(function (a, b) { return a.startsAt < b.startsAt ? -1 : 1; });
    out.consult.next = out.consult.next.slice(0, 10);
  } catch (e) { out.error = e.message; }
  return out;
}
