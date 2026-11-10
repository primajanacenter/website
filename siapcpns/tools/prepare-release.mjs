#!/usr/bin/env node
/**
 * Persiapan rilis (Fase 9) — jalankan dari root repo sebelum peluncuran:
 *
 *   node tools/prepare-release.mjs https://siapcpns.primajana.id          # cek + tulis sitemap/robots
 *   node tools/prepare-release.mjs https://siapcpns.primajana.id --check  # cek saja, tanpa menulis file
 *
 * Yang dilakukan:
 *  1. Membuat sitemap.xml dan robots.txt untuk halaman publik.
 *  2. Mengubah og:image/og:url menjadi alamat lengkap (dibutuhkan WhatsApp, Facebook, X untuk pratinjau tautan).
 *  3. Memeriksa hal yang sering terlupa: USE_MOCK, URL Apps Script, Client ID, placeholder [..] di Privasi/Syarat,
 *     berkas rahasia yang tidak boleh ada di repo, dan ukuran gambar.
 * Keluar dengan kode 1 bila ada PENGHALANG (blocker). Butuh Node.js 18+.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [domainArg, flag] = process.argv.slice(2);
if (!domainArg || !/^https:\/\/[a-z0-9.-]+(\/[^\s]*)?$/i.test(domainArg)) {
  console.error("Pemakaian: node tools/prepare-release.mjs https://domain-kamu [--check]");
  process.exit(1);
}
const BASE = domainArg.replace(/\/+$/, "");
const WRITE = flag !== "--check";
const ROOT = process.cwd();
const blockers = [], warnings = [], done = [];

// Halaman publik yang boleh diindeks mesin pencari
const PUBLIC = [
  { path: "", file: "index.html", prio: "1.0", freq: "weekly" },
  { path: "pages/panduan.html", file: "pages/panduan.html", prio: "0.9", freq: "monthly" },
  { path: "pages/materi.html", file: "pages/materi.html", prio: "0.8", freq: "weekly" },
  { path: "pages/akbar.html", file: "pages/akbar.html", prio: "0.8", freq: "weekly" },
  { path: "pages/skb.html", file: "pages/skb.html", prio: "0.7", freq: "monthly" },
  { path: "pages/premium.html", file: "pages/premium.html", prio: "0.7", freq: "monthly" },
  { path: "pages/privasi.html", file: "pages/privasi.html", prio: "0.3", freq: "yearly" },
  { path: "pages/syarat.html", file: "pages/syarat.html", prio: "0.3", freq: "yearly" },
];

const read = (f) => readFileSync(join(ROOT, f), "utf8");
if (!existsSync(join(ROOT, "index.html"))) {
  console.error("Jalankan dari folder root repo (yang berisi index.html).");
  process.exit(1);
}

/* ---------- 1. sitemap & robots ---------- */
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC.map((p) => `  <url><loc>${BASE}/${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.prio}</priority></url>`).join("\n")}
</urlset>
`;
const robots = `User-agent: *
Allow: /
Disallow: /backend/
Disallow: /tools/
Disallow: /docs/

Sitemap: ${BASE}/sitemap.xml
`;
if (WRITE) {
  writeFileSync(join(ROOT, "sitemap.xml"), sitemap);
  writeFileSync(join(ROOT, "robots.txt"), robots);
  done.push(`sitemap.xml (${PUBLIC.length} halaman) & robots.txt ditulis`);
}

/* ---------- 2. og:image / og:url absolut ---------- */
let ogFixed = 0;
for (const p of PUBLIC) {
  let html = read(p.file);
  const before = html;
  if (!/<meta property="og:image"/.test(html)) {
    const t = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "Siap CPNS";
    html = html.replace(/(<meta name="description"[^>]*>)/, `$1\n  <meta property="og:title" content="${t}">\n  <meta property="og:type" content="website">\n  <meta property="og:image" content="assets/img/og-image.png">`);
  }
  html = html.replace(/(<meta property="og:image" content=")(?:\.\.\/|\.\/)?(?:https?:\/\/[^"]*?\/)?(assets\/img\/[^"]+)(")/, `$1${BASE}/$2$3`);
  const url = `${BASE}/${p.path}`;
  if (/<meta property="og:url"/.test(html)) html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  else html = html.replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${url}">`);
  if (!/<link rel="canonical"/.test(html)) html = html.replace(/(<meta property="og:url"[^>]*>)/, `$1\n  <link rel="canonical" href="${url}">`);
  else html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  if (html !== before) { ogFixed++; if (WRITE) writeFileSync(join(ROOT, p.file), html); }
  if (!/<meta name="description"/.test(html)) warnings.push(`${p.file}: belum ada meta description`);
}
if (ogFixed) done.push(`${ogFixed} halaman: og:image/og:url/canonical memakai ${BASE}${WRITE ? "" : " (mode --check, tidak ditulis)"}`);

/* ---------- 3. Pemeriksaan ---------- */
const cfg = read("assets/js/core/config.js");
const val = (k) => (cfg.match(new RegExp(`${k}:\\s*("?)([^",\\n]*)\\1`)) || [])[2];
if (/USE_MOCK:\s*true/.test(cfg)) blockers.push("config.js: USE_MOCK masih true (aplikasi memakai data contoh)");
if (!val("APPS_SCRIPT_URL") || !/\/exec$/.test(val("APPS_SCRIPT_URL"))) blockers.push("config.js: APPS_SCRIPT_URL kosong / tidak berakhiran /exec");
if (!/\.apps\.googleusercontent\.com/.test(val("GOOGLE_CLIENT_ID") || "")) blockers.push("config.js: GOOGLE_CLIENT_ID belum diisi");
done.push(`config.js versi ${val("APP_VERSION") || "?"}`);

for (const f of ["pages/privasi.html", "pages/syarat.html"]) {
  const ph = [...new Set((read(f).match(/\[[a-zA-Z][^\]<]{2,60}\]/g) || []))];
  if (ph.length) blockers.push(`${f}: placeholder belum diisi → ${ph.join(", ")}`);
}

// Berkas yang tidak boleh ikut ter-publish
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    if (n === ".git" || n === "node_modules") continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push({ p: p.slice(ROOT.length + 1), size: st.size });
  }
  return out;
};
const all = walk(ROOT);
const forbidden = all.filter((f) => /(^|\/)\.clasp(rc)?\.json$|\.env$|(^|\/)(AKBAR|DIAG|LAT|SKB)-[0-9A-Z-]+.*\.xlsx$|MATERI.*\.xlsx$|service-account.*\.json$/i.test(f.p));
forbidden.forEach((f) => blockers.push(`Berkas rahasia/kunci jawaban ada di repo: ${f.p}`));
const secretHits = all.filter((f) => /\.(js|mjs|gs|html|json|md)$/.test(f.p) && f.size < 2e6 && f.p !== "tools/prepare-release.mjs")
  .filter((f) => /eyJ[a-zA-Z0-9_-]{30,}|sk_live_|MAYAR_API_KEY\s*[:=]\s*['"][A-Za-z0-9._-]{16,}/.test(readFileSync(join(ROOT, f.p), "utf8")));
secretHits.forEach((f) => blockers.push(`Kemungkinan rahasia tertulis di ${f.p}`));

const bigImg = all.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.p) && f.size > 150 * 1024);
bigImg.forEach((f) => warnings.push(`Gambar besar (${Math.round(f.size / 1024)} KB): ${f.p}`));

if (!existsSync(join(ROOT, "CNAME"))) warnings.push("Tidak ada file CNAME (diperlukan GitHub Pages untuk domain sendiri)");
else {
  const cname = read("CNAME").trim();
  if (!BASE.includes(cname)) warnings.push(`CNAME berisi "${cname}", berbeda dengan ${BASE}`);
}

/* ---------- Laporan ---------- */
console.log(`\nPersiapan rilis untuk ${BASE}\n`);
done.forEach((d) => console.log("✅ " + d));
warnings.forEach((w) => console.log("⚠️  " + w));
blockers.forEach((b) => console.log("⛔ " + b));
console.log(`\n${blockers.length ? blockers.length + " PENGHALANG harus diselesaikan sebelum rilis." : "Tidak ada penghalang."}${warnings.length ? " " + warnings.length + " peringatan." : ""}`);
console.log("Lanjutkan dengan checklist di docs/peluncuran.md (healthCheck di Apps Script, Mayar production, dll.).\n");
process.exit(blockers.length ? 1 : 0);
