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
  root.Play = { encode, decode, toMove, winLine, ncOver, ball, innings, whoseTurn, whoAmI };
})(typeof window !== "undefined" ? window : globalThis);
