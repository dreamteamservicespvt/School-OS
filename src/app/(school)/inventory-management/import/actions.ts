"use server";

// Import items with opening stock, and assets (14 Items & Stock and Assets,
// P10), through the one shared importer: upload, match columns, preview
// every row's problems, import the good rows, and undo the whole import.
// Items: the store keeper (Items & Stock full). Assets: Assets full.

import { revalidatePath } from "next/cache";
import type { Tx } from "@/lib/db";
import { SHEET_TYPES, saveFile } from "@/lib/files";
import { fileStore } from "@/lib/storage";
import { autoMatch, importKind, previewImport, readSheet, runImport, undoImport } from "@/lib/importer";
import { flash } from "@/lib/flash";
import { formatRupees } from "@/lib/format";
import { inInventory, need, problemState, str, UUID_RE, InventoryProblem, type InvWork } from "@/lib/inventory/act";
import { ASSETS_IMPORT, ITEMS_IMPORT } from "@/lib/inventory/import";
import { BASE } from "@/lib/inventory/words";

export type Upload = { fileId: string; fileName: string; headers: string[]; match: Record<string, number>; rows: number };
export type Checked = { good: number; bad: { line: number; name: string; problems: string[] }[]; sample: { line: number; name: string; detail: string }[] };
type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const KINDS = {
  items: { key: ITEMS_IMPORT, purpose: "inventory-items-import", may: (w: InvWork) => w.can.stock, what: "items", list: `${BASE}/items` },
  assets: { key: ASSETS_IMPORT, purpose: "inventory-assets-import", may: (w: InvWork) => w.can.assets, what: "assets", list: `${BASE}/assets` },
} as const;
type Kind = keyof typeof KINDS;

function kindOf(fd: FormData) {
  const k = str(fd, "kind") as Kind;
  if (!(k in KINDS)) throw new InventoryProblem("Choose what to import.");
  return { k, ...KINDS[k], def: importKind(KINDS[k].key)! };
}

async function rowsOf(tx: Tx, fileId: string, purpose: string) {
  if (!UUID_RE.test(fileId)) throw new InventoryProblem("Upload the file again.");
  const f = await tx.storedFile.findFirst({ where: { id: fileId, purpose } });
  if (!f) throw new InventoryProblem("Upload the file again.");
  const body = await fileStore().get(f.storageKey);
  if (!body) throw new InventoryProblem("Upload the file again.");
  const sheet = await readSheet(body, f.fileName);
  return { ...sheet, fileName: f.fileName };
}

function matchOf(fd: FormData, headers: string[], columns: { key: string; label: string; required?: boolean }[]) {
  const match: Record<string, number> = {};
  for (const c of columns) {
    const v = str(fd, `col:${c.key}`);
    if (v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < headers.length) match[c.key] = Number(v);
  }
  const missing = columns.filter((c) => c.required && match[c.key] === undefined);
  if (missing.length) throw new InventoryProblem(`Choose the file's column for: ${missing.map((c) => c.label).join(", ")}.`);
  return match;
}

const fail = (e: unknown): { ok: false; message: string } => ({ ok: false, message: problemState(e).message ?? "That did not work." });

function uploaded(fd: FormData) {
  for (const v of fd.getAll("file")) if (v instanceof File && v.size > 0) return v;
  return null;
}

type ItemValue = { name: string; size: string | null; category: string; opening: { store: string | null; qty: number }[]; pricePaise: bigint | null };
type AssetValue = { name: string; type: string; costPaise: bigint | null; tag: string | null };

function sampleOf(k: Kind, v: unknown) {
  if (k === "items") {
    const x = v as ItemValue;
    const qty = x.opening.reduce((a, o) => a + o.qty, 0);
    return { name: `${x.name}${x.size ? ` (${x.size})` : ""}`, detail: [x.category, qty ? `${qty.toLocaleString("en-IN")} opening` : "no opening stock", x.pricePaise !== null ? formatRupees(x.pricePaise) : ""].filter(Boolean).join(" · ") };
  }
  const x = v as AssetValue;
  return { name: x.name, detail: [x.tag ?? "next tag", x.type, x.costPaise !== null ? formatRupees(x.costPaise) : ""].filter(Boolean).join(" · ") };
}

export async function uploadInventoryFile(fd: FormData): Promise<Result<Upload>> {
  try {
    const kind = kindOf(fd);
    return { ok: true, data: await inInventory("create", async (w) => {
      need(kind.may(w), `import ${kind.what}`);
      const f = uploaded(fd);
      if (!f) throw new InventoryProblem("Choose the CSV or Excel file.");
      const saved = await saveFile(w.tx, w.ctx, { file: f, purpose: kind.purpose, allowed: SHEET_TYPES });
      const sheet = await rowsOf(w.tx, saved.id, kind.purpose);
      if (sheet.rows.length === 0) throw new InventoryProblem("The file has headings but no rows.");
      if (sheet.rows.length > 3000) throw new InventoryProblem(`The file has ${sheet.rows.length} rows. Import at most 3000 at a time.`);
      return { fileId: saved.id, fileName: sheet.fileName, headers: sheet.headers, match: autoMatch(kind.def.columns, sheet.headers), rows: sheet.rows.length };
    }) };
  } catch (e) {
    return fail(e);
  }
}

export async function checkInventoryFile(fd: FormData): Promise<Result<Checked>> {
  try {
    const kind = kindOf(fd);
    return { ok: true, data: await inInventory("create", async (w) => {
      need(kind.may(w), `import ${kind.what}`);
      const sheet = await rowsOf(w.tx, str(fd, "fileId"), kind.purpose);
      const p = await previewImport(w.tx, w.ctx, kind.def, sheet.rows, matchOf(fd, sheet.headers, kind.def.columns));
      return {
        good: p.good.length,
        bad: p.bad.slice(0, 200).map((b) => ({ line: b.line, name: b.row.name || "(no name)", problems: b.problems })),
        sample: p.good.slice(0, 10).map((g) => ({ line: g.line, ...sampleOf(kind.k, g.value) })),
      };
    }, 180_000) };
  } catch (e) {
    return fail(e);
  }
}

export async function importInventoryFile(fd: FormData): Promise<Result<{ batchId: string; added: number; skipped: number }>> {
  try {
    const kind = kindOf(fd);
    const batch = await inInventory("create", async (w) => {
      need(kind.may(w), `import ${kind.what}`);
      const sheet = await rowsOf(w.tx, str(fd, "fileId"), kind.purpose);
      const p = await previewImport(w.tx, w.ctx, kind.def, sheet.rows, matchOf(fd, sheet.headers, kind.def.columns));
      if (p.good.length === 0) throw new InventoryProblem("No row is ready to import. Fix the problems and upload again.");
      return runImport(w.tx, w.ctx, kind.def, sheet.fileName, p);
    }, 300_000);
    await flash({ message: `${batch.added} ${kind.what === "items" ? (batch.added === 1 ? "item" : "items") : batch.added === 1 ? "asset" : "assets"} imported${batch.skipped ? `, ${batch.skipped} rows skipped` : ""}.`, link: { href: kind.list, label: kind.what === "items" ? "Items & Stock" : "Assets" } });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoInventoryImport(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const kind = kindOf(fd);
    const batchId = str(fd, "batchId");
    if (!UUID_RE.test(batchId)) throw new InventoryProblem("This import was not found.");
    const n = await inInventory("archive", async (w) => {
      need(kind.may(w), `undo an import of ${kind.what}`);
      const b = await w.tx.importBatch.findFirst({ where: { id: batchId, kind: kind.key } });
      if (!b) throw new InventoryProblem("This import was not found.");
      if (b.undoneAt) throw new InventoryProblem("This import was already undone.");
      try {
        await undoImport(w.tx, w.ctx, b.id);
      } catch (e) {
        // The importer's own refusals are plain errors in plain words.
        if (e instanceof Error && e.constructor === Error) throw new InventoryProblem(e.message);
        throw e;
      }
      return (b.createdIds as string[]).length;
    }, 180_000);
    await flash({ message: kind.what === "items" ? `Import undone. ${n} item${n === 1 ? "" : "s"} archived and their opening stock taken out.` : `Import undone. ${n} asset${n === 1 ? "" : "s"} archived.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: n } };
  } catch (e) {
    return fail(e);
  }
}
