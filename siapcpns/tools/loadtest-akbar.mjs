#!/usr/bin/env node
/**
 * Uji beban Tryout Akbar (Fase 7) — jalankan dari komputer sendiri, BUKAN dari browser.
 *
 *   node tools/loadtest-akbar.mjs <URL_WEB_APP_/exec> <LOADTEST_TOKEN> [langkah konkurensi] [detik per langkah]
 *   contoh: node tools/loadtest-akbar.mjs https://script.google.com/macros/s/XXX/exec rahasia 5,10,20,30 30
 *
 * Action "loadProbe" meniru biaya satu permintaan peserta (baca soal dari cache, cari 1 baris,
 * tulis 1 baris di bawah lock). Isi Script Property LOADTEST_TOKEN sebelum uji dan KOSONGKAN setelahnya.
 * Butuh Node.js 18+ (fetch bawaan). Token tidak pernah disimpan di repo.
 */
const [url, key, stepsArg = "5,10,20,30", secArg = "30"] = process.argv.slice(2);
if (!url || !key) {
  console.error("Pemakaian: node tools/loadtest-akbar.mjs <URL /exec> <LOADTEST_TOKEN> [5,10,20,30] [30]");
  process.exit(1);
}
const steps = stepsArg.split(",").map(Number).filter(Boolean);
const seconds = Number(secArg) || 30;

async function probe(id) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "loadProbe", payload: { key, probeId: id } }),
      redirect: "follow",
    });
    const ms = performance.now() - t0;
    if (!res.ok) return { ok: false, ms, code: "HTTP_" + res.status };
    const j = await res.json();
    return j.ok ? { ok: true, ms } : { ok: false, ms, code: j.error?.code || "ERR" };
  } catch (e) {
    return { ok: false, ms: performance.now() - t0, code: "NETWORK" };
  }
}

const pct = (arr, p) => (arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0);

console.log(`Uji beban: ${steps.join(" → ")} pengguna serentak, ${seconds} detik per langkah\n`);
console.log("serentak | permintaan | sukses | gagal | p50 (ms) | p95 (ms) | req/detik | kode galat");
const summary = [];
for (const n of steps) {
  const until = Date.now() + seconds * 1000;
  const results = [];
  await Promise.all(Array.from({ length: n }, async (_, w) => {
    let i = 0;
    while (Date.now() < until) results.push(await probe(`w${w}-${i++}`));
  }));
  const ok = results.filter((r) => r.ok);
  const codes = {};
  results.filter((r) => !r.ok).forEach((r) => (codes[r.code] = (codes[r.code] || 0) + 1));
  const row = { n, total: results.length, ok: ok.length, fail: results.length - ok.length, p50: Math.round(pct(ok.map((r) => r.ms), 0.5)), p95: Math.round(pct(ok.map((r) => r.ms), 0.95)), rps: +(results.length / seconds).toFixed(1), codes };
  summary.push(row);
  console.log(`${String(n).padStart(8)} | ${String(row.total).padStart(10)} | ${String(row.ok).padStart(6)} | ${String(row.fail).padStart(5)} | ${String(row.p50).padStart(8)} | ${String(row.p95).padStart(8)} | ${String(row.rps).padStart(9)} | ${JSON.stringify(codes)}`);
  if (row.fail / Math.max(1, row.total) > 0.2) { console.log("\nGalat > 20%: uji dihentikan."); break; }
}
const safe = summary.filter((r) => r.fail / Math.max(1, r.total) <= 0.01 && r.p95 < 5000).pop();
console.log("\nKapasitas aman (galat ≤ 1% dan p95 < 5 detik):", safe ? `${safe.rps} permintaan/detik pada ${safe.n} serentak` : "belum tercapai pada langkah terkecil");
if (safe) {
  // Peserta ±12 simpan + 1 mulai + 1 kirim per 100 menit ≈ 14 permintaan / 6000 detik
  const perUserRps = 14 / 6000;
  console.log(`Perkiraan peserta yang mengerjakan BERSAMAAN: ± ${Math.floor((safe.rps * 0.6) / perUserRps).toLocaleString("id-ID")} (margin 40%).`);
}
