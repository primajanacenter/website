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
| `getReport` | 3/6/7 | Ya | `{ attemptId }` (attempt akbar: error `RESULTS_PENDING` sampai event terbit) | `{ total, maxTotal, passedAll, subtests[], topics[] (gratis: 1 terbuka), review[] (gratis: 5), topicsLocked, reviewLocked, … }` | ✅ |
| `getToday` | 4 | Ya | – | `{ date, profile, focusTopics[{topicId,name,subtest}], topicLevels{topicId:{level,pct,n}}, practice{doneToday,correctToday,byTopicToday,dailyLimit (null = Premium),remaining,bankSize}, streak, hasTryout }` | ✅ |
| `startPractice` | 4 | Ya | `{ topicId? }` | `{ sessionId, topicId, questions[] (tanpa kunci), remainingToday, dailyLimit }` — error `DAILY_LIMIT` bila kuota gratis habis | ✅ |
| `answerPractice` | 4 | Ya | `{ sessionId, questionId, answer }` | `{ questionId, answer, points, correct, bestAnswer, optionScores (TKP), explanation, topic }` — error `SESSION_EXPIRED` setelah 6 jam | ✅ |
| `getMaterialIndex` | 6 | Opsional | – | `{ premium, loggedIn, available: { topicId: [{ level, title, minutes }] }, recommended: { topicId: level } }` | ✅ |
| `getMaterial` | 6 | Opsional | `{ topicId, level: 2-4 }` | Premium: `{ locked: false, material: { title, minutes, ringkasan, poinKunci[], contoh{soal,pilihan[],jawaban,pembahasan}, tips[], jebakan[] } }` · lainnya: `{ locked: true, reason: LOGIN\|PREMIUM, teaser }` | ✅ |
| `getPlan` | 6 | Ya (Premium) | – | rencana adaptif: `{ adaptive, weekly, daysToTest, totalHours, targets, adherence, gaps, priorities[], notes[], week[], today }` — error `FORBIDDEN`, `PROFILE_INCOMPLETE` | ✅ |
| `getPlans` | 5 | Opsional | – | `{ plans: [{ planId, name, durationDays, price, priceBefore, badge, description }], env: "sandbox"\|"production"\|"off", current: { plan, premiumUntil } \| null, pending: trx \| null, history: trx[] }` | ✅ |
| `createCheckout` | 5 | Ya | `{ planId }` (nominal dari server) | `{ trxId, paymentUrl, expiresAt, reused, redirect }` — error `PAYMENT_OFF`, `PAYMENT_ERROR`, `RATE_LIMITED` | ✅ |
| `getPaymentStatus` | 5 | Ya | `{ trxId }` | `{ transaction: { trxId, planId, planName, amount, status: pending\|paid\|expired\|failed, paymentUrl, createdAt, expiresAt, paidAt, premiumUntil }, plan, premiumUntil }` | ✅ |
| `getAkbarInfo` | 7 | Opsional | – | `{ serverNow, loggedIn, premium, current: { eventId, title, opensAt, closesAt, lastStartAt, resultsAt, state: upcoming\|open\|closing\|scoring\|published, durationMin, questionCount, participants, my: { attemptId, status, endsAt, rank, total, percentile, passedAll } \| null } \| null, next[{eventId,title,opensAt,closesAt}], past[] }` | ✅ |
| `joinAkbar` | 7 | Ya | `{ eventId }` | sama dengan `startAttempt` + `{ packageId, eventId, resultsAt }`; melanjutkan attempt yang berjalan — error `NOT_OPEN`, `CLOSED`, `ALREADY_DONE` | ✅ |
| `getAkbarRanking` | 7 | Opsional | `{ eventId, scope: national\|province }` | `{ event, scope, premium, stats{n,passRate,median,top10,pg}, me \| null, top[{rank,name,province,total,twk,tiu,tkp,passedAll}] }`; Premium: `analysis[{subtest,mine,median,top10,pg}]`, scope provinsi (`province`, `provinceTotal`) — error `RESULTS_PENDING`, `FORBIDDEN` (provinsi, non-Premium) | ✅ |
| `loadProbe` | 7 | Tidak | `{ key, probeId }` (key = Script Property `LOADTEST_TOKEN`) | `{ ms, questions }`; tanpa token dianggap `UNKNOWN_ACTION` | ✅ (uji beban) |

## Kode error umum

| Kode | Arti |
|---|---|
| `UNAUTHENTICATED` | Belum login / token tidak valid |
| `NOT_FOUND` | Paket/attempt tidak ada atau bukan milik pengguna |
| `NOT_FINISHED` | Rapor diminta saat ujian masih berjalan |
| `BUSY` | Server sedang memproses permintaan lain, coba lagi |
| `FORBIDDEN` | Fitur butuh premium |
| `DAILY_LIMIT` | Kuota latihan gratis (10 soal/hari, WIB) sudah habis |
| `SESSION_EXPIRED` | Sesi latihan lebih dari 6 jam, mulai sesi baru |
| `PROFILE_INCOMPLETE` | Profil belajar belum diisi |
| `PAYMENT_OFF` | Pembayaran belum dikonfigurasi (MAYAR_BASE_URL kosong) |
| `PAYMENT_ERROR` | Gagal menghubungi Mayar atau Mayar menolak permintaan |
| `RESULTS_PENDING` | Skor/rapor/peringkat Tryout Akbar dikunci sampai hasil terbit |
| `NOT_OPEN` | Tryout Akbar belum dibuka |
| `CLOSED` | Batas mulai Tryout Akbar sudah lewat |
| `ALREADY_DONE` | Sudah mengikuti Tryout Akbar ini (1× per event) |
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


## Webhook Mayar (Fase 5)

`POST <URL /exec>?hook=mayar&token=<WEBHOOK_TOKEN>` dengan body JSON dari Mayar (`event`, `data`). Balasan `{ received: true|false }`. Isi webhook hanya pemicu; status lunas selalu dicek ulang ke `GET /hl/v2/payments/{id}`. Lihat `docs/setup-fase-5.md`.
