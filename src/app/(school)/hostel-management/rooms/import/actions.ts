"use server";

// Import rooms and beds (15 Rooms & Beds, P10) through the one shared
// importer: upload, match columns, preview every row's problems, import the
// good rows, and undo the whole import later (the rooms are closed, never
// deleted). For people who add rooms; a warden only into their own hostel.

import { revalidatePath } from "next/cache";
import type { Tx } from "@/lib/db";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { fileStore } from "@/lib/storage";
import { autoMatch, importKind, previewImport, readSheet, runImport, undoImport, type Preview } from "@/lib/importer";
import { flash } from "@/lib/flash";
import { inHostel, need, problemState, str, UUID_RE, HostelProblem } from "@/lib/hostel/act";
import type { Mine } from "@/lib/hostel/scope";
import { ROOMS_IMPORT } from "@/lib/hostel/import";
import { BASE } from "@/lib/hostel/words";

const PURPOSE = "hostel-import";

export type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type Checked = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; name: string; detail: string }[] };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Row = { hostelId: string; hostelName: string; floor: string; roomNo: string; beds: number; roomType: string | null };

const kind = () => importKind(ROOMS_IMPORT)!;

async function rowsOf(tx: Tx, fileId: string) {
  if (!UUID_RE.test(fileId)) throw new HostelProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose: PURPOSE } });
  if (!f) throw new HostelProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new HostelProblem("Upload the file again.");
  const sheet = await readSheet(body, f.fileName);
  return { ...sheet, fileName: f.fileName };
}

function matchOf(fd: FormData, headers: string[]) {
  const match: Record<string, number> = {};
  for (const c of kind().columns) {
    const v = str(fd, `col:${c.key}`);
    if (v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < headers.length) match[c.key] = Number(v);
  }
  const missing = kind().columns.filter((c) => c.required && match[c.key] === undefined);
  if (missing.length) throw new HostelProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

/** A warden imports into their own hostel only: other hostels' rows are skipped with a reason. */
function ownHostels(p: Preview<unknown>, mine: Mine) {
  if (mine === null) return p;
  const out: Preview<unknown> = { good: [], bad: [...p.bad] };
  for (const g of p.good) {
    const v = g.value as Row;
    if (mine.includes(v.hostelId)) out.good.push(g);
    else out.bad.push({ line: g.line, row: g.row, problems: [`You work in your own hostel only, not in ${v.hostelName}.`] });
  }
  out.bad.sort((a, b) => a.line - b.line);
  return out;
}

const fail = (e: unknown): { ok: false; message: string } => ({ ok: false, message: problemState(e).message ?? "That did not work." });

function uploaded(fd: FormData) {
  for (const v of fd.getAll("file")) if (v instanceof File && v.size > 0) return v;
  return null;
}

export async function uploadRoomsFile(fd: FormData): Promise<Result<Upload>> {
  try {
    return { ok: true, data: await inHostel("create", async (w) => {
      need(w.can.rooms, "import rooms");
      const f = uploaded(fd);
      if (!f) throw new HostelProblem("Choose the CSV or Excel file.");
      const saved = await saveFile(w.tx, w.ctx, { file: f, purpose: PURPOSE, allowed: SHEET_TYPES });
      const sheet = await rowsOf(w.tx, saved.id);
      if (sheet.rows.length === 0) throw new HostelProblem("The file has headings but no rows.");
      if (sheet.rows.length > 1000) throw new HostelProblem(`The file has ${sheet.rows.length} rows. Import at most 1000 rooms at a time.`);
      return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match: autoMatch(kind().columns, sheet.headers), rows: sheet.rows.length };
    }) };
  } catch (e) {
    return fail(e);
  }
}

export async function checkRoomsFile(fd: FormData): Promise<Result<Checked>> {
  try {
    return { ok: true, data: await inHostel("create", async (w) => {
      need(w.can.rooms, "import rooms");
      const sheet = await rowsOf(w.tx, str(fd, "fileId"));
      const p = ownHostels(await previewImport(w.tx, w.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers)), w.mine);
      return {
        good: p.good.length,
        bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: b.row.room || "(no room number)", problems: b.problems })),
        sample: p.good.slice(0, 10).map((g) => { const v = g.value as Row; return { line: g.line, name: `Room ${v.roomNo}`, detail: [v.hostelName, `${v.floor} floor`, `${v.beds} bed${v.beds === 1 ? "" : "s"}`, v.roomType ?? ""].filter(Boolean).join(" · ") }; }),
      };
    }, 180_000) };
  } catch (e) {
    return fail(e);
  }
}

export async function importRoomsFile(fd: FormData): Promise<Result<{ batchId: string; added: number; skipped: number }>> {
  try {
    const batch = await inHostel("create", async (w) => {
      need(w.can.rooms, "import rooms");
      const sheet = await rowsOf(w.tx, str(fd, "fileId"));
      const p = ownHostels(await previewImport(w.tx, w.ctx, kind(), sheet.rows, matchOf(fd, sheet.headers)), w.mine);
      if (p.good.length === 0) throw new HostelProblem("No row is ready to import. Fix the problems and upload again.");
      return runImport(w.tx, w.ctx, kind(), sheet.fileName, p as Preview<Row>);
    }, 300_000);
    await flash({ message: `${batch.added} room${batch.added === 1 ? "" : "s"} imported${batch.skipped ? `, ${batch.skipped} rows skipped` : ""}.`, link: { href: `${BASE}/rooms`, label: "Rooms & Beds" } });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoRoomsImport(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const batchId = str(fd, "batchId");
    if (!UUID_RE.test(batchId)) throw new HostelProblem("This import was not found.");
    const n = await inHostel("archive", async (w) => {
      need(w.can.rooms, "undo a room import");
      const b = await w.tx.importBatch.findFirst({ where: { id: batchId, kind: ROOMS_IMPORT } });
      if (!b) throw new HostelProblem("This import was not found.");
      if (b.undoneAt) throw new HostelProblem("This import was already undone.");
      const ids = b.createdIds as string[];
      if (w.mine !== null) {
        const other = await w.tx.hostelRoom.count({ where: { id: { in: ids }, hostelId: { notIn: w.mine } } });
        if (other) throw new HostelProblem("This import added rooms in another hostel. Ask the Principal or School Admin to undo it.");
      }
      await undoImport(w.tx, w.ctx, b.id);
      return ids.length;
    });
    await flash({ message: `Import undone. ${n} room${n === 1 ? "" : "s"} closed with their beds.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: n } };
  } catch (e) {
    return fail(e);
  }
}
