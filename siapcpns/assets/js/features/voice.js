/**
 * voice.js — pengenalan suara (Web Speech API) yang tahan banting untuk Latihan Wawancara (Fase 14.1).
 *
 * Pelajaran dari uji lapangan:
 *  - Di Android/iOS mikrofon bersifat eksklusif. Jangan membuka getUserMedia/MediaRecorder bersamaan dengan
 *    SpeechRecognition — pengenalan suara tidak akan menerima audio. Rekaman putar-ulang & meter level hanya di desktop.
 *  - Mode continuous di Chrome Android menggandakan hasil; di Android dipakai sesi pendek yang dimulai ulang otomatis.
 *  - Pengenalan berhenti sendiri setelah hening beberapa detik ("no-speech"/onend) → dimulai ulang selama masih merekam.
 *  - Semua galat diterjemahkan ke pesan yang jelas, bukan diam-diam diabaikan.
 */

export const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const ua = navigator.userAgent || "";
export const env = {
  android: /Android/i.test(ua),
  ios: /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  inApp: /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp|TikTok/i.test(ua),
  firefox: /Firefox\//i.test(ua),
  samsung: /SamsungBrowser/i.test(ua),
  brave: Boolean(navigator.brave),
};
env.mobile = env.android || env.ios || /Mobi/i.test(ua);
/** Rekaman putar-ulang & meter level aman dipakai bersamaan dengan pengenalan suara hanya di desktop. */
env.canRecordAlongside = !env.mobile && Boolean(navigator.mediaDevices && window.MediaRecorder);

/** Apakah mode suara bisa dipakai di browser ini? → { ok, reason } */
export function voiceSupport() {
  if (!window.isSecureContext) return { ok: false, reason: "Mode suara hanya berjalan di alamat https://." };
  if (env.inApp) return { ok: false, reason: "Kamu membuka aplikasi dari browser bawaan aplikasi lain (WhatsApp/Instagram/dll). Buka tautan ini di Chrome agar mikrofon bisa dipakai." };
  if (!SR) {
    if (env.firefox) return { ok: false, reason: "Firefox belum mendukung pengenalan suara. Gunakan Google Chrome atau Microsoft Edge." };
    if (env.ios) return { ok: false, reason: "Browser ini belum mendukung pengenalan suara. Di iPhone/iPad gunakan Safari versi terbaru." };
    return { ok: false, reason: "Browser ini belum mendukung pengenalan suara. Gunakan Google Chrome atau Microsoft Edge versi terbaru." };
  }
  if (env.brave) return { ok: true, warn: "Brave sering memblokir layanan pengenalan suara. Bila suaramu tidak dikenali, gunakan Google Chrome." };
  if (env.samsung) return { ok: true, warn: "Bila suaramu tidak dikenali di Samsung Internet, gunakan Google Chrome." };
  return { ok: true };
}

const ERR = {
  "not-allowed": "Izin mikrofon ditolak. Ketuk ikon gembok/kamera di bilah alamat → izinkan Mikrofon, lalu coba lagi.",
  "service-not-allowed": "Browser menolak layanan pengenalan suara. Gunakan Google Chrome/Edge, atau pilih mode ketik.",
  "audio-capture": "Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain (mis. panggilan/Zoom). Tutup aplikasi itu lalu coba lagi.",
  "network": "Pengenalan suara membutuhkan internet (diproses oleh layanan Google/Apple). Periksa koneksi lalu coba lagi.",
  "language-not-supported": "Bahasa Indonesia belum tersedia untuk pengenalan suara di perangkat ini. Pilih mode ketik.",
  "no-audio": "Mikrofon tidak memberi suara. Periksa izin mikrofon, pastikan tidak dibisukan, lalu ketuk Coba lagi.",
};
export const errorText = (code) => ERR[code] || "Pengenalan suara terhenti. Ketuk Coba lagi atau pilih ketik jawaban.";
const FATAL = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"];

/** Gabungkan hasil final satu sesi; buang pengulangan yang kadang dikirim Chrome Android. */
function joinFinals(list) {
  const out = [];
  for (const raw of list) {
    const t = raw.trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last && (t === last || t.startsWith(last))) out[out.length - 1] = t;
    else if (last && last.startsWith(t)) continue;
    else out.push(t);
  }
  return out.join(" ");
}

/**
 * Pendengar suara yang memulai ulang dirinya sendiri.
 * on.text(finalText, interimText) · on.state('starting'|'listening'|'sound'|'speech'|'quiet'|'stopped') · on.error(code, message, fatal)
 */
export function createListener(on = {}) {
  let rec = null, want = false, committed = "", sessFinal = "", interim = "", gotAudio = false, watchdog = 0, restarts = 0, netErrors = 0, lastError = "";
  const emit = () => on.text && on.text((committed + " " + sessFinal).trim(), interim.trim());
  const state = (s) => on.state && on.state(s);

  function boot() {
    if (!want) return;
    rec = new SR();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = !env.android;
    rec.maxAlternatives = 1;
    sessFinal = ""; interim = "";
    rec.onaudiostart = () => { gotAudio = true; clearTimeout(watchdog); state("listening"); };
    rec.onsoundstart = () => state("sound");
    rec.onspeechstart = () => state("speech");
    rec.onsoundend = () => state("quiet");
    rec.onresult = (e) => {
      const finals = [], inter = [];
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? finals : inter).push(e.results[i][0].transcript);
      sessFinal = joinFinals(finals);
      interim = inter.join(" ");
      netErrors = 0;
      state("speech");
      emit();
    };
    rec.onerror = (e) => {
      lastError = e.error;
      if (e.error === "no-speech" || e.error === "aborted") return;           // hening → dimulai ulang di onend
      if (e.error === "network" && ++netErrors <= 2) return;                   // coba ulang sebentar
      const fatal = FATAL.includes(e.error) || e.error === "network";
      if (fatal) want = false;
      on.error && on.error(e.error, errorText(e.error), fatal);
    };
    rec.onend = () => {
      committed = (committed + " " + sessFinal).trim();
      sessFinal = ""; interim = "";
      emit();
      if (want && restarts < 400) { restarts++; setTimeout(boot, lastError === "network" ? 800 : 150); }
      else state("stopped");
    };
    try { rec.start(); state("starting"); }
    catch (err) { setTimeout(() => want && boot(), 300); }
  }

  return {
    start() {
      if (!SR) { on.error && on.error("unsupported", voiceSupport().reason, true); return; }
      want = true; restarts = 0; netErrors = 0; lastError = ""; gotAudio = false;
      boot();
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { if (want && !gotAudio) on.error && on.error("no-audio", errorText("no-audio"), false); }, 5000);
    },
    stop() {
      want = false; clearTimeout(watchdog);
      return new Promise((resolve) => {
        if (!rec) return resolve(this.text());
        const done = () => resolve(this.text());
        const prev = rec.onend;
        rec.onend = (ev) => { prev && prev(ev); done(); };
        try { rec.stop(); } catch { done(); }
        setTimeout(done, 1500);   // jaga-jaga bila onend tidak datang
      });
    },
    abort() { want = false; clearTimeout(watchdog); try { rec && rec.abort(); } catch { /* abaikan */ } },
    text() { return (committed + " " + sessFinal + " " + interim).replace(/\s+/g, " ").trim(); },
    reset() { committed = ""; sessFinal = ""; interim = ""; },
    get active() { return want; },
    get heard() { return gotAudio; },
  };
}

/**
 * Tes lengkap sebelum wawancara: izin → suara masuk → ucapan dikenali.
 * on.step(key, ok, detail) dengan key: support | perm | sound | text. → Promise<{ ok, text, error }>
 */
export function testVoice(on = {}, seconds = 8) {
  return new Promise((resolve) => {
    const sup = voiceSupport();
    on.step && on.step("support", sup.ok, sup.ok ? (sup.warn || "") : sup.reason);
    if (!sup.ok) return resolve({ ok: false, error: sup.reason });
    let finished = false, heardSound = false, text = "";
    const finish = (ok, error) => { if (finished) return; finished = true; l.abort(); resolve({ ok, text, error }); };
    const l = createListener({
      state: (s) => {
        if (s === "listening") on.step && on.step("perm", true, "");
        if ((s === "sound" || s === "speech") && !heardSound) { heardSound = true; on.step && on.step("sound", true, ""); }
      },
      text: (f, i) => {
        text = (f + " " + i).trim();
        on.text && on.text(f, i);
        if (text.split(/\s+/).length >= 3) { on.step && on.step("text", true, text); setTimeout(() => finish(true), 900); }
      },
      error: (code, msg, fatal) => {
        if (code === "not-allowed" || code === "service-not-allowed") on.step && on.step("perm", false, msg);
        else if (code === "no-audio") on.step && on.step("sound", false, msg);
        else on.step && on.step("text", false, msg);
        if (fatal || code === "no-audio") finish(false, msg);
      },
    });
    l.start();
    setTimeout(() => {
      if (finished) return;
      if (text) { on.step && on.step("text", true, text); return finish(true); }
      const msg = heardSound ? "Suara terdengar, tetapi belum dikenali sebagai kata. Bicara lebih jelas dan dekat ke mikrofon, lalu tes lagi." :
        "Belum ada suara yang masuk. Pastikan mikrofon tidak dibisukan dan pilih mikrofon yang benar di pengaturan perangkat.";
      on.step && on.step(heardSound ? "text" : "sound", false, msg);
      finish(false, msg);
    }, seconds * 1000);
  });
}

/** Rekaman putar-ulang + meter level (desktop saja). → { stop(): Promise<url|''> } atau null */
export async function startSideRecorder(onLevel) {
  if (!env.canRecordAlongside) return null;
  let stream, ctx, raf = 0, media, chunks = [];
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return null; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v - 128)); onLevel && onLevel(Math.min(1, p / 60)); raf = requestAnimationFrame(tick); };
    tick();
  } catch { /* meter opsional */ }
  try { media = new MediaRecorder(stream); media.ondataavailable = (e) => e.data.size && chunks.push(e.data); media.start(); } catch { media = null; }
  return {
    stop: () => new Promise((resolve) => {
      cancelAnimationFrame(raf);
      const close = () => { stream.getTracks().forEach((t) => t.stop()); try { ctx && ctx.close(); } catch { /* abaikan */ }
        resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: chunks[0].type || "audio/webm" })) : ""); };
      if (!media || media.state === "inactive") return close();
      media.onstop = close;
      try { media.stop(); } catch { close(); }
    }),
  };
}
