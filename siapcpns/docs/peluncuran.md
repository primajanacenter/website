# Checklist peluncuran (production)

Urutkan dari atas. Centang di salinanmu sendiri. Hal bertanda ⛔ wajib selesai sebelum aplikasi diumumkan.

## A. Seminggu sebelum rilis

**Legal & konten**

- ⛔ Isi semua placeholder `[..]` di `pages/privasi.html` dan `pages/syarat.html`: tanggal berlaku, badan usaha & alamat, email kontak, jam layanan, jangka waktu tanggapan dan penghapusan data. Edit sumbernya, lalu jalankan `prepare-release`.
- ⛔ Minta orang kedua mereview seluruh paket soal yang akan live (DIAG, LAT, AKBAR, SKB) dan materi premium. Regulasi yang dikutip di SKB dan TWK harus masih berlaku.
- Cek kewajiban pendaftaran **PSE Lingkup Privat** untuk layanan digital berbayar milik badan usaha. Pendaftarannya lewat OSS / Komdigi. Konsultasikan bila ragu, karena ini bukan nasihat hukum.
- Pastikan disclaimer "Aplikasi latihan independen, bukan situs resmi BKN/KemenPANRB" tampil di semua halaman (sudah ada di header).

**Pembayaran (Mayar)**

- ⛔ Akun Mayar production sudah terverifikasi (KYC) dan rekening pencairan sudah diatur.
- ⛔ Script Properties: `MAYAR_BASE_URL` = `https://api.mayar.id`, dan `MAYAR_API_KEY` diganti dengan API key **production**.
- ⛔ Buat `WEBHOOK_TOKEN` baru (`generateWebhookToken`), lalu jalankan `registerMayarWebhook`.
- Uji satu pembelian sungguhan dengan nominal terkecil (P1M), lalu cek: status lunas, Premium aktif, `admin_dashboard` mencatat pendapatan. Jika perlu, refund lewat dashboard Mayar.
- Cek harga di sheet `plans`, lalu jalankan `refreshPlanCache`.

**Login Google**

- ⛔ Di Google Cloud Console › OAuth consent screen: status **In production**, nama aplikasi, logo, email dukungan, serta tautan Privasi dan Syarat terisi.
- ⛔ Tambahkan domain final di *Authorized JavaScript origins* pada OAuth Client ID.
- Script Property `ALLOWED_ORIGIN` / `APP_BASE_URL` = domain final.

## B. Hari H − 1

**Frontend**

- ⛔ `assets/js/core/config.js`:
  - `USE_MOCK: false`
  - `APPS_SCRIPT_URL` = URL `/exec` deployment terbaru
  - `GOOGLE_CLIENT_ID` terisi
  - `APP_VERSION: "1.0.0"`
- ⛔ Jalankan `node tools/prepare-release.mjs https://domain-kamu` sampai tidak ada penghalang, lalu commit `sitemap.xml` dan `robots.txt`.
- Domain: file `CNAME` di root repo berisi domain, DNS sudah mengarah ke GitHub Pages, dan **Enforce HTTPS** aktif.

**Backend**

- ⛔ Deploy versi terbaru: **Deploy › Manage deployments › Edit › New version**. URL `/exec` tetap sama.
- ⛔ Jalankan `healthCheck` sampai semua ✅. Pemicu yang harus ada:
  - `reconcilePayments` (15 menit)
  - `warmQuestionCache` (per jam)
  - `publishAkbarResults` (per jam)
  - `dailyOps` (harian)
  - `sendReminders` (per jam)
- Tryout Akbar: minimal 2 event ke depan sudah terjadwal (`scheduleAkbarEvents`). `checkAkbarEvents` semuanya ✅.
- Kirim `testReminderEmails` ke `ADMIN_EMAIL`, lalu cek tampilan email dan pastikan tautan berhenti langganan berfungsi. `WEBAPP_URL` dan `APP_BASE_URL` harus terisi.
- Uji beban (`tools/loadtest-akbar.mjs`) sudah dijalankan dan `LOADTEST_TOKEN` sudah dikosongkan.
- Hapus data uji: pengguna, transaksi sandbox, attempt, dan referral uji di Spreadsheet. Buat backup dulu dengan `backupDaily`.

## C. Hari H

- Uji alur lengkap dari HP dengan akun baru:
  1. Cek Kesiapan, lalu masuk dengan Google.
  2. Onboarding, lalu beranda.
  3. Latihan 10 soal.
  4. Tryout diagnostik dan rapor.
  5. Halaman Premium, lalu bayar.
  6. Status lunas, lalu materi Lv3 terbuka.
  7. Tautan ajak teman.
- Di HP Android (Chrome), pasang aplikasi dari halaman Pengaturan. Di iPhone (Safari), pakai Bagikan › Tambahkan ke Layar Utama. Buka dari ikon, lalu matikan internet dan pastikan Materi dan Panduan tetap terbuka.
- Bagikan tautan ke WhatsApp/Telegram dan pastikan pratinjau gambar (og-image) muncul.
- Google Search Console: verifikasi domain dan kirim `sitemap.xml`.

## D. Rutin setelah rilis

| Kapan | Tugas |
|---|---|
| Setiap pagi | Baca email ringkasan. Jika ada galat server, buka `error_log` dan Apps Script › Eksekusi. |
| Setiap minggu | Cek `admin_dashboard`: tren `metrics_daily`, pembayaran pending yang menumpuk, dan peserta Akbar. |
| Setiap bulan | Unggah paket AKBAR baru dan jalankan `scheduleAkbarEvents`. Tambah bank latihan atau paket SKB bila perlu. Jalankan `healthCheck`. |
| Saat aturan CPNS baru terbit | Perbarui ambang batas (`DEFAULT_PG` di `Tryout.gs`), bobot SKD/SKB (`PostSkd.gs`), dan teks Panduan/SKB. |
| Saat ada permintaan hapus data | Ikuti bagian 4 di `setup-fase-9.md`. |
| Sebulan sekali | Uji pemulihan backup: buka salah satu file backup, lalu pastikan sheet `users`/`transactions` terbaca utuh. |

## E. Pemulihan darurat

- **Spreadsheet rusak/terhapus**:
  1. Buka folder backup dan buat salinan file backup terakhir.
  2. Ganti Script Property `SPREADSHEET_ID` dengan ID salinan itu.
  3. Jalankan `healthCheck`.

  Data sejak backup terakhir (maksimal 1 hari) perlu diperiksa ulang. Pembayaran bisa dicocokkan dari dashboard Mayar dan dipulihkan dengan `adminGrantPremium`.
- **Webhook Mayar gagal**: `reconcilePayments` tetap mengaktifkan Premium dalam 15 menit. Cek `webhook_log`.
- **Lonjakan galat setelah deploy**: kembalikan ke versi sebelumnya di Manage deployments (pilih versi lama), lalu perbaiki kodenya.
