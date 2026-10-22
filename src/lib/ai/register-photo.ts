// Smart Import reading photos of a paper register (gap list G43). Many schools
// move in from paper: the person photographs or scans the register pages, and
// the AI service copies each page into rows. The rows then become an ordinary
// file in the one import engine (src/lib/move-in): column matching, row
// problems, fixes, leave-out, the check and Undo. Nothing is saved until the
// person presses Bring in, and every row is marked "read from a photo".
//
// What is sent: only the picture the person uploaded, for this purpose, with
// the import's name and its column names (never a record). Every request is
// logged as an AI Call by aiTask(). What comes back is kept only as the file's
// rows; a column that holds restricted details (Aadhaar, bank details) is
// dropped, and a number shaped like an Aadhaar number is never kept.
import "server-only";

import * as z from "zod/v4";
import type { SchoolContext } from "../db";
import { aiTask, type AiImage, type AiReason } from "./index";
import { restrictedName } from "./minimise";

/** Most photos read in one upload, and rows kept from one page. */
export const MAX_PHOTOS = 5;
export const MAX_PAGE_ROWS = 300;
/** Written by the reader in a cell it could not read; such a row is a problem until a person types it in. */
export const UNCLEAR = "[unclear]";
export const isUnclear = (v: string | undefined | null) => /\[\s*unclear\s*\]/i.test(v ?? "");

export const REGISTER_SYSTEM = [
  "You copy one photo or scan of a page of an Indian school's paper register (an admission register, a staff register, a fee register or a similar list) into a table, so the school can check it and bring it into School OS.",
  "Copy exactly what is written. Never correct, complete, guess or invent a name, number, date or amount. Keep spellings, dates and numbers as written, in the script they are written in.",
  "When a cell, or part of it, cannot be read with certainty, write [unclear] for the part you cannot read. Leave a cell empty when it is empty on the page.",
  "headings: the column titles as written on the page, left to right. Give an empty list when the page has no heading row (a continuation page).",
  "rows: one list of cells for each record line on the page, top to bottom, with one cell for each column, in the same order as the headings. Leave out the heading row, page totals, signatures, stamps, notes in the margin and lines struck out.",
  "Never copy Aadhaar numbers, bank account numbers, IFSC codes or passwords: leave those cells empty.",
  "readable: false when the picture is not a page of a register or list, or is too blurred, dark or cut off to read; then give empty lists.",
].join("\n");

export const registerAnswer = z.object({
  readable: z.boolean(),
  headings: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
export type RegisterAnswer = z.infer<typeof registerAnswer>;

/** The text sent with the picture: what is being brought in and the columns School OS keeps. Never a record. */
export function registerQuestion(importing: string, fields: { label: string }[]) {
  return { importing: importing.slice(0, 60), columnsSchoolOsKeeps: fields.map((f) => f.label.slice(0, 80)).slice(0, 60) };
}

const AADHAAR_SHAPED = /^\d{4}\s?\d{4}\s?\d{4}$/;
const clean = (v: unknown) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);

export type PageTable = { headings: string[]; rows: string[][] };

/**
 * The pages read, as one sheet: the headings of the first page that has them
 * (or "Column 1", "Column 2"…), then every page's rows in order. Restricted
 * columns are dropped and Aadhaar-shaped numbers left out. Also says which
 * rows each page gave (sheet rows, the headings being row 1).
 */
export function sheetFromPages(pages: PageTable[]): { rows: string[][]; spans: { from: number; to: number }[]; dropped: string[] } {
  const named = pages.find((p) => p.headings.some((h) => clean(h)));
  const width = Math.max(named?.headings.length ?? 0, ...pages.flatMap((p) => p.rows.map((r) => r.length)), 0);
  const headings = Array.from({ length: width }, (_, i) => clean(named?.headings[i]) || `Column ${i + 1}`);
  const dropped = new Set<string>();
  const keep = headings.map((h, i) => {
    const what = restrictedName(h);
    if (what) { dropped.add(what); return -1; }
    return i;
  }).filter((i) => i >= 0);
  const sameAsHeadings = (r: string[]) => r.length > 1 && r.every((c, i) => clean(c).toLowerCase() === (headings[i] ?? "").toLowerCase());
  const out: string[][] = [keep.map((i) => headings[i])];
  const spans: { from: number; to: number }[] = [];
  for (const p of pages) {
    const from = out.length + 1;
    for (const r of p.rows.slice(0, MAX_PAGE_ROWS)) {
      const cells = r.map(clean);
      if (!cells.some(Boolean) || sameAsHeadings(cells)) continue;
      out.push(keep.map((i) => {
        const v = cells[i] ?? "";
        // A number shaped like an Aadhaar number is never kept, whatever its column (a mobile with 91 in front is kept).
        return AADHAAR_SHAPED.test(v) && !/^91\s?[6-9]/.test(v) ? "" : v;
      }));
    }
    spans.push({ from, to: out.length });
  }
  return { rows: out, spans, dropped: [...dropped] };
}

export type PhotoIn = { fileName: string; image: AiImage };
export type PhotoReading = { ok: true; pages: PageTable[]; callIds: string[] } | { ok: false; message: string; reason: AiReason | "unreadable-page" | "empty" };

/** Reads each photo through the AI gateway (one request a photo, logged), or says in plain words why not. */
export async function readRegisterPhotos(ctx: SchoolContext, input: { importing: string; fields: { label: string }[]; photos: PhotoIn[] }): Promise<PhotoReading> {
  const question = registerQuestion(input.importing, input.fields);
  const results = await Promise.all(input.photos.slice(0, MAX_PHOTOS).map((p) => aiTask(ctx, {
    feature: "ai-smart-import", purpose: "Read a register photo", system: REGISTER_SYSTEM, input: question, schema: registerAnswer,
    images: [p.image], needs: ["images"], effort: "medium", maxTokens: 16_000, minTimeoutMs: 90_000,
  })));
  const pages: PageTable[] = [];
  const callIds: string[] = [];
  for (const [i, r] of results.entries()) {
    if (!r.ok) return { ok: false, reason: r.reason, message: r.words };
    callIds.push(r.callId);
    if (!r.data.readable) {
      return { ok: false, reason: "unreadable-page", message: `“${input.photos[i].fileName}” could not be read as a register page. Take the photo again in good light, straight from above, with the whole page in it.` };
    }
    pages.push({ headings: r.data.headings, rows: r.data.rows });
  }
  if (!pages.some((p) => p.rows.some((r) => r.some((c) => clean(c))))) {
    return { ok: false, reason: "empty", message: "No rows were found on these pages. Check that each photo shows the register's lines, and try again." };
  }
  return { ok: true, pages, callIds };
}
