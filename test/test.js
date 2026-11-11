// The surprise test in a browser: the same five questions as the app for that day (rules.js),
// marked in red, with your marks to send back. Nothing is sent anywhere by the page.
(function () {
  const $ = (id) => document.getElementById(id);
  const T = window.SurpriseTest;
  const today = T.dayFor(new Date());
  // A shared link carries the test number (#11), so friends take the same test even a day later.
  const fromLink = parseInt(location.hash.slice(1), 10);
  const day = fromLink >= 1 && fromLink - 1 <= today ? fromLink - 1 : today;
  const test = T.make(day);
  const answers = test.questions.map(() => "");
  const key = "lp.test." + day;
  $("title").textContent = "SURPRISE TEST #" + test.number;
  try { $("name").value = localStorage.getItem("lp.from") || ""; } catch {}

  test.questions.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = "q";
    const inline = q.kind === "times" || q.kind === "sum";
    let html = `<div class="row"><b>${i + 1}.</b> <span>${q.prompt}</span>`;
    if (inline) html += ` <input data-i="${i}" inputmode="numeric" autocomplete="off" aria-label="Answer ${i + 1}">`;
    html += `<span class="mark" data-m="${i}"></span></div>`;
    if (q.kind === "misspelt") {
      html += `<div class="words">${q.words.map((w, k) => `<button class="word" data-i="${i}" data-k="${k}">${w}</button>`).join("")}</div>`;
    } else if (!inline) {
      html += `<div class="ans"><span class="pencil">ans:</span><input data-i="${i}" class="${q.number ? "" : "wide"}"
        ${q.number ? 'inputmode="numeric"' : 'autocapitalize="characters"'} autocomplete="off" aria-label="Answer ${i + 1}"></div>`;
    }
    html += `<div class="fix" data-f="${i}"></div>`;
    div.innerHTML = html;
    $("questions").appendChild(div);
  });
  document.querySelectorAll("input[data-i]").forEach((el) => el.addEventListener("input", () => (answers[+el.dataset.i] = el.value)));
  document.querySelectorAll(".word").forEach((el) => el.addEventListener("click", () => {
    const i = +el.dataset.i;
    if (marked) return;
    answers[i] = el.dataset.k;
    document.querySelectorAll(`.word[data-i="${i}"]`).forEach((w) => w.classList.toggle("on", w === el));
  }));

  let marked = null;
  async function handIn(instant) {
    marked = test.questions.map((q, i) => T.isRight(q, answers[i]));
    document.querySelectorAll("input[data-i]").forEach((el) => (el.disabled = true));
    $("actions").hidden = true;
    for (let i = 0; i < marked.length; i++) {
      if (!instant) await new Promise((r) => setTimeout(r, 450));
      document.querySelector(`[data-m="${i}"]`).textContent = marked[i] ? "✓" : "✗";
      if (!marked[i]) document.querySelector(`[data-f="${i}"]`).textContent = "→ " + test.questions[i].answer;
    }
    const marks = marked.filter(Boolean).length * T.MARKS_EACH;
    $("score").textContent = marks + "/" + T.MAX; $("score").hidden = false;
    $("remark").textContent = T.remark(marks);
    $("after").hidden = false;
    try { localStorage.setItem(key, JSON.stringify(answers)); localStorage.setItem("lp.from", $("name").value.trim()); } catch {}
    $("share").onclick = () => share(marks);
  }
  $("handIn").addEventListener("click", () => handIn(false));

  async function share(marks) {
    const row = marked.map((m) => (m ? "✓" : "✗")).join("");
    const who = $("name").value.trim();
    const text = `${who ? who.toUpperCase() + " got" : "I got"} ${marks}/10 ${row} in surprise test #${test.number}. ${T.remark(marks)} Your turn:`;
    const url = location.origin + location.pathname + "#" + test.number;
    if (navigator.share) { try { await navigator.share({ text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text + " " + url); } catch { prompt("Copy this:", text + " " + url); return; }
    $("copied").hidden = false; setTimeout(() => ($("copied").hidden = true), 2500);
  }

  // Already done (in this browser): show the marked paper.
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved) {
      saved.forEach((a, i) => (answers[i] = a));
      document.querySelectorAll("input[data-i]").forEach((el) => (el.value = answers[+el.dataset.i]));
      document.querySelectorAll(".word").forEach((w) => w.classList.toggle("on", answers[+w.dataset.i] === w.dataset.k));
      handIn(true);
    }
  } catch {}
})();
