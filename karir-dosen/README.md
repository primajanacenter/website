# Tangga Karier Dosen — Paket Rilis GitHub Pages

Semua file di folder ini siap diunggah **flat** (sejajar, tanpa subfolder tambahan kecuali `icons/`) ke repo GitHub Anda.

## Struktur file

```
index.html                          ← Landing page utama (jadi halaman depan situs)
premium-landing.html                ← Landing page khusus Premium (funnel konversi ke Mayar)
Tangga-Karier-Dosen-FREE.html       ← Aplikasi versi Free
Tangga-Karier-Dosen-PREMIUM.html    ← Aplikasi versi Premium (JANGAN dimasukkan ke repo publik — lihat catatan di bawah)
manifest.json                       ← Untuk fitur PWA (install ke homescreen) di versi Premium
sw.js                               ← Service worker (mode offline) untuk versi Premium
icons/icon-192.png
icons/icon-512.png
```

## Alur funnel

```
index.html (kesadaran/awareness)
   → klik "Lihat Premium" / "Beli Premium"
premium-landing.html (pitch mendalam: keuntungan, fitur, contoh output)
   → klik "Beli Sekarang"
Mayar.id (checkout & pembayaran)
```

Semua CTA berlabel "Premium" di `index.html` sudah diarahkan ke `premium-landing.html`, bukan langsung ke Mayar — supaya calon pembeli melihat pitch lengkap dulu sebelum checkout.

## Langkah 1 — Isi placeholder sebelum upload

Ada beberapa placeholder yang **wajib** diganti dengan data Anda sendiri. Cari teks berikut di setiap file:

1. **`GANTI-DENGAN-LINK-PRODUK-ANDA`**
   Muncul di beberapa tempat:
   - `premium-landing.html` (3 tombol: hero, blok harga, sticky CTA di bawah layar HP)
   - `Tangga-Karier-Dosen-FREE.html` (banner ajakan upgrade di tab Hasil)

   Ganti dengan link produk Digital Download Anda di Mayar.id.

2. **`VERSION_CHECK_URL` dan `APP_PAGE_URL`** (opsional, untuk fitur notifikasi versi baru)
   Ada di `Tangga-Karier-Dosen-PREMIUM.html`, cari komentar `TO ENABLE`. Isi kalau Anda berencana rutin memperbarui aplikasi dan ingin pembeli lama diberi tahu otomatis. Boleh dikosongkan — fitur ini nonaktif secara default dan tidak mengganggu apa pun jika dibiarkan kosong.

## Langkah 2 — Upload ke GitHub

1. Buat repo baru (atau pakai repo yang sudah ada), publik.
2. Upload **index.html**, **premium-landing.html**, **Tangga-Karier-Dosen-FREE.html**, **manifest.json**, **sw.js**, dan folder **icons/** ke root repo.
3. **Jangan upload `Tangga-Karier-Dosen-PREMIUM.html` ke repo publik ini** — upload file itu ke Mayar.id sebagai file "Digital Download" produk Premium Anda, supaya hanya pembeli yang bisa mengunduhnya. Kalau ikut diupload ke GitHub publik, siapa pun bisa mengaksesnya gratis lewat URL langsung.
4. Aktifkan GitHub Pages: Settings → Pages → Source: pilih branch (biasanya `main`) dan folder `/root`.
5. Setelah aktif, situs Anda bisa diakses di `https://USERNAME.github.io/NAMA-REPO/`.

## Langkah 3 — Cek setelah live

- Buka landing page, klik "Coba Gratis" → harus membuka aplikasi Free.
- Klik "Lihat Premium" atau "Beli Premium" → harus membuka `premium-landing.html`.
- Di `premium-landing.html`, klik "Beli Sekarang" (ada 3 titik: hero, blok harga, sticky bar bawah di HP) → harus mengarah ke halaman produk Mayar Anda.
- Di aplikasi Free/Premium, klik "← Beranda" di pojok kiri atas header → harus kembali ke landing page.
- Service worker (mode offline Premium) hanya aktif di `https://` atau `localhost` — tidak aktif kalau file dibuka langsung dari disk (`file://`), itu wajar bukan bug.

## Catatan keamanan data

Semua aplikasi (Free & Premium) menyimpan data pengguna di `localStorage` browser masing-masing pengguna — tidak ada data yang terkirim ke server Anda atau pihak manapun. Anda tidak perlu (dan tidak bisa) melihat data yang dimasukkan pengguna lain.
