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

### `attempts` (Fase 3)
attempt_id · user_id · package_id · type · status (in_progress/submitted) · started_at · ends_at · submitted_at · twk · tiu · tkp · total · passed_twk · passed_tiu · passed_tkp · passed_all · answered · correct_json · topic_json · answers_json · duration_sec · finish_mode (manual/timeout/late/auto)

### `topic_levels` (Fase 4)
user_id · topic_id · level (1–4) · accuracy · avg_seconds · updated_at

### `transactions` (Fase 5)
trx_id · user_id · plan_id · amount · status (pending/paid/expired) · payment_url · created_at · paid_at · processed (ya/tidak)

### `webhook_log` (Fase 5)
received_at · event · trx_id · raw_json · result

## Bank soal

### `packages` (Fase 3)
package_id · title · type · description · duration_min · pg_twk · pg_tiu · pg_tkp · free_attempts · status · order

### `questions` (Fase 3)
question_id · package_id · number · subtest · topic_id · level · text · context · option_a … option_e · answer · score_a … score_e · explanation · status · source

Daftar topik ada di konstanta `TOPICS` pada `Tryout.gs`. Panduan pengisian lengkap: `docs/setup-fase-3.md`.

### `materials`
material_id · topic_id · level (1–4) · title · body_markdown · video_url · status
