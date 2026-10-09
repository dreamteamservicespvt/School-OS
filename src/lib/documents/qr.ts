// A small QR code maker for documents (ID cards, certificates, receipts):
// byte mode, versions 1 to 15, error correction level M, best mask chosen by
// the standard penalty rules (ISO/IEC 18004). Drawn as an inline SVG, so a
// PDF needs no outside request.

const ECC_M_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
const ECC_M_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];
const MAX_VERSION = 15;

function rawModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_M_CODEWORDS_PER_BLOCK[ver] * ECC_M_BLOCKS[ver];

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMultiply(coef, factor)));
  }
  return result;
}

function addEcc(data: number[], ver: number): number[] {
  const numBlocks = ECC_M_BLOCKS[ver];
  const blockEccLen = ECC_M_CODEWORDS_PER_BLOCK[ver];
  const rawCodewords = Math.floor(rawModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

type Grid = { size: number; modules: boolean[][]; fn: boolean[][] };

function setFn(g: Grid, x: number, y: number, dark: boolean) {
  g.modules[y][x] = dark;
  g.fn[y][x] = true;
}

function drawFunctionPatterns(g: Grid, ver: number) {
  for (let i = 0; i < g.size; i++) {
    setFn(g, 6, i, i % 2 === 0);
    setFn(g, i, 6, i % 2 === 0);
  }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < g.size && yy >= 0 && yy < g.size) setFn(g, xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(g.size - 4, 3);
  finder(3, g.size - 4);
  const align = alignmentPositions(ver);
  const n = align.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(g, align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormatBits(g, 0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = g.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(g, a, b, dark);
      setFn(g, b, a, dark);
    }
  }
}

function drawFormatBits(g: Grid, mask: number) {
  const data = (0 << 3) | mask; // level M = 0b00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, bit(i));
  setFn(g, 8, 7, bit(6));
  setFn(g, 8, 8, bit(7));
  setFn(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(g, 8, g.size - 15 + i, bit(i));
  setFn(g, 8, g.size - 8, true);
}

function drawCodewords(g: Grid, data: number[]) {
  let i = 0;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < g.size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? g.size - 1 - vert : vert;
        if (!g.fn[y][x] && i < data.length * 8) {
          g.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && MASKS[mask](x, y)) g.modules[y][x] = !g.modules[y][x];
}

function penalty(g: Grid): number {
  const m = g.modules;
  const n = g.size;
  let score = 0;
  // Runs of 5 or more in rows and columns.
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = pass === 0 ? m[a][b] : m[b][a];
        const prev = pass === 0 ? m[a][b - 1] : m[b - 1][a];
        if (cur === prev) run++;
        else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  }
  // 2x2 blocks.
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  // Finder-like patterns 1:1:3:1:1 with 4 light modules on one side.
  const pattern = (get: (i: number) => boolean, len: number) => {
    let s = 0;
    for (let i = 0; i + 11 <= len; i++) {
      const w = Array.from({ length: 11 }, (_, k) => get(i + k));
      const core = w[0] && !w[1] && w[2] && w[3] && w[4] && !w[5] && w[6];
      if (core && !w[7] && !w[8] && !w[9] && !w[10]) s += 40;
      const core2 = w[4] && !w[5] && w[6] && w[7] && w[8] && !w[9] && w[10];
      if (core2 && !w[0] && !w[1] && !w[2] && !w[3]) s += 40;
    }
    return s;
  };
  for (let a = 0; a < n; a++) {
    score += pattern((i) => m[a][i], n);
    score += pattern((i) => m[i][a], n);
  }
  // Balance of dark and light.
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const total = n * n;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

export type QrMatrix = { size: number; version: number; mask: number; modules: boolean[][] };

/** Makes the QR matrix for a text. Throws if the text is too long for a document QR. */
export function makeQr(text: string, forceMask?: number): QrMatrix {
  const bytes = [...Buffer.from(text, "utf8")];
  let version = 1;
  for (; version <= MAX_VERSION; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error("The text is too long for a QR code on a document.");
  const capacity = dataCodewords(version) * 8;
  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  const size = version * 4 + 17;
  const blank = (): Grid => ({ size, modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)), fn: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)) });
  const base = blank();
  drawFunctionPatterns(base, version);
  drawCodewords(base, addEcc(data, version));

  let best: Grid | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const g: Grid = { size, modules: base.modules.map((r) => [...r]), fn: base.fn.map((r) => [...r]) };
    applyMask(g, mask);
    drawFormatBits(g, mask);
    const s = penalty(g);
    if (s < bestScore) { best = g; bestMask = mask; bestScore = s; }
  }
  return { size, version, mask: bestMask, modules: best!.modules };
}

/** An SVG of the QR code, with the 4-module quiet zone. Size in CSS units (e.g. "22mm"). */
export function qrSvg(text: string, size = "22mm"): string {
  const qr = makeQr(text);
  const n = qr.size + 8;
  let path = "";
  qr.modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
