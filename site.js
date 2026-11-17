// Shared bits for the web pages: the header's dialog, and the little drawings on the game cards.
(function () {
  const dlg = document.getElementById("dlg");
  if (dlg) {
    const title = dlg.querySelector("#dlgTitle");
    let opener = null;
    window.openPane = function (key) {
      let found = null;
      dlg.querySelectorAll(".pane").forEach((p) => { p.hidden = p.dataset.pane !== key; if (!p.hidden) found = p; });
      if (!found) return;
      title.textContent = found.dataset.title || "";
      if (!dlg.open) dlg.showModal();
      const first = found.querySelector("input, select, textarea, button");
      if (first) first.focus();
    };
    window.closePane = () => { if (dlg.open) dlg.close(); };
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-dialog]");
      if (t) { opener = t; window.openPane(t.dataset.dialog); return; }
      if (e.target.closest("#dlg .close")) dlg.close();
    });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });   // the backdrop
    dlg.addEventListener("close", () => { if (opener && opener.isConnected) opener.focus(); });
  }

  // The game cards' art (only where the elements exist).
  const sud = document.getElementById("sudoku-art");
  if (sud) for (const d of "1..4.6.5..2...2.64.3..1.2.3..5.1.2..") { const c = document.createElement("span"); c.textContent = d === "." ? "" : d; sud.append(c); }
  const wa = document.getElementById("word-art");
  if (wa) for (const [i, l] of [..."CKQZPAGEBORN"].entries()) { const c = document.createElement("span"); c.textContent = l; if ([4, 5, 6, 7].includes(i)) c.className = "marked"; wa.append(c); }
  const canvas = document.getElementById("dot-art");
  if (canvas) {
    const ctx = canvas.getContext("2d"); ctx.scale(2, 2);
    const gx = 19, gy = 13, step = 23;
    ctx.strokeStyle = "#91a4bc"; ctx.lineWidth = .75;
    for (let i = 0; i < 5; i++) { const x = gx + i * step; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + 69); ctx.stroke(); }
    for (let i = 0; i < 4; i++) { const y = gy + i * step; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + 92, y); ctx.stroke(); }
    const path = [[0, 2], [1, 2], [1, 1], [2, 1], [2, 0], [3, 0], [3, 1]], stops = [[0, 2], [1, 1], [2, 0], [3, 1]];
    const pt = ([x, y]) => [gx + (x + .5) * step, gy + (y + .5) * step];
    ctx.strokeStyle = "#42618b"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(...pt(path[0])); for (const p of path.slice(1)) ctx.lineTo(...pt(p)); ctx.stroke();
    ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const [i, s] of stops.entries()) { const [x, y] = pt(s); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = "#3d5c84"; ctx.fill(); ctx.fillStyle = "white"; ctx.fillText(i + 1, x, y + .5); }
  }
})();
