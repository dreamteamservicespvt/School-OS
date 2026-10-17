"use server";

// Imports offered on a module's own page (old dues and past receipts in Fee
// Management, past expenses in Finance Management, the holiday list in Events
// & Calendar). Each action checks on the server that the person may bring in
// that kind of record in its own module, works inside the school's own
// transaction and explains a refusal in plain words.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { FileProblem } from "@/lib/files";
import { PermissionDeniedError } from "@/lib/permissions";
import { MoneyProblem } from "@/lib/fees/problem";
import { EventsProblem } from "@/lib/events/problem";
import { StudentProblem } from "@/lib/students/students";
import {
  MODULE_IMPORTS, ModuleImportProblem, checkModuleFile, guardModuleImport, runModuleFile, undoModuleImport, uploadModuleFile,
  type CheckedFile, type Uploaded,
} from "@/lib/imports/module-import";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const KNOWN = [ModuleImportProblem, PermissionDeniedError, FileProblem, MoneyProblem, EventsProblem, StudentProblem];
function fail(e: unknown): { ok: false; message: string } {
  unstable_rethrow(e);
  if (KNOWN.some((K) => e instanceof K)) return { ok: false, message: (e as Error).message };
  console.error(JSON.stringify({ level: "error", event: "module-import-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not work, and nothing was changed. Try again." };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export async function uploadModuleImport(fd: FormData): Promise<Result<Uploaded & { kind: string }>> {
  try {
    const { current, key } = await guardModuleImport(str(fd, "kind"), "create");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ModuleImportProblem("Choose the CSV or Excel file.");
    const data = await withSchool(current.ctx, (tx) => uploadModuleFile(tx, current.ctx, key, file), { timeout: 60_000 });
    return { ok: true, data: { ...data, kind: key } };
  } catch (e) {
    return fail(e);
  }
}

export async function checkModuleImport(fd: FormData): Promise<Result<CheckedFile>> {
  try {
    const { current, key } = await guardModuleImport(str(fd, "kind"), "create");
    return { ok: true, data: await withSchool(current.ctx, (tx) => checkModuleFile(tx, current.ctx, key, str(fd, "fileId"), fd), { timeout: 180_000 }) };
  } catch (e) {
    return fail(e);
  }
}

export async function runModuleImport(fd: FormData): Promise<Result<{ batchId: string; added: number; updated: number; skipped: number }>> {
  try {
    const { current, key } = await guardModuleImport(str(fd, "kind"), "create");
    const batch = await withSchool(current.ctx, (tx) => runModuleFile(tx, current.ctx, key, str(fd, "fileId"), fd), { timeout: 300_000 });
    const words = MODULE_IMPORTS[key];
    await flash({ message: `${batch.added} ${batch.added === 1 ? words.one : words.many} brought in${batch.skipped ? `; ${batch.skipped} ${batch.skipped === 1 ? "row was" : "rows were"} left out with problems to download` : ""}.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { batchId: batch.id, added: batch.added, updated: batch.updated, skipped: batch.skipped } };
  } catch (e) {
    return fail(e);
  }
}

export async function undoModuleImportAction(fd: FormData): Promise<Result<{ archived: number }>> {
  try {
    const { current, key } = await guardModuleImport(str(fd, "kind"), "archive");
    const r = await withSchool(current.ctx, (tx) => undoModuleImport(tx, current.ctx, key, str(fd, "batchId")), { timeout: 120_000 });
    const words = MODULE_IMPORTS[key];
    await flash({ message: `Import undone: ${r.archived} ${r.archived === 1 ? words.one : words.many} taken back. The import stays in the history.` });
    revalidatePath("/", "layout");
    return { ok: true, data: { archived: r.archived } };
  } catch (e) {
    return fail(e);
  }
}
