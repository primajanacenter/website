/* self-assessment.js - versi FREE: cocokkan minat rumpun ilmu ke daftar
   mapel pendukung program studi (PENDUKUNG_DATA di-embed lewat halaman). */
(function () {
  function initAssessment(formId, resultId, data) {
    const form = document.getElementById(formId);
    const resultBox = document.getElementById(resultId);
    if (!form || !resultBox) return;

    const saved = TKAStorage.get("pilih-mapel:free", null);
    if (saved) {
      form.querySelector('[name="rumpun"]').value = saved.rumpun || "";
      form.querySelector('[name="minat"]').value = saved.minat || "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const rumpun = form.querySelector('[name="rumpun"]').value;
      const minat = form.querySelector('[name="minat"]').value;

      const cocok = data.filter(function (row) {
        return row.rumpunIlmu === rumpun;
      });

      resultBox.innerHTML = "";
      if (cocok.length === 0) {
        resultBox.innerHTML = "<p>Belum ada rekomendasi untuk kombinasi ini. Coba rumpun lain.</p>";
      } else {
        const heading = document.createElement("h3");
        heading.textContent = "Rekomendasi kelompok program studi & mapel pilihan";
        resultBox.appendChild(heading);
        cocok.forEach(function (row) {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML =
            "<h3>" + row.kelompokProdi + "</h3>" +
            "<p>Mapel pilihan pendukung: <strong>" + row.mapelPendukung.join(", ") + "</strong></p>";
          resultBox.appendChild(card);
        });
      }

      TKAStorage.set("pilih-mapel:free", { rumpun: rumpun, minat: minat, waktu: new Date().toISOString() });
    });
  }

  window.TKASelfAssessment = { init: initAssessment };
})();
