# Fase 11 — Semua paket soal versi terbaru (format SKD terbaru + soal figural bergambar)

## Ringkasan
Semua paket soal kini mengikuti kisi-kisi SKD terbaru (KepmenPANRB 321/2024). TIU memuat tiga kelompok soal:
- verbal: analogi, silogisme, analitis;
- numerik: deret, hitung, soal cerita;
- **figural**: analogi gambar, ketidaksamaan, serial gambar.

| Paket | Isi |
|---|---|
| DIAG-01 s.d. 03, AKBAR-01 s.d. 08 | 110 soal: TWK 30 · TIU 35 · TKP 45 |
| LAT-01 s.d. 20 (bank latihan harian) | 63 soal: TWK 24 · TIU 21 (termasuk 3 figural) · TKP 18 |
| MATERI (Premium) | 63 materi: 21 topik × level 2–4, termasuk topik baru *Figural* |
| Materi level 1 (publik) | 21 topik, termasuk *Figural*, dengan contoh soal bergambar |
| DEMO-01 | 15 soal, termasuk 2 contoh soal figural |
| SKB-KTU-01 | Tidak berubah (disertakan ulang agar folder lengkap) |

Rincian TIU per paket tryout:

| Topik | Soal |
|---|---|
| Analogi | 4 |
| Silogisme | 4 |
| Analitis | 4 |
| Deret | 4 |
| Hitung & perbandingan kuantitatif | 5 |
| Soal cerita | 4 |
| **Figural** (analogi gambar 4, ketidaksamaan 3, serial 3) | **10** |

Soal TWK dan TKP pada paket lama tetap dipakai karena sudah bertipe HOTS. Pada TIU, soal yang dikurangi diganti dengan 10 soal figural. Semua soal figural unik: 170 soal di 31 paket, tidak ada yang kembar.

### Perubahan aplikasi
- Gambar tampil di ujian CAT, Tryout Akbar, latihan, rapor/pembahasan, dan contoh soal materi.
- Gambar (SVG) dibersihkan di server sebelum dikirim ke peserta.
- Topik **Figural** sekarang ikut muncul di:
  - latihan per topik;
  - rencana belajar dan peta level (21 topik);
  - halaman materi.
- **ID soal diberi versi**, misalnya `DIAG-01-v2-001`.
  - Rapor percobaan lama tetap menampilkan skor dan analisis topik.
  - Pembahasan per soal pada percobaan lama disembunyikan, disertai keterangan, supaya pembahasan tidak tertukar dengan soal versi baru.
- Perbaikan penjadwalan Tryout Akbar: event lama yang disimpan dalam UTC (`…T23:00:00.000Z`) kini dikenali, jadi jadwal baru tidak bentrok.

## Langkah pemasangan

### A. GitHub
- Unggah seluruh isi `siap-cpns-repo-lengkap.zip` dan timpa file lama.
- Tiga file sengaja **tidak** disertakan agar isianmu tidak tertimpa:
  - `assets/js/core/config.js` (berisi URL Apps Script dan Client ID milikmu);
  - `pages/privasi.html` dan `pages/syarat.html` (isinya tidak berubah).
- Jika sebelumnya kamu menjalankan `node tools/prepare-release.mjs https://domainmu`, jalankan lagi setelah unggah. Perintah ini mengisi ulang tag `canonical`/`og:url` dan menulis `sitemap.xml`/`robots.txt`.
- Jika mau, ubah `APP_VERSION` di `config.js` menjadi `"0.11.0"`.
- `sw.js` memakai `CACHE_VERSION = "sc-v11.1"`, jadi pengguna otomatis menerima tampilan baru.

### B. Apps Script
1. Salin ulang **semua** file di `backend/apps-script/` dengan nama yang sama. Yang berubah:
   - `Akbar.gs`, `Tryout.gs`, `Plan.gs`, `Materi.gs`;
   - `Setup.gs`, `SampleData.gs`.
2. Deploy › Manage deployments › Edit › **New version**.

### C. Google Drive: ganti paket soal
Kerjakan saat sepi, misalnya malam hari, dan **tidak sedang ada Tryout Akbar berlangsung**. Peserta yang sedang mengerjakan tryout saat paket diganti akan dinilai dengan soal versi baru.

1. Buka folder Drive `QUESTIONS_FOLDER_ID`. Pindahkan ke Sampah semua spreadsheet paket lama:
   - DIAG-01 s.d. 03;
   - LAT-01 s.d. 20;
   - AKBAR-01 s.d. 04, juga AKBAR-05 s.d. 08 bila sudah diunggah;
   - SKB-KTU-01;
   - "Paket DEMO-01".
2. **Tip praktis:** buka Setelan Drive (ikon gerigi) dan centang **"Konversi upload menjadi format editor Google Dokumen"**. Dengan begitu, file .xlsx otomatis menjadi Google Spreadsheet saat diunggah.
3. Unggah 32 file paket dari `paket-soal-lengkap-RAHASIA.zip` ke folder tersebut. Semua file **kecuali** `MATERI – …`.
4. Pastikan setiap file sudah berformat Google Spreadsheet. Hapus sisa file .xlsx bila ada.

### D. Materi Premium (ID file tetap sama)
1. Buka spreadsheet materi yang sekarang (yang ID-nya ada di `MATERIALS_SPREADSHEET_ID`).
2. Pilih File › **Impor** › Upload › pilih `MATERI – Materi Premium – LIVE.xlsx` › **Ganti spreadsheet**.

Dengan cara ini ID file tidak berubah, jadi Script Properties tidak perlu diubah.

### E. Jalankan di editor Apps Script (berurutan)
1. `refreshQuestionCache()`: membaca ulang semua paket dan indeks latihan. Log harus menampilkan:
   - DIAG-01..03 dan AKBAR-01..08 masing-masing (110);
   - LAT-01..20 masing-masing (63);
   - SKB-KTU-01 (50).
2. `checkQuestionFolder()`: pastikan tidak ada peringatan paket ganda.
3. `createDemoPackageFile()`: membuat ulang "Paket DEMO-01" dengan 2 soal figural.
   - Bila memakai mode satu spreadsheet, jalankan `importDemoPackage()` sebagai gantinya.
4. `refreshMaterialCache()`: log harus berbunyi `Materi live: 63 (Lv2 21 · Lv3 21 · Lv4 21)`.
5. `scheduleAkbarEvents()`: menjadwalkan paket Akbar yang belum punya jadwal (AKBAR-05 s.d. 08) pada hari Minggu kosong berikutnya.
   - Event yang sudah ada tetap.
   - Isi soalnya otomatis memakai versi baru.
6. `healthCheck()` untuk pemeriksaan akhir.

## Format sel gambar (untuk penyusun soal)
- Kolom `context` dan `option_a` s.d. `option_e`:
  - Isi dengan kode SVG yang **diawali `<svg`**.
  - Aplikasi menampilkannya sebagai gambar.
  - Soal ketidaksamaan tidak memakai `context`.
- Materi (`contoh_soal`): tulis teks soal, lalu baris baru berisi kode `<svg …>`.
- Jangan mengedit SVG secara manual. Soal figural dibuat dengan generator yang sudah memeriksa bahwa jawaban dan pengecohnya unik.

## Keamanan
- Semua file xlsx berisi **kunci jawaban** atau materi berbayar. Simpan **hanya di Drive**, jangan di repo GitHub publik.
- Repo hanya memuat:
  - materi level 1 publik;
  - paket demo (2 soal figural yang tidak dipakai di paket mana pun);
  - template kosong `docs/template-paket-soal-tryout.xlsx`.

## Uji yang sudah dijalankan
- Harness backend: ALL PASSED.
- Uji 31 paket nyata:
  - komposisi soal, figural, dan ID `-v2-` per paket;
  - mulai DIAG-01 → jawaban sempurna = 550;
  - rapor lama: skor tetap, pembahasan disembunyikan;
  - latihan topik figural;
  - 63 materi, dengan contoh figural bergambar di L2–L4.
- Uji Tryout Akbar 1–4 dan 5–8: join, 10 soal figural, skor 550, dan jadwal tidak bentrok.
- Uji tampilan di HP dan desktop: ujian, rapor, materi figural, serta regresi halaman lain tanpa galat.
