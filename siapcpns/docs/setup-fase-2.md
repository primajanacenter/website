# Panduan setup Fase 2: Login Google + Spreadsheet

Ikuti urutan ini. Total ± 30–45 menit. Lakukan dengan akun Google Workspace Primajana yang akan memiliki database.

## 1. Buat Spreadsheet database

1. Buka Google Drive → buat Spreadsheet baru, beri nama misalnya **Siap CPNS – Database**.
2. Salin ID-nya dari URL: `https://docs.google.com/spreadsheets/d/`**`INI_ID_NYA`**`/edit`.
3. Jangan bagikan Spreadsheet ini ke publik. Cukup pemilik dan pengelola.

## 2. Buat proyek Apps Script

**Cara A — clasp (disarankan, kode tercatat di Git):**
```bash
npm i -g @google/clasp
clasp login
cd backend/apps-script
clasp create --type standalone --title "Siap CPNS API"
clasp push
```
`clasp create` membuat file `.clasp.json` (sudah di `.gitignore`, jangan di-commit).

**Cara B — manual:** buka script.google.com → New project → buat file dengan nama dan isi yang sama seperti di folder `backend/apps-script/` (Router, Config, Db, Setup, Auth, Users, dst). Di Project Settings centang "Show appsscript.json" lalu salin isinya.

## 3. Isi Script Properties

Apps Script → ⚙ Project Settings → Script Properties → Add:

| Property | Nilai |
|---|---|
| `SPREADSHEET_ID` | ID dari langkah 1 |
| `GOOGLE_CLIENT_ID` | dari langkah 5 (bisa diisi belakangan) |

## 4. Siapkan sheet & uji

1. Di editor, pilih fungsi **`setupSheets`** → Run → izinkan akses.
2. Pilih **`testBackend`** → Run. Execution log harus menampilkan semua sheet dengan "0 baris data".

## 5. Buat OAuth Client ID (Google Sign-In)

1. Buka [console.cloud.google.com](https://console.cloud.google.com) → buat project, misalnya **Siap CPNS**.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: Siap CPNS · Support email · Logo (boleh logo Primajana).
   - App domain: isi domain Anda, halaman privasi: `https://domainanda.id/pages/privasi.html`.
   - Authorized domains: domain Anda.
   - Scopes: cukup `email`, `profile`, `openid` (tidak perlu verifikasi Google untuk scope ini).
   - Setelah siap, klik **Publish app** (status "In production") agar semua orang bisa login.
3. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins:
     - `https://domainanda.id`
     - `https://www.domainanda.id` (jika dipakai)
     - `http://localhost` dan `http://localhost:8080` (untuk uji lokal)
   - Redirect URI: tidak perlu.
4. Salin **Client ID** (berakhiran `.apps.googleusercontent.com`):
   - ke Script Property `GOOGLE_CLIENT_ID`, dan
   - ke `GOOGLE_CLIENT_ID` di `assets/js/core/config.js`.

Client ID bukan rahasia; aman berada di repo publik. **Client secret tidak dipakai** dan jangan pernah di-commit.

## 6. Deploy Web App

1. Apps Script → **Deploy → New deployment** → type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Deploy → izinkan akses → salin **Web app URL** (berakhiran `/exec`).
4. Buka URL itu di browser: harus tampil `{"ok":true,"data":{"status":"ok",...}}`.

> Setiap kali kode Apps Script berubah: **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. URL tetap sama. Tanpa langkah ini, perubahan tidak aktif.

## 7. Sambungkan frontend

Edit `assets/js/core/config.js`:
```js
USE_MOCK: false,
APPS_SCRIPT_URL: "https://script.google.com/macros/s/XXXX/exec",
GOOGLE_CLIENT_ID: "XXXX.apps.googleusercontent.com",
```
Commit & push → situs ter-deploy ulang.

> Selama `USE_MOCK = true`, tombol "Masuk dengan akun uji" hanya muncul di `localhost`. Di domain produksi, halaman Masuk menampilkan pesan "Fitur masuk sedang disiapkan", jadi aman untuk push kode Fase 2 sebelum backend siap.

## 8. Uji alur lengkap

1. Buka situs → Cek Kesiapan → selesai → **Masuk & simpan hasil**.
2. Login Google → isi onboarding 3 langkah → masuk Beranda.
3. Cek Spreadsheet: ada baris baru di `users`, `profiles`, dan `assessments` (source = `login`).
4. Buka situs di jendela penyamaran → Cek Kesiapan → selesai → baris baru di `assessments` dengan source = `anon`.

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| Tombol Google tidak muncul / error "origin not allowed" | Domain belum ada di *Authorized JavaScript origins*. Perubahan bisa butuh ± 5 menit. |
| "Token login bukan untuk aplikasi ini" | `GOOGLE_CLIENT_ID` di Script Properties berbeda dengan di `config.js`. |
| "Script Property … belum diisi" | Isi properti yang disebut, lalu jalankan `checkConfig()`. |
| Perubahan kode tidak berpengaruh | Belum membuat *New version* di Manage deployments. |
| "Tidak bisa terhubung ke server" | `APPS_SCRIPT_URL` salah, atau akses Web App bukan "Anyone". |
| Harus login ulang tiap ± 1 jam | Perilaku normal token Google. Pengguna yang pernah login akan masuk otomatis (One Tap). |

## Uji backend tanpa Google

```bash
node backend/tests/gas-harness.test.js
```
Menjalankan 51 uji (login, token palsu/kedaluwarsa, validasi profil, manipulasi skor, formula injection, dll.) dengan simulasi layanan Google.
