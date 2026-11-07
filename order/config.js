/* ==================== PENGATURAN – ubah bagian ini ==================== */
const PRIMAJANA = {
  // URL Web App dari Apps Script (Deploy → Web app). Berakhiran /exec
  API_URL: 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec',

  // Nomor WhatsApp admin (format 62…), dipakai untuk tombol konfirmasi setelah pesan
  ADMIN_WHATSAPP: '6281234567890',

  // Pilihan jenis orderan di form. Opsi "Lainnya" ditambahkan otomatis.
  JENIS_ORDER: [
    'Design PPT',
    'Analisis Data',
    'HKI',
    'Design Poster',
    'Design Infografis'
  ],

  // Order dianggap "mendekati deadline" jika sisa harinya ≤ angka ini
  DEADLINE_WARNING_DAYS: 3
};

/* ==================== HELPER – tidak perlu diubah ==================== */

async function callApi(action, payload, token) {
  if (PRIMAJANA.API_URL.indexOf('GANTI_') > -1) {
    throw new Error('API_URL belum diatur. Isi URL Web App di file config.js.');
  }
  let res;
  try {
    res = await fetch(PRIMAJANA.API_URL, {
      method: 'POST',
      // text/plain agar tidak memicu CORS preflight (Apps Script tidak mendukungnya)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action, token: token || null }, payload || {}))
    });
  } catch (e) {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('Respons server tidak valid. Pastikan Web App di-deploy dengan akses "Anyone".');
  }
  if (!data.ok) {
    const err = new Error(data.error || 'Terjadi kesalahan.');
    err.code = data.code;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function rupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function todayStr() {
  return ymd(new Date());
}

function daysUntil(dateStr) {
  const d = parseYmd(dateStr);
  if (!d) return null;
  const t = parseYmd(todayStr());
  return Math.round((d - t) / 86400000);
}

function formatTanggal(dateStr) {
  const d = parseYmd(dateStr);
  return d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
}

function formatWaktu(dateTimeStr) {
  const s = String(dateTimeStr || '');
  const time = s.slice(11, 16);
  return formatTanggal(s) + (time ? ', ' + time.replace(':', '.') : '');
}

function formatWa(wa) {
  const d = digitsOnly(wa);
  return d.indexOf('62') === 0 ? '0' + d.slice(2) : d;
}
