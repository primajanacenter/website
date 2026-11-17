/**
 * mock-affiliate.js: data contoh Program Affiliate untuk mode uji (USE_MOCK = true).
 * Aturan sebenarnya ada di server (Affiliate.gs); di sini hanya cukup untuk mencoba tampilan.
 */
const PROGRAM = { ratePct: 20, minPayout: 100000, fee: 3000, holdDays: 7, windowDays: 90,
  providers: { bank: ["BCA", "BRI", "BNI", "Mandiri", "BSI", "Bank lain"], ewallet: ["DANA", "OVO", "GoPay", "ShopeePay"] } };
const day = 86400e3;
const iso = (ms) => new Date(ms).toISOString();
const mask = (s) => (String(s).length <= 4 ? s : "•".repeat(String(s).length - 4) + String(s).slice(-4));

function sampleCommissions(now) {
  const rows = [[75000 * 0.9, "premium", 1], [85000, "skb", 2], [30000 * 0.9, "premium", 9], [150000 * 0.9, "premium", 12], [85000, "skb", 15], [75000 * 0.9, "premium", 20]];
  return rows.map(([amount, kind, ago], i) => ({ id: "com_" + i, at: iso(now - ago * day), kind, product: kind === "skb" ? "Premium SKB 1 bulan" : "Premium", amount, ratePct: 20,
    commission: Math.floor(amount * 0.2), availableAt: iso(now - ago * day + 7 * day), state: "" }));
}

export function mockAffiliate(action, p, { store, apiError }) {
  const now = Date.now();
  const st = store.get("mock.aff", null) || { status: "none", code: "SCDEMO77", payment: null, coms: [], payouts: [], appliedAt: "" };
  const save = () => store.set("mock.aff", st);
  const states = () => st.coms.forEach((c) => {
    if (c.state === "paid" || c.state === "void" || c.state === "requested") return;
    c.state = new Date(c.availableAt).getTime() <= now ? "available" : "holding";
  });
  const stats = () => {
    states();
    const s = { count: 0, sales: 0, total: 0, holding: 0, available: 0, requested: 0, paid: 0, voided: 0, referred: 9, buyers: 4 };
    st.coms.forEach((c) => { if (c.state === "void") { s.voided += c.commission; return; } s.count++; s.sales += c.amount; s.total += c.commission; s[c.state] += c.commission; });
    return s;
  };
  const pay = (x) => {
    const accountNo = String(x.accountNo || "").replace(/\D/g, "");
    if (!x.provider || accountNo.length < 6 || String(x.accountName || "").trim().length < 3) throw apiError("BAD_REQUEST", "Lengkapi data rekening.");
    return { method: x.method === "ewallet" ? "ewallet" : "bank", provider: x.provider, accountNo, accountName: x.accountName.trim(), phone: x.phone || (st.payment && st.payment.phone) || "" };
  };
  const publicPay = () => st.payment && { ...st.payment, accountMasked: mask(st.payment.accountNo), accountNo: undefined };

  switch (action) {
    case "getAffiliate": {
      const out = { program: PROGRAM, code: st.code, status: st.status };
      if (st.status === "none") return out;
      const s = stats(); save();
      const open = st.payouts.some((x) => x.status === "requested");
      return { ...out, ratePct: 20, appliedAt: st.appliedAt, adminNote: st.note || "", payment: publicPay(), stats: s,
        commissions: st.coms.slice().reverse(), payouts: st.payouts.slice().reverse().map((x) => ({ ...x, accountMasked: mask(x.accountNo) })),
        canRequest: st.status === "approved" && !open && s.available >= PROGRAM.minPayout, openRequest: open };
    }
    case "applyAffiliate":
      if (!p.agree) throw apiError("BAD_REQUEST", "Setujui ketentuan program affiliate terlebih dahulu.");
      st.payment = { ...pay(p), channel: p.channel, name: p.name };
      st.status = "pending"; st.appliedAt = iso(now); save();
      return { status: "pending" };
    case "updateAffiliatePayment":
      st.payment = { ...st.payment, ...pay(p) }; save();
      return { updated: true };
    case "requestPayout": {
      const s = stats();
      if (s.available < PROGRAM.minPayout) throw apiError("BAD_REQUEST", "Saldo tersedia minimal Rp100.000 untuk dicairkan.");
      const id = "po_" + now;
      st.coms.forEach((c) => { if (c.state === "available") { c.state = "requested"; c.payoutId = id; } });
      const row = { id, status: "requested", gross: s.available, fee: PROGRAM.fee, net: s.available - PROGRAM.fee, requestedAt: iso(now), processedAt: "",
        method: st.payment.method, provider: st.payment.provider, accountNo: st.payment.accountNo, accountName: st.payment.accountName, paidVia: "", refNo: "", note: "" };
      st.payouts.push(row); save();
      return { ...row, accountMasked: mask(row.accountNo) };
    }
    case "adminAffiliates": {
      const s = st.status === "none" ? null : stats();
      const me = st.status === "none" ? [] : [{ userId: "me", name: st.payment.name || "Pengguna uji", email: "kamu@contoh.id", phone: st.payment.phone, status: st.status, code: st.code,
        ratePct: 20, customRate: false, channel: st.payment.channel, method: st.payment.method, provider: st.payment.provider, accountNo: st.payment.accountNo,
        accountName: st.payment.accountName, appliedAt: st.appliedAt, approvedAt: "", adminNote: st.note || "", referred: 9, stats: s }];
      const demo = { userId: "demo1", name: "Rizky Pratama", email: "rizky@contoh.id", phone: "081200001111", status: "approved", code: "SCRIZKY2", ratePct: 25, customRate: true,
        channel: "IG @cpns.harian", method: "bank", provider: "BCA", accountNo: "1234567890", accountName: "Rizky Pratama", appliedAt: iso(now - 40 * day), approvedAt: iso(now - 39 * day),
        adminNote: "", referred: 31, stats: { count: 14, sales: 1120000, total: 280000, holding: 42000, available: 61000, requested: 0, paid: 177000, voided: 0 } };
      const affs = [...me, demo];
      return { program: PROGRAM, affiliates: affs,
        totals: { affiliates: affs.filter((a) => a.status === "approved").length, pending: affs.filter((a) => a.status === "pending").length, paidThisMonth: 174000, feesCollected: 3000,
          sales: 1120000 + (s ? s.sales : 0), total: 280000 + (s ? s.total : 0), holding: 42000 + (s ? s.holding : 0), available: 61000 + (s ? s.available : 0) },
        payouts: st.payouts.slice().reverse().map((x) => ({ ...x, userId: "me", name: st.payment.name, email: "kamu@contoh.id", phone: st.payment.phone, count: 3 })),
        commissions: st.coms.slice().reverse().map((c) => ({ ...c, affiliateId: "me", affiliateName: st.payment.name, trxId: "trx_demo_" + c.id, note: c.note || "" })) };
    }
    case "adminAffiliateAction": {
      const a = p.action;
      if (a === "approve") { st.status = "approved"; st.note = ""; if (!st.coms.length) st.coms = sampleCommissions(now); }
      else if (a === "reject") { st.status = "rejected"; st.note = p.note; }
      else if (a === "suspend") { st.status = "suspended"; st.note = p.note; }
      else if (a === "reactivate") st.status = "approved";
      save();
      return { userId: p.userId, status: st.status, ratePct: 20 };
    }
    case "adminPayoutAction": {
      const x = st.payouts.find((y) => y.id === p.payoutId);
      if (!x || x.status !== "requested") throw apiError("ALREADY_DONE", "Pencairan ini sudah diproses.");
      if (p.action === "paid") { Object.assign(x, { status: "paid", processedAt: iso(now), paidVia: p.paidVia || "bank", refNo: p.refNo || "" }); st.coms.forEach((c) => { if (c.payoutId === x.id) c.state = "paid"; }); }
      else { if (!p.note) throw apiError("BAD_REQUEST", "Tulis alasan penolakan."); Object.assign(x, { status: "rejected", processedAt: iso(now), note: p.note }); st.coms.forEach((c) => { if (c.payoutId === x.id) { c.state = ""; c.payoutId = ""; } }); }
      save();
      return x;
    }
    case "adminCommissionVoid": {
      const c = st.coms.find((y) => y.id === p.commissionId);
      if (!p.note) throw apiError("BAD_REQUEST", "Tulis alasan pembatalan komisi.");
      if (c) { c.state = "void"; c.note = p.note; save(); }
      return { id: p.commissionId, state: "void" };
    }
    default:
      throw apiError("UNKNOWN_ACTION", action);
  }
}
