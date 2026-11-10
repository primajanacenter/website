# Panduan setup Fase 8: Hasil SKD, Persiapan SKB & Ajak Teman

Lanjutan dari Fase 7. Perkiraan waktu sekitar 15 menit.

## Isi Fase 8

| Fitur | Gratis (login) | Premium |
|---|---|---|
| **Hasil SKD** (`pages/pasca-skd.html`): input skor resmi, analisis ambang batas, perbandingan dengan tryout, kontribusi ke nilai akhir, simulasi SKB, langkah berikutnya | ✓ | ✓ |
| **Persiapan SKB** (`pages/skb.html`): panduan, kalkulator nilai akhir, checklist 8 langkah | ✓ | ✓ |
| Tryout SKB per rumpun jabatan | 1× per paket, 5 pembahasan | Tanpa batas, semua pembahasan & topik |
| **Ajak teman** (`pages/ajak.html`) | Kode ajakan, tautan, WhatsApp, statistik | sama |

**Aturan ajak teman**

- Setiap pengguna punya kode ajakan, misalnya `SC7KQ2MX`. Tautannya `https://domainmu/?ref=SC7KQ2MX`.
- Teman yang membuka tautan lalu masuk (atau mengisi kode di halaman Ajak teman) dan **belum pernah membeli Premium** mendapat **diskon 10%** untuk pembelian pertama. Harga diskon dihitung di server dan dikirim ke Mayar.
- Setelah pembayaran teman lunas, pengajak otomatis mendapat **+7 hari Premium**. Bonus ini ditumpuk ke masa aktif yang ada.
- Batas bonus 20 kali per 30 hari per pengajak. Bonus diberikan sekali per teman, hanya untuk pembelian pertama. Tidak ada komisi uang.
- Konstanta bisa diubah di `Referral.gs`: `REF_BONUS_DAYS`, `REF_DISCOUNT_PCT`, `REF_MAX_REWARDS_30D`.

**Rumus nilai akhir yang dipakai**

Ini bobot umum seleksi CPNS 2024 (Permenpanrb 6/2024):

- Nilai SKD = skor SKD ÷ 550 × 40
- Nilai akhir = Nilai SKD + nilai SKB (skala 100) × 60%

Halaman selalu menyebutkan bahwa komposisi bisa berbeda per instansi. Jika aturan seleksi baru terbit, ubah `SKD_WEIGHT`/`SKB_WEIGHT` di `PostSkd.gs` dan teks di `pages/skb.html`.

## 1. Perbarui Apps Script

- Baru: `PostSkd.gs`, `Referral.gs`
- Berubah: `Db.gs`, `Router.gs`, `Tryout.gs`, `Payment.gs`, `Users.gs`, `Plan.gs`, `Practice.gs`

```bash
cd backend/apps-script && clasp push
```

1. Jalankan **`setupSheets`**. Fungsi ini menambahkan:
   - Sheet `skd_results` dan `referrals`.
   - Kolom `ref_code` di sheet `users`.
   - Kolom `ref_code` dan `discount` di sheet `transactions`.

   Kolom baru ditaruh di akhir, jadi data lama aman.
2. **Deploy › Manage deployments › Edit › New version**.

## 2. Unggah paket SKB pertama

File: **`SKB-KTU-01 – SKB Kemampuan Teknis Umum ASN 1 – LIVE.xlsx`**

- Isi: 50 soal, 60 menit, 5 topik masing-masing 10 soal: Manajemen ASN & disiplin, Standar pelayanan publik, Administrasi pemerintahan, Akuntabilitas kinerja & anggaran, Integritas & keterbukaan informasi.
- `type` = `skb`, `free_attempts` = 1.
- Kunci jawaban tersebar rata a–e.

Langkah:

1. Unggah ke **folder paket soal**.
2. **File › Simpan sebagai Google Spreadsheet**, lalu hapus file .xlsx-nya.
3. Jalankan `refreshQuestionCache`.
4. Minta orang kedua mereview isinya. Regulasi bisa berubah, dan soal SKB sebaiknya dicocokkan dengan kisi-kisi resmi jabatan.

**Menambah rumpun lain** (misalnya Guru, Kesehatan, Teknis):

1. Salin file tadi dan ganti `package_id`/`title`.
2. Kolom `subtest` tetap `SKB`.
3. `topic_id` boleh baru, asalkan diawali `skb-`. Nama topik baru akan tampil sebagai ID di rapor sampai ditambahkan ke `SKB_TOPICS` di `Tryout.gs`.

Paket `skb` tidak tampil di lobi tryout SKD dan tidak memengaruhi rencana belajar, latihan, maupun "skor terakhir" di beranda.

## 3. Perbarui frontend

Ekstrak `siap-cpns-fase8-update.zip` ke root repo. File `config.js` tidak disertakan. Opsional: ubah `APP_VERSION` menjadi `"0.8.0"`.

```bash
git add . && git commit -m "Fase 8: hasil SKD, persiapan SKB, ajak teman" && git push
git tag v0.8-pasca-skd && git push --tags
```

Halaman baru `pasca-skd.html`, `skb.html`, dan `ajak.html` ditautkan dari panel **"Setelah SKD & lainnya"** di beranda. Kalau tanggal tes di profil sudah lewat, beranda juga menampilkan ajakan untuk mengisi skor SKD.

## 4. Uji

1. **Hasil SKD**:
   - Isi TWK 90, TIU 100, TKP 180 dengan tanggal hari ini. Hasilnya: lolos ambang batas, kontribusi SKD 26,91, simulasi 4 skenario, langkah pertama "Siapkan SKB".
   - Ubah TIU menjadi 70. Hasilnya: belum lolos, langkah pertama "Fokus ke TIU".
2. **SKB**:
   - Kalkulator dengan 400/75 menghasilkan 74,09.
   - Paket SKB-KTU-01 tampil dan bisa dikerjakan. Rapor menampilkan "Nilai SKB …/100".
   - Akun gratis tidak bisa mengulang paket yang sama.
3. **Ajak teman** (butuh 2 akun Google dan Mayar sandbox):
   - Akun A membuka `ajak.html` dan menyalin tautan.
   - Di browser lain (jendela privat), buka tautan itu lalu masuk dengan akun B. Beranda B menampilkan notifikasi diskon, dan `premium.html` menampilkan harga −10%, misalnya Rp44.100.
   - B membayar di sandbox. Setelah status lunas, B mendapat Premium dan A mendapat +7 hari Premium. Statistik di `ajak.html` milik A bertambah.
   - Kode milik sendiri dan pembeli lama tidak bisa memakai kode.

## Keamanan & privasi

- Diskon dan bonus dihitung sepenuhnya di server. Frontend hanya mengirim kode.
- Bonus diberikan di dalam proses aktivasi yang sama (idempoten). Pemeriksaan ulang pembayaran tidak menggandakan bonus.
- Pengajak tidak melihat nama atau email teman, hanya tanggal dan status.
- Skor SKD hanya bisa dibaca pemiliknya.
- Kebijakan Privasi sudah diperbarui (skor SKD dan kode ajakan).
- File paket SKB berisi kunci jawaban, jadi jangan simpan di repo.
