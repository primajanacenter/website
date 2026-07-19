/* quiz-engine.js - render soal, hitung skor, simpan riwayat ke localStorage.
   Dipakai di halaman tryout FREE (paket 1). Data soal disuntikkan lewat
   variabel global TRYOUT_DATA & TRYOUT_SLUG yang di-embed langsung di HTML. */
(function () {
  function initQuiz(containerId, slug, data) {
    const container = document.getElementById(containerId);
    if (!container || !data || !data.soal) return;

    const jawabanUser = {};

    function renderSoal(soal, index) {
      const wrap = document.createElement("div");
      wrap.className = "soal-box";
      wrap.id = "soal-" + soal.id;

      const nomor = document.createElement("strong");
      nomor.textContent = "Soal " + (index + 1) + " (" + soal.tipe.replace(/_/g, " ") + ")";
      wrap.appendChild(nomor);

      if (soal.stimulus) {
        const stim = document.createElement("div");
        stim.className = "stimulus";
        stim.textContent = soal.stimulus;
        wrap.appendChild(stim);
      }

      const pertanyaan = document.createElement("p");
      pertanyaan.textContent = soal.pertanyaan;
      wrap.appendChild(pertanyaan);

      const pilihanWrap = document.createElement("div");
      pilihanWrap.className = "pilihan-jawaban";

      if (soal.tipe === "pg_kompleks_kategori" && soal.pernyataan) {
        jawabanUser[soal.id] = new Array(soal.pernyataan.length).fill(null);
        soal.pernyataan.forEach(function (p, pi) {
          const row = document.createElement("div");
          row.style.marginBottom = "6px";
          const label = document.createElement("div");
          label.textContent = p;
          row.appendChild(label);
          soal.kategori.forEach(function (kat) {
            const lab = document.createElement("label");
            lab.style.display = "inline-block";
            lab.style.marginRight = "10px";
            const inp = document.createElement("input");
            inp.type = "radio";
            inp.name = "soal-" + soal.id + "-p" + pi;
            inp.value = kat;
            inp.addEventListener("change", function () {
              jawabanUser[soal.id][pi] = kat;
            });
            lab.appendChild(inp);
            lab.appendChild(document.createTextNode(kat));
            row.appendChild(lab);
          });
          pilihanWrap.appendChild(row);
        });
      } else {
        const isMulti = soal.tipe === "pg_kompleks_mcma";
        jawabanUser[soal.id] = isMulti ? [] : null;
        soal.pilihan.forEach(function (opt, oi) {
          const letter = String.fromCharCode(65 + oi);
          const label = document.createElement("label");
          const inp = document.createElement("input");
          inp.type = isMulti ? "checkbox" : "radio";
          inp.name = "soal-" + soal.id;
          inp.value = letter;
          inp.addEventListener("change", function () {
            if (isMulti) {
              const arr = jawabanUser[soal.id];
              if (inp.checked) arr.push(letter);
              else jawabanUser[soal.id] = arr.filter((v) => v !== letter);
            } else {
              jawabanUser[soal.id] = letter;
            }
          });
          label.appendChild(inp);
          label.appendChild(document.createTextNode(letter + ". " + opt));
          pilihanWrap.appendChild(label);
        });
      }

      wrap.appendChild(pilihanWrap);

      const pembahasan = document.createElement("div");
      pembahasan.className = "pembahasan";
      pembahasan.textContent = "Pembahasan: " + soal.pembahasan;
      wrap.appendChild(pembahasan);

      container.appendChild(wrap);
    }

    data.soal.forEach(renderSoal);

    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = "Selesai & Lihat Skor";
    btn.addEventListener("click", function () {
      let benar = 0;
      data.soal.forEach(function (soal) {
        const box = document.getElementById("soal-" + soal.id);
        const pembahasanEl = box.querySelector(".pembahasan");
        pembahasanEl.style.display = "block";
        let isBenar = false;
        if (soal.tipe === "pg_kompleks_kategori") {
          isBenar = JSON.stringify(jawabanUser[soal.id]) === JSON.stringify(soal.kunci);
        } else if (soal.tipe === "pg_kompleks_mcma") {
          const u = (jawabanUser[soal.id] || []).slice().sort();
          const k = soal.kunci.slice().sort();
          isBenar = JSON.stringify(u) === JSON.stringify(k);
        } else {
          isBenar = jawabanUser[soal.id] === soal.kunci;
        }
        box.classList.add(isBenar ? "hasil-benar" : "hasil-salah");
        if (isBenar) benar++;
      });

      const total = data.soal.length;
      const skor = Math.round((benar / total) * 100);

      const ringkasan = document.createElement("div");
      ringkasan.className = "skor-ringkasan";
      ringkasan.innerHTML =
        '<div class="angka">' + skor + '</div>' +
        '<div>Benar ' + benar + ' dari ' + total + ' soal</div>';
      container.insertBefore(ringkasan, container.firstChild);

      TKAStorage.pushHistory("tryout:" + slug + ":paket1:history", {
        tanggal: new Date().toISOString(),
        skor: skor,
        benar: benar,
        total: total
      });

      btn.disabled = true;
      try {
        window.scrollTo({ top: ringkasan.offsetTop - 20, behavior: "smooth" });
      } catch (e) { /* abaikan di lingkungan yang tidak mendukung smooth scroll */ }
    });

    container.appendChild(btn);
  }

  window.TKAQuiz = { init: initQuiz };
})();
