# Fase 12 — Super User Dashboard

Halaman `pages/admin.html` menampilkan capaian, bisnis, dan kesehatan sistem di dalam aplikasi. Angka penjualan dihitung dari sheet `transactions` yang sudah diisi otomatis oleh webhook dan rekonsiliasi Mayar, jadi kamu tidak perlu membuka dasbor Mayar untuk memantau penjualan.

## Isi dasbor
Rentang waktu bisa dipilih 7, 30, atau 90 hari. Setiap angka dibandingkan dengan periode sebelumnya yang sama panjang.

| Tab | Isi |
|---|---|
| **Ringkasan** | Pendapatan, transaksi lunas, pengguna baru, pengguna aktif belajar, Premium aktif, dan konversi ke pembeli. Ada juga daftar peringatan (pembayaran menunggu, Premium yang segera berakhir, galat server, mode sandbox) dan grafik harian. |
| **Bisnis** | Pendapatan hari ini, 7 hari, 30 hari, dan sepanjang waktu; penjualan per paket; status checkout (lunas, kedaluwarsa, menunggu, gagal); persentase pembeli berulang; hasil program ajak teman beserta diskonnya; daftar Premium yang berakhir dalam 7 hari; serta daftar transaksi per tanggal/status yang bisa diunduh sebagai **CSV**. |
| **Pengguna** | Total, pendaftar baru, aktif belajar, dan login; aktivasi pengguna baru (profil → cek kesiapan → tryout → latihan → Premium); retensi kohort mingguan; pendidikan; dan provinsi tujuan. |
| **Capaian belajar** | Tryout per jenis dengan rata-rata skor dan kelulusan ambang batas (TWK 65 · TIU 80 · TKP 166); soal latihan per hari; topik terlemah; skor SKD resmi yang diinput pengguna; dan rekap Tryout Akbar (peserta, rata-rata, tertinggi, % lolos). |
| **Operasional** | Hasil `healthCheck` (Script Properties, sheet, paket, pemicu), galat 24 jam teratas, webhook Mayar 7 hari, email pengingat, dan backup terakhir. |
| **Cari pengguna** | Cari berdasarkan email, nama, atau kode ajak. Hasilnya menampilkan status Premium, transaksi, tryout, latihan, ajakan, dan skor SKD. Berguna untuk menjawab pertanyaan seperti "saya sudah bayar tapi belum Premium". |

Catatan perhitungan:
- Transaksi Rp0 (pemberian Premium manual) tidak dihitung sebagai pendapatan, tetapi tetap dicatat terpisah.
- Data dihitung di server dan disimpan di cache selama 5 menit. Tombol **Muat ulang** menghitung ulang seketika.

## Keamanan
- Hanya email di Script Property **`ADMIN_EMAILS`** yang bisa membuka data. Semua action admin hanya-baca.
- Akun lain, termasuk Premium, hanya melihat pesan "Akses ditolak", dan server tidak mengirim data apa pun.
- Halaman ini tidak diindeks mesin pencari (`noindex, nofollow`) dan tidak masuk sitemap.
- Tautan **Admin** di Beranda hanya muncul untuk akun admin. Server tetap memeriksa ulang setiap permintaan.
- Isi dasbor memuat email pengguna. Jangan tampilkan atau bagikan tangkapan layarnya di tempat publik.

## Langkah pemasangan
1. **Script Properties** (Apps Script › Project Settings › Script properties):
   - Tambahkan `ADMIN_EMAILS`, isi dengan email Google admin dipisah koma. Contoh: `pemilik@gmail.com, mitra@primajana.id`.
   - Bila `ADMIN_EMAILS` kosong, `ADMIN_EMAIL` (penerima ringkasan harian) otomatis menjadi admin.
2. **Apps Script:**
   - Salin file baru **`Admin.gs`**.
   - Salin ulang `Router.gs`, `Users.gs`, dan `Ops.gs`.
   - Deploy › Manage deployments › Edit › **New version**.
3. **GitHub:** unggah isi zip, yang berisi file baru dan file yang berubah.
4. **Buka dasbor:**
   - Masuk dengan email admin, lalu klik **Admin** di menu Beranda, atau buka `pages/admin.html` langsung.
   - Bisa juga dipasang di layar utama HP lewat menu "Tambahkan ke layar utama" pada browser.
5. (Opsional) Jalankan `healthCheck()`. Barisnya harus berbunyi `ADMIN_EMAILS terisi (n admin)`.

## Uji yang sudah dijalankan
- Harness backend:
  - Akses ditolak untuk non-admin, akun yang belum login, dan saat `ADMIN_EMAILS` kosong.
  - Pendapatan total sama dengan jumlah transaksi lunas.
  - Seri harian konsisten dengan KPI.
  - Cache 5 menit berjalan.
  - Daftar transaksi dan filter status berfungsi.
  - Pencarian pengguna tidak membocorkan jawaban mentah.
- Uji tampilan (desktop, HP 390 px, mode gelap):
  - Semua tab terbuka tanpa geser horizontal.
  - Tooltip grafik dan tabel alternatif tampil.
  - Unduh CSV berfungsi, termasuk pencegahan formula injection saat dibuka di Excel/Sheets.
  - Pencarian pengguna berfungsi.
  - Akun non-admin melihat "Akses ditolak".
