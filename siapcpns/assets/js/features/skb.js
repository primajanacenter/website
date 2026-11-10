/**
 * skb.js — Persiapan SKB (Fase 8)
 *
 * Panduan, kalkulator nilai akhir (SKD 40% + SKB 60%), checklist (disimpan lokal),
 * dan lobi paket tryout bertipe "skb" (memakai lobi & mesin ujian yang sama dengan tryout SKD).
 */

import { store } from "../core/store.js";
import { $, $$ } from "../core/ui.js";
import { initTryout } from "./tryout.js";

const CK_KEY = "skb.checklist";
const fmt = (n) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function initSkb() {
  initCalc();
  initChecklist();
  await initTryout({ type: "skb", page: "skb.html" });
}

function initCalc() {
  const skd = $("#calc-skd"), skb = $("#calc-skb");
  const update = () => {
    const a = Math.min(550, Math.max(0, Number(skd.value) || 0));
    const b = Math.min(100, Math.max(0, Number(skb.value) || 0));
    const partA = Math.round((a / 550) * 40 * 100) / 100;
    const partB = Math.round(b * 0.6 * 100) / 100;
    $("#calc-out").textContent = fmt(partA + partB);
    $("#calc-detail").textContent = `SKD ${fmt(partA)} + SKB ${fmt(partB)}`;
  };
  skd.addEventListener("input", update);
  skb.addEventListener("input", update);
  $("#skb-calc").addEventListener("submit", (e) => e.preventDefault());
  update();
}

function initChecklist() {
  const saved = store.get(CK_KEY, {});
  const boxes = $$("#skb-checklist [data-ck]");
  const progress = () => ($("#skb-check-progress").textContent = `${boxes.filter((b) => b.checked).length} dari ${boxes.length}`);
  boxes.forEach((b) => {
    b.checked = Boolean(saved[b.dataset.ck]);
    b.addEventListener("change", () => {
      const cur = store.get(CK_KEY, {});
      cur[b.dataset.ck] = b.checked;
      store.set(CK_KEY, cur);
      progress();
    });
  });
  progress();
}
