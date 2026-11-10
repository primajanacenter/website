# Panduan setup Fase 9: Siap Rilis & Operasional

Lanjutan dari Fase 8. Perkiraan waktu sekitar 20 menit. Checklist peluncuran lengkap ada di [`peluncuran.md`](peluncuran.md).

## Isi Fase 9

| Fitur | Di mana | Keterangan |
|---|---|---|
| **Dasbor admin** | sheet `admin_dashboard` di Spreadsheet database | Pengguna (baru/aktif), Premium aktif, konversi, pendapatan hari ini/7/30 hari/total, transaksi per paket, diskon ajakan, tryout & latihan, skor SKD, ajak teman, 5 event Akbar terakhir, galat 24 jam. Hanya angka, tanpa email/nama. |
| **Riwayat harian** | sheet `metrics_daily` | Satu baris per hari, cocok untuk membuat grafik di Google Sheets (Sisipkan › Diagram). |
| **Backup otomatis** | folder Drive `BACKUP_FOLDER_ID` | Salinan Spreadsheet database setiap hari. Backup lebih dari 14 hari dipindah ke Sampah. |
| **Catatan galat** | sheet `error_log` | Galat server (otomatis) dan galat JavaScript di browser pengguna (maksimal 3 per halaman, 30 per menit, 300 per hari). |
| **Email ringkasan harian** | `ADMIN_EMAIL` | Dikirim sekitar 05.00 WIB. Berisi angka utama, galat terbanyak, dan status backup. |
| **healthCheck** | jalankan dari editor | Memeriksa Script Properties, sheet, paket soal, jadwal Akbar, pemicu, galat 24 jam, mode Mayar, dan sisa `LOADTEST_TOKEN`. |
| **Hapus data pengguna** | `adminDeleteUser` | Menangani permintaan penghapusan data sesuai UU PDP. |
| **SEO** | semua halaman + `tools/prepare-release.mjs` | Meta description & Open Graph, `sitemap.xml`, `robots.txt`, alamat lengkap og:image/canonical. |
| **Kecepatan** | `assets/img/primajana-logo-112.png` | Logo footer 96 KB diganti 4 KB, dipakai di semua halaman. |

## 1. Perbarui Apps Script

- Baru: `Ops.gs`
- Berubah: `Db.gs`, `Router.gs`

```bash
cd backend/apps-script && clasp push
```

1. Jalankan **`setupSheets`**. Fungsi ini menambahkan sheet `error_log` dan `metrics_daily`.
2. Buat folder baru di Google Drive, misalnya "Backup Siap CPNS". Jangan bagikan folder ini, karena isinya data pengguna. Salin ID folder dari URL (`/folders/`**`ID`**), lalu tambahkan Script Properties:
   - **`BACKUP_FOLDER_ID`** = ID folder tadi.
   - **`ADMIN_EMAIL`** = email penerima ringkasan harian (opsional).
3. Jalankan **`dailyOps`** satu kali.
   - Google akan meminta izin baru: kirim email (MailApp) dan membuat salinan file Drive. Setujui.
   - Hasilnya: sheet `admin_dashboard` terbentuk, ada backup pertama di folder, dan email ringkasan terkirim.
4. Jalankan **`installOpsTrigger`** (sekali). Pemicu `dailyOps` akan berjalan setiap hari sekitar 05.00 WIB.
5. Jalankan **`healthCheck`**. Semua baris sebaiknya ✅. Baris ⚠️ menyebutkan fungsi yang perlu dijalankan.
6. **Deploy › Manage deployments › Edit › New version**. Langkah ini wajib agar galat server tercatat dan action `logClientError` aktif.

> Mengubah dasbor: sheet `admin_dashboard` ditulis ulang setiap pagi, jadi jangan menambah catatan di sana. Kalau ingin grafik, buat di sheet terpisah yang membaca `metrics_daily`.

## 2. Perbarui frontend

Ekstrak `siap-cpns-fase9-update.zip` ke root repo. File `config.js` tidak disertakan. Ubah `APP_VERSION` menjadi `"0.9.0"`.

Pelaporan galat browser otomatis aktif saat `USE_MOCK: false` dan `APPS_SCRIPT_URL` terisi. Di mode uji, pelaporan tidak aktif.

```bash
git add . && git commit -m "Fase 9: operasional & siap rilis" && git push
git tag v0.9-siap-rilis && git push --tags
```

## 3. Siapkan SEO (setelah domain final)

Dari root repo:

```bash
node tools/prepare-release.mjs https://domain-kamu --check   # periksa dulu
node tools/prepare-release.mjs https://domain-kamu           # tulis sitemap.xml, robots.txt, og:url/canonical
```

Tool ini berhenti dengan daftar **⛔ PENGHALANG** bila ada yang belum siap, misalnya:
- `USE_MOCK` masih `true`, atau URL Apps Script/Client ID kosong.
- Placeholder `[..]` di Privasi/Syarat belum diisi.
- Ada file kunci jawaban (.xlsx) atau rahasia di repo.

Setelah tidak ada penghalang, commit `sitemap.xml` dan `robots.txt`. Daftarkan sitemap di Google Search Console (Properti domain › Sitemaps › `https://domain-kamu/sitemap.xml`).

## 4. Menangani permintaan hapus data

1. Pastikan email peminta sama dengan email akun Google yang dipakai di aplikasi.
2. Buka `Ops.gs` › `adminDeleteUser`, lalu isi `EMAIL`.
3. Jalankan dengan `DRY_RUN = true`. Log menampilkan jumlah data per sheet.
4. Ubah ke `DRY_RUN = false`, lalu jalankan lagi.
   - Dihapus: profil, hasil Cek Kesiapan, jawaban latihan, skor SKD, attempt tryout, hasil Akbar, dan data ajakan sebagai teman.
   - Dianonimkan: baris `users` (email/nama/foto) dan email di `transactions`. Catatan transaksi tetap disimpan untuk keperluan keuangan.
5. Jika orang itu ikut event Akbar yang sudah terbit, jalankan `adminRepublishAkbar` untuk event tersebut agar namanya hilang dari papan peringkat.
6. Balas permintaan sesuai tenggat yang tertulis di Kebijakan Privasi.

Jika orang yang sama masuk lagi dengan Google, sistem membuat akun baru yang kosong.

## 5. Uji

1. Buka aplikasi (mode backend). Di konsol browser, jalankan `setTimeout(() => { throw new Error("uji galat") })`. Dalam beberapa detik, baris `client` muncul di `error_log`.
2. Jalankan `dailyOps`. Pastikan dasbor terisi, backup muncul, dan email masuk.
3. Jalankan `healthCheck` dan pastikan hasilnya "Semua pemeriksaan lolos" (setelah Mayar production di hari rilis).
