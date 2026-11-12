# Fase 14 — Paket SKB per instansi & Latihan Wawancara

## Ringkasan
Beranda kini berisi 8 kotak (4 × 2 di HP): A–F seperti sebelumnya, ditambah **G. Paket SKB** dan **H. Panduan & Info CPNS**.

**G. Paket SKB** (`pages/paket-skb.html`):
1. Pengguna memilih instansi. Pilihan tersimpan di profil (kolom `users.skb_instansi`).
2. Setiap instansi punya 5 kotak:
   - **Tryout SKB**: 3 paket × 100 soal, 90 menit, bebas diulang, rapor dan pembahasan.
   - **Materi SKB**: 6–7 topik. Setiap topik berisi 4 bagian (konsep dasar → strategi) dan 3 contoh soal mudah, sedang, sulit.
   - **Latihan Soal**: 50 soal per topik, 45 menit, disusun dari mudah ke sulit.
   - **Wawancara**: latihan wawancara bergaya mock test, mode suara atau mode ketik.
   - **Info seleksi**: catatan seleksi dan kalkulator nilai akhir.
3. Instansi yang tersedia: Kemenag, Kemendikbudristek, Kejaksaan, Kemenkes, PUPR, dan **SKB Umum ASN**. SKB Umum ASN adalah gabungan dari halaman SKB lama dan paket `SKB-KTU-01`.
4. Nama instansi mengikuti istilah yang Anda berikan. Setiap instansi diberi catatan perubahan kelembagaan:
   - Kemendikbudristek dipecah menjadi 3 kementerian (Oktober 2024).
   - PUPR dipecah menjadi Kementerian PU dan Kementerian PKP.
   - Urusan halal (BPJPH, 2024) dan haji (Kementerian Haji dan Umrah, 2025) tidak lagi di Kemenag.

| Akses | Gratis | Premium SKB |
|---|---|---|
| Materi | topik pertama tiap instansi | semua topik, semua instansi |
| Latihan soal | topik pertama tiap instansi | semua |
| Tryout SKB instansi | – | 3 tryout, bebas diulang |
| Wawancara | 1 sesi per instansi | tanpa batas |
| SKB Umum ASN | seperti sebelumnya (kuota gratis per paket) | sama |

**Premium SKB** berharga **Rp85.000 per 30 hari** untuk semua instansi.
- Tidak ada pilihan 3 atau 6 bulan. Membeli lagi sebelum masa aktif habis menambah 30 hari.
- Premium SKB terpisah dari Premium SKD: yang satu tidak membuka yang lain.
- Diskon ajak teman tidak berlaku untuk Premium SKB.
- Harga bisa diubah lewat Script Property `PRICE_SKB`.

## Latihan Wawancara (mode suara, tanpa AI)
**Format sesi:** 7 pertanyaan dalam 3 bagian, mirip mock test IELTS speaking.
- Bagian 1 (3 pertanyaan): perkenalan dan motivasi. Persiapan 10 detik, menjawab 60 detik.
- Bagian 2 (1 pertanyaan): presentasi singkat. Persiapan 60 detik, berbicara 120 detik.
- Bagian 3 (3 pertanyaan): wawasan instansi dan situasi kerja. Persiapan 15 detik, menjawab 90 detik.

**Alur di aplikasi:**
1. Pertanyaan dibacakan dengan suara pewawancara (fitur speechSynthesis, bahasa id-ID).
2. Waktu persiapan berjalan, lalu perekaman dimulai otomatis.
3. Ucapan diubah menjadi teks di browser (Web Speech API).
4. Rekaman suara hanya disimpan di perangkat untuk didengar ulang. Rekaman tidak dikirim ke server.
5. Pengguna memeriksa teks hasil pengenalan suara (boleh memperbaiki salah dengar) dan mengisi penilaian diri.

**Dukungan browser:**
- Mode suara: Chrome atau Edge di Android dan desktop. Di Safari iOS dukungannya terbatas.
- Bila browser tidak mendukung, mode ketik dipilih otomatis.

**Rubrik otomatis (skor 0–100, diubah menjadi band 1–9):**
- Isi dan kata kunci (40): kata kunci per pertanyaan dari sheet `interview`.
- Struktur (15): kata penghubung seperti "pertama", "karena", "contohnya", "kesimpulannya".
- Kelancaran dan bahasa (20):
  - kata pengisi seperti "eee", "anu", "gitu" per menit;
  - kata tidak baku;
  - tempo bicara, idealnya ±70–175 kata per menit.
- Waktu atau panjang jawaban (15).
- Penilaian diri (10).

**Penilaian dan hasil:**
- Kata kunci dan jawaban model hanya ada di server.
- Jawaban model dikirim ke pengguna setelah sesi selesai. Hasil sesi juga masuk ke Rapot.

## Langkah pemasangan
1. **Apps Script**
   - File baru: `Skb.gs`.
   - File yang berubah: `Db.gs`, `Auth.gs`, `Tryout.gs`, `Shop.gs`, `Materi.gs`, `Router.gs`, `Users.gs`, `Plan.gs`, `PostSkd.gs`, `Admin.gs`.
   - Paling aman: salin ulang semua file `.gs`.
2. **Jalankan `setupSheets()`.**
   - Kolom baru di `users`: `skb_until`, `skb_instansi`.
   - Sheet baru: `interviews`.
   - Kolom baru di bank soal `packages`: `instansi` (dipakai bila Anda memakai `QUESTIONS_SPREADSHEET_ID`).
3. **Paket soal SKB Kemenag** (zip RAHASIA):
   - Unggah 4 file ke folder paket soal (`QUESTIONS_FOLDER_ID`):
     - `SKBLAT-KEMENAG`
     - `SKB-KEMENAG-01`
     - `SKB-KEMENAG-02`
     - `SKB-KEMENAG-03`
   - Simpan masing-masing sebagai Google Spreadsheet, lalu hapus file `.xlsx`-nya.
4. **Materi dan wawancara.**
   - `MATERI – Materi Premium + SKB – LIVE.xlsx` berisi 63 materi SKD lama, 24 materi SKB Kemenag, dan sheet `interview` (57 pertanyaan untuk 5 instansi).
   - Cara termudah: unggah file ini, simpan sebagai Google Spreadsheet, lalu ganti Script Property `MATERIALS_SPREADSHEET_ID` dengan ID file baru.
   - Alternatif: salin baris `MAT-kmg-…` dan sheet `interview` ke file materi lama.
5. Jalankan `refreshQuestionCache()` lalu `refreshSkbCache()`. Log akan menampilkan jumlah tryout, soal latihan, dan pertanyaan wawancara per instansi.
6. **Deploy:** Manage deployments › Edit › **New version**.
7. **GitHub:**
   - Unggah isi zip update.
   - `config.js`, `privasi.html`, dan `syarat.html` tetap tidak disertakan.
   - `CACHE_VERSION = "sc-v14.0"`.
8. **Opsional:**
   - `adminGrantSkb()` untuk memberi Premium SKB secara manual.
   - Script Property `SKB_TOPIC_MIN` untuk mengubah durasi latihan SKB.

## Menambah instansi berikutnya (bertahap)
- Daftar instansi dan topik ada di `SKB_INSTANSI` (`Skb.gs`). ID topik sudah disiapkan untuk kelima instansi.
- Untuk setiap instansi, tambahkan:
  - 1 file bank latihan `SKBLAT-<KODE>`: `type = skblat`, `instansi = <id>`, minimal 50 soal per topik.
  - 3 file tryout `SKB-<KODE>-0x`: `type = skb`, `instansi = <id>`, masing-masing 100 soal.
  - Baris materi `MAT-<topik>-L1..L4`.
- Kode instansi: `DIKBUD`, `KEJAGUNG`, `KEMENKES`, `PUPR`.
- Kotak yang belum berisi konten otomatis tampil "Segera hadir".
- Bank wawancara untuk kelima instansi sudah terisi.

## Isi tahap ini & catatan jujur
- **Kemenag, 6 topik:**
  - 427 soal unik dengan pembahasan;
  - 300 soal untuk latihan (50 per topik);
  - 3 tryout × 100 soal (distribusi kunci A–E seimbang);
  - 24 materi;
  - 18 contoh soal.
- **Soal tryout yang sama dengan latihan:** dari 300 soal tryout, 191 juga ada di bank latihan. Soal unik belum cukup untuk 600 slot. Agar tryout dan latihan sepenuhnya berbeda, perlu sekitar 190 soal tambahan. Ini bisa saya tambahkan di tahap berikutnya.
- **Panjang opsi jawaban:** sudah diseimbangkan agar jawaban benar tidak selalu opsi terpanjang (sebelumnya 83%, sekarang 40%). Pemeriksaan ulang oleh ahli materi Kemenag tetap disarankan sebelum rilis.
- **Kemendikbudristek, Kejaksaan, Kemenkes, PUPR:** saat ini baru bank wawancara dan info seleksi. Materi, latihan, dan tryout menyusul per instansi.

## Uji yang sudah dijalankan
- **Harness backend:** ALL PASSED (370 uji, termasuk 48 uji Fase 14), mencakup:
  - harga Rp85.000 dari server dan perpanjangan 30 hari yang idempoten;
  - gating gratis/Premium SKB;
  - Premium SKD tidak membuka SKB;
  - kunci jawaban, kata kunci, dan jawaban model tidak bocor sebelum selesai;
  - rubrik mendeteksi kata pengisi dan bahasa tidak baku;
  - rotasi pertanyaan wawancara;
  - Rapot dan dasbor admin.
- **E2E dengan backend nyata dan konten Kemenag asli (HP 390 px):**
  - pilih instansi;
  - materi dan contoh soal;
  - latihan 50 soal → rapor;
  - beli Premium SKB → tryout 100 soal terbuka;
  - wawancara 7 pertanyaan → band dan jawaban model;
  - tes mikrofon;
  - Rapot, Akun, dan dasbor admin.
  - Hasil: tanpa galat dan tanpa geser horizontal.
