# TKA Prep - Situs FREE

Situs statis persiapan TKA SMA/MA. Dibangun dengan Eleventy (11ty), tapi
**hasil build (`dist/`) adalah kumpulan file HTML yang masing-masing berdiri
sendiri** - tiap halaman punya CSS, JS, dan data soal ter-inline langsung di
dalam file itu, tanpa `<link>`/`<script src>` ke file lain.

## Menjalankan di lokal

```bash
npm install
npm run build     # hasil ada di folder dist/
npm run serve     # mode pratinjau dengan live-reload
```

Folder `dist/` sudah disertakan sebagai contoh hasil build (boleh dihapus,
akan dibuat ulang otomatis tiap `npm run build`).

## Struktur

- `src/_data/` - semua konten terstruktur: `mapel.json` (definisi, muatan,
  kompetensi, matriks, contoh soal per mata uji), `tryoutFree.json` (bank
  soal tryout paket 1/gratis per mapel), `pendukungProdi.json` (rumpun ilmu
  → kelompok prodi → mapel pendukung, acuan self-assessment).
- `src/_includes/layouts/base.njk` - layout utama, memuat CSS via shortcode
  `{% inlineCSS %}` dan JS via `{% inlineJS %}` supaya ikut ter-embed di
  output, bukan jadi file terpisah.
- `src/mata-pelajaran/detail.njk` - 1 template, di-*paginate* atas
  `mapel.json` untuk menghasilkan halaman detail semua mata pelajaran
  sekaligus.
- `src/tryout/tryout-paket1.njk` - quiz engine tryout gratis, data soal
  disuntikkan sebagai `const TRYOUT_DATA = {...}` langsung di HTML.
- `src/pilih-mapel/index.njk` - self-assessment gratis.

## Menambah mata pelajaran baru

Tambahkan entri baru di `src/_data/mapel.json` (dan `tryoutFree.json` bila
mau sediakan tryout gratisnya) - Eleventy otomatis membuatkan halamannya
tanpa perlu menulis HTML baru.

## Deploy ke GitHub Pages

Push ke branch `main` - `.github/workflows/deploy.yml` otomatis build lalu
deploy ke GitHub Pages. Aktifkan GitHub Pages di **Settings > Pages > Source:
GitHub Actions** pada repo ini.

## Catatan penting: paket PREMIUM

Paket PREMIUM (tryout paket 2-6, self-assessment mendalam) **tidak** dibangun
dari repo ini. Buat repo/folder terpisah (sebaiknya privat) berisi bank soal
premium, lalu build masing-masing jadi 1 file `.html` mandiri dengan pola
yang sama (CSS/JS/data inline), lalu unggah manual sebagai produk digital di
Mayar.

**Soal file:// & localStorage.** File PREMIUM dibuka lewat `file://` (double
klik) di perangkat pembeli. Sebagian browser (terutama Firefox) membatasi
`localStorage` untuk halaman `file://`. Kode di `assets/js/storage.js` sudah
dibungkus `try/catch` sehingga kuis tetap berjalan & skor tetap tampil walau
penyimpanan riwayat gagal - hanya riwayat lintas sesi yang mungkin tidak
tersimpan di sebagian browser. Sarankan pengguna memakai Chrome/Edge untuk
pengalaman tersimpan yang paling konsisten.
