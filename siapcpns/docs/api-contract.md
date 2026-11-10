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
| `login` | 2/8 | Ya | `{ assessment?, ref? }` (hasil Cek Kesiapan lokal; kode ajakan dari tautan `?ref=`) | `{ user, profile, profileComplete, latestAssessment, isNew, attachedAssessmentId, referralClaimed }` | ✅ mock + backend |
| `getMe` | 2 | Ya | – | `{ user: { userId, email, name, picture, plan, premiumUntil }, profile, profileComplete, latestAssessment }` | ✅ mock + backend |
| `saveProfile` | 2 | Ya | `{ education, major, targetFormation, targetProvince, testDate, targetType, minutesPerDay, daysPerWeek, reminderTime }` | `{ profile, profileComplete }` | ✅ mock + backend |
| `getTryoutInfo` | 3 | Ya | – | `{ packages: [{ packageId, title, type, durationMin, pg, questionCount, attempts[], inProgress, canStart, lockReason }], plan, serverNow }` | ✅ |
| `startAttempt` | 3 | Ya | `{ packageId }` | `{ attemptId, title, durationMin, startedAt, endsAt, serverNow, questions[] (tanpa kunci), answers{} }` — melanjutkan jika masih berjalan | ✅ |
| `saveProgress` | 3 | Ya | `{ attemptId, answers{} }` | `{ saved, count, savedAt }` | ✅ |
| `submitAttempt` | 3 | Ya | `{ attemptId, answers{}, finishMode }` | `{ attemptId, status }` (idempoten) | ✅ |
| `getReport` | 3/6/7 | Ya | `{ attemptId }` (attempt akbar: error `RESULTS_PENDING` sampai event terbit) | `{ total, maxTotal, passedAll (null untuk SKB), score100 (SKB), subtests[], topics[] (gratis: 1 terbuka), review[] (gratis: 5), topicsLocked, reviewLocked, … }` | ✅ |
| `getToday` | 4 | Ya | – | `{ date, profile, focusTopics[{topicId,name,subtest}], topicLevels{topicId:{level,pct,n}}, practice{doneToday,correctToday,byTopicToday,dailyLimit (null = Premium),remaining,bankSize}, streak, hasTryout }` | ✅ |
| `startPractice` | 4 | Ya | `{ topicId? }` | `{ sessionId, topicId, questions[] (tanpa kunci), remainingToday, dailyLimit }` — error `DAILY_LIMIT` bila kuota gratis habis | ✅ |
| `answerPractice` | 4 | Ya | `{ sessionId, questionId, answer }` | `{ questionId, answer, points, correct, bestAnswer, optionScores (TKP), explanation, topic }` — error `SESSION_EXPIRED` setelah 6 jam | ✅ |
| `getMaterialIndex` | 6 | Opsional | – | `{ premium, loggedIn, available: { topicId: [{ level, title, minutes }] }, recommended: { topicId: level } }` | ✅ |
| `getMaterial` | 6 | Opsional | `{ topicId, level: 2-4 }` | Premium: `{ locked: false, material: { title, minutes, ringkasan, poinKunci[], contoh{soal,pilihan[],jawaban,pembahasan}, tips[], jebakan[] } }` · lainnya: `{ locked: true, reason: LOGIN\|PREMIUM, teaser }` | ✅ |
| `getPlan` | 6 | Ya (Premium) | – | rencana adaptif: `{ adaptive, weekly, daysToTest, totalHours, targets, adherence, gaps, priorities[], notes[], week[], today }` — error `FORBIDDEN`, `PROFILE_INCOMPLETE` | ✅ |
| `getPlans` | 5/8 | Opsional | – | `{ plans: [{ planId, name, durationDays, price, priceBefore, badge, description, refPrice? }], referral?: { discountPct }, env: "sandbox"\|"production"\|"off", current: { plan, premiumUntil } \| null, pending: trx \| null, history: trx[] }` | ✅ |
| `createCheckout` | 5 | Ya | `{ planId }` (nominal dari server) | `{ trxId, paymentUrl, expiresAt, reused, redirect }` — error `PAYMENT_OFF`, `PAYMENT_ERROR`, `RATE_LIMITED` | ✅ |
| `getPaymentStatus` | 5 | Ya | `{ trxId }` | `{ transaction: { trxId, planId, planName, amount, status: pending\|paid\|expired\|failed, paymentUrl, createdAt, expiresAt, paidAt, premiumUntil }, plan, premiumUntil }` | ✅ |
| `getAkbarInfo` | 7 | Opsional | – | `{ serverNow, loggedIn, premium, current: { eventId, title, opensAt, closesAt, lastStartAt, resultsAt, state: upcoming\|open\|closing\|scoring\|published, durationMin, questionCount, participants, my: { attemptId, status, endsAt, rank, total, percentile, passedAll } \| null } \| null, next[{eventId,title,opensAt,closesAt}], past[] }` | ✅ |
| `joinAkbar` | 7 | Ya | `{ eventId }` | sama dengan `startAttempt` + `{ packageId, eventId, resultsAt }`; melanjutkan attempt yang berjalan — error `NOT_OPEN`, `CLOSED`, `ALREADY_DONE` | ✅ |
| `getAkbarRanking` | 7 | Opsional | `{ eventId, scope: national\|province }` | `{ event, scope, premium, stats{n,passRate,median,top10,pg}, me \| null, top[{rank,name,province,total,twk,tiu,tkp,passedAll}] }`; Premium: `analysis[{subtest,mine,median,top10,pg}]`, scope provinsi (`province`, `provinceTotal`) — error `RESULTS_PENDING`, `FORBIDDEN` (provinsi, non-Premium) | ✅ |
| `loadProbe` | 7 | Tidak | `{ key, probeId }` (key = Script Property `LOADTEST_TOKEN`) | `{ ms, questions }`; tanpa token dianggap `UNKNOWN_ACTION` | ✅ (uji beban) |
| `getTryoutInfo` (SKB) | 8 | Ya | `{ type: "skb" }` | sama dengan lobi tryout, hanya paket `type` = `skb` | ✅ |
| `getPostSkd` | 8 | Ya | – | `{ premium, profileTestDate, testPassed, result: { testDate, twk, tiu, tkp, total, passedAll, formation, skbDate } \| null, analysis: { subtests[{id,score,max,pg,gap,passed}], weakest, tryout{n,total,best,diff} \| null, skdPart, skdWeight, skbWeight, scenarios[{skb,final}], steps[{id,title,text,href}], note } \| null, history[] }` | ✅ |
| `saveSkdResult` | 8 | Ya | `{ testDate (YYYY-MM-DD, tidak di masa depan), twk 0–150, tiu 0–175, tkp 0–225, formation?, skbDate? }` | sama dengan `getPostSkd`; tanggal sama → diperbarui | ✅ |
| `getReferral` | 8 | Ya | – | `{ code, bonusDays, discountPct, invited, purchased, rewarded, bonusDaysEarned, recent[{status,joinedAt,rewardedAt}], myReferral: { code, status, discountActive } \| null, canClaim }` | ✅ |
| `claimReferral` | 8 | Ya | `{ code }` | `{ claimed, code, discountPct }` — error `NOT_FOUND`, `BAD_REQUEST` (kode sendiri / sudah pernah membeli), `ALREADY_DONE` | ✅ |
| `logClientError` | 9 | Tidak | `{ message, source?, line?, page?, ua?, action?, code? }` | `{ logged }` — dibatasi 30/menit & 300/hari; dikirim otomatis oleh `ui.js` (hanya mode backend) | ✅ |
| `getNotifPrefs` | 10 | Ya | – | `{ prefs: { daily, akbar, premium }, premium, email, reminderTime, emailEnabled }` (default: daily & akbar mati, premium nyala). Pengingat email = khusus Premium; pengingat di perangkat tidak memakai API | ✅ |
| `saveNotifPrefs` | 10 | Ya | `{ daily?, akbar?, premium?, reminderTime? (JJ:MM, WIB) }` | sama dengan `getNotifPrefs` + `warning?` — error `FORBIDDEN` (pengguna gratis menyalakan daily/akbar), `BAD_REQUEST`, `PROFILE_INCOMPLETE` (jam tanpa profil) | ✅ |
| `GET /exec?unsub=TOKEN&kind=daily\|akbar\|premium\|all` | 10 | Tidak | tautan di email | halaman HTML konfirmasi berhenti langganan | ✅ |
| `batch` | 10.2 | Opsional | `{ calls: [{ action, payload }] }` (maks 6; hanya action baca: getMe, getToday, getPlan, getPlans, getMaterialIndex, getTryoutInfo, getAkbarInfo, getAkbarRanking, getReferral, getPostSkd, getNotifPrefs, ping) | `[{ ok, data } \| { ok:false, error }]` sesuai urutan; token diverifikasi sekali | ✅ |
| `getAdminDashboard` | 12 | Ya (ADMIN_EMAILS) | `{ days?: 7\|30\|90, force? }` | `{ range, env, kpi, business, users, learning, daily[], ops, cached }` — cache server 5 menit; error `FORBIDDEN` untuk non-admin | ✅ |
| `adminTransactions` | 12 | Ya (ADMIN_EMAILS) | `{ from?, to? (YYYY-MM-DD), status? }` | `{ from, to, total, truncated, items[{trxId, createdAt, paidAt, email, planId, planName, amount, discount, status, refCode, source, mayarId}] }` (maks 3.000) | ✅ |
| `adminLookupUser` | 12 | Ya (ADMIN_EMAILS) | `{ q }` (min. 3 huruf: email, nama, atau kode ajak) | `{ total, list[], detail \| null }` — detail: profil, paket, transaksi, tryout, latihan, ajakan, skor SKD | ✅ |

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
| `ALREADY_DONE` | Sudah mengikuti Tryout Akbar ini (1× per event) atau sudah memakai kode ajakan |
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
