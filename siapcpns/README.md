# Siap CPNS · oleh Primajana

Aplikasi persiapan belajar CPNS untuk pemula. Dibangun bertahap dengan HTML, CSS, dan JavaScript murni (ES modules, tanpa proses build), backend Google Apps Script, database Google Spreadsheet, dan pembayaran Mayar.id.

> Aplikasi independen, tidak berafiliasi dengan BKN, KemenPANRB, maupun instansi pemerintah mana pun.

**Status: Fase 0–3 selesai** — landing page, Cek Kesiapan, Panduan CPNS, login Google, onboarding, beranda, tryout CAT (timer server, simpan otomatis, panel nomor soal) dan rapor per subtes & topik.

➡️ Setup backend: [`docs/setup-fase-2.md`](docs/setup-fase-2.md) lalu [`docs/setup-fase-3.md`](docs/setup-fase-3.md) (bank soal & paket tryout).

---

## Struktur folder

```
├── index.html                 Landing + Cek Kesiapan
├── 404.html
├── pages/                     Halaman lain (panduan.html sudah jadi, sisanya "segera hadir")
├── assets/
│   ├── css/                   base.css (token), components.css, pages/
│   ├── js/core/               config, api (mock), auth, store, ui
│   ├── js/features/           satu file per fitur
│   ├── data/                  HANYA data publik (assessment.json, features.json)
│   └── img/
├── backend/apps-script/       Kode Apps Script (tanpa rahasia)
└── docs/                      api-contract, sheet-schema, user-flow
```

## Menjalankan di komputer

ES modules dan `fetch()` **tidak jalan** jika file dibuka langsung (`file://`). Jalankan server lokal dari folder ini:

```bash
# pilih salah satu
npx serve .
python3 -m http.server 8080
```

Lalu buka `http://localhost:8080` (atau port yang ditampilkan). Di VS Code bisa juga pakai ekstensi **Live Server**.

## Upload ke GitHub

```bash
git init
git add .
git commit -m "Fase 0-1: fondasi, landing, cek kesiapan, panduan"
git branch -M main
git remote add origin https://github.com/<username>/<nama-repo>.git
git push -u origin main
```

Setelah repo dibuat, aktifkan di **Settings → Code security**:
- Secret scanning
- Push protection

Dan di **Settings → Branches**: tambahkan branch protection untuk `main`.

## Deploy

**Cloudflare Pages (disarankan untuk aplikasi berbayar)**
1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → pilih repo ini.
2. Framework preset: **None**. Build command: *(kosong)*. Output directory: `/`.
3. Custom domains → tambahkan domain Anda, ikuti petunjuk DNS.

**GitHub Pages (alternatif)**
1. Settings → Pages → Source: *Deploy from a branch* → `main` / root.
2. Custom domain → isi domain Anda (GitHub akan membuat file `CNAME`).
3. Catatan: kebijakan GitHub Pages tidak mengizinkan situs yang tujuan utamanya transaksi komersial/SaaS. Pertimbangkan pindah ke Cloudflare Pages sebelum fitur berbayar aktif.

> Semua tautan di halaman memakai path relatif, jadi situs juga berjalan di `username.github.io/nama-repo/`. Hanya `404.html` yang memakai path absolut (berjalan benar di domain sendiri).

## Konfigurasi

Edit `assets/js/core/config.js`:

| Kunci | Kapan diisi | Keterangan |
|---|---|---|
| `APP_NAME`, `APP_SHORT` | Sekarang | Nama aplikasi (juga ganti di `<title>` tiap halaman) |
| `WAITLIST_URL` | Opsional | Link Google Form daftar tunggu, muncul di halaman "segera hadir" |
| `USE_MOCK` | Fase 2 → `false` | `true` = data contoh tanpa backend |
| `APPS_SCRIPT_URL` | Fase 2 | URL Web App (`…/exec`) |
| `GOOGLE_CLIENT_ID` | Fase 2 | OAuth Client ID untuk Google Sign-In |

**Identitas lembaga:** logo Primajana ada di `assets/img/` (`primajana-logo.png` lengkap, `primajana-mark.png` ikon saja, favicon, `apple-touch-icon.png`, `icon-192/512.png` untuk `manifest.webmanifest`, dan `og-image.png` untuk pratinjau tautan). Nama lembaga diatur di `ORG_NAME` pada `config.js`.

Setelah domain aktif, ubah `og:image` di `index.html` menjadi URL lengkap (misalnya `https://domainanda.id/assets/img/og-image.png`) agar pratinjau di WhatsApp dan media sosial tampil.

Warna dan font diatur di bagian `:root` file `assets/css/base.css` (palet institusional navy + emas).

**Pedoman tampilan:** antarmuka latihan memakai pola ujian CAT yang umum (panel nomor soal, ragu-ragu, penunjuk waktu) agar pengguna terbiasa. Jangan memakai logo, lambang, nama, atau tampilan persis situs resmi BKN/SSCASN, dan pertahankan bilah "Aplikasi latihan independen" di setiap halaman. Pengguna tidak boleh mengira aplikasi ini situs resmi.

Soal Cek Kesiapan, bobot nilai, level, dan rekomendasi diatur di `assets/data/assessment.json` (tanpa perlu mengubah kode).

## Checklist keamanan (repo publik)

**Boleh di repo:** HTML/CSS/JS, `config.js` (URL Web App & OAuth Client ID memang publik), data publik, kode Apps Script tanpa rahasia, dokumentasi.

**DILARANG di repo:**
- [ ] API key Mayar (sandbox maupun production)
- [ ] Token webhook
- [ ] ID Spreadsheet
- [ ] `.clasp.json` / `.clasprc.json`
- [ ] Soal tryout, kunci jawaban, pembahasan berbayar, materi premium (pengecualian: paket DEMO-01 di `backend/sample/` dan `assets/data/demo-tryout.json` memang publik)
- [ ] Data pengguna (termasuk ekspor CSV/XLSX)

Semua rahasia disimpan di **Apps Script → Project Settings → Script Properties** (lihat `backend/apps-script/Config.gs`).

Jika rahasia pernah ter-commit: **segera buat ulang (rotate)** key tersebut. Menghapus file di commit berikutnya tidak cukup, karena riwayat Git tetap menyimpannya.

## Backend

Panduan langkah demi langkah: **[`docs/setup-fase-2.md`](docs/setup-fase-2.md)** → [`setup-fase-3.md`](docs/setup-fase-3.md) → [`setup-fase-4.md`](docs/setup-fase-4.md) → [`setup-fase-5.md`](docs/setup-fase-5.md).

Panduan Fase 2 (Spreadsheet, Apps Script, Script Properties, OAuth Client ID, deploy Web App, sambungkan frontend).

Uji backend tanpa akun Google: `node backend/tests/gas-harness.test.js`.

Selama `USE_MOCK = true`, halaman Masuk menampilkan tombol "Masuk dengan akun uji" sehingga seluruh alur (login → onboarding → beranda) bisa dicoba tanpa backend.

## Tahapan

Lihat `docs/user-flow.md`. Ringkasnya: 0 Fondasi ✅ · 1 Cek Kesiapan ✅ · 2 Login & profil ✅ · 3 Tryout & rapor ✅ · 4 Produk gratis lengkap (soft launch) ✅ · 5 Pembayaran Mayar ✅ · 6 Fitur premium · 7 Tryout Akbar · 8 Pasca-SKD.

Beri tag di akhir setiap fase: `git tag v0.1-landing && git push --tags`.

## Lisensi

Belum ada file lisensi: hak cipta kode tetap milik pemilik repo, meskipun repo dapat dilihat publik. Tambahkan lisensi hanya jika Anda memang ingin mengizinkan orang lain memakai kodenya.
