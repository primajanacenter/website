/**
 * mock-skb.js — data CONTOH Paket SKB untuk mode uji (USE_MOCK = true). Hanya dimuat di mode uji.
 * Konten asli (soal, materi, pertanyaan & jawaban model wawancara) ada di server, bukan di repo.
 */

const INS = [
  ["kemenag", "Kemenag", "Kementerian Agama", ["Moderasi beragama", "Kelembagaan & budaya kerja Kemenag", "Pendidikan agama, madrasah & pesantren", "Layanan nikah, zakat & wakaf", "Kerukunan umat beragama & FKUB", "Pelayanan publik & tata kelola Kemenag"]],
  ["kemendikbud", "Kemendikbudristek", "Kemendikbudristek", ["Sistem pendidikan nasional", "Guru, dosen & tenaga kependidikan", "Kurikulum & asesmen", "Pedagogi & pembelajaran", "Pendidikan tinggi & riset", "Pemajuan kebudayaan", "Tata kelola & layanan pendidikan"]],
  ["kejagung", "Kejaksaan", "Kejaksaan Agung RI", ["Kedudukan & kewenangan Kejaksaan", "Hukum acara pidana", "Hukum pidana (KUHP)", "Tindak pidana korupsi", "Perdata & tata usaha negara", "Keadilan restoratif", "Intelijen & pengamanan pembangunan"]],
  ["kemenkes", "Kemenkes", "Kementerian Kesehatan", ["UU Kesehatan & tenaga kesehatan", "Sistem & transformasi kesehatan", "Jaminan kesehatan nasional", "Kesehatan masyarakat & promosi kesehatan", "Gizi, KIA & stunting", "Pencegahan & pengendalian penyakit", "Mutu layanan & keselamatan pasien"]],
  ["pupr", "PUPR", "Kementerian PUPR", ["Jasa konstruksi", "Sumber daya air", "Jalan & jembatan", "Bangunan gedung", "Perumahan & kawasan permukiman", "Pengadaan barang/jasa pemerintah", "Keselamatan konstruksi"]],
];
const SELF = ["Menjawab inti pertanyaan", "Memberi contoh nyata", "Mengaitkan dengan tugas instansi", "Menutup dengan kesimpulan"];
const QS = [
  [1, "Perkenalan", "Perkenalkan diri Anda secara singkat dan jelaskan mengapa Anda melamar di instansi ini.", 10, 60, ["motivasi", "melayani", "pendidikan", "pengalaman"]],
  [1, "Motivasi", "Apa yang Anda ketahui tentang tugas jabatan yang Anda lamar?", 10, 60, ["tugas", "tanggung jawab", "kompetensi"]],
  [1, "Integritas", "Ceritakan pengalaman Anda menolak sesuatu yang tidak sesuai aturan.", 10, 60, ["aturan", "integritas", "menolak"]],
  [2, "Presentasi", "Presentasikan dalam 2 menit: bagaimana Anda akan meningkatkan kualitas layanan di unit kerja Anda pada tahun pertama?", 60, 120, ["pelayanan", "digital", "evaluasi", "koordinasi", "masyarakat"]],
  [3, "Situasi kerja", "Atasan meminta Anda menyelesaikan laporan dalam waktu yang sangat singkat, padahal data belum lengkap. Apa yang Anda lakukan?", 15, 90, ["koordinasi", "prioritas", "data", "melapor"]],
  [3, "Wawasan instansi", "Menurut Anda, apa tantangan terbesar instansi ini dalam lima tahun ke depan?", 15, 90, ["tantangan", "solusi", "transformasi"]],
  [3, "Situasi kerja", "Seorang warga marah karena layanan terlambat. Bagaimana Anda menanganinya?", 15, 90, ["mendengarkan", "empati", "solusi", "aturan"]],
];
const db = (store) => store.get("mock.skb", { selected: "", iv: [], active: false });
const save = (store, d) => store.set("mock.skb", d);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export async function mockSkb(action, p, { auth, store, apiError }) {
  const d = db(store);
  const ins = (id) => INS.find((x) => x[0] === id);
  const skb = { active: d.active, until: d.active ? new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10) : "" };
  if (action === "getSkbCatalog") {
    return { loggedIn: auth.isLoggedIn(), skb, price: 85000, days: 30, selected: d.selected,
      instansi: [...INS.map(([id, short, name, t], i) => ({ id, short, name, note: i === 0 ? "Contoh data mode uji." : "", general: false, topics: t.length, materi: i === 0 ? 6 : 0, latihan: i === 0 ? 6 : 0, tryouts: i === 0 ? 3 : 0, interview: i === 0 ? 20 : 0, ready: i === 0 })),
        { id: "umum", short: "SKB Umum ASN", name: "SKB Umum ASN", note: "", general: true, topics: 5, materi: 0, latihan: 0, tryouts: 1, interview: 0, ready: true }] };
  }
  if (action === "setSkbInstansi") { if (!auth.isLoggedIn()) throw apiError("UNAUTHENTICATED", "Silakan masuk."); d.selected = p.instansi; save(store, d); return { selected: p.instansi }; }
  if (action === "getSkbInstansi") {
    const x = ins(p.instansi) || (p.instansi === "umum" ? ["umum", "SKB Umum ASN", "SKB Umum ASN", ["Manajemen ASN & disiplin", "Standar pelayanan publik", "Administrasi pemerintahan", "Akuntabilitas kinerja & anggaran", "Integritas & keterbukaan informasi"]] : null);
    if (!x) throw apiError("BAD_REQUEST", "Instansi tidak dikenal.");
    const general = x[0] === "umum", first = x[0] === "kemenag";
    const used = d.iv.filter((s) => s.instansi === x[0]).length;
    return { serverNow: new Date().toISOString(), loggedIn: auth.isLoggedIn(), skb, price: 85000, days: 30,
      instansi: { id: x[0], short: x[1], name: x[2], note: "Mode uji: data contoh.", general },
      tryouts: first ? [1, 2, 3].map((n) => ({ packageId: `SKB-KEMENAG-0${n}`, title: `Tryout SKB Kemenag ${n}`, description: "100 soal kompetensi teknis Kemenag.", durationMin: 90, questionCount: 100, max: 500, locked: !d.active, canStart: d.active, lockReason: d.active ? null : "SKB_REQUIRED", attempts: 0, last: null, best: null, inProgress: null })) : [],
      topics: x[3].map((name, i) => ({ topicId: `${x[0]}-${i}`, name, free: i === 0 || general, locked: !(i === 0 || general) && !d.active, materi: first, materiTitles: first ? ["Konsep dasar", "Pemahaman", "Analisis kasus", "Strategi siap tes"] : [], questions: first ? 50 : 0, packageId: `LTS-${x[0]}-${i}`, attempts: 0, last: null, best: null, inProgress: null })),
      topicSize: 50, topicMin: 45,
      interview: { available: first, questions: 20, free: 1, freeLeft: d.active ? null : Math.max(0, 1 - used), canStart: first && (d.active || used < 1), history: d.iv.filter((s) => s.instansi === x[0] && s.result).map((s) => ({ sessionId: s.sessionId, score: s.result.score, band: s.result.band, submittedAt: s.result.submittedAt })).reverse() },
      info: ["Nilai akhir umumnya = 40% nilai SKD + 60% nilai SKB.", "SKB CAT berisi soal kompetensi teknis sesuai jabatan.", "Banyak instansi menambah wawancara, psikotes, atau praktik kerja.", "Selalu cocokkan dengan pengumuman resmi instansi."] };
  }
  if (action === "getSkbMateri") {
    const free = /-0$/.test(p.topicId);
    const lv = (l) => ({ topicId: p.topicId, level: l, title: ["", "Konsep dasar", "Pemahaman", "Analisis kasus", "Strategi siap tes"][l], minutes: 8, ringkasan: "Contoh isi materi mode uji. Materi asli dimuat dari server.", poinKunci: ["Poin kunci 1", "Poin kunci 2"], tips: ["Strategi contoh"], jebakan: ["Jebakan contoh"],
      contoh: l > 1 ? { soal: `Contoh soal level ${l}?`, konteks: "", pilihan: ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D", "Pilihan E"], jawaban: 1, pembahasan: "Pembahasan contoh." } : null });
    if (!free && !d.active) return { topicId: p.topicId, name: "Topik contoh", instansi: { id: "kemenag", short: "Kemenag" }, free, locked: true, reason: auth.isLoggedIn() ? "SKB" : "LOGIN", price: 85000, teaser: { titles: ["Konsep dasar", "Pemahaman", "Analisis kasus", "Strategi siap tes"], pointCount: 8 } };
    return { topicId: p.topicId, name: "Moderasi beragama", instansi: { id: "kemenag", short: "Kemenag" }, free, locked: false, levels: [1, 2, 3, 4].map(lv) };
  }
  if (!auth.isLoggedIn()) throw apiError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
  if (action === "startInterview") {
    const run = d.iv.find((s) => s.instansi === p.instansi && !s.result);
    if (run) return run.pub;
    if (!d.active && d.iv.some((s) => s.instansi === p.instansi)) throw apiError("SKB_REQUIRED", "Sesi wawancara gratis untuk instansi ini sudah dipakai. Premium SKB membuka latihan tanpa batas.");
    const sessionId = "iv_mock_" + Date.now();
    const labels = { 1: "Bagian 1 · Perkenalan & motivasi", 2: "Bagian 2 · Presentasi singkat", 3: "Bagian 3 · Wawasan instansi & situasi kerja" };
    const pub = { sessionId, instansi: { id: p.instansi, short: ins(p.instansi)?.[1] || p.instansi }, startedAt: new Date().toISOString(), selfChecks: SELF, premium: d.active,
      questions: QS.map(([part, category, text, prepSec, answerSec], i) => ({ qId: "MQ" + i, number: i + 1, part, partLabel: labels[part], category, text, prepSec, answerSec })) };
    d.iv.push({ sessionId, instansi: p.instansi, pub }); save(store, d);
    return pub;
  }
  if (action === "submitInterview" || action === "getInterviewResult") {
    const s = d.iv.find((x) => x.sessionId === p.sessionId);
    if (!s) throw apiError("NOT_FOUND", "Sesi wawancara tidak ditemukan.");
    if (!s.result && action === "submitInterview") {
      const answers = s.pub.questions.map((q, i) => {
        const a = (p.answers || []).find((x) => x.qId === q.qId) || {};
        const t = " " + norm(a.transcript) + " ", words = norm(a.transcript) ? norm(a.transcript).split(" ").length : 0;
        const kw = QS[i][5], hit = kw.filter((k) => t.includes(" " + k)), missing = kw.filter((k) => !hit.includes(k));
        const fillers = (t.match(/ (eee|ee|anu|gitu|emm) /g) || []).length;
        const aspects = words < 3 ? { isi: 0, struktur: 0, kelancaran: 0, waktu: 0, diri: 0 } : { isi: Math.round(Math.min(1, hit.length / kw.length / 0.7) * 40), struktur: 9, kelancaran: Math.max(0, 20 - fillers * 2), waktu: 12, diri: Math.round(((a.self || []).filter(Boolean).length / 4) * 10) };
        const score = Object.values(aspects).reduce((x, y) => x + y, 0);
        return { qId: q.qId, number: i + 1, part: q.part, partLabel: q.partLabel, question: q.text, answerSec: q.answerSec, transcript: a.transcript || "", durationSec: a.durationSec || 0, mode: a.mode || "text", edited: Boolean(a.edited), self: a.self || [],
          score, aspects, words, wpm: a.mode === "voice" && a.durationSec ? Math.round(words / (a.durationSec / 60)) : null, fillers, informal: [], hit, missing,
          tips: words < 3 ? ["Jawaban belum terekam."] : missing.length ? ["Tambahkan poin: " + missing.join(", ") + "."] : ["Jawaban sudah lengkap (mode uji)."], model: "Contoh jawaban model (mode uji). Jawaban model asli dimuat dari server.", modelTips: "" };
      });
      const score = Math.round(answers.reduce((x, a) => x + a.score, 0) / answers.length);
      const avg = (k) => Math.round(answers.reduce((x, a) => x + a.aspects[k], 0) / answers.length);
      s.result = { sessionId: s.sessionId, instansi: s.pub.instansi, submittedAt: new Date().toISOString(), score, band: Math.max(1, Math.round((1 + score / 100 * 8) * 2) / 2),
        level: score >= 85 ? "Sangat baik" : score >= 70 ? "Baik" : score >= 55 ? "Cukup" : "Perlu latihan",
        aspects: { isi: avg("isi"), struktur: avg("struktur"), kelancaran: avg("kelancaran"), waktu: avg("waktu"), diri: avg("diri") }, aspectMax: { isi: 40, struktur: 15, kelancaran: 20, waktu: 15, diri: 10 }, answers };
      save(store, d);
    }
    if (!s.result) throw apiError("NOT_FINISHED", "Sesi wawancara ini belum selesai.");
    return s.result;
  }
  throw apiError("UNKNOWN_ACTION", action);
}
