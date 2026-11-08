# Panduan setup Fase 3: Tryout CAT & Rapor

Lanjutan dari Fase 2. Estimasi ± 20 menit (di luar penyusunan soal).

## 1. Perbarui kode Apps Script

Salin/push semua file di `backend/apps-script/`. File baru dan berubah: `Tryout.gs` (baru), `SampleData.gs` (baru), `Db.gs`, `Setup.gs`, `Router.gs`, `Users.gs`.

```bash
cd backend/apps-script && clasp push
```

## 2. Buat file Spreadsheet BANK SOAL (terpisah)

1. Buat Spreadsheet baru, misalnya **Siap CPNS – Bank Soal**. **Jangan dibagikan** ke siapa pun selain tim penyusun soal.
2. Salin ID-nya, tambahkan Script Property **`QUESTIONS_SPREADSHEET_ID`**.

Bank soal dipisah dari database pengguna agar akses tim penyusun soal tidak mencakup data pribadi pengguna, dan sebaliknya.

## 3. Jalankan fungsi setup (dari editor Apps Script)

| Urutan | Fungsi | Hasil |
|---|---|---|
| 1 | `setupSheets` | Menambah sheet **attempts** di database utama (sheet lama tidak berubah) |
| 2 | `setupQuestionSheets` | Membuat sheet **packages** dan **questions** di bank soal |
| 3 | `importDemoPackage` | Memasukkan paket **DEMO-01** (15 soal contoh) |

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
- TWK: `twk-pancasila`, `twk-uud`, `twk-nkri`, `twk-bhinneka`, `twk-nasionalisme`, `twk-integritas`, `twk-belanegara`
- TIU: `tiu-analogi`, `tiu-silogisme`, `tiu-analitis`, `tiu-deret`, `tiu-hitung`, `tiu-cerita`, `tiu-figural`
- TKP: `tkp-pelayanan`, `tkp-jejaring`, `tkp-sosbud`, `tkp-tik`, `tkp-profesionalisme`, `tkp-antiradikalisme`

Baris judul (salin ke baris 1 jika membuat sheet sendiri):
```
question_id	package_id	number	subtest	topic_id	level	text	context	option_a	option_b	option_c	option_d	option_e	answer	score_a	score_b	score_c	score_d	score_e	explanation	status	source
```

### Setelah mengubah soal atau paket

Soal di-cache ± 10 menit. Agar perubahan langsung aktif, jalankan **`refreshQuestionCache`** dari editor.

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
