# Google Analytics 4 (Fase 14.3)

## 1. Buat properti GA4
1. Buka https://analytics.google.com dan masuk dengan akun Google Primajana.
2. Admin › Buat › Properti. Nama: "Siap CPNS". Zona waktu: Indonesia (GMT+7). Mata uang: Rupiah (IDR).
3. Pilih platform **Web**. URL situs: `https://primajana.com`, nama aliran: "Siap CPNS".
4. Salin **Measurement ID** (format `G-XXXXXXXXXX`).

## 2. Pasang di aplikasi
1. Unggah file dari zip update ke GitHub (tanpa `config.js`).
2. Buka `assets/js/core/config.js` milik Anda di GitHub, lalu tambahkan satu baris di dalam `CONFIG`
   (misalnya di bawah `WAITLIST_URL`):

   ```js
   GA_MEASUREMENT_ID: "G-XXXXXXXXXX",
   ```

   Measurement ID memang publik (terlihat di setiap situs yang memakai GA), jadi aman di repo publik.
3. Commit. Setelah GitHub Pages selesai, buka aplikasi lalu cek di GA: Laporan › **Realtime**.
   Pengguna yang sudah pernah membuka aplikasi akan mendapat versi baru otomatis (`CACHE_VERSION = "sc-v14.3"`).

Tidak perlu menyalin script GA ke setiap halaman: script dimuat otomatis oleh `hydrateCommon()` di semua halaman.

## 3. Yang dicatat
| Event | Kapan |
|---|---|
| `page_view` | setiap halaman dibuka |
| `sign_up` / `login` | login Google berhasil (akun baru / lama) |
| `cek_kesiapan_selesai` | Cek Kesiapan disimpan |
| `tryout_mulai` (param `paket`) / `tryout_selesai` | tryout dimulai / dikumpulkan |
| `latihan_mulai`, `materi_dibuka` | latihan soal / materi dibuka |
| `akbar_daftar` | daftar Tryout Akbar |
| `wawancara_mulai` / `wawancara_selesai` | latihan wawancara SKB |
| `ajak_teman_klaim` | kode ajak teman dipakai |
| `begin_checkout` (param `produk`, `ref`) | tombol beli ditekan |
| `purchase` (nilai Rupiah) | pembayaran lunas terlihat di halaman status (sekali per transaksi) |

Sarankan menandai `sign_up` dan `purchase` sebagai **Key event** (Admin › Data display › Events).
Agar parameter `paket` dan `produk` muncul di laporan, daftarkan sebagai **Custom dimension** (cakupan Event).

## 4. Privasi
- Tidak ada nama, email, token, userId, atau jawaban yang dikirim ke GA.
- Parameter URL dibersihkan; hanya `utm_*` yang dikirim (pakai `?utm_source=wa&utm_campaign=jarkoman` di link promosi untuk melacak sumber).
- Google Signals dan personalisasi iklan dimatikan. GA tidak aktif di `localhost` dan `admin.html`.
- Tambahkan kalimat berikut di `privasi.html` bagian pihak ketiga:

  > Kami memakai Google Analytics untuk memahami cara aplikasi dipakai (halaman yang dibuka, jenis perangkat, dan perkiraan lokasi tingkat kota). Data ini tidak memuat nama atau email, dan tidak dipakai untuk iklan.

## 5. Live GA di Super User Dashboard (tab "Live GA")
Data dibaca server Apps Script lewat Google Analytics Data API, jadi tidak ada kunci yang tampil di browser.
1. **Apps Script editor › Layanan (+) › Google Analytics Data API › Tambahkan** (identifier `AnalyticsData`).
   Bila memakai `appsscript.json` dari repo, layanan ini sudah tercantum.
2. **Project Settings › Script Properties:**
   - `GA_PROPERTY_ID` = `564371238` (angka setelah huruf `p` di URL GA, bukan Measurement ID `G-…`).
   - Opsional `GA_REPORT_URL` = link laporan Realtime Anda, untuk tombol "Buka di Google Analytics".
3. Pastikan akun Google pemilik deploy Apps Script punya akses minimal **Viewer** di properti GA
   (GA › Admin › Property access management). Bila akunnya sama dengan pemilik GA, lewati langkah ini.
4. Di editor, jalankan **`testAnalytics()`** sekali dan setujui izin baru (membaca Google Analytics).
   Log menampilkan jumlah pengguna aktif.
5. **Deploy › Manage deployments › Edit › New version.**
6. Buka `admin.html#live`. Data realtime (30 menit terakhir) diperbarui otomatis tiap 60 detik selama tab terbuka.
