# Struktur Spreadsheet

Dua file terpisah:

1. **Database utama** (`SPREADSHEET_ID`) — data pengguna & transaksi.
2. **Paket soal** — soal, kunci, pembahasan. Bisa berupa folder Drive berisi satu file per paket (`QUESTIONS_FOLDER_ID`, disarankan) dan/atau satu file bank soal (`QUESTIONS_SPREADSHEET_ID`). Hanya diakses akun pemilik Apps Script. Kolom dibaca berdasarkan nama di baris judul.

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
attempt_id · user_id · package_id · type · status (in_progress/submitted) · started_at · ends_at · submitted_at · twk · tiu · tkp · total · passed_twk · passed_tiu · passed_tkp · passed_all · answered · correct_json · topic_json · answers_json · duration_sec · finish_mode (manual/timeout/late/auto) · event_id (Fase 7, terisi hanya untuk attempt Tryout Akbar)

### `practice_answers` (Fase 4)
user_id · date (YYYY-MM-DD, WIB) · question_id · package_id · topic_id · subtest · answer · points · answered_at

Satu baris per jawaban latihan harian. Level topik, topik fokus, kuota harian, dan streak dihitung dari sheet ini (ditambah hasil tryout), sehingga tidak perlu sheet `topic_levels` terpisah. Level: < 40% → 1 Kenal · < 70% → 2 Paham · ≤ 85% → 3 Mahir · > 85% → 4 Siap tes.

### `plans` (Fase 5)
plan_id · name · duration_days · price · price_before · badge · description · status (active/inactive) · order

Harga & durasi paket Premium. Ubah langsung di sheet, lalu jalankan `refreshPlanCache`.

### `transactions` (Fase 5)
trx_id · user_id · email · plan_id · plan_name · duration_days · amount · status (pending/paid/expired/failed) · mayar_id (id payment request) · mayar_trx_id · payment_url · created_at · expires_at · paid_at · processed (ya/tidak) · premium_until (hasil aktivasi) · source (webhook/status-page/reconcile/admin) · note

### `webhook_log` (Fase 5)
received_at · event · trx_id · mayar_ref · result (fulfilled/already_processed/not_paid:…/no_match/ignored/error:…) · raw_json (maks. 4.000 karakter)

### `akbar_events` (Fase 7)
event_id (AK-YYYYMMDD) · package_id · title · opens_at · closes_at · results_at (ISO, WIB +07:00) · status (scheduled/published/cancelled) · participants · created_at

### `akbar_results` (Fase 7, ditulis ulang tiap penerbitan)
event_id · user_id · attempt_id · rank · total · twk · tiu · tkp · passed_all · percentile · duration_sec · province · province_rank · province_total · education · display_name (nama tersamar) · published_at

### `loadtest_log` (Fase 7, boleh dikosongkan)
at · probe_id · note

### `skd_results` (Fase 8)
user_id · test_date (YYYY-MM-DD) · twk · tiu · tkp · total · passed_all · formation · skb_date · created_at · updated_at

### `referrals` (Fase 8)
referee_id (teman) · referrer_id (pengajak) · code · status (joined/rewarded/capped/void) · trx_id · bonus_days · created_at · rewarded_at

### `error_log` (Fase 9)
at · kind (server/client) · action · code · message · detail · page (tanpa query string) · ua

### `metrics_daily` (Fase 9, satu baris per hari WIB)
date · users_total · new_users · active_7d · premium_active · paid_trx · revenue · revenue_30d · attempts · practice · skd_results · referrals_rewarded · errors_24h

### `admin_dashboard` (Fase 9)
Ditulis ulang otomatis oleh `buildAdminDashboard` / `dailyOps`. Hanya angka agregat, jangan diedit manual.

## Bank soal

### `packages` (Fase 3; `type` = diagnostic / latihan / akbar / skb)
package_id · title · type · description · duration_min · pg_twk · pg_tiu · pg_tkp · free_attempts · status · order

Kolom `type`: `diagnostik`/`tryout` tampil di lobi Tryout; **`latihan`** tidak tampil di lobi dan hanya dipakai sebagai bank soal latihan harian (Fase 4). Soal latihan harian diambil dari **semua** paket aktif (termasuk paket tryout) — paket `latihan` menambah variasi.

### `questions` (Fase 3)
question_id · package_id · number · subtest · topic_id · level · text · context · option_a … option_e · answer · score_a … score_e · explanation · status · source

Daftar topik ada di konstanta `TOPICS` pada `Tryout.gs`. Panduan pengisian lengkap: `docs/setup-fase-3.md`.

### `materials` (Fase 6, file terpisah `MATERIALS_SPREADSHEET_ID`)
material_id · topic_id · level (2–4) · title · minutes · ringkasan · poin_kunci (1 butir per baris) · contoh_soal · opsi_a … opsi_e · kunci (a–e) · pembahasan · strategi (per baris) · jebakan (per baris) · status (live/draft)

Hanya dibaca server. Level 1 tetap di `assets/data/materi-level1.json` (publik).
