# Panduan setup Fase 4: Materi, Latihan Harian, Rencana Belajar

Lanjutan dari Fase 3. Estimasi ± 15 menit.

## Isi Fase 4

| Fitur | Halaman | Gratis | Premium (Fase 6) |
|---|---|---|---|
| Materi level 1 (20 topik SKD) | `pages/materi.html` | Terbuka untuk semua, tanpa login | Level 2–4 (pendalaman) |
| Latihan harian | `pages/latihan.html` | 10 soal per hari (WIB) | Tanpa batas |
| Rencana belajar dasar | `pages/rencana.html` | Jadwal mingguan dari komitmen di profil | Rencana adaptif |
| Kartu "Tugas hari ini" | `pages/dashboard.html` | Materi + latihan + tryout, streak, kuota | – |

Cara kerja latihan harian: soal dipilih dari semua paket aktif dengan prioritas **soal yang pernah salah (≥ 1 hari lalu) → soal baru di topik fokus → soal baru lainnya → soal benar yang paling lama**. Topik fokus = 3 topik dengan akurasi terendah (dari latihan dan tryout). Kunci jawaban tidak pernah dikirim sebelum soal dijawab.

## 1. Perbarui frontend

Ekstrak `siap-cpns-fase4-update.zip` ke root repo (timpa file lama). **`config.js` tidak disertakan**, jadi URL backend dan Client ID milikmu tetap aman. Ubah sendiri `APP_VERSION` di `assets/js/core/config.js` menjadi `"0.4.0"` (opsional).

```bash
git add . && git commit -m "Fase 4: materi, latihan harian, rencana belajar" && git push
git tag v0.4-produk-gratis && git push --tags
```

## 2. Perbarui Apps Script

File baru/berubah: `Practice.gs` (baru), `Router.gs`, `Db.gs`, `Tryout.gs`.

```bash
cd backend/apps-script && clasp push
```

Atau salin manual lewat editor Apps Script (buat file `Practice.gs` baru).

## 3. Tambah sheet `practice_answers`

Di editor Apps Script, jalankan **`setupSheets`** sekali lagi. Fungsi ini hanya menambah sheet/kolom yang belum ada; data lama tidak berubah.

## 4. Unggah bank latihan LAT-01

1. Unggah **`LAT-01 – Bank Latihan Harian 1 – LIVE.xlsx`** ke folder paket soal (`QUESTIONS_FOLDER_ID`).
2. Pastikan menjadi **Google Spreadsheet** (File › Simpan sebagai Google Spreadsheet), lalu hapus file .xlsx-nya.
3. Jalankan **`refreshQuestionCache`**, lalu **`checkQuestionFolder`** untuk memastikan LAT-01 terbaca (60 soal: TWK 24 · TIU 18 · TKP 18).

Paket bertipe `latihan` **tidak muncul di lobi Tryout**; soalnya hanya dipakai untuk latihan harian. Soal DIAG-01/02/03 juga ikut dipakai latihan harian.

## 5. Deploy versi baru

**Deploy › Manage deployments › ✏️ Edit › Version: New version › Deploy.** URL Web App tetap sama.

## 6. Uji

1. Buka `materi.html` tanpa login → 20 kartu topik tampil.
2. Masuk → Beranda menampilkan kartu **Tugas hari ini** (materi, latihan 10 soal, tryout bila belum pernah).
3. Kerjakan latihan 10 soal → setiap soal langsung diberi pembahasan; setelah 10 soal muncul pesan kuota habis.
4. Cek sheet `practice_answers` → 10 baris baru.
5. Buka **Rencana** → jadwal 7 hari, topik fokus, dan peta level 20 topik.

## Menambah bank latihan berikutnya

- Gunakan template paket soal yang sama, isi `type` = **`latihan`**, `package_id` unik (mis. `LAT-02`), `free_attempts` dikosongkan.
- Sebaiknya ± 3 soal per topik untuk 20 topik (60 soal). Topik `tiu-figural` sudah didukung sejak Fase 11 (gambar SVG, lihat setup-fase-11.md), tetapi belum dipakai di latihan harian.
- Unggah ke folder → otomatis terbaca ± 1 jam, atau langsung dengan `refreshQuestionCache`.
- Semakin banyak bank, semakin jarang pengguna bertemu soal yang sama. Kebutuhan kasar: 10 soal × 30 hari = 300 soal per pengguna aktif per bulan.

## Catatan

- Materi level 1 ada di `assets/data/materi-level1.json` (repo publik, memang konten gratis). Materi premium level 2–4 nanti disimpan di Spreadsheet, **bukan** di repo.
- Kuota gratis diatur oleh `FREE_PRACTICE_DAILY` di `Practice.gs` (default 10).
- Isi soal dan materi sebaiknya ditinjau tim sebelum soft launch.
