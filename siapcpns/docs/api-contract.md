# Kontrak API

Semua permintaan dari frontend lewat `assets/js/core/api.js` → Apps Script Web App.

## Format

**Permintaan** (`POST`, `Content-Type: text/plain;charset=utf-8`)

```json
{ "action": "namaAction", "payload": { }, "token": "<Google ID token atau null>" }
```

**Balasan**

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "KODE_ERROR", "message": "Pesan untuk pengguna" } }
```

## Daftar action

| Action | Fase | Login | Payload | Data balasan | Status |
|---|---|---|---|---|---|
| `ping` | 0 | Tidak | – | `{ status, mode, time }` | ✅ mock + backend |
| `saveAssessment` | 1–2 | Opsional | `{ version, total, levelId, durationSec, aspects[], answers{} }` | `{ saved, id }` | ✅ mock + backend |
| `joinWaitlist` | 1–2 | Tidak | `{ email, source? }` | `{ email }` | ✅ mock + backend |
| `login` | 2 | Ya | `{ assessment? }` (hasil Cek Kesiapan lokal untuk ditautkan) | `{ user, profile, profileComplete, latestAssessment, isNew, attachedAssessmentId }` | ✅ mock + backend |
| `getMe` | 2 | Ya | – | `{ user: { userId, email, name, picture, plan, premiumUntil }, profile, profileComplete, latestAssessment }` | ✅ mock + backend |
| `saveProfile` | 2 | Ya | `{ education, major, targetFormation, targetProvince, testDate, targetType, minutesPerDay, daysPerWeek, reminderTime }` | `{ profile, profileComplete }` | ✅ mock + backend |
| `getTryoutInfo` | 3 | Ya | – | `{ packages: [{ packageId, title, type, durationMin, pg, questionCount, attempts[], inProgress, canStart, lockReason }], plan, serverNow }` | ✅ |
| `startAttempt` | 3 | Ya | `{ packageId }` | `{ attemptId, title, durationMin, startedAt, endsAt, serverNow, questions[] (tanpa kunci), answers{} }` — melanjutkan jika masih berjalan | ✅ |
| `saveProgress` | 3 | Ya | `{ attemptId, answers{} }` | `{ saved, count, savedAt }` | ✅ |
| `submitAttempt` | 3 | Ya | `{ attemptId, answers{}, finishMode }` | `{ attemptId, status }` (idempoten) | ✅ |
| `getReport` | 3/6 | Ya | `{ attemptId }` | `{ total, maxTotal, passedAll, subtests[], topics[] (gratis: 1 terbuka), review[] (gratis: 5), topicsLocked, reviewLocked, … }` | ✅ |
| `getPractice` / `submitPractice` | 4 | Ya | – | soal latihan & hasil | ⏳ |
| `getMaterial` | 4/6 | Ya | `{ topic, level }` | isi materi (level 2–4 butuh premium) | ⏳ |
| `getPlan` | 4/6 | Ya | – | rencana harian/mingguan | ⏳ |
| `getPlans` | 5 | Tidak | – | daftar paket & harga (dari server) | ⏳ |
| `createCheckout` | 5 | Ya | `{ planId }` | `{ trxId, paymentUrl }` | ⏳ |
| `getPaymentStatus` | 5 | Ya | `{ trxId }` | `{ status, plan, premiumUntil }` | ⏳ |
| `getAkbarSchedule` / `joinAkbar` / `getAkbarRanking` | 7 | Ya | – | jadwal, slot, peringkat | ⏳ |

## Kode error umum

| Kode | Arti |
|---|---|
| `UNAUTHENTICATED` | Belum login / token tidak valid |
| `NOT_FOUND` | Paket/attempt tidak ada atau bukan milik pengguna |
| `NOT_FINISHED` | Rapor diminta saat ujian masih berjalan |
| `BUSY` | Server sedang memproses permintaan lain, coba lagi |
| `FORBIDDEN` | Fitur butuh premium |
| `BAD_REQUEST` | Format permintaan salah |
| `UNKNOWN_ACTION` | Action tidak dikenal |
| `RATE_LIMITED` | Terlalu banyak permintaan |
| `TIMEOUT` / `NETWORK` | Masalah koneksi (dari sisi frontend) |
| `SERVER_ERROR` | Kesalahan internal |

Perbarui file ini **sebelum** menambah action baru di frontend atau backend.

## Nilai yang valid (divalidasi di server)

- `education`: `SMA/SMK`, `D3`, `D4/S1`, `S2`, `S3`
- `targetType`: `passing_grade`, `kompetitif`
- `minutesPerDay`: 15, 30, 45, 60, 90 · `daysPerWeek`: 1–7 · `reminderTime`: `HH:MM` · `testDate`: `YYYY-MM-DD` atau kosong
- `levelId`: `baru-mulai`, `sedang-bersiap`, `hampir-siap` · skor aspek ≤ maksimum (25/15/40/20) dan jumlahnya = `total`

## Login

Login "Ya" = kirim `token` (Google ID token). Server memverifikasi ke Google (aud, iss, exp, email_verified). Identitas pengguna hanya diambil dari token, bukan dari payload.
