// Hex maps drawn as text pictures, for designing levels. In a picture, column
// x of a map sits at text column 2x, and row y at text row 2y (odd columns one
// text row lower), so every neighbour is visually next to its hex:
// two rows up or down, or one row up or down and two columns across.
//
//     .            map row:  '. .'      (odd-q layout used by sim.js)
//   .   .  <- NW / NE        ' . '
//     X
//   .   .  <- SW / SE
//     .

export function picture(level) {
  const rows = level.map.length, cols = Math.max(...level.map.map((r) => r.length));
  const out = [...Array(rows * 2 + 1)].map(() => Array(cols * 2 + 1).fill(' '));
  level.map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== ' ') out[y * 2 + (x & 1)][x * 2] = ch;
  }));
  for (const m of level.metronomes || []) out[m.at[1] * 2 + (m.at[0] & 1)][m.at[0] * 2] = 'M';
  while (out.length && !out[out.length - 1].join('').trim()) out.pop();
  return out.map((r) => r.join('').trimEnd()).join('\n');
}

// The other way: picture lines to map rows. 'M' marks a metronome on floor;
// its direction comes from `dirs` in reading order. '·' is void, so a design
// can keep the empty hex positions visible (see paper()).
export function fromPicture(pic, dirs = []) {
  const cells = [];
  let cols = 0, rows = 0;
  pic.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === ' ' || ch === '·') return;
    if (c % 2) throw new Error(`odd text column at line ${r + 1}, col ${c + 1}: '${ch}'`);
    const x = c / 2;
    if ((r - (x & 1)) % 2) throw new Error(`'${ch}' at line ${r + 1}, col ${c + 1} is between hexes`);
    const y = (r - (x & 1)) / 2;
    cells.push({ x, y, ch });
    cols = Math.max(cols, x + 1);
    rows = Math.max(rows, y + 1);
  }));
  const map = [...Array(rows)].map(() => Array(cols).fill(' '));
  const metronomes = [];
  for (const { x, y, ch } of cells) {
    if (ch === 'M') {
      metronomes.push({ at: [x, y], dir: dirs[metronomes.length] });
      map[y][x] = '.';
    } else map[y][x] = ch;
  }
  return { map: map.map((r) => r.join('')), metronomes };
}

// Blank hex paper to draw a picture on: '·' marks every hex position.
export function paper(w, h) {
  return [...Array(h * 2)].map((_, r) => [...Array(w)].map((_, x) => ((x & 1) === (r & 1) ? '·' : ' ')).join(' ').trimEnd());
}
