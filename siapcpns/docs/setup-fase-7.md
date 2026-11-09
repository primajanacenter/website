# Panduan setup Fase 7: Tryout Akbar Mingguan

Lanjutan dari Fase 6. Perkiraan waktu sekitar 20 menit, ditambah 10 menit jika menjalankan uji beban.

## Isi Fase 7

| | Gratis (login) | Premium |
|---|---|---|
| Ikut Tryout Akbar setiap Minggu | ✓ | ✓ |
| Skor & peringkat nasional (50 teratas + posisi saya + persentil) | ✓ | ✓ |
| Peringkat provinsi (20 teratas di provinsi target) | – | ✓ |
| Analisis skor vs rata-rata 10% teratas per subtes | – | ✓ |
| Pembahasan setelah hasil terbit | 5 soal | Semua soal |

**Aturan event**

- Event dibuka **Minggu pukul 06.00–21.00 WIB**. Peserta bebas memilih jam mulai.
- Durasi pengerjaan 100 menit (110 soal). Batas terakhir untuk mulai adalah **19.20 WIB**, agar waktu pengerjaan tidak melewati jam tutup.
- Setiap akun hanya boleh mengikuti **satu kali** per event. Jika browser tertutup, peserta melanjutkan attempt yang sama.
- Skor, kunci jawaban, dan pembahasan **dikunci sampai hasil terbit pada Senin pukul 06.00 WIB**. Tujuannya mencegah soal dan kunci bocor ke peserta yang belum mengerjakan.
- Urutan peringkat: total → TKP → TIU → TWK → durasi tercepat.
- Nama di papan peringkat disamarkan menjadi nama depan + inisial, misalnya "Alice W.". Email dan ID pengguna tidak pernah dikirim.
- Attempt yang belum dikumpulkan saat event ditutup akan dinilai otomatis dari jawaban terakhir yang tersimpan.

## 1. Perbarui Apps Script

File baru/berubah:

- Baru: `Akbar.gs`
- Berubah: `Db.gs`, `Router.gs`, `Tryout.gs`, `Users.gs`

```bash
cd backend/apps-script && clasp push
```

1. Jalankan **`setupSheets`**. Fungsi ini menambahkan:
   - Sheet `akbar_events`, `akbar_results`, dan `loadtest_log`.
   - Kolom `event_id` di sheet `attempts`.

   Data lama tidak terhapus.
2. **Deploy › Manage deployments › Edit › New version**.

## 2. Unggah 4 paket Tryout Akbar

File: `AKBAR-01` s.d. `AKBAR-04` (`… – LIVE.xlsx`). Setiap file berisi 110 soal HOTS (TWK 30 · TIU 35 · TKP 45) dengan `type` = `akbar`.

Soal-soal ini sudah dicek tidak sama dengan DIAG-01–03, LAT-01–20, maupun contoh soal di materi.

1. Unggah keempat file ke **folder paket soal** (`QUESTIONS_FOLDER_ID`).
2. Untuk setiap file: buka → **File › Simpan sebagai Google Spreadsheet** → hapus file .xlsx-nya.
3. Jalankan **`checkQuestionFolder`**. Log harus menampilkan 4 paket akbar, masing-masing 110 soal live.
4. Jalankan **`refreshQuestionCache`**.

Paket `akbar` **tidak tampil** di lobi tryout dan tidak bisa dibuka melalui `startAttempt`. Paket ini hanya dapat diakses selama jendela event.

> File paket berisi kunci jawaban. Jangan simpan di repo dan jangan bagikan tautannya.

## 3. Jadwalkan event

1. Jalankan **`scheduleAkbarEvents`**. Setiap paket akbar yang belum terjadwal ditempatkan di hari Minggu kosong berikutnya, sesuai urutan `order`:

   ```
   Terjadwal: AKBAR-01 → Minggu 2026-11-15 06.00–21.00 WIB
   …
   4 event dibuat.
   ```

2. Periksa sheet `akbar_events`. Tanggal boleh diubah manual di kolom `opens_at`, `closes_at`, dan `results_at` (format ISO, misalnya `2026-11-15T06:00:00+07:00`). Jaga `event_id` tetap unik.
3. Jalankan **`installAkbarTrigger`** satu kali. Trigger per jam ini (`publishAkbarResults`) menerbitkan hasil begitu `results_at` lewat.
4. Untuk bulan berikutnya, cukup unggah paket `AKBAR-05` dst. lalu jalankan `scheduleAkbarEvents` lagi.

**Admin**

- `adminRepublishAkbar`: hitung ulang peringkat sebuah event, misalnya setelah kunci jawaban dikoreksi. Ganti nilai `EVENT_ID` di baris pertama fungsi sebelum dijalankan.
- Untuk membatalkan event, ubah `status` menjadi `cancelled`.

## 4. Perbarui frontend

Ekstrak `siap-cpns-fase7-update.zip` ke root repo. File `config.js` tidak disertakan. Opsional: ubah `APP_VERSION` menjadi `"0.7.0"`.

```bash
git add . && git commit -m "Fase 7: Tryout Akbar mingguan" && git push
git tag v0.7-akbar && git push --tags
```

Halaman baru: `pages/akbar.html`. Tautan ke halaman ini muncul di beranda, landing page, dan lobi tryout.

## 5. Uji alur

1. **Tanpa login**: `akbar.html` menampilkan jadwal, hitung mundur, dan aturan. Tombol ikut mengarahkan ke halaman masuk.
2. **Simulasi event berjalan**:
   - Ubah `opens_at` event pertama ke 1 jam lalu dan `closes_at` ke 5 jam lagi.
   - Masuk, klik **Ikut sekarang**, kerjakan beberapa soal, lalu kumpulkan.
   - Halaman kembali ke lobi, menampilkan status sudah mengumpulkan dan jadwal terbit hasil.
   - Mengikuti lagi ditolak, dan rapor masih terkunci.
3. **Simulasi hasil terbit**:
   - Ubah `closes_at` dan `results_at` ke waktu yang sudah lewat, lalu jalankan `publishAkbarResults`.
   - Peringkat nasional, posisi saya, dan persentil tampil. Akun Premium juga melihat tab Provinsi dan analisis vs 10% teratas.
4. Kembalikan tanggal event ke jadwal semula. Hapus baris uji di `akbar_results` dan attempt uji di `attempts` (yang memiliki `event_id`) agar event resmi tetap bersih. Jika ragu, jalankan `adminRepublishAkbar` setelah event selesai.

## 6. Uji beban (disarankan sebelum event pertama)

Apps Script membatasi sekitar **30 eksekusi bersamaan** per skrip. Jendela 15 jam menyebar peserta, dan jawaban hanya disimpan setiap 10 perubahan atau 2 menit. Kapasitas nyata tetap perlu diukur.

1. Isi Script Property **`LOADTEST_TOKEN`** dengan string acak, misalnya hasil `generateWebhookToken`.
2. Dari komputer Anda (Node.js 18+):

   ```bash
   node tools/loadtest-akbar.mjs https://script.google.com/macros/s/XXX/exec TOKEN 5,10,20,30 30
   ```

   Output per tingkat konkurensi: jumlah permintaan, error, p50, p95, permintaan per detik, dan **perkiraan peserta serentak** (rps × interval simpan 60 detik).
3. **Kosongkan `LOADTEST_TOKEN` setelah selesai.** Tanpa token, action `loadProbe` dianggap tidak ada. Hapus juga isi sheet `loadtest_log`.

**Membaca hasil**

- Error ≤ 1% dan p95 < 3 detik pada konkurensi 20–30 berarti aman untuk ratusan hingga ±1.000 peserta tersebar dalam satu hari.
- Jika error mulai muncul di konkurensi rendah (misalnya 10), umumkan anjuran memilih jam mulai yang berbeda (pagi/siang/malam), atau pertimbangkan memindahkan penyimpanan jawaban ke layanan lain pada fase berikutnya.
- Kuota harian akun Google gratis (waktu eksekusi total ± 90 menit/hari untuk trigger, 6 menit per eksekusi) cukup untuk trigger per jam ini. `publishAkbarEvent_` memproses ribuan peserta dalam satu eksekusi.

## Keamanan & privasi

- Kunci jawaban dan skor tidak dikirim selama event berlangsung.
- Papan peringkat publik hanya memuat nama tersamar, skor, status lolos ambang batas, dan provinsi target.
- `LOADTEST_TOKEN` hanya disimpan di Script Properties dan dikosongkan setelah uji.
- Kebijakan Privasi diperbarui dengan keterangan papan peringkat (`pages/privasi.html`).
