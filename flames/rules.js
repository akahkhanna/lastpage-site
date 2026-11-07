// FLAMES rules — kept identical to the app (Flames.swift), so a link shows the same
// answer the sender saw. Strike shared letters one for one, count what's left, then go
// round F-L-A-M-E-S crossing out every count-th letter until one is left.
(function (root) {
  const LETTERS = ["F", "L", "A", "M", "E", "S"];
  const MEANING = { F: "Friends", L: "Love", A: "Affection", M: "Marriage", E: "Enemies", S: "Siblings" };
  const REACTION = { F: "best friends forever!", L: "aww ❤️", A: "sooo cute!!", M: "wedding bells!!",
                     E: "I knew it!!", S: "ewww, brother and sister!! 😂" };
  // Split into what people read as single letters (grapheme clusters), like Swift's
  // Character, so "रा" is one letter. A cluster counts as a letter if it starts with one.
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  const chars = (s) => seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
  const isLetter = (c) => /\p{L}/u.test(Array.from(c)[0] || "");

  function play(first, second) {
    const a = chars(first.toLowerCase());
    const b = chars(second.toLowerCase());
    const struckA = a.map(() => false), struckB = b.map(() => false), pairs = [];
    a.forEach((ch, i) => {
      if (!isLetter(ch)) return;
      const j = b.findIndex((c, k) => !struckB[k] && c === ch);
      if (j >= 0) { struckA[i] = true; struckB[j] = true; pairs.push([i, j]); }
    });
    const count = a.filter((c, i) => isLetter(c) && !struckA[i]).length
                + b.filter((c, i) => isLetter(c) && !struckB[i]).length;
    if (count === 0) return { struck: [struckA, struckB], pairs, count: 0, crossedOut: [], answer: null };
    const remaining = LETTERS.slice(), crossed = [];
    let position = 0;
    while (remaining.length > 1) {
      position = (position + count - 1) % remaining.length;
      crossed.push(remaining.splice(position, 1)[0]);
      if (position === remaining.length) position = 0;
    }
    return { struck: [struckA, struckB], pairs, count, crossedOut: crossed, answer: remaining[0] };
  }

  root.Flames = { LETTERS, MEANING, REACTION, play, chars };
  if (typeof module !== "undefined") module.exports = root.Flames;
})(typeof window !== "undefined" ? window : globalThis);
