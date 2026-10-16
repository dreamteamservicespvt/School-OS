// Reading whatever file a school brings (workflow 15): an Excel workbook with
// several sheets, a CSV saved by old school software with commas, semicolons
// or tabs, in UTF-8, UTF-16 ("Unicode text" from Excel) or Windows-1252.
// Every cell comes back as text, dates as DD-MM-YYYY.
import ExcelJS from "exceljs";

export type Sheet = { name: string; rows: string[][] };

export class ReadProblem extends Error {}

/** Most rows read from one sheet. Bigger files are split by the school. */
export const MAX_ROWS = 5000;

export async function readWorkbook(buf: Buffer, fileName: string): Promise<Sheet[]> {
  const lower = fileName.toLowerCase();
  if (buf.length === 0) throw new ReadProblem("The file is empty.");
  // Old Excel (.xls, a compound file starting D0 CF 11 E0) cannot be read safely.
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])) || (lower.endsWith(".xls") && buf.subarray(0, 2).toString() !== "PK")) {
    throw new ReadProblem("This is an old Excel file (.xls). Open it in Excel and use Save As, Excel Workbook (.xlsx) or CSV, then upload that.");
  }
  if (buf.subarray(0, 2).toString() === "PK") return readXlsx(buf);
  return [{ name: fileName.replace(/\.[^.]+$/, "") || "Sheet 1", rows: readDelimited(decodeText(buf)) }];
}

async function readXlsx(buf: Buffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ReadProblem("This Excel file could not be opened. It may be damaged or protected with a password. Save it again in Excel, without a password, and upload it.");
  }
  const sheets: Sheet[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      if (n > MAX_ROWS + 50) return;
      const cells = (row.values as unknown[]).slice(1).map((v) => cellText(v));
      while (rows.length < n - 1) rows.push([]);
      rows.push(cells);
    });
    sheets.push({ name: ws.name, rows: trimGrid(rows) });
  }
  if (!sheets.length) throw new ReadProblem("This Excel file has no sheets to read.");
  return sheets;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ddmmyyyy = (d: Date) => `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;

/** One Excel cell as text: dates as DD-MM-YYYY, formulas as their result, whole numbers without ".0". */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : ddmmyyyy(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; error?: string; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim();
    if (o.result !== undefined) return cellText(o.result);
    if (o.text !== undefined) return cellText(o.text);
    if (o.error) return "";
    return "";
  }
  return String(v).replace(/ /g, " ").trim();
}

/** Text from a CSV file in whichever encoding the old software used. */
export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  // UTF-16 without a mark: every other byte is zero in English text.
  const sample = buf.subarray(0, 400);
  let zeros = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) zeros++;
  if (sample.length > 20 && zeros > sample.length / 4) return new TextDecoder("utf-16le").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/** Splits CSV text, finding the separator (comma, semicolon, tab or bar) the file uses. */
export function readDelimited(text: string): string[][] {
  const sep = guessSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      if (rows.length > MAX_ROWS + 50) break;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return trimGrid(rows.map((r) => r.map((c) => c.replace(/ /g, " ").trim())));
}

export function guessSeparator(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = 0;
  for (const sep of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => countOutsideQuotes(l, sep));
    const min = Math.min(...counts);
    const score = min > 0 ? min * 10 + counts.filter((c) => c === counts[0]).length : counts.reduce((a, b) => a + b, 0) / 100;
    if (score > bestScore) { best = sep; bestScore = score; }
  }
  return best;
}

function countOutsideQuotes(line: string, sep: string) {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) n++;
  }
  return n;
}

/** Drops empty rows at the end and empty columns at the right. */
function trimGrid(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((c) => !c)) end--;
  const out = rows.slice(0, end);
  let width = 0;
  for (const r of out) for (let i = r.length - 1; i >= 0; i--) if (r[i]) { width = Math.max(width, i + 1); break; }
  return out.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
}
