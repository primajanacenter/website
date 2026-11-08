# Alur pengguna (ringkas)

1. **Cek Kesiapan** (tanpa login) → skor 0–100, level, 3 rekomendasi, pembahasan.
2. **Simpan hasil** → daftar/login (Fase 2) → onboarding singkat (data assessment terisi otomatis).
3. **Tetapkan target & komitmen** → formasi, target skor, tanggal tes, menit/hari, hari/minggu.
4. **Tryout diagnostik gratis** → rapor ringkas → *Paywall 1* (rapor detail per topik).
5. **Loop harian** → materi sesuai level, 10 soal/hari (gratis) atau latihan adaptif (premium).
6. **Tryout Akbar mingguan** → persentil & peringkat nasional (gratis) → *Paywall 3* (pembahasan lengkap, peringkat formasi).
7. **Pembayaran** (Mayar V2) → webhook → cek ulang status → premium aktif.
8. **Hari-H & pasca-SKD** → input skor asli → SKB add-on / rencana seleksi berikutnya.

## Tahapan pengembangan

| Fase | Isi | Status |
|---|---|---|
| 0 | Fondasi: struktur, CSS, api.js mock, deploy | ✅ |
| 1 | Landing + Cek Kesiapan + Panduan | ✅ |
| 2 | Apps Script + Sheets, Google Sign-In, onboarding, beranda | ✅ |
| 3 | Tryout CAT + rapor (paket DEMO; paket diagnostik 110 soal disusun tim) | ✅ |
| 4 | Materi level 1, latihan harian, rencana dasar → soft launch | ⏳ |
| 5 | Pembayaran Mayar (sandbox → production) | ⏳ |
| 6 | Fitur premium inti | ⏳ |
| 7 | Tryout Akbar (uji beban dulu) | ⏳ |
| 8 | Pasca-SKD, SKB, referral | ⏳ |
