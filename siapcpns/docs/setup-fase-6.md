# Panduan setup Fase 6: Materi Premium Level 2–4 & Rencana Adaptif

Lanjutan dari Fase 5. Estimasi ± 15 menit.

## Isi Fase 6

| Fitur | Gratis | Premium |
|---|---|---|
| Materi level 1 (20 topik) | ✓ (publik, di repo) | ✓ |
| Materi level 2 Paham · 3 Mahir · 4 Siap tes (60 materi) | Cuplikan + ajakan Premium | Isi lengkap: ringkasan, poin kunci, contoh soal + pembahasan, strategi, jebakan |
| Rencana belajar | Rencana dasar (pola tetap, di browser) | **Adaptif** dari server |

Cara kerja rencana adaptif (`Plan.gs`, action `getPlan`):

- **Prioritas topik**: selisih level topik terhadap target (level 3 untuk "lolos ambang batas", level 4 untuk "skor kompetitif"). Topik di subtes yang skornya di bawah ambang batas pada tryout terakhir diberi bobot lebih besar. Topik yang belum terukur juga dinaikkan prioritasnya.
- **Target latihan harian**: dihitung dari menit belajar per hari, lalu disesuaikan dengan kepatuhan 7 hari terakhir. Di bawah 50% target diturunkan; di atas 110% target dinaikkan.
- **Tryout**: dijadwalkan bila belum pernah tryout, atau sudah 14 hari sejak tryout terakhir (7 hari bila tes ≤ 45 hari lagi).
- **Mode akhir**: 14 hari terakhir sebelum tes memakai materi Lv4 dan latihan campuran.
- **Materi harian**: ditautkan ke level yang disarankan, yaitu satu tingkat di atas level saat ini.

## 1. Unggah file materi

1. Unggah **`MATERI – Materi Premium – LIVE.xlsx`** ke Google Drive, **di luar** folder paket soal.
2. Buka → **File › Simpan sebagai Google Spreadsheet** → hapus file .xlsx-nya.
3. Salin ID file dari URL (`/spreadsheets/d/`**`ID`**`/edit`).
4. Jangan bagikan file ini secara publik. Isinya konten berbayar dan hanya dibaca server.

## 2. Perbarui Apps Script

File baru/berubah: `Materi.gs`, `Plan.gs` (baru), `Practice.gs`, `Router.gs`, `Config.gs`.

```bash
cd backend/apps-script && clasp push
```

1. Tambahkan Script Property **`MATERIALS_SPREADSHEET_ID`** = ID file materi.
2. Jalankan **`refreshMaterialCache`**. Log harus menampilkan `Materi live: 60 (Lv2 20 · Lv3 20 · Lv4 20)`.
3. **Deploy › Manage deployments › Edit › New version**.

## 3. Perbarui frontend

Ekstrak `siap-cpns-fase6-update.zip` ke root repo. `config.js` tidak disertakan; opsional ubah `APP_VERSION` menjadi `"0.6.0"`.

```bash
git add . && git commit -m "Fase 6: materi premium & rencana adaptif" && git push
git tag v0.6-premium-inti && git push --tags
```

## 4. Uji

1. **Tanpa login**: `materi.html?topik=twk-uud&level=3` menampilkan cuplikan dan tombol masuk/Premium.
2. **Akun gratis**: cuplikan + ajakan Premium; `rencana.html` menampilkan rencana dasar dan ajakan rencana adaptif.
3. **Akun Premium**:
   - Level 2–4 tampil lengkap, dengan contoh soal interaktif.
   - `rencana.html` menampilkan panel **Analisis rencana adaptif**: catatan, skor per subtes terhadap ambang batas, kepatuhan, dan 6 topik prioritas.
   - Kartu "Tugas hari ini" di beranda mengikuti rencana adaptif, misalnya "Materi Lv2: …" dan "Latihan topik … (10 soal)".
4. Untuk melihat pengaruh skor, kerjakan satu tryout. Topik dari subtes yang paling jauh di bawah ambang batas akan naik ke urutan atas.

## Mengedit materi

- Edit langsung di sheet `materials`. Butir `poin_kunci`, `strategi`, dan `jebakan` ditulis satu per baris (Alt+Enter di dalam sel).
- Untuk TKP, `kunci` adalah opsi bernilai tertinggi.
- Pakai `status` = `draft` untuk menyembunyikan materi.
- Setelah mengedit, jalankan `refreshMaterialCache`. Tanpa itu, perubahan otomatis berlaku dalam ± 1 jam.
- Contoh soal di materi sudah dicek agar tidak sama dengan soal di DIAG-01–03 dan LAT-01–20.

## Keamanan

- Isi materi level 2–4 tidak ada di repo publik. Server hanya mengirim isi lengkap kepada pengguna dengan premium aktif.
- Pengguna lain hanya menerima judul, durasi, jumlah poin, dan ±170 karakter pembuka.
