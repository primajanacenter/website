# Panduan setup Fase 3: Tryout CAT & Rapor

Lanjutan dari Fase 2. Estimasi ± 20 menit (di luar penyusunan soal).

## 1. Perbarui kode Apps Script

Salin/push semua file di `backend/apps-script/`. File baru dan berubah: `Tryout.gs` (baru), `SampleData.gs` (baru), `Db.gs`, `Setup.gs`, `Router.gs`, `Users.gs`.

```bash
cd backend/apps-script && clasp push
```

## 2. Siapkan tempat paket soal — pilih salah satu (boleh keduanya)

### Cara 1 (disarankan): folder Google Drive, 1 file = 1 paket

1. Buat folder di Google Drive, misalnya **Siap CPNS – Paket Soal**. Jangan dibagikan selain ke tim penyusun soal.
2. Salin ID folder dari URL: `https://drive.google.com/drive/folders/`**`INI_ID_FOLDER`**.
3. Tambahkan Script Property **`QUESTIONS_FOLDER_ID`** = ID folder.
4. Untuk setiap paket: buat file dari `template-paket-soal-tryout.xlsx` → unggah ke folder → **File › Simpan sebagai Google Spreadsheet** (file .xlsx tidak terbaca; hanya Google Spreadsheet). Hapus file .xlsx-nya agar tidak membingungkan.
   - Tip: di Google Drive ⚙ Setelan → centang **"Konversi file yang diupload ke format editor Google Dokumen"**, maka file .xlsx otomatis menjadi Google Spreadsheet saat diunggah.
5. Setiap file wajib berisi sheet **`packages`** (1 baris) dan **`questions`**. Sheet lain diabaikan. Urutan kolom boleh berbeda selama nama kolomnya benar.
6. `package_id` harus unik di semua file. Jika ganda, yang terbaca hanya satu dan sisanya diabaikan (tercatat di log).

File baru otomatis muncul di aplikasi dalam ± 1 jam (setelah `installQuestionTrigger` dipasang), atau **langsung** dengan menjalankan `refreshQuestionCache`.

Fungsi tambahan:
- `checkQuestionFolder` — laporan semua paket: jumlah soal per subtes dan baris yang bermasalah (tidak mengubah data).
- `createDemoPackageFile` — membuat file paket DEMO-01 (15 soal) langsung di folder.
- `installQuestionTrigger` — jalankan sekali untuk memasang pembaruan otomatis per jam.

### Cara 2: satu file BANK SOAL berisi banyak paket

1. Buat Spreadsheet baru, misalnya **Siap CPNS – Bank Soal**. **Jangan dibagikan** ke siapa pun selain tim penyusun soal.
2. Salin ID-nya, tambahkan Script Property **`QUESTIONS_SPREADSHEET_ID`**.

Bank soal dipisah dari database pengguna agar akses tim penyusun soal tidak mencakup data pribadi pengguna, dan sebaliknya.

## 3. Jalankan fungsi setup (dari editor Apps Script)

| Urutan | Fungsi | Cara 1 (folder) | Cara 2 (satu file) |
|---|---|---|---|
| 1 | `setupSheets` | ✓ | ✓ — menambah sheet **attempts** di database utama |
| 2 | `setupQuestionSheets` | – | ✓ — membuat sheet packages & questions |
| 3 | paket demo | `createDemoPackageFile` | `importDemoPackage` |
| 4 | `installQuestionTrigger` | ✓ (sekali) | opsional |
| 5 | `checkQuestionFolder` | cek laporan di Execution log | cek laporan |

Saat pertama menjalankan fungsi yang memakai folder, Google meminta izin akses Drive — klik **Izinkan**.

## 4. Deploy versi baru

Deploy → Manage deployments → ✏ Edit → Version: **New version** → Deploy. URL tetap sama.

## 5. Uji

Masuk ke situs → Beranda → **Tryout CAT** → Mulai **Tryout Demo**. Kerjakan beberapa soal, muat ulang halaman (jawaban harus tetap ada), selesaikan, dan cek rapor. Di Spreadsheet, sheet `attempts` akan berisi baris dengan status `submitted`.

---

## Menyusun paket tryout sungguhan (misalnya DIAG-01)

### Sheet `packages` — satu baris per paket

| Kolom | Contoh | Keterangan |
|---|---|---|
| package_id | `DIAG-01` | Kode unik, tanpa spasi |
| title | Tryout Diagnostik 1 | Ditampilkan ke peserta |
| type | `diagnostic` | `diagnostic`, `demo`, nanti `akbar` / `premium` |
| description | Ukur kemampuan awalmu… | Opsional |
| duration_min | `100` | Durasi ujian (menit) |
| pg_twk / pg_tiu / pg_tkp | kosong | Kosong = 65 / 80 / 166. Isi angka jika paket tidak 110 soal |
| free_attempts | `1` | Batas percobaan untuk pengguna gratis. Kosong = tanpa batas |
| status | `draft` → `live` | Hanya paket `live` yang tampil |
| order | `1` | Urutan tampil (kecil di atas) |

### Sheet `questions` — satu baris per soal

| Kolom | Isi |
|---|---|
| question_id | Unik, contoh `DIAG-01-001` |
| package_id | `DIAG-01` |
| number | 1–110 (urutan tampil). Susun TWK 1–30, TIU 31–65, TKP 66–110 seperti SKD |
| subtest | `TWK`, `TIU`, atau `TKP` |
| topic_id | Salah satu kode topik di bawah |
| level | 1–4 (Kenal, Paham, Mahir, Siap tes) — dipakai di Fase 4 |
| text | Teks soal |
| context | Opsional: deret angka, tabel singkat, kutipan |
| option_a … option_e | Teks opsi |
| answer | **TWK/TIU:** huruf jawaban benar (`a`–`e`). **TKP:** kosongkan |
| score_a … score_e | **TKP:** nilai 1–5 untuk tiap opsi. **TWK/TIU:** kosongkan |
| explanation | Pembahasan |
| status | `live` (atau `draft` untuk menyembunyikan) |
| source | Penyusun/sumber, untuk catatan internal |

**Kode topik (`topic_id`):**
- TWK: `twk-pancasila`, `twk-uud`, `twk-nkri`, `twk-bhinneka`, `twk-nasionalisme`, `twk-integritas`, `twk-belanegara`, `twk-bahasa`
- TIU: `tiu-analogi`, `tiu-silogisme`, `tiu-analitis`, `tiu-deret`, `tiu-hitung`, `tiu-cerita`, `tiu-figural`
- TKP: `tkp-pelayanan`, `tkp-jejaring`, `tkp-sosbud`, `tkp-tik`, `tkp-profesionalisme`, `tkp-antiradikalisme`

Baris judul (salin ke baris 1 jika membuat sheet sendiri):
```
question_id	package_id	number	subtest	topic_id	level	text	context	option_a	option_b	option_c	option_d	option_e	answer	score_a	score_b	score_c	score_d	score_e	explanation	status	source
```

### Setelah mengubah soal atau paket

Daftar paket dan soal di-cache (diperbarui otomatis tiap jam bila trigger terpasang). Agar perubahan langsung aktif, jalankan **`refreshQuestionCache`** dari editor. Jalankan **`checkQuestionFolder`** untuk memeriksa kelengkapan sebelum mengubah status ke `live`.

### Checklist kualitas sebelum `live`
- [ ] Jumlah soal per subtes sesuai (30/35/45 untuk paket penuh)
- [ ] Setiap soal TWK/TIU punya tepat satu `answer`; setiap soal TKP punya `score_a…e` berisi 1–5 dan tepat satu opsi bernilai 5
- [ ] Pembahasan ada di semua soal
- [ ] Soal orisinal (bukan salinan soal resmi atau buku/aplikasi lain) dan sudah direview orang kedua
- [ ] Uji coba sendiri sebagai pengguna sebelum mengubah status ke `live`

## Catatan perilaku

- Waktu ujian ditentukan server (`ends_at`). Jika peserta menutup halaman, waktu tetap berjalan; setelah habis, jawaban yang tersimpan dinilai otomatis.
- Jawaban dikirim ke server setiap 10 perubahan, tiap 2 menit, dan saat tab ditinggalkan. Kirim jawaban yang terlambat > 3 menit setelah waktu habis memakai jawaban terakhir yang tersimpan di server.
- Kunci jawaban dan skor TKP tidak pernah dikirim ke browser sebelum ujian dinilai.
- Pengguna gratis: rapor per subtes, 1 topik terlemah, 5 pembahasan prioritas. Detail lengkap disiapkan untuk Premium (Fase 5–6).
