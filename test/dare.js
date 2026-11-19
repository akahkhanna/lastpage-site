// "Beat my 1:12": a friend's time on today's puzzle, carried in the link ("#16-72-AKASH":
// puzzle number, seconds, name), the same as the app's links. Nothing is sent anywhere.
(function (root) {
  const clock = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  function read() {
    let raw = location.hash.slice(1);
    try { raw = decodeURIComponent(raw); } catch {}
    const m = raw.match(/^(\d+)-(\d+)-(.+)$/);
    return m && +m[2] > 0 ? { day: +m[1] - 1, secs: +m[2], name: m[3].trim().slice(0, 20) } : null;
  }
  const dare = read();
  // Under the title: their time to beat, then (once done) who won.
  function show(day, mine) {
    let el = document.getElementById("dare");
    if (!el) {
      el = document.createElement("p");
      el.id = "dare";
      el.style.cssText = "color:var(--red);font-weight:700;font-size:22px;transform:rotate(-2deg);transform-origin:left;margin:4px 0 8px";
      document.getElementById("title").after(el);
    }
    if (!dare || dare.day !== day) { el.hidden = true; return; }
    el.hidden = false;
    const theirs = clock(dare.secs);
    if (!mine) el.textContent = `beat ${dare.name}'s ${theirs} ✏️`;
    else if (mine < dare.secs) el.textContent = `you beat ${dare.name} by ${dare.secs - mine} s!! 🎉`;
    else if (mine > dare.secs) el.textContent = `${dare.name} wins by ${mine - dare.secs} s (${theirs})… send one back!`;
    else el.textContent = `dead heat with ${dare.name}!! 🤝`;
  }
  // Your name for the link back (asked once, remembered in this browser only).
  function myName() {
    let n = "";
    try { n = localStorage.getItem("lp.from") || ""; } catch {}
    if (!n) {
      n = (prompt("Your name, so they know who to beat:") || "").trim().slice(0, 20);
      if (n) try { localStorage.setItem("lp.from", n); } catch {}
    }
    return n;
  }
  function link(day, secs) {
    const n = myName();
    return location.origin + location.pathname + "#" + (n ? `${day + 1}-${secs}-${encodeURIComponent(n)}` : `${day + 1}`);
  }
  // The family board: a finished puzzle's time goes against this browser's address (made once,
  // the same one the homework page uses), if it's in a family.
  function post(puzzle, day, secs, hints) {
    let addr = "", fams = [];
    try { addr = localStorage.getItem("lp.address") || ""; fams = JSON.parse(localStorage.getItem("lp.families") || "[]"); } catch {}
    if (!addr || !fams.length) return;
    fetch("https://lastpage-api.akkikhanna.workers.dev/a/" + addr + "/result", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, puzzle, seconds: secs, hints: hints || 0 }) }).catch(() => {});
  }
  // "next: dot to dot →": the daily puzzles not yet done today, in a fixed order; all done → the board.
  const PUZZLES = [["sudoku.html", "lp.minisudoku.", "Mini sudoku"], ["dots.html", "lp.dots.", "Dot to dot"], ["trail.html", "lp.trail.", "Word trail"]];
  function next(day) {
    const el = document.getElementById("next");
    if (!el) return;
    const here = location.pathname.split("/").pop();
    const left = PUZZLES.filter(([page, key]) => page !== here && !localStorage.getItem(key + day));
    el.innerHTML = left.length
      ? "Next: " + left.map(([page, , title]) => `<a href="${page}${(location.hash.match(/^#\d+/) || [""])[0]}">${title} →</a>`).join(" · ")
      : `All three done for today ✓ <a href="../board/">Family board →</a>`;
  }
  // "Challenge someone": your families with everyone listed; a tap sends "beat my 1:12" to them
  // (their phone, or their browser if notifications are on). The share button stays for anyone else.
  const PUZ = { "sudoku.html": "sudoku", "dots.html": "dots", "trail.html": "trail" };
  function family(day, mine) {
    const puzzle = PUZ[location.pathname.split("/").pop()];
    const share = document.getElementById("share");
    if (!puzzle || !share || !mine) return;
    let fams = [], addr = "";
    try { fams = JSON.parse(localStorage.getItem("lp.families") || "[]"); addr = localStorage.getItem("lp.address") || ""; } catch {}
    const isMe = (m) => m.addr === addr || (m.addrs || []).includes(addr);
    const groups = fams.map((f) => ({ name: f.name, people: f.members.filter((m) => !isMe(m)) })).filter((g) => g.people.length);
    let el = document.getElementById("famDare");
    if (!groups.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "famDare"; share.before(el); }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    el.innerHTML = `<p class="status" style="margin:8px 0 4px"><b>Challenge someone</b> to beat your ${clock(mine)}</p>` + groups.map((g) =>
      `<p class="small" style="margin:6px 0 2px"><b>${esc(g.name)}</b></p><div class="chips">${g.people.map((m) => `<button class="choice" data-dare="${esc(m.addr)}">${esc(m.name)}</button>`).join("")}</div>`).join("")
      + `<p class="small" style="margin:10px 0 0">or send a link to anyone:</p>`;
    el.onclick = async (e) => {
      const b = e.target.closest("[data-dare]"); if (!b || b.disabled) return;
      b.disabled = true; const name = b.textContent; b.textContent = name + "…";
      let from = ""; try { from = localStorage.getItem("lp.from") || ""; } catch {}
      if (!from) { from = (prompt("Your name, so they know who to beat:") || "").trim().slice(0, 20); if (from) try { localStorage.setItem("lp.from", from); } catch {} }
      try {
        const r = await fetch("https://lastpage-api.akkikhanna.workers.dev/a/" + b.dataset.dare + "/dare", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: from || "Someone", puzzle, day, secs: mine }) });
        if (!r.ok) throw new Error("server said " + r.status);
        b.textContent = name + " ✓"; b.classList.add("on");
      } catch (err) { b.disabled = false; b.textContent = name; alert("Couldn't reach " + name + ": " + err.message); }
    };
  }
  const shown = show;
  root.Dare = { show: (day, mine) => { shown(day, mine); next(day); family(day, mine); }, next, link, clock, post };
})(window);
