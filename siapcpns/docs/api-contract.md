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
| `saveAssessment` | 1–2 | Tidak | `{ version, total, levelId, aspects[], answers{} }` | `{ id }` | ✅ mock |
| `joinWaitlist` | 1 | Tidak | `{ email }` | `{ email }` | ✅ mock |
| `getMe` | 2 | Ya | – | `{ user, profile, plan, premiumUntil }` | ⏳ |
| `saveProfile` | 2 | Ya | `{ education, major, targetFormation, testDate, minutesPerDay, daysPerWeek }` | `{ profile }` | ⏳ |
| `startAttempt` | 3 | Ya | `{ type: "diagnostic" \| "practice" \| "akbar" }` | `{ attemptId, questions[] (tanpa kunci), endsAt }` | ⏳ |
| `submitAttempt` | 3 | Ya | `{ attemptId, answers{} }` | `{ scores: { twk, tiu, tkp, total }, passed: { twk, tiu, tkp } }` | ⏳ |
| `getReport` | 3/6 | Ya | `{ attemptId }` | ringkas (gratis) / detail per topik (premium) | ⏳ |
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
| `FORBIDDEN` | Fitur butuh premium |
| `BAD_REQUEST` | Format permintaan salah |
| `UNKNOWN_ACTION` | Action tidak dikenal |
| `RATE_LIMITED` | Terlalu banyak permintaan |
| `TIMEOUT` / `NETWORK` | Masalah koneksi (dari sisi frontend) |
| `SERVER_ERROR` | Kesalahan internal |

Perbarui file ini **sebelum** menambah action baru di frontend atau backend.
