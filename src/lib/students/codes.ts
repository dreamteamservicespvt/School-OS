// QR codes and barcodes for certificates and ID cards, drawn as inline SVG
// so PDFs need nothing from outside (src/lib/pdf.ts blocks outside requests).
import "server-only";

import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

/** A random verification code: no personal data, cannot be guessed (16 characters). */
export function newVerifyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function qrSvg(text: string, size = 96) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
}

// Code 128 (set B): printable ASCII, used for the admission number barcode.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/** An SVG barcode (Code 128 B) for short ASCII text such as an admission number. */
export function barcodeSvg(text: string, height = 32, moduleWidth = 1.2) {
  const clean = text.replace(/[^\x20-\x7e]/g, "?");
  const codes = [104, ...Array.from(clean, (ch) => ch.charCodeAt(0) - 32)];
  const check = codes.reduce((sum, c, i) => sum + c * (i === 0 ? 1 : i), 0) % 103;
  codes.push(check, 106);
  let x = 10 * moduleWidth;
  let bars = "";
  for (const code of codes) {
    const pattern = PATTERNS[code];
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]) * moduleWidth;
      if (i % 2 === 0) bars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
      x += w;
    }
  }
  const width = x + 10 * moduleWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(1)}" height="${height}" viewBox="0 0 ${width.toFixed(1)} ${height}" role="img" aria-label="Barcode ${clean}"><g fill="#000">${bars}</g></svg>`;
}
