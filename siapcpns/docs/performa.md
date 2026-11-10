# Performa (Fase 10.2)

Apps Script butuh sekitar 0,5–2 detik untuk setiap permintaan HTTP, ditambah waktu membaca Spreadsheet. Karena itu, perbaikan ini fokus pada tiga hal: **mengurangi jumlah permintaan**, **mengurangi bacaan ke Spreadsheet/Drive**, dan **tidak bertanya ulang ke server untuk data yang baru saja diambil**.

## Yang berubah

### Server (Apps Script)

| Perubahan | Sebelum | Sesudah |
|---|---|---|
| Verifikasi login Google (`tokeninfo`) | Dipanggil ulang setiap 10 menit per pengguna | Sekali per masa berlaku token (± 1 jam) |
| Mencari baris pengguna di sheet `users` | Setiap permintaan (TextFinder) | Di-cache 5 menit. Dihapus otomatis saat baris itu berubah (pembayaran, profil, referral, admin) |
| Cache daftar paket & soal | 1 jam, dan **dikosongkan dulu** setiap jam lalu dibaca ulang. Pengguna yang datang saat itu menunggu semua file dibuka (bisa puluhan detik) | 6 jam, **ditimpa** setiap jam tanpa pernah kosong. Setiap file paket dibuka **sekali** (packages + questions sekaligus) |
| Lobi tryout & info Akbar | Memuat seluruh soal setiap paket hanya untuk menghitung jumlahnya | Jumlah soal disimpan di daftar paket |
| Bank latihan harian (`getToday`, `startPractice`) | Memuat ± 1.200 soal lengkap di setiap permintaan | Indeks ringkas (id, paket, topik). Soal lengkap hanya dimuat untuk 10 soal yang terpilih |
| Data yang sama dalam satu permintaan | Dibaca berulang dari CacheService | Dibaca sekali per permintaan (memo) |
| **Action `batch`** | – | Hingga 6 action baca dalam **1 permintaan HTTP**, dengan token diverifikasi sekali |

### Browser

| Perubahan | Efek |
|---|---|
| **Beranda**: profil + tugas hari ini + rencana adaptif digabung dalam 1 permintaan (`batch`) | Sebelumnya 2–3 permintaan berurutan, sekarang 1 |
| **Rencana**: tugas hari ini + rencana adaptif digabung (`batch`) | 2 permintaan menjadi 1. Pengguna gratis tidak lagi meminta rencana adaptif |
| **Cache baca sementara** (sessionStorage, per akun) untuk `getMe`, `getToday`, `getPlan`, `getPlans`, materi, lobi tryout, info Akbar, peringkat, ajak teman, hasil SKD, pengaturan pengingat | Berpindah antarhalaman tidak bertanya ulang ke server selama 30 detik–30 menit (tergantung jenis data) |
| Cache baca dikosongkan otomatis setiap ada aksi tulis (jawab soal, simpan profil, bayar, cek status bayar, ikut Akbar, dsb.) dan saat keluar akun | Data yang tampil tetap benar setelah pengguna mengubah sesuatu |
| Permintaan yang sama dan bersamaan digabung | Tidak ada permintaan ganda |
| `preconnect` ke server Apps Script dan `modulepreload` modul JS inti | Koneksi dan berkas JS disiapkan sejak HTML dibaca. Hemat ± 0,2–0,5 detik di HP |

## Hasil uji (simulasi jeda server 300 ms per permintaan)

- Beranda: 1 permintaan (`batch[getMe,getToday]`). Sebelumnya 2–3 permintaan berurutan.
- Rencana setelah beranda: 0 permintaan (dari cache). Sebelumnya 1–2.
- Kembali ke beranda: 0 permintaan.

Di server sungguhan, penghematan terbesar biasanya **1–4 detik per halaman**, karena satu permintaan Apps Script yang dihemat bernilai ± 1 detik.

## Hal yang perlu diketahui admin

- **Edit langsung di Spreadsheet** pada baris `users` (misalnya mengubah `premium_until` manual) baru terbaca paling lambat **5 menit**. Agar langsung berlaku, jalankan `adminClearUserCache` (isi email terlebih dahulu). Lebih aman memakai `adminGrantPremium`, yang langsung berlaku.
- **Mengubah soal/paket**: jalankan `refreshQuestionCache` seperti biasa. Kalau tidak, perubahan berlaku otomatis paling lambat ± 1 jam lewat pemicu `warmQuestionCache`.
- Pastikan pemicu `warmQuestionCache` (per jam) terpasang. `healthCheck` akan memeriksanya.
- Kalau `getMe`/`getToday` di HP terasa "telat" setelah perubahan di sheet, pengguna cukup menutup lalu membuka lagi browser/aplikasinya, karena sessionStorage terhapus saat browser ditutup.

## Batasan Apps Script yang tetap ada

- **Cold start**: permintaan pertama setelah lama tidak dipakai bisa butuh 2–5 detik. Ini batasan Google dan tidak bisa dihilangkan dari kode.
- Batas sekitar 30 eksekusi bersamaan per skrip (lihat uji beban di `setup-fase-7.md`).
- Kalau suatu saat pengguna aktif sudah ribuan per hari, pertimbangkan memindahkan backend ke layanan lain. Seluruh frontend hanya berbicara lewat `assets/js/core/api.js`, jadi cukup file itu yang diubah.
