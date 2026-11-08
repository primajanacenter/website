/**
 * rencana.js — Rencana belajar dasar (Fase 4)
 */

import { api } from "../core/api.js";
import { auth } from "../core/auth.js";
import { $, esc, fmtDate } from "../core/ui.js";
import { ALL_TOPICS, LEVEL_NAMES, buildPlan, taskDone } from "./plan.js";

export async function initRencana() {
  if (!auth.requireLogin("masuk.html")) return;
  const res = await api.call("getToday");
  if (!res.ok) {
    if (res.error.code === "UNAUTHENTICATED") return location.replace("masuk.html?next=rencana.html");
    return status(res.error.message);
  }
  const today = res.data;
  if (!today.profile) return location.replace("onboarding.html?next=rencana.html");
  const plan = buildPlan(today);

  $("#st-commit").textContent = `± ${plan.weekly.hours} jam/minggu`;
  $("#st-commit-sub").textContent = `${plan.weekly.perDay} menit × ${plan.weekly.days} hari`;
  if (plan.daysToTest && plan.daysToTest > 0) {
    $("#st-days").textContent = `${plan.daysToTest} hari`;
    $("#st-days-sub").textContent = `± ${plan.totalHours} jam belajar tersisa · ${fmtDate(today.profile.testDate)}`;
  } else {
    $("#st-days").textContent = "–";
    $("#st-days-sub").innerHTML = `<a href="onboarding.html?next=rencana.html">Isi perkiraan tanggal tes</a>`;
  }
  $("#st-streak").textContent = today.streak;

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

  $("#r-focus").innerHTML = today.focusTopics
    .map((t) => {
      const lv = today.topicLevels[t.topicId];
      return `<a class="topic-card focus" style="min-width:200px" href="materi.html?topik=${t.topicId}">
        <strong>${esc(t.name)}</strong>
        ${lv ? `<span class="lv lv-${lv.level}">Lv ${lv.level} · ${LEVEL_NAMES[lv.level]} · ${lv.pct}%</span>` : `<span class="lv">Belum diukur</span>`}
      </a>`;
    })
    .join("");

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
