# Fase 13 — Tampilan menu kotak A–F, produk satuan, Mentoring & Konsultasi

## Ringkasan perubahan
Beranda (`index.html`) kini langsung berupa menu kotak untuk semua pengunjung, tanpa perlu login. Di HP ada navigasi bawah: Beranda · Tryout · Materi · Rapot · Akun.

| Menu | Isi | Harga |
|---|---|---|
| **A. Paket Tryout** | Isi dari atas ke bawah:<br>1. Tryout Akbar mingguan (tiket, peringkat nasional)<br>2. Coba Paket Tryout (15 soal: 5 TWK, 5 TIU, 5 TKP)<br>3. Paket tryout SKD (DIAG-01..03 + paket Akbar yang sudah selesai)<br>Semua: kerjakan semua soal, kirim, lalu rapor + pembahasan muncul. | Akbar Rp10.000/tiket · Coba gratis · Paket Rp10.000 (bebas diulang) |
| **B. Paket Materi** | 3 kotak TWK/TIU/TKP → daftar judul (21 topik) → halaman materi lengkap (konsep dasar + 3 bagian pendalaman + strategi & jebakan) + 3 contoh soal mudah/sedang/sulit. Contoh soal langsung menampilkan kunci & pembahasan tiap kali dijawab. | Judul teratas tiap subtes gratis; lainnya Premium |
| **C. Latihan Soal per Materi** | 3 kotak TWK/TIU/TKP → 21 topik → 50 soal HOTS (mudah → sulit), 45 menit. Kerjakan semua, kirim, lalu nilai + pembahasan muncul. | Topik teratas tiap subtes gratis; lainnya Premium |
| **D. Mentoring CPNS** | Live Mentoring Jumat 19.00–21.00 WIB via Zoom (maks. 30 kursi, reservasi tiket). Di bawahnya katalog rekaman. | Live Rp25.000/sesi · Rekaman Rp10.000 |
| **E. Konsultasi CPNS** | Pilih tanggal & jam → bayar → chat di aplikasi selama 60 menit. Konsultan membalas dari "Meja konsultan". | Rp30.000/sesi |
| **F. Cek Kesiapan & Rapot** | Cek kesiapan + semua hasil (tryout, Akbar, latihan per materi, SKB) + peta level 21 topik. | Gratis |

Penjelasan tambahan:
- **Premium baru:** 1 bulan Rp30.000 · 3 bulan Rp75.000 · 6 bulan Rp150.000. Premium membuka semua judul **Paket Materi** dan **Paket Latihan Soal per Materi** (TWK, TIU, TKP). Premium juga tetap membuka latihan harian tanpa batas, rencana adaptif, dan pengingat email.
- **Premium lama:** pembeli Premium dengan harga lama (sebelum `applyPricingV2()` dijalankan) tetap mendapat semua paket tryout reguler sampai masa Premium mereka habis.
- **Tiket Akbar:** pemilik tiket Akbar otomatis memiliki paket tryout tersebut setelah event selesai. Semua peserta Akbar mendapat peringkat provinsi, analisis lengkap, dan pembahasan semua soal.
- **Diskon ajak teman** tetap hanya untuk pembelian Premium pertama. Pembelian produk satuan tidak menghapus hak diskon ini.
- **Menu Akun (member area):**
  - status Premium;
  - tiket Live dengan tombol **Gabung**;
  - rekaman, konsultasi, paket tryout & tiket Akbar milik pengguna;
  - riwayat pembayaran;
  - menu "Lainnya": Rencana belajar, Latihan harian, Ajak teman, Hasil SKD & SKB, Pengaturan pengingat, Profil belajar, Panduan, Super User Dashboard (admin), Meja konsultan (konsultan).

## Tentang perlindungan link Zoom & rekaman (penting, baca)
Pilihan yang dipakai: **"Sederhana: link disembunyikan"**.
- **Link Zoom:**
  - Tidak pernah ada di halaman atau email.
  - Server mengirimnya hanya kepada pemilik tiket, dan hanya mulai 15 menit sebelum sesi sampai sesi selesai, ketika tombol **Gabung** di menu Akun ditekan.
  - Setiap klik Gabung dicatat di sheet `access_log`.
- **Rekaman:**
  - Video YouTube berstatus **Unlisted** diputar di member area hanya untuk pembeli.
  - Selama video diputar, email pembeli muncul sebagai tanda air yang berpindah-pindah.
  - Setiap pemutaran juga dicatat di `access_log`.
- **Batasan yang perlu diketahui:** tidak ada sistem yang bisa 100% mencegah orang merekam layar atau menyalin URL yang sengaja dicari. Langkah di atas mempersulit pembagian dan membuat pelanggaran bisa dilacak.
- **Pengaturan Zoom yang disarankan untuk setiap sesi:**
  - Waiting Room aktif.
  - Passcode aktif.
  - Matikan "Allow participants to rename themselves" dan "Allow participants to record locally".
  - Kunci rapat (Lock Meeting) setelah semua peserta masuk.
  - Terima dari Waiting Room hanya nama yang ada di daftar peserta. Jalankan `listLiveAttendees()` atau buka Super User Dashboard › Bisnis › Layanan mendatang.
- **Pengaturan YouTube:** gunakan **Unlisted** dan izinkan embedding. Video **Private** tidak bisa diputar di aplikasi untuk pembeli.
- Bila nanti ingin perlindungan lebih kuat, ada dua opsi lanjutan: Zoom registrant API (link unik per pembeli, butuh Zoom Pro) dan rekaman di Google Drive dengan akses per email pembeli.

## Langkah pemasangan
1. **Apps Script**
   - Salin ulang **semua** file di `backend/apps-script/`.
   - File baru: `Shop.gs`, `Mentoring.gs`, `Consult.gs`.
   - File yang berubah: `Db.gs`, `Payment.gs`, `Tryout.gs`, `Akbar.gs`, `Materi.gs`, `Referral.gs`, `Router.gs`, `Notify.gs`, `Admin.gs`, `Users.gs`, `Ops.gs`.
2. **Jalankan `setupSheets()`.** Fungsi ini menambah kolom `kind` dan `ref_id` di `transactions`, serta membuat sheet baru:
   - `entitlements`
   - `mentoring_sessions`
   - `consult_slots`
   - `consult_messages`
   - `access_log`
3. **Jalankan `applyPricingV2()`.**
   - Harga Premium berubah menjadi 30 rb / 75 rb / 150 rb.
   - Waktu peralihan dicatat di Script Property `PRICING_V2_FROM`. Waktu ini dipakai untuk menentukan pembeli Premium lama.
4. **Jadwal mentoring**
   - Jalankan `seedMentoringSeries()`: 8 Jumat berikutnya dibuat dengan topik berseri.
   - Lalu isi `zoom_url` dan `zoom_passcode` di sheet `mentoring_sessions`.
   - Bisa juga salin dari file `Jadwal Mentoring & Konsultasi – Siap CPNS.xlsx`.
5. **Jadwal konsultasi**
   - Jalankan `seedConsultSlots()`. Ubah jam, nama, atau email konsultan di fungsinya bila perlu.
   - Atau isi `consult_slots` secara manual, lalu jalankan `refreshConsultCache()`.
   - Konsultan cukup masuk ke aplikasi dengan email di kolom `consult_slots.consultant_email`.
6. (Opsional) **Ubah harga produk** lewat Script Properties: `PRICE_TRYOUT`, `PRICE_AKBAR`, `PRICE_LIVE`, `PRICE_REC`, `PRICE_CONSULT`. Harga per sesi/slot juga bisa diisi di kolom `price`.
7. **Deploy:** Deploy › Manage deployments › Edit › **New version**.
8. **GitHub:**
   - Unggah isi zip repo.
   - `config.js`, `privasi.html`, dan `syarat.html` tidak disertakan agar isianmu tidak tertimpa.
   - `CACHE_VERSION = "sc-v13.0"`.
9. Jalankan `healthCheck()` dan `refreshQuestionCache()`.

## Operasional rutin
- **Sebelum Jumat:**
  - Pastikan `zoom_url` dan `zoom_passcode` sesi minggu itu sudah terisi. Dasbor admin menandai "link Zoom belum diisi".
  - Tambah jadwal baru dengan `seedMentoringSeries()` (lanjut otomatis ke topik berikutnya).
- **Setelah sesi:**
  - Unggah rekaman ke YouTube (Unlisted), lalu isi `recording_url`.
  - Ubah `recording_status` menjadi `published` dan `status` menjadi `done`. Rekaman langsung muncul di katalog.
- **Sesi dibatalkan:** ubah `status` menjadi `cancelled`. Pemilik tiket melihat status "Dibatalkan" di Akun. Proses pengembalian dana atau penjadwalan ulang secara manual. Untuk memindahkan akses ke sesi lain, gunakan `adminGrantProduct()`.
- **Konsultasi bentrok** (sangat jarang; terjadi bila dua pembayaran untuk slot yang sama selesai bersamaan): kolom `note` di `entitlements` dan `transactions` berisi "BENTROK". Hubungi pembeli untuk jadwal ulang atau pengembalian dana.
- **Tryout Akbar** tetap memakai `scheduleAkbarEvents()`. Setelah semua event sebuah paket terbit, paketnya otomatis masuk daftar Paket Tryout berbayar.

## Uji yang sudah dijalankan
- **Harness backend:** ALL PASSED, termasuk 65 uji Fase 13:
  - harga dari server;
  - hak akses & aktivasi idempoten;
  - kursi/slot ditahan selama checkout;
  - link Zoom & ID video tidak bocor;
  - jendela Gabung 15 menit;
  - chat dua arah dan polling pesan baru;
  - chat tertutup setelah 60 menit;
  - Premium lama vs baru;
  - dasbor admin per produk.
- **Uji E2E lengkap dengan backend nyata (mock Mayar):**
  - beli & kerjakan paket tryout;
  - tiket Akbar;
  - materi gratis/terkunci + pop-up Premium;
  - contoh soal langsung dinilai;
  - latihan 50 soal / 45 menit;
  - beli tiket live → Gabung membuka Zoom;
  - beli & tonton rekaman;
  - pesan & chat konsultasi dua arah;
  - Rapot;
  - beli Premium membuka semua judul.
  - Diuji di HP 390 px & desktop tanpa galat dan tanpa geser horizontal.
- **Mode uji (`USE_MOCK`):** semua halaman baru terbuka dengan data contoh.
