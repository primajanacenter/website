# Panduan setup Fase 5: Pembayaran Premium (Mayar.id)

Lanjutan dari Fase 4. Estimasi ± 30 menit. Mulai di **sandbox** dulu, lalu pindah ke **production** setelah uji lengkap.

## Cara kerja singkat

1. Pengguna memilih paket di `pages/premium.html`. Frontend hanya mengirim `planId`.
2. Server membaca harga dari sheet **`plans`**, mencatat transaksi `pending`, lalu membuat *payment request* Mayar (API V2 `POST /hl/v2/payments/create`).
3. Pengguna membayar di halaman Mayar, lalu kembali ke `pages/status-bayar.html`.
4. Premium aktif **hanya** setelah server memastikan status lunas langsung ke API Mayar. Ada tiga pemicu yang saling mencadangkan:
   - webhook Mayar → isi webhook tidak dipercaya, server selalu cek ulang ke API;
   - halaman status pembayaran (cek otomatis tiap beberapa detik);
   - pemicu terjadwal `reconcilePayments` setiap 15 menit.
5. Aktivasi idempoten: satu transaksi tidak akan menambah masa premium dua kali. Pembelian saat masih aktif menambah masa aktif yang tersisa.

## 1. Siapkan akun Mayar sandbox

1. Daftar di **web.mayar.io** (sandbox).
2. Buka **https://web.mayar.io/api-keys** → buat API key bertipe **Read & Write**.
3. Jangan pernah menempel API key di kode, chat grup, atau repo.

## 2. Perbarui Apps Script

File baru/berubah: `Payment.gs`, `Webhook.gs`, `Triggers.gs`, `Router.gs`, `Db.gs`, `Setup.gs`, `Config.gs`.

```bash
cd backend/apps-script && clasp push
```

## 3. Isi Script Properties

**Project Settings › Script Properties**:

| Properti | Isi |
|---|---|
| `MAYAR_API_KEY` | API key Read & Write |
| `MAYAR_BASE_URL` | Sandbox: `https://api.mayar.io` · Production: `https://api.mayar.id` |
| `WEBHOOK_TOKEN` | Token acak panjang. Jalankan `generateWebhookToken` dan salin hasil dari log |
| `APP_BASE_URL` | Alamat situs tanpa garis miring akhir, mis. `https://siapcpns.domainmu.id` (untuk tombol kembali dari Mayar) |
| `WEBAPP_URL` | URL Web App yang berakhiran `/exec` (untuk mendaftarkan webhook) |

Lalu jalankan:

1. **`setupSheets`**: menambah sheet `plans`, `transactions`, `webhook_log`, dan mengisi 3 paket awal (P1M Rp49.000 · P3M Rp119.000 · P6M Rp179.000).
2. **`checkPaymentConfig`**: memastikan semua properti terisi (nilainya tidak ditampilkan).
3. **`installPaymentTrigger`**: memasang pengecekan otomatis setiap 15 menit.

## 4. Deploy versi baru, lalu daftarkan webhook

1. **Deploy › Manage deployments › ✏️ Edit › Version: New version › Deploy.**
2. Daftarkan webhook dengan salah satu cara:
   - Jalankan **`registerMayarWebhook`** (memakai `WEBAPP_URL` + `WEBHOOK_TOKEN`), atau
   - Dashboard Mayar › Integration › Webhook, isi: `<URL /exec>?hook=mayar&token=<WEBHOOK_TOKEN>`.

> Riwayat webhook di dashboard Mayar bisa tampil "gagal" karena Apps Script membalas dengan redirect 302. Ini aman: skrip tetap memproses webhook, dan pembayaran juga diverifikasi lewat halaman status serta `reconcilePayments`. Cek sheet `webhook_log` untuk memastikan webhook masuk.

## 5. Perbarui frontend

Ekstrak `siap-cpns-fase5-update.zip` ke root repo. `config.js` tidak disertakan. Opsional: ubah `APP_VERSION` menjadi `"0.5.0"`.

```bash
git add . && git commit -m "Fase 5: pembayaran Premium (Mayar)" && git push
git tag v0.5-pembayaran && git push --tags
```

Lengkapi bagian bertanda `[ ]` di `pages/syarat.html` (kontak layanan pelanggan, kebijakan pengembalian dana, nama dan alamat badan usaha) sebelum membuka pembayaran production. Penyedia pembayaran umumnya meminta halaman syarat, kebijakan pengembalian dana, dan kontak.

## 6. Uji di sandbox

1. Buka `premium.html` → muncul banner **Mode uji pembayaran** dan 3 paket.
2. Masuk → pilih **Premium 3 bulan** → diarahkan ke halaman bayar Mayar sandbox.
3. Selesaikan pembayaran uji di halaman Mayar.
4. Kembali ke `status-bayar.html` (otomatis bila redirect didukung, atau buka manual) → status berubah menjadi **Pembayaran berhasil, Premium aktif**.
5. Cek spreadsheet:
   - `transactions` → status `paid`, `processed` = `ya`, kolom `source` berisi `webhook` / `status-page` / `reconcile`.
   - `users` → `plan` = `premium`, `premium_until` bertambah 90 hari.
6. Uji tambahan:
   - Buat pembayaran lalu tutup halaman tanpa membayar → setelah 24 jam berstatus `expired`.
   - Beli paket kedua saat Premium aktif → masa aktif bertambah dari tanggal berakhir sebelumnya.
   - Latihan harian tidak lagi dibatasi 10 soal; rapor menampilkan semua topik dan pembahasan.

## 7. Pindah ke production

1. Selesaikan verifikasi akun di **web.mayar.id** (production) dan buat API key Read & Write baru.
2. Ganti `MAYAR_API_KEY` dan `MAYAR_BASE_URL` = `https://api.mayar.id`. Buat `WEBHOOK_TOKEN` baru.
3. Daftarkan ulang webhook untuk akun production (langkah 4.2).
4. Lakukan satu transaksi nyata nominal terkecil untuk memastikan alur berjalan.
5. Banner mode uji otomatis hilang ketika `MAYAR_BASE_URL` mengarah ke `mayar.id`.

## Mengubah harga atau paket

- Ubah langsung di sheet **`plans`** (kolom `price`, `duration_days`, `badge`, `description`). Isi `status` dengan `active` atau `inactive`.
- `price_before` (opsional) adalah harga bila membayar bulanan. Halaman Premium menampilkan selisihnya sebagai "Hemat Rp…". Jangan isi dengan harga coret yang tidak pernah berlaku.
- Jalankan **`refreshPlanCache`** agar perubahan langsung berlaku (tanpa itu, berlaku otomatis dalam 10 menit).
- Transaksi yang sudah dibuat tetap memakai harga saat dibuat.

## Fungsi admin

| Fungsi | Kegunaan |
|---|---|
| `checkPaymentConfig` | Cek properti & paket aktif |
| `reconcilePayments` | Cek ulang transaksi pending sekarang juga |
| `adminRecheckTransaction` | Cek ulang satu transaksi (ubah `TRX_ID` di fungsi) |
| `adminGrantPremium` | Beri/perpanjang premium manual, mis. kompensasi (ubah `EMAIL` dan `DAYS`) |
| `registerMayarWebhook` | Daftarkan URL webhook ke Mayar |

## Keamanan (repo publik)

- API key, token webhook, dan ID spreadsheet hanya di Script Properties.
- Nominal selalu dari server; permintaan frontend berisi `amount` diabaikan.
- Webhook tanpa token yang benar diabaikan. Webhook dengan token benar tetap dicek ulang ke API Mayar, sehingga webhook palsu tidak dapat mengaktifkan premium.
- Bila token webhook bocor: buat token baru, perbarui `WEBHOOK_TOKEN`, lalu daftarkan ulang webhook.
- Bila API key bocor: cabut di dashboard Mayar dan buat key baru.
