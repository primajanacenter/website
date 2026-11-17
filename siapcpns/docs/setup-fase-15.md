# Fase 15: Program Affiliate (komisi uang) + Live GA di dasbor

## Ringkasan aturan
| Aturan | Nilai | Ubah lewat Script Property |
|---|---|---|
| Komisi | 20% dari nominal yang dibayar pembeli | `AFF_RATE_PCT` (atau tarif khusus per affiliate di dasbor) |
| Produk dihitung | semua: Premium SKD, Premium SKB, tryout, Akbar, mentoring, rekaman, konsultasi | |
| Masa atribusi | 90 hari sejak pembeli bergabung lewat link/kode | `AFF_WINDOW_DAYS` |
| Masa tahan (cek refund) | 7 hari, lalu komisi bisa dicairkan | `AFF_HOLD_DAYS` |
| Minimal pencairan | Rp100.000 (seluruh saldo tersedia dicairkan sekaligus) | `AFF_MIN_PAYOUT` |
| Potongan transfer | Rp3.000 per pencairan | `AFF_PAYOUT_FEE` |

- **Siapa:** pengguna mendaftar di `pages/affiliate.html` (rekening bank/e-wallet, nomor WA, kanal promosi). Admin menyetujui di Super User Dashboard › tab **Affiliate**.
- **Link:** sama dengan link Ajak Teman (`?ref=KODE`), ditambah `utm_source=affiliate&utm_campaign=KODE` agar terlihat di GA.
- **Pembeli** tetap mendapat diskon 10% Premium pertama. **Affiliate aktif** mendapat komisi uang sebagai pengganti bonus +7 hari Premium. Pengguna biasa tetap mendapat bonus hari seperti sebelumnya.
- Atribusi hanya untuk pengguna baru yang memakai link/kode sebelum membeli Premium pertama (aturan Ajak Teman). Pembelian sebelum affiliate disetujui atau saat dinonaktifkan tidak memberi komisi.

## Alur pencairan (manual)
1. Affiliate menekan **Cairkan komisi** (saldo tersedia ≥ Rp100.000). Admin menerima email pemberitahuan dan lencana merah di tab Affiliate.
2. Admin mentransfer nominal **Diterima** (saldo dikurangi Rp3.000) ke rekening yang tertera, lewat m-banking, e-wallet, atau saldo **Mayar**. Tombol **Unduh CSV antrean** membantu transfer massal.
3. Klik **Sudah ditransfer**, pilih lewat Bank / E-wallet / Mayar, isi nomor referensi. Affiliate langsung melihat status "Sudah ditransfer".
4. Bila data rekening salah: **Tolak** dengan alasan. Saldo kembali tersedia dan affiliate bisa memperbaiki rekening lalu mengajukan lagi.
5. Bila transaksi pembeli di-refund: tab Affiliate › Komisi terbaru › **Batalkan** (sebelum dicairkan).

### Tentang fitur affiliate bawaan Mayar
Fitur affiliate di dasbor Mayar bekerja per halaman produk Mayar dengan link affiliate dari Mayar sendiri.
Aplikasi ini membuat tagihan lewat API Mayar, jadi penjualan aplikasi tidak tercatat di modul affiliate Mayar.
Karena itu pencatatan komisi dilakukan di sistem aplikasi; Mayar tetap bisa dipakai sebagai **sumber dana transfer** (tarik saldo atau transfer dari saldo Mayar) dan dicatat dengan pilihan "Mayar" saat menandai pencairan.

## Langkah pemasangan
1. **Apps Script**
   - File baru: `Affiliate.gs`, `Analytics.gs`.
   - File berubah: `Db.gs`, `Router.gs`, `Payment.gs`, `Referral.gs`, `appsscript.json` (layanan Google Analytics Data API).
   - Paling aman: salin ulang semua file `.gs` dan isi `appsscript.json` (Project Settings › centang "Show appsscript.json").
2. Jalankan **`setupSheets()`**. Sheet baru: `affiliates`, `commissions`, `payouts`.
3. Live GA: ikuti `docs/setup-analytics.md` bagian 5 (`GA_PROPERTY_ID` = `564371238`, jalankan `testAnalytics()`).
4. **Deploy › Manage deployments › Edit › New version.**
5. **GitHub:** unggah isi zip update (tanpa `config.js`, `privasi.html`, `syarat.html`). `CACHE_VERSION = "sc-v15.0"`.
6. **Syarat & Ketentuan:** tambahkan bagian Program Affiliate di `syarat.html` (bisa menyalin daftar ketentuan dari `affiliate.html`), dan di `privasi.html` sebutkan bahwa data rekening affiliate disimpan untuk keperluan pencairan.

## Keamanan & privasi
- Nomor rekening lengkap hanya terlihat oleh pemilik dan admin; di halaman affiliate ditampilkan tersamar (••••7890).
- Affiliate tidak pernah melihat nama/email pembeli, hanya produk, tanggal, nominal, dan komisi.
- Nominal komisi dihitung di server dari transaksi lunas (webhook/rekonsiliasi Mayar), bukan dari browser. Setiap transaksi hanya memberi satu komisi.

## Uji yang sudah dijalankan
- Harness backend: ALL PASSED, termasuk 37 uji Fase 15 (daftar, persetujuan, komisi 20% setelah diskon, semua produk, idempoten, tarif khusus, batas 90 hari, masa tahan, pembatalan, pencairan + potongan Rp3.000, tolak & kembalikan saldo, tandai dibayar via Mayar, nonaktifkan, kebocoran data pembeli).
- E2E browser (HP 390 px & desktop) dengan backend nyata: daftar → admin setujui → 4 pembeli lewat link → saldo → cairkan → admin tandai ditransfer → riwayat; tanpa galat dan tanpa geser horizontal.
