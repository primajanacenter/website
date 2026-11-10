/**
 * mock-admin.js — data CONTOH untuk Super User Dashboard saat USE_MOCK = true.
 * Hanya dimuat di mode uji. Angkanya acak-tetap (seeded) agar tampilan stabil.
 */

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const iso = (d) => d.toISOString().slice(0, 10);
const day = (off) => { const d = new Date(Date.now() + 7 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return iso(d); };
const PLANS = [["P1M", "Premium 1 bulan", 49000], ["P3M", "Premium 3 bulan", 119000], ["P6M", "Premium 6 bulan", 179000]];
const NAMES = ["Rani", "Dimas", "Sari", "Yoga", "Lina", "Fajar", "Tika", "Bayu", "Nisa", "Arif", "Maya", "Hendra"];

function trxList(r, n) {
  return Array.from({ length: n }, (_, i) => {
    const [pid, pname, price] = PLANS[Math.floor(r() * 3)];
    const st = r() < 0.72 ? "paid" : r() < 0.6 ? "expired" : r() < 0.7 ? "pending" : "failed";
    const created = new Date(Date.now() - i * 3.1 * 3600e3 - r() * 3600e3);
    const disc = r() < 0.15 ? Math.round(price * 0.1) : 0;
    const nm = NAMES[i % NAMES.length].toLowerCase();
    return {
      trxId: "trx_" + (1e5 + i * 37).toString(36), createdAt: created.toISOString(), paidAt: st === "paid" ? new Date(created.getTime() + 6e5).toISOString() : "",
      email: `${nm}${i}@contoh.id`, planId: pid, planName: pname, amount: price - disc, discount: disc, status: st,
      refCode: disc ? "AJAK" + (100 + i) : "", source: st === "paid" ? "webhook" : "", mayarId: st === "paid" ? "my-" + i : "",
    };
  });
}

export function mockAdminDashboard({ days = 30 } = {}) {
  const r = rng(20261110 + days);
  const daily = Array.from({ length: days }, (_, i) => {
    const t = i / days;
    const paid = Math.round(2 + 6 * t + r() * 4);
    return {
      date: day(i - days + 1), paid, revenue: paid * (70000 + Math.round(r() * 60000)),
      signups: Math.round(18 + 30 * t + r() * 14), learners: Math.round(60 + 120 * t + r() * 40),
      attempts: Math.round(8 + 12 * t + r() * 8), practice: Math.round(400 + 900 * t + r() * 300),
    };
  });
  const sum = (k) => daily.reduce((s, d) => s + d[k], 0);
  const recent = trxList(r, 25);
  const topics = [["tiu-figural", "Figural", "tiu", 41.2], ["tiu-analitis", "Penalaran analitis", "tiu", 46.8], ["twk-uud", "UUD 1945", "twk", 52.4],
    ["tiu-cerita", "Soal cerita", "tiu", 55.1], ["twk-bahasa", "Bahasa negara", "twk", 58.9], ["tiu-deret", "Deret angka", "tiu", 61.3]];
  return {
    generatedAt: new Date().toISOString(), cached: false, env: "sandbox",
    range: { days, from: day(-days + 1), to: day(0), prevFrom: day(-2 * days + 1), prevTo: day(-days) },
    kpi: {
      revenue: sum("revenue"), revenuePrev: Math.round(sum("revenue") * 0.78), paid: sum("paid"), paidPrev: Math.round(sum("paid") * 0.8),
      aov: Math.round(sum("revenue") / Math.max(1, sum("paid"))), newUsers: sum("signups"), newUsersPrev: Math.round(sum("signups") * 0.85),
      learners: Math.round(daily[days - 1].learners * 3.2), learnersPrev: Math.round(daily[days - 1].learners * 2.6),
      premiumActive: 312, usersTotal: 4820, conversionPct: 8.4,
    },
    business: {
      revenueToday: daily[days - 1].revenue, revenue7: daily.slice(-7).reduce((s, d) => s + d.revenue, 0), revenue30: Math.round(sum("revenue") * (30 / days)),
      revenueTotal: 48650000, pending: { count: 6, amount: 594000 },
      statusCounts: { paid: sum("paid"), expired: Math.round(sum("paid") * 0.25), pending: 6, failed: 3 }, checkoutToPaidPct: 76.3,
      byPlan: [{ planId: "P3M", name: "Premium 3 bulan", count: Math.round(sum("paid") * 0.52), revenue: Math.round(sum("revenue") * 0.55) },
        { planId: "P1M", name: "Premium 1 bulan", count: Math.round(sum("paid") * 0.3), revenue: Math.round(sum("revenue") * 0.2) },
        { planId: "P6M", name: "Premium 6 bulan", count: Math.round(sum("paid") * 0.18), revenue: Math.round(sum("revenue") * 0.25) }],
      payers: 405, repeatPct: 11.6, discountRange: 312000, grantsRange: 2,
      referral: { joined: 64, rewarded: 21, joinedTotal: 188 },
      expiring: NAMES.slice(0, 5).map((n, i) => ({ email: `${n.toLowerCase()}@contoh.id`, name: n + " Uji", premiumUntil: day(i + 1) })), expiringCount: 17,
      recent,
    },
    users: {
      total: 4820, newToday: daily[days - 1].signups, new7: daily.slice(-7).reduce((s, d) => s + d.signups, 0), new30: Math.round(sum("signups") * (30 / days)),
      login7: 1340, learners7: 980, learners30: 2110, profilesComplete: 3920,
      funnel: [["daftar", "Mendaftar", 1], ["profil", "Profil lengkap", 0.82], ["cek", "Cek kesiapan", 0.61], ["tryout", "Selesai tryout", 0.38], ["latihan", "Latihan harian", 0.47], ["premium", "Membeli Premium", 0.07]]
        .map(([key, label, f]) => ({ key, label, n: Math.round(sum("signups") * f) })),
      cohorts: Array.from({ length: 6 }, (_, w) => ({ week: day(-7 * (5 - w) - 1), size: 180 + Math.round(r() * 120),
        weeks: [1, 2, 3, 4].map((k) => (k > 5 - w ? null : Math.round((48 - k * 8 + r() * 6) * 10) / 10)) })),
      education: [["D4/S1", 2810], ["SMA/SMK", 820], ["D3", 610], ["S2", 410], ["S3", 22]].map(([key, n]) => ({ key, n })),
      provinces: [["Jawa Barat", 820], ["Jawa Timur", 640], ["Jawa Tengah", 590], ["DKI Jakarta", 410], ["Sumatera Utara", 280], ["Sulawesi Selatan", 240], ["Banten", 210], ["Riau", 160]].map(([key, n]) => ({ key, n })),
    },
    learning: {
      attempts: sum("attempts"),
      attemptsByType: [
        { type: "diagnostic", n: Math.round(sum("attempts") * 0.6), avgTotal: 352.4, passPct: 31.2, avgTwk: 78.5, avgTiu: 86.1, avgTkp: 187.8 },
        { type: "akbar", n: Math.round(sum("attempts") * 0.3), avgTotal: 338.9, passPct: 24.6, avgTwk: 72.3, avgTiu: 79.4, avgTkp: 187.2 },
        { type: "skb", n: Math.round(sum("attempts") * 0.1), avgTotal: null, passPct: null, avgTwk: null, avgTiu: null, avgTkp: null },
      ],
      practice: sum("practice"), practiceAccPct: 63.7, practiceUsers: 1720,
      topicsWeak: topics.map(([topicId, name, subtest, pct]) => ({ topicId, name, subtest, n: 900 + Math.round(r() * 2000), pct })),
      topicsStrong: [],
      akbar: [
        { eventId: "AK-20261122", packageId: "AKBAR-01", title: "Tryout Akbar 1", opensAt: "2026-11-22", status: "upcoming", joined: 0, ranked: 0, avg: null, top: null, passPct: null },
        { eventId: "AK-20261115", packageId: "AKBAR-00", title: "Tryout Akbar uji", opensAt: "2026-11-15", status: "published", joined: 842, ranked: 815, avg: 341.6, top: 498, passPct: 26.4 },
      ],
      skd: { n: 46, passPct: 67.4, avgTotal: 368.2 },
    },
    daily,
    ops: {
      health: { warnings: 2, report: ["✅ Script Property SPREADSHEET_ID terisi", "✅ Paket live: diagnostic 3, akbar 8, latihan 20, skb 1", "⚠️ Pembayaran: sandbox (ganti ke https://api.mayar.id saat rilis)", "✅ Pemicu dailyOps", "⚠️ Pemicu sendReminders belum ada — jalankan installReminderTrigger", "", "2 hal perlu dicek."] },
      errors24h: { total: 7, server: 1, client: 6, top: [{ key: "client · tryout.html · Failed to fetch", n: 4 }, { key: "server · startPractice · Service invoked too many times", n: 1 }] },
      webhook: { last: new Date(Date.now() - 42 * 60e3).toISOString(), count7: 61, problems7: 0 },
      reminders: { sent7: 1240, failed7: 3 }, lastBackup: day(0),
    },
  };
}

export function mockAdminTransactions({ from, to, status } = {}) {
  const items = trxList(rng(7), 140).filter((t) => {
    const d = (t.paidAt || t.createdAt).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to) && (!status || t.status === status);
  });
  return { from: from || day(-29), to: to || day(0), total: items.length, truncated: false, items };
}

export function mockAdminLookup({ q } = {}) {
  q = String(q || "").trim().toLowerCase();
  if (q.length < 3) { const e = new Error("Ketik minimal 3 huruf email atau nama."); e.code = "BAD_REQUEST"; throw e; }
  const all = NAMES.map((n, i) => ({ userId: "u" + i, email: `${n.toLowerCase()}@contoh.id`, name: n + " Uji", plan: i % 3 ? "free" : "premium", createdAt: day(-i * 4) }));
  const list = all.filter((u) => u.email.includes(q) || u.name.toLowerCase().includes(q));
  const one = list.length === 1 ? list[0] : list.find((u) => u.email === q);
  const detail = one && {
    ...one, premiumUntil: one.plan === "premium" ? day(40) : "", lastLoginAt: day(0), refCode: "AJAK" + one.userId.toUpperCase(),
    profile: { education: "D4/S1", major: "Akuntansi", province: "Jawa Barat", formation: "Analis Keuangan", testDate: day(30) },
    attempts: [{ packageId: "DIAG-02", type: "diagnostic", total: 372, passedAll: true, submittedAt: day(-2) }, { packageId: "DIAG-01", type: "diagnostic", total: 318, passedAll: false, submittedAt: day(-12) }],
    attemptsTotal: 2, practice: { answers: 640, last: day(0), accPct: 66.2 },
    transactions: trxList(rng(3), 2).map((t) => ({ ...t, email: one.email })), referrals: { invited: 3, rewarded: 1 },
    skd: null,
  };
  return { total: list.length, list, detail: detail || null };
}
