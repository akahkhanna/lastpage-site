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
  root.Dare = { show, link, clock, post };
})(window);
