/**
 * panduan.js — checklist dokumen di halaman Panduan (Fase 1).
 * Status centang disimpan lokal di perangkat pengguna.
 */

import { store, KEYS } from "../core/store.js";
import { $, $$ } from "../core/ui.js";

export function initChecklist() {
  const root = $("#doc-checklist");
  if (!root) return;

  const boxes = $$("input[type=checkbox]", root);
  const saved = new Set(store.get(KEYS.DOC_CHECKLIST, []));

  boxes.forEach((b) => {
    b.checked = saved.has(b.value);
    b.addEventListener("change", () => {
      const checked = boxes.filter((x) => x.checked).map((x) => x.value);
      store.set(KEYS.DOC_CHECKLIST, checked);
      update();
    });
  });

  function update() {
    const done = boxes.filter((b) => b.checked).length;
    $("#doc-count").textContent = `${done}/${boxes.length}`;
    $("#doc-progress").style.width = `${(done / boxes.length) * 100}%`;
  }
  update();
}
