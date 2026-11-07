/**
 * placeholder.js — halaman "segera hadir" untuk fitur yang belum dibangun.
 * pages/segera.html?fitur=tryout  → menampilkan info fitur dari assets/data/features.json
 * Halaman fitur lain (tryout.html, rapor.html, dst.) memakai atribut data-feature.
 * Saat sebuah fitur mulai dibangun, ganti isi halamannya dan hapus pemanggilan ini.
 */

import { CONFIG } from "../core/config.js";
import { $ } from "../core/ui.js";

export async function initPlaceholder() {
  const main = $("[data-feature]");
  const key = main?.dataset.feature || new URLSearchParams(location.search).get("fitur");

  const waitlist = $("#ph-waitlist");
  if (waitlist && CONFIG.WAITLIST_URL) {
    waitlist.href = CONFIG.WAITLIST_URL;
    waitlist.hidden = false;
  }

  if (!key) return;
  try {
    const res = await fetch("../assets/data/features.json", { cache: "no-cache" });
    const features = await res.json();
    const f = features[key];
    if (!f) return;
    $("#ph-title").textContent = f.title;
    $("#ph-phase").textContent = f.phase;
    $("#ph-desc").textContent = f.desc;
    document.title = `${f.title} — ${CONFIG.APP_NAME}`;
  } catch {
    /* tetap tampilkan teks bawaan */
  }
}
