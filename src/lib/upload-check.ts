// Checks on every upload (08-platform-security.md §8 "Uploads are checked for
// viruses and limited in size"; gap list G46, part 4). A file is judged by its
// content, never only by its name. Programs, scripts, web pages and pictures
// that can carry code are refused; PDFs with built-in programs and Excel files
// with macros are refused; photos lose their hidden details (such as where
// they were taken). A virus scanner (ClamAV's clamd) checks every file once
// CLAMAV_HOST is set; until then this step is off. Each refusal says why in
// plain words.
import { Socket } from "node:net";
import sharp from "sharp";

/** A file refused, with the reason in plain words (re-exported by files.ts). */
export class FileProblem extends Error {}

/** Names that are programs or web pages whatever is inside. */
const DANGEROUS_NAME = /\.(exe|com|bat|cmd|scr|pif|msi|msp|dll|cpl|jar|apk|app|dmg|sh|bash|ps1|psm1|vbs|vbe|js|mjs|jse|wsf|wsh|hta|html?|xhtml|svgz?|php\d?|phtml|asp|aspx|jsp|py|pl|rb|lnk|reg|iso|docm|xlsm|xltm|pptm)$/i;

const startsWith = (buf: Buffer, bytes: number[]) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);

/** The start of a text file, without a byte-order mark or leading spaces, in lower case. */
function textStart(buf: Buffer, n = 4096) {
  let s = buf.subarray(0, n).toString("latin1");
  if (s.startsWith("\xef\xbb\xbf")) s = s.slice(3);
  return s.replace(/^[\s\u0000]+/, "").toLowerCase();
}

/** Refuses programs, scripts and web pages, by name and by their first bytes. */
export function refuseDangerous(buf: Buffer, fileName: string) {
  if (DANGEROUS_NAME.test(fileName.trim())) throw new FileProblem("Programs, scripts and web pages cannot be uploaded, so this file was not saved. Upload a photo, a PDF or a spreadsheet.");
  const program =
    startsWith(buf, [0x4d, 0x5a]) || // Windows program (MZ)
    startsWith(buf, [0x7f, 0x45, 0x4c, 0x46]) || // Linux program (ELF)
    startsWith(buf, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(buf, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(buf, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(buf, [0xcf, 0xfa, 0xed, 0xfe]) || // Mac programs
    startsWith(buf, [0xca, 0xfe, 0xba, 0xbe]) || // Java or Mac program
    startsWith(buf, [0x23, 0x21]); // a script ("#!")
  if (program) throw new FileProblem("This file is a program, not a document or photo, so it was not saved. Upload a photo, a PDF or a spreadsheet.");
  const head = textStart(buf);
  if (/^(<!doctype\s+html|<html|<head|<body|<script|<iframe|<object|<embed)/.test(head)) throw new FileProblem("This file is a web page, which can carry hidden code, so it was not saved. Save it as a PDF and upload that.");
  if (/^<svg|^<\?xml[\s\S]*<svg/.test(head)) throw new FileProblem("Pictures in SVG format can carry hidden code, so they are not accepted. Save the picture as PNG or JPG and upload that.");
}

/** PDFs that run a program when opened. */
export function checkPdf(buf: Buffer) {
  const text = buf.toString("latin1");
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(text)) {
    throw new FileProblem("This PDF has a built-in program or attached file, which can be unsafe, so it was not saved. Open it and print it to a new PDF (Print, Save as PDF), then upload that.");
  }
}

/** An Excel workbook: a ZIP holding the "xl/" parts, and no macros. */
export function checkWorkbook(buf: Buffer) {
  const text = buf.toString("latin1");
  if (!text.includes("[Content_Types].xml") || !text.includes("xl/")) throw new FileProblem("This is not an Excel workbook. Save it as Excel Workbook (.xlsx) or CSV and upload that.");
  if (/vbaProject\.bin/i.test(text)) throw new FileProblem("This Excel file has macros, which can run hidden code, so it was not saved. Save it as Excel Workbook (.xlsx, without macros) or CSV and upload that.");
}

/** A CSV must be plain text. */
export function checkCsv(buf: Buffer) {
  if (buf.subarray(0, 64 * 1024).includes(0)) throw new FileProblem("This file is not a plain CSV file. Save it as CSV (comma separated) or Excel Workbook (.xlsx) and upload that.");
  if (/<script|<iframe|<html/.test(textStart(buf, 64 * 1024))) throw new FileProblem("This file has web page code in it, so it was not saved. Check it is the right file.");
}

/** For spreadsheets read straight away and not kept (marks entry, imports). */
export function checkSheet(buf: Buffer, fileName: string) {
  refuseDangerous(buf, fileName);
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) checkWorkbook(buf);
  else checkCsv(buf);
}

/**
 * Removes hidden details from a photo (EXIF, including where it was taken)
 * by drawing it again, the right way up, in the same format. A file that is
 * not really a picture fails here.
 */
export async function cleanPhoto(buf: Buffer, type: string): Promise<Buffer> {
  try {
    const img = sharp(buf).rotate();
    if (type === "image/png") return await img.png().toBuffer();
    if (type === "image/webp") return await img.webp({ quality: 90 }).toBuffer();
    return await img.jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw new FileProblem("This photo could not be opened. It may be damaged. Save or take it again and upload it.");
  }
}

// Virus scanning (ClamAV's clamd, INSTREAM). Off until CLAMAV_HOST is set.

export type ScanResult = { status: "off" } | { status: "clean" } | { status: "found"; name: string };

export function virusScanOn() {
  return Boolean(process.env.CLAMAV_HOST);
}

/** Sends the file to clamd and reads its answer. Throws when the scanner cannot be reached. */
export function clamdScan(buf: Buffer, host: string, port: number, timeoutMs = 15_000): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let reply = "";
    const fail = (e: Error) => {
      socket.destroy();
      reject(e);
    };
    socket.setTimeout(timeoutMs, () => fail(new Error("Virus scanner did not answer in time")));
    socket.on("error", fail);
    socket.on("data", (d) => {
      reply += d.toString("latin1");
    });
    socket.on("close", () => {
      const text = reply.replace(/\0/g, "").trim();
      const found = /:\s*(.+?)\s+FOUND$/.exec(text);
      if (found) resolve({ status: "found", name: found[1] });
      else if (/:\s*OK$/.test(text)) resolve({ status: "clean" });
      else reject(new Error(`Virus scanner answered: ${text.slice(0, 200) || "nothing"}`));
    });
    socket.connect(port, host, () => {
      socket.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let i = 0; i < buf.length; i += CHUNK) {
        const part = buf.subarray(i, i + CHUNK);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(part.length);
        socket.write(len);
        socket.write(part);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

/** The virus check every upload passes through. Refuses the file if the scanner finds something or cannot be reached. */
export async function scanUpload(buf: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { status: "off" };
  let result: ScanResult;
  try {
    result = await clamdScan(buf, host, Number(process.env.CLAMAV_PORT ?? 3310));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "virus-scan-unavailable", error: e instanceof Error ? e.message : String(e) }));
    throw new FileProblem("This file could not be checked for viruses just now, so it was not saved. Please try again in a few minutes.");
  }
  if (result.status === "found") {
    console.error(JSON.stringify({ level: "warn", event: "virus-found", signature: result.name }));
    throw new FileProblem("This file looks like it has a virus, so it was not saved. Scan your computer or phone, or ask for a fresh copy of the file.");
  }
  return result;
}
