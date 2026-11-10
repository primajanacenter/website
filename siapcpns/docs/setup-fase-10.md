# Panduan setup Fase 10: Aplikasi di HP & Pengingat Email

Lanjutan dari Fase 9. Perkiraan waktu sekitar 15 menit.

## Isi Fase 10

**Aplikasi di HP (PWA)**

- **Pasang ke layar utama**:
  - Android/Chrome dan komputer (Chrome/Edge) memakai tombol **Pasang**. Tombolnya ada di beranda dan di halaman **Pengaturan**.
  - iPhone/iPad memakai Safari › Bagikan › **Tambahkan ke Layar Utama**. Petunjuknya tampil otomatis di halaman Pengaturan.
- **Tampilan aplikasi**: terbuka tanpa bilah browser, dengan ikon adaptif (maskable). Tekan lama ikonnya untuk membuka pintasan: Latihan, Tryout, Tryout Akbar, Materi.
- **Mode offline** (`sw.js`):
  - Halaman yang pernah dibuka, **Panduan CPNS**, dan **Materi level 1** tetap bisa dibaca saat sinyal putus. Halaman lain menampilkan `offline.html`.
  - Pita kuning "Kamu sedang offline" muncul otomatis.
  - Latihan, tryout, login, dan pembayaran tetap membutuhkan internet.
- **Selalu versi terbaru**: halaman, CSS, dan JS diambil dari jaringan lebih dulu. Salinan cache hanya dipakai saat offline, jadi setiap update di GitHub langsung terlihat pengguna.

**Pengingat di perangkat: gratis untuk semua pengguna, tanpa email** (`assets/js/features/reminder-local.js`)

- Diatur di **Pengaturan › Pengingat di perangkat ini**: belajar harian (jam sesuai HP) dan Tryout Akbar.
- Pengaturan disimpan di browser pengguna masing-masing (localStorage, ditambah salinan di Cache Storage untuk service worker). Pengaturan ini **tidak dikirim ke server** dan tidak memakai kuota email.
- Cara pengingat muncul:

| Situasi | Yang terjadi | Dukungan |
|---|---|---|
| Pengguna membuka Siap CPNS setelah jam pengingat dan belum latihan hari itu | Kartu pengingat 🔔 di bawah layar | Semua browser, termasuk iPhone |
| Aplikasi/tab masih terbuka di latar belakang saat jam pengingat | Notifikasi HP (perlu tombol **Izinkan notifikasi**) | Android, komputer, iPhone (aplikasi terpasang, iOS 16.4+) |
| Aplikasi tertutup | Notifikasi lewat *Periodic Background Sync*. Jadwal ditentukan browser, jadi bisa terlambat beberapa jam | Hanya Chrome/Edge (Android/komputer) untuk aplikasi yang **sudah dipasang** |

- Status "sudah latihan hari ini" tercatat otomatis saat pengguna menjawab soal latihan atau membuka beranda setelah latihan.
- Jadwal Tryout Akbar diambil dari server paling sering setiap 12 jam, dan hanya jika pengingat Akbar aktif.
- Keterbatasan web: browser tidak mengizinkan situs menjadwalkan notifikasi tepat waktu tanpa server. Karena itu pengingat yang **pasti tepat waktu** disediakan lewat email untuk Premium.

**Pengingat email: khusus Premium** (`Notify.gs`)

| Pengingat | Kapan | Default |
|---|---|---|
| Email belajar harian | Pada jam pengingat (WIB) di profil, hanya bila hari itu belum latihan | Mati (pengguna Premium mengaktifkan sendiri) |
| Email Tryout Akbar | Sabtu ± 19.00 WIB, sehari sebelum event | Mati |
| Masa aktif Premium | 09.00 WIB, 3 hari sebelum dan pada hari terakhir | Nyala |

- Pengguna gratis tidak bisa mengaktifkan email harian atau Akbar. Server menolak dengan `FORBIDDEN` dan halaman menampilkan ajakan Premium.
- Saat Premium berakhir, email harian dan Akbar **berhenti otomatis**, karena pengiriman memeriksa status Premium setiap kali.
- Setiap email berisi tautan **berhenti menerima pengingat**. Satu jenis email hanya dikirim sekali per hari atau per event (`notif_log`).
- **Kuota**: email dikirim dari akun pemilik Apps Script.
  - Akun Gmail biasa: sekitar 100 penerima per hari.
  - Google Workspace: sekitar 1.500 per hari.
  - Pengiriman berhenti sendiri saat kuota hampir habis. Matikan sementara dengan Script Property `NOTIF_EMAIL` = `off`.
  - Karena hanya untuk Premium, kuota Gmail biasa cukup untuk awal peluncuran.

## 1. Perbarui Apps Script (salin file)

- **Baru**: `Notify.gs`
- **Diganti isinya**: `Db.gs`, `Router.gs`, `Ops.gs`, `Auth.gs`, `Tryout.gs`, `Practice.gs`, `Akbar.gs`

`Auth.gs`, `Tryout.gs`, `Practice.gs`, dan `Akbar.gs` berisi perbaikan kecepatan (Fase 10.2). Rinciannya ada di [`performa.md`](performa.md).

Lalu jalankan:

1. **`setupSheets`**: menambahkan sheet `notif_prefs` dan `notif_log`.
2. **`refreshQuestionCache`**: membangun cache paket versi baru (jumlah soal dan indeks bank latihan) dalam satu kali baca per file. Log menampilkan, misalnya, `Cache paket dibangun ulang: 29 paket, 1200 soal latihan, 40 detik`. Pastikan pemicu `warmQuestionCache` (per jam) masih terpasang; `healthCheck` akan memeriksanya.
3. Pastikan Script Properties ini terisi:
   - **`APP_BASE_URL`**: alamat situs, misalnya `https://siapcpns.primajana.id`. Dipakai untuk tombol di email.
   - **`WEBAPP_URL`**: URL Web App berakhiran `/exec`. Dipakai untuk tautan berhenti langganan.
4. **`testReminderEmails`**: mengirim 3 contoh email ke `ADMIN_EMAIL`. Saat pertama kali, setujui izin yang diminta, lalu cek tampilan emailnya.
5. **`installReminderTrigger`** (sekali): memasang pemicu `sendReminders` setiap jam.
6. **Deploy › Manage deployments › Edit › New version**. Langkah ini wajib agar tautan berhenti langganan (`doGet`) dan action baru aktif.
7. **`healthCheck`**: sekarang juga memeriksa pemicu `sendReminders`.

## 2. Perbarui GitHub

Ekstrak `siap-cpns-fase10-update.zip` ke root repo (`config.js` tidak disertakan), lalu ubah `APP_VERSION` menjadi `"0.10.0"`.

File baru di **root repo**: `sw.js`, `offline.html`, `manifest.webmanifest` (diperbarui), serta ikon `assets/img/icon-maskable-*.png`.

`sw.js` **harus berada di root situs**, sejajar dengan `index.html`, agar mode offline berlaku untuk semua halaman.

Mode offline hanya aktif di **https** (GitHub Pages dengan Enforce HTTPS) atau `localhost`.

## 3. Uji

1. **Pasang aplikasi**:
   - Di HP Android, buka situs di Chrome, masuk, lalu pilih **Beranda › Pasang** (atau **Pengaturan › Pasang aplikasi**).
   - Ikon Siap CPNS muncul di layar utama.
   - Buka dari ikon: tampilan tanpa bilah alamat.
2. **Offline**:
   - Buka Materi dan Panduan sekali.
   - Aktifkan mode pesawat, lalu buka ikon aplikasi. Materi dan Panduan tetap tampil, dan pita kuning offline muncul.
   - Halaman yang belum pernah dibuka menampilkan "Kamu sedang offline".
3. **Pengingat di perangkat (akun gratis)**:
   - Di **Pengaturan › Pengingat di perangkat ini**, nyalakan pengingat harian dengan jam beberapa menit yang lalu, lalu tekan Simpan. Kartu 🔔 "Waktunya latihan hari ini" langsung muncul.
   - Kerjakan 1 soal latihan. Pengingat harian tidak muncul lagi hari itu.
   - Tekan **Izinkan notifikasi** lalu **Coba pengingat**. Notifikasi HP muncul.
4. **Pengingat email (akun Premium)**:
   - Nyalakan email harian dengan jam satu jam ke depan, lalu jangan latihan. Email masuk setelah pemicu berjalan (paling lambat ± 1 jam).
   - Klik "Berhenti menerima pengingat ini", lalu cek bahwa sakelar di Pengaturan sudah mati.
   - Akun gratis: bagian email terkunci dengan ajakan Premium.

## Catatan penting setelah update berikutnya

- Kalau Anda mengubah daftar file inti (CSS/JS baru), tambahkan ke daftar `PRECACHE` di `sw.js` bila file itu perlu tersedia saat offline.
- Setelah perubahan besar, naikkan `CACHE_VERSION` di `sw.js` (versi sekarang `sc-v10.2`, misalnya menjadi `sc-v10.3`) agar cache lama dibersihkan.
- Pengguna yang tampilannya terasa aneh bisa menekan **Pengaturan › Hapus salinan offline**.
