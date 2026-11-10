/**
 * postskd.js — Hasil SKD (Fase 8)
 *
 * Pengguna memasukkan skor SKD resmi → server menilai ambang batas, membandingkan dengan tryout,
 * menghitung kontribusi ke nilai akhir, dan menyarankan langkah berikutnya.
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { store, KEYS } from "../core/store.js";
import { $, esc, fmtDate, setBusy } from "../core/ui.js";

const LABEL = { twk: "TWK", tiu: "TIU", tkp: "TKP" };
const fmt = (n) => Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function initPostSkd() {
  if (!auth.requireLogin("masuk.html")) return;
  $("#ps-form").addEventListener("submit", save);
  const res = await api.call("getPostSkd");
  if (!res.ok) return fail(res.error);
  fillForm(res.data);
  render(res.data);
}

function todayJkt() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

function fillForm(d) {
  $("#ps-date").max = todayJkt();
  const r = d.result;
  if (r) {
    $("#ps-date").value = r.testDate;
    $("#ps-twk").value = r.twk; $("#ps-tiu").value = r.tiu; $("#ps-tkp").value = r.tkp;
    $("#ps-formation").value = r.formation || ""; $("#ps-skbdate").value = r.skbDate || "";
  } else if (d.profileTestDate && d.profileTestDate <= todayJkt()) {
    $("#ps-date").value = d.profileTestDate;
  }
}

async function save(e) {
  e.preventDefault();
  const btn = $("#ps-save");
  const payload = {
    testDate: $("#ps-date").value, twk: numOrEmpty("#ps-twk"), tiu: numOrEmpty("#ps-tiu"), tkp: numOrEmpty("#ps-tkp"),
    formation: $("#ps-formation").value.trim(), skbDate: $("#ps-skbdate").value,
  };
  if (!payload.testDate) return status("Isi tanggal tes SKD.", true);
  if ([payload.twk, payload.tiu, payload.tkp].some((v) => v === "")) return status("Isi ketiga skor (TWK, TIU, TKP).", true);
  setBusy(btn, true, "Menyimpan…");
  const res = await api.call("saveSkdResult", payload);
  setBusy(btn, false);
  if (!res.ok) return fail(res.error);
  status("Skor tersimpan.");
  render(res.data);
  $("#ps-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function numOrEmpty(sel) {
  const v = $(sel).value.trim();
  return v === "" ? "" : Number(v);
}

function render(d) {
  const r = d.result, a = d.analysis;
  if (!r || !a) return;
  $("#ps-result").hidden = false;
  const v = $("#ps-verdict");
  v.className = `chip ${r.passedAll ? "chip-ok" : "chip-bad"}`;
  v.textContent = r.passedAll ? "Memenuhi ambang batas" : "Belum memenuhi ambang batas";
  $("#ps-headline").innerHTML = r.passedAll
    ? `Total <b>${r.total}</b> dari 550. Ketiga subtes di atas ambang batas, jadi kamu berpeluang lanjut ke SKB tergantung peringkat di formasimu.`
    : `Total <b>${r.total}</b> dari 550. ${a.subtests.filter((s) => !s.passed).map((s) => LABEL[s.id]).join(" dan ")} masih di bawah ambang batas.`;
  $("#ps-sub").innerHTML = a.subtests
    .map((s) => {
      const pct = Math.min(100, (s.score / s.max) * 100), pg = Math.min(100, (s.pg / s.max) * 100);
      return `<tr><td><strong>${LABEL[s.id]}</strong></td><td class="num"><b>${s.score}</b> / ${s.max}</td>
        <td><div class="pg-bar ${s.passed ? "" : "fail"}" role="img" aria-label="Skor ${s.score}, ambang batas ${s.pg}"><span style="width:${pct}%"></span><i style="left:${pg}%"></i></div>
        <span class="xsmall ${s.passed ? "muted" : "bad"}">${s.passed ? `+${s.gap} di atas ambang ${s.pg}` : `kurang ${-s.gap} dari ambang ${s.pg}`}</span></td></tr>`;
    })
    .join("");
  const kpis = [
    `<div><span class="xsmall muted">Kontribusi SKD ke nilai akhir</span><b>${fmt(a.skdPart)}</b><span class="xsmall muted">dari ${a.skdWeight}</span></div>`,
  ];
  if (a.tryout) {
    const sign = a.tryout.diff > 0 ? "+" : "";
    kpis.push(`<div><span class="xsmall muted">Rata-rata ${a.tryout.n} tryout terakhir</span><b>${a.tryout.total}</b><span class="xsmall ${a.tryout.diff >= 0 ? "ok" : "bad"}">skor asli ${sign}${a.tryout.diff}</span></div>`);
  } else {
    kpis.push(`<div><span class="xsmall muted">Pembanding tryout</span><b>–</b><span class="xsmall muted">belum ada tryout di aplikasi</span></div>`);
  }
  $("#ps-kpis").innerHTML = kpis.join("");
  $("#ps-scen-wrap").hidden = !r.passedAll;
  $("#ps-scen").innerHTML = a.scenarios.map((s) => `<tr><td>${s.skb}</td><td class="num"><b>${fmt(s.final)}</b></td></tr>`).join("");
  $("#ps-note").textContent = a.note;

  $("#ps-steps-card").hidden = false;
  $("#ps-steps").innerHTML = a.steps
    .map((s) => `<li><div><b>${esc(s.title)}</b><p class="small muted">${esc(s.text)}</p></div>${s.href ? `<a class="btn btn-primary" href="${esc(s.href)}">Buka</a>` : ""}</li>`)
    .join("");

  if (d.history && d.history.length > 1) {
    $("#ps-history-card").hidden = false;
    $("#ps-history").innerHTML = d.history
      .map((h) => `<li><span>${esc(fmtDate(h.testDate))}</span><b>${h.total}</b><span class="chip ${h.passedAll ? "chip-ok" : "chip-bad"}">${h.passedAll ? "Lolos ambang batas" : "Belum lolos"}</span></li>`)
      .join("");
  }
  store.remove(KEYS.ME);
}

function fail(error) {
  if (error.code === "UNAUTHENTICATED") return location.replace(`masuk.html?next=${encodeURIComponent("pasca-skd.html")}`);
  status(error.message, true);
}

function status(msg, isError = false) {
  const el = $("#ps-status");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("error", isError);
}
