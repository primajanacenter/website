/**
 * rencana.js — Rencana belajar (Fase 4: dasar di browser · Fase 6: adaptif dari server untuk Premium)
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, fmtDate } from "../core/ui.js";
import { ALL_TOPICS, LEVEL_NAMES, buildPlan, taskDone } from "./plan.js";

const SUBNAME = { twk: "TWK", tiu: "TIU", tkp: "TKP" };

/** Rencana yang dipakai halaman: adaptif (Premium) atau dasar. Dipakai juga oleh beranda. */
export async function loadPlan(today) {
  if (today.plan === "premium") {
    const res = await api.call("getPlan");
    if (res.ok) return res.data;
  }
  return buildPlan(today);
}

export async function initRencana() {
  if (!auth.requireLogin("masuk.html")) return;
  const res = await api.call("getToday");
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return location.replace("masuk.html?next=rencana.html");
    return status(res.error.message);
  }
  const today = res.data;
  if (!today.profile) return location.replace("onboarding.html?next=rencana.html");
  const plan = await loadPlan(today);
  const adaptive = Boolean(plan.adaptive);

  $("#r-lead").textContent = adaptive
    ? `Rencana adaptif Premium · diperbarui ${new Date(plan.generatedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} dari skor tryout, level topik, dan kepatuhanmu.`
    : "Rencana dasar dari target, komitmen waktu, dan topik terlemahmu.";
  $("#st-commit").textContent = adaptive ? `${plan.targets.practicePerDay} soal/hari` : `± ${plan.weekly.hours} jam/minggu`;
  $("#st-commit-sub").textContent = adaptive
    ? `target latihan · ${plan.weekly.perDay} menit × ${plan.weekly.days} hari`
    : `${plan.weekly.perDay} menit × ${plan.weekly.days} hari`;
  if (plan.daysToTest && plan.daysToTest > 0) {
    $("#st-days").textContent = `${plan.daysToTest} hari`;
    $("#st-days-sub").textContent = `± ${plan.totalHours} jam belajar tersisa · ${fmtDate(today.profile.testDate)}`;
  } else {
    $("#st-days").textContent = "–";
    $("#st-days-sub").innerHTML = `<a href="onboarding.html?next=rencana.html">Isi perkiraan tanggal tes</a>`;
  }
  $("#st-streak").textContent = today.streak;

  renderWeek(plan, today);
  if (adaptive) renderAdaptive(plan);
  else renderFocus(today);
  renderLevels(today);
  $("#r-upsell").hidden = adaptive || today.plan === "premium";
}

function renderWeek(plan, today) {
  $("#r-week").innerHTML = plan.week
    .map((d) => {
      const tasks = d.study
        ? d.tasks
            .map((t) => {
              const done = d.isToday && taskDone(t, today);
              return `<a class="${t.type === "tryout" ? "tryout" : ""} ${done ? "done" : ""}" href="${t.href}">${esc(t.label)} · ${t.minutes}′</a>`;
            })
            .join("")
        : `<span class="xsmall muted">Istirahat</span>`;
      return `<div class="day ${d.isToday ? "today" : ""} ${d.study ? "" : "rest"}">
        <h3><span>${d.dayName}</span><span class="xsmall muted num">${d.date.slice(8)}/${d.date.slice(5, 7)}</span></h3>${tasks}</div>`;
    })
    .join("");
}

function renderAdaptive(plan) {
  $("#r-adaptive").hidden = false;
  $("#r-notes").innerHTML = (plan.notes.length ? plan.notes : ["Rencana sudah seimbang. Pertahankan ritme belajarmu."]).map((n) => `<li>${esc(n)}</li>`).join("");
  $("#r-gaps").innerHTML = plan.gaps
    ? ["twk", "tiu", "tkp"]
        .map((s) => {
          const g = plan.gaps[s];
          const pct = Math.min(100, Math.round((g.score / g.pg) * 100));
          return `<div><span class="xsmall muted">${SUBNAME[s]} · tryout terakhir</span><b>${g.score} <span class="xsmall muted">/ ambang ${g.pg}</span></b>
            <div class="gap-bar"><i class="${g.passed ? "ok" : ""}" style="width:${pct}%"></i></div>
            <span class="xsmall ${g.passed ? "" : "muted"}">${g.passed ? "Lolos ambang batas" : `Kurang ${g.gap} poin`}</span></div>`;
        })
        .join("")
    : `<div><span class="small muted">Belum ada skor tryout. <a href="tryout.html">Kerjakan tryout diagnostik</a> agar analisis per subtes muncul.</span></div>`;
  $("#r-adherence").textContent =
    plan.adherence.pct === null
      ? "Kepatuhan belum dihitung: belum ada riwayat latihan minggu lalu."
      : `Kepatuhan 7 hari terakhir: ${plan.adherence.done} dari ${plan.adherence.planned} soal target (${plan.adherence.pct}%).`;

  $("#r-focus-title").textContent = "Prioritas topik";
  $("#r-focus-sub").textContent = "diurutkan dari selisih target & ambang batas";
  $("#r-focus").innerHTML = `<div class="prio-list">${plan.priorities
    .slice(0, 6)
    .map(
      (p, i) => `<a href="materi.html?topik=${p.topicId}&level=${Math.max(2, p.recommendedLevel)}">
        <span class="rank">${i + 1}</span>
        <span><strong>${esc(p.name)}</strong> <span class="xsmall muted">${SUBNAME[p.subtest]}</span><small>${esc(p.reason)}</small></span>
        ${p.level ? `<span class="lv lv-${p.level}">Lv ${p.level}</span>` : `<span class="lv">–</span>`}
      </a>`
    )
    .join("")}</div>`;
}

function renderFocus(today) {
  $("#r-focus").innerHTML = today.focusTopics
    .map((t) => {
      const lv = today.topicLevels[t.topicId];
      return `<a class="topic-card focus" style="min-width:200px" href="materi.html?topik=${t.topicId}">
        <strong>${esc(t.name)}</strong>
        ${lv ? `<span class="lv lv-${lv.level}">Lv ${lv.level} · ${LEVEL_NAMES[lv.level]} · ${lv.pct}%</span>` : `<span class="lv">Belum diukur</span>`}
      </a>`;
    })
    .join("");
}

function renderLevels(today) {
  $("#r-levels").innerHTML = ALL_TOPICS.map((t) => {
    const lv = today.topicLevels[t.id];
    return `<div><span><span class="xsmall muted">${t.subtest.toUpperCase()}</span> ${esc(t.name)}</span>${
      lv ? `<span class="lv lv-${lv.level}">Lv ${lv.level}</span>` : `<span class="lv">–</span>`
    }</div>`;
  }).join("");
}

function status(msg) {
  const el = $("#r-status");
  el.hidden = false;
  el.classList.add("error");
  el.textContent = msg;
}
