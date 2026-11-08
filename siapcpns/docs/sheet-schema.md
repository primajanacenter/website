# Struktur Spreadsheet

Dua file terpisah:

1. **Database utama** (`SPREADSHEET_ID`) — data pengguna & transaksi.
2. **Bank soal** (`QUESTIONS_SPREADSHEET_ID`) — soal, kunci, pembahasan, materi premium. Hanya bisa diakses akun pemilik Apps Script.

Baris 1 setiap sheet = nama kolom persis seperti di bawah. Sheet di database utama dibuat otomatis oleh `setupSheets()` (sumber kebenaran: `SCHEMA` di `backend/apps-script/Db.gs`). Semua sel diformat teks agar tanggal dan nomor HP tidak berubah otomatis.

## Database utama

### `users`
| Kolom | Contoh | Catatan |
|---|---|---|
| user_id | u_8f3a… | dibuat server |
| picture | https://… | foto profil Google |
| email | nama@gmail.com | dari token Google |
| name | Rina | |
| phone | 0812… | opsional, dibutuhkan saat checkout Mayar |
| plan | free / premium | hanya diubah server |
| premium_until | 2027-03-31 | |
| mayar_member_id | | Fase 5 |
| created_at | ISO datetime | |
| last_login_at | ISO datetime | |

### `profiles`
user_id · education · major · target_formation · target_province · test_date · target_type · minutes_per_day · days_per_week · reminder_time · updated_at

### `assessments`
assessment_id · user_id (kosong jika belum login) · version · total · level_id · alur · dokumen · kemampuan · waktu · duration_sec · answers_json · source (anon/login) · created_at

### `waitlist`
email · source · created_at

### `attempts`
attempt_id · user_id · type (diagnostic/practice/akbar) · started_at · submitted_at · twk · tiu · tkp · total · passed_twk · passed_tiu · passed_tkp · answers_json

### `topic_levels` (Fase 4)
user_id · topic_id · level (1–4) · accuracy · avg_seconds · updated_at

### `transactions` (Fase 5)
trx_id · user_id · plan_id · amount · status (pending/paid/expired) · payment_url · created_at · paid_at · processed (ya/tidak)

### `webhook_log` (Fase 5)
received_at · event · trx_id · raw_json · result

## Bank soal

### `questions`
question_id · subtest (TWK/TIU/TKP) · topic_id · level (1–4) · text · option_a … option_e · answer (TWK/TIU: huruf benar) · score_a … score_e (TKP: 1–5) · explanation · status (draft/review/live) · source · created_by

### `topics`
topic_id · subtest · name · order

### `materials`
material_id · topic_id · level (1–4) · title · body_markdown · video_url · status
