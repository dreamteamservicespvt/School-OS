// Live test as Principal (17 Nov 2026): receipt PDF amounts had no rupee sign ("20,000").
// The receipt's HTML has "₹20,000" (formatRupees), but the serverless browser that makes
// live PDFs has only Latin fonts, with no ₹, so the sign printed as nothing. The app's own
// Noto Sans Devanagari file has the ₹ glyph; it is now also used for that one character.
// This test reads the font file's character map, so it proves the glyph is really there.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { INDIAN_FONTS } from "@/lib/pdf";

const KNOWN = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

function cmapOf(file: string): Buffer {
  const buf = readFileSync(file);
  if (buf.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[at++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v >>> 0;
    }
    throw new Error("bad UIntBase128");
  };
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    const tag = index === 63 ? buf.toString("latin1", at, (at += 4)) : KNOWN[index];
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(buf.subarray(at, at + totalCompressedSize));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === "cmap") return data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  throw new Error("no cmap table");
}

/** The glyph number for a code point (0 = no glyph). */
function glyphFor(cmap: Buffer, cp: number): number {
  const n = cmap.readUInt16BE(2);
  let best = 0;
  for (let i = 0; i < n; i++) {
    const sub = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(sub);
    if (format === 4 && cp <= 0xffff) {
      const segs = cmap.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        if (end < cp) continue;
        const start = cmap.readUInt16BE(starts + s * 2);
        if (start > cp) break;
        const delta = cmap.readUInt16BE(deltas + s * 2);
        const range = cmap.readUInt16BE(ranges + s * 2);
        if (range === 0) best = best || ((cp + delta) & 0xffff);
        else {
          const g = cmap.readUInt16BE(ranges + s * 2 + range + (cp - start) * 2);
          if (g) best = best || ((g + delta) & 0xffff);
        }
        break;
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const o = sub + 16 + g * 12;
        const start = cmap.readUInt32BE(o);
        const end = cmap.readUInt32BE(o + 4);
        if (cp >= start && cp <= end) { best = best || (cmap.readUInt32BE(o + 8) + (cp - start)); break; }
      }
    }
  }
  return best;
}


/** Does a unicode-range ("U+0900-097F, U+20B9") take this code point? */
function inRange(range: string, cp: number) {
  return range.split(",").map((r) => r.trim().replace(/^U\+/i, "")).some((r) => {
    const [a, b] = r.split("-").map((x) => parseInt(x, 16));
    return cp >= a && cp <= (b ?? a);
  });
}

describe("the rupee sign in PDFs made on the serverless browser", () => {
  it("is drawn from one of the app's own fonts, which really has the ₹ glyph", () => {
    const RUPEE = 0x20b9;
    const fonts = INDIAN_FONTS.filter(([, range]) => inRange(range, RUPEE));
    expect(fonts.map(([file]) => file)).toEqual(["noto-sans-devanagari.woff2"]);
    for (const [file] of fonts) expect(glyphFor(cmapOf(join(process.cwd(), "src", "app", "fonts", file)), RUPEE)).toBeGreaterThan(0);
  });

  it("the check itself tells a missing glyph from a present one", () => {
    const telugu = cmapOf(join(process.cwd(), "src", "app", "fonts", "noto-sans-telugu.woff2"));
    expect(glyphFor(telugu, 0x0c15)).toBeGreaterThan(0);
    expect(glyphFor(telugu, 0x20b9)).toBe(0);
  });
});
