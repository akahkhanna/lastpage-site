// Games by link, kept identical to the app (TurnLinks.swift, NoughtsCrosses, BookCricket):
// the whole game rides in the link after "#", as base64url JSON. Nothing is stored anywhere.
//   { g: "nc" | "bc", n: [name0, name1],
//     b: "t..x.....", s: "t" | "x", k: [ticks, crosses, draws],   // noughts & crosses
//     p: [pages], q: [pages] }                                      // book cricket
(function (root) {
  function encode(post) {
    const bytes = new TextEncoder().encode(JSON.stringify(post));
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(s) {
    try {
      let b = s.replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
      const bin = atob(b), bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const post = JSON.parse(new TextDecoder().decode(bytes));
      return valid(post) ? post : null;
    } catch { return null; }
  }
  function valid(p) {
    if (!p || !Array.isArray(p.n) || p.n.length !== 2) return false;
    if (p.g === "nc") return typeof p.b === "string" && /^[tx.]{9}$/.test(p.b) && (p.s === "t" || p.s === "x") && Array.isArray(p.k) && p.k.length === 3;
    if (p.g === "bc") return Array.isArray(p.p);
    return false;
  }

  // Noughts & crosses
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function toMove(b, s) {
    const t = [...b].filter((c) => c === "t").length, x = [...b].filter((c) => c === "x").length;
    return t === x ? s : t < x ? "t" : "x";
  }
  function winLine(b) { return LINES.find((l) => b[l[0]] !== "." && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) || null; }
  function ncOver(b) { return !!winLine(b) || !b.includes("."); }

  // Book cricket: last digit of the page; 0 OUT, 8 no ball (1 run, doesn't count); 3 wickets or 18 balls.
  function ball(page) { const d = page % 10; return d === 0 ? "W" : d === 8 ? "nb" : d; }
  function innings(pages, target) {
    const batters = [[], [], []]; let runs = 0, wickets = 0, legal = 0;
    const over = () => wickets >= 3 || legal >= 18 || (target != null && runs >= target);
    for (const pg of pages) {
      if (over()) break;
      const b = ball(pg); batters[wickets].push(b);
      if (b === "W") wickets++; else if (b === "nb") runs += 1; else runs += b;
      if (b !== "nb") legal++;
    }
    return { batters, runs, wickets, legal, over: over() };
  }
  function whoseTurn(p) {
    if (p.g === "nc") return toMove(p.b, p.s) === "t" ? 0 : 1;
    const first = innings(p.p || []);
    if (!first.over) return 0;
    if (!p.q || !innings(p.q, first.runs + 1).over) return 1;
    return 0;
  }
  // You're whoever's turn it is; opening your own sent link again just shows it, waiting.
  function whoAmI(p, myName) {
    const turn = whoseTurn(p);
    if (p.n[turn] && p.n[turn] !== myName && p.n[1 - turn] === myName) return 1 - turn;
    return turn;
  }
  // The winning three struck through in red pen, the way you'd do it on paper (drawn on, not just shaded).
  function strike(board, line) {
    if (!board || !line) return;
    const at = (i) => [((i % 3) + 0.5) * 100 / 3, (Math.floor(i / 3) + 0.5) * 100 / 3];
    let [x1, y1] = at(line[0]), [x2, y2] = at(line[2]);
    // A little past the outer squares' centres, as a hand would.
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ext = 11;
    x1 -= dx / len * ext; y1 -= dy / len * ext; x2 += dx / len * ext; y2 += dy / len * ext;
    const full = (len + 2 * ext + 4).toFixed(1);   // the board is square, so its own units measure the line
    board.insertAdjacentHTML("beforeend", `<svg class="strike" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b8322a" stroke-width="2.6" stroke-linecap="round"
        stroke-dasharray="${full}" style="--full:${full};animation:lp-strike .35s ease-out both"/></svg>`);
    // However the page is being drawn, the line ends up there: the animation is only the pen moving.
    const l = board.querySelector("svg.strike:last-child line");
    setTimeout(() => { l.style.animation = "none"; }, 600);
  }
  root.Play = { encode, decode, toMove, winLine, ncOver, ball, innings, whoseTurn, whoAmI, strike };
})(typeof window !== "undefined" ? window : globalThis);
