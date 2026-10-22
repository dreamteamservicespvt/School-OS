"use server";

// Undo of a student import from Student Management's import history (P10).
// Files themselves come in on the one import engine
// (src/app/(school)/_imports/file-actions.ts, place "students").

import { revalidatePath } from "next/cache";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { undoImport } from "@/lib/importer";
import { STUDENT_IMPORT_KINDS, STUDENT_UPDATE_IMPORT } from "@/lib/students/import-kinds";
import { StudentProblem } from "@/lib/students/students";
import { BASE, attempt, studentAction } from "../_lib/page";

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const KINDS = STUDENT_IMPORT_KINDS;

export async function undoImportAction(fd: FormData) {
  const { current } = await studentAction("archive", { manage: true });
  const id = String(fd.get("id") ?? "");
  if (!isId(id)) return "This import was not found.";
  let putBack = 0;
  let changes = false;
  const r = await attempt(() => withSchool(current.ctx, async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id } });
    if (!batch || !KINDS.includes(batch.kind)) throw new StudentProblem("This import was not found.");
    if (batch.undoneAt) throw new StudentProblem("This import was already undone.");
    const u = await undoImport(tx, current.ctx, id);
    putBack = u.putBack;
    changes = batch.kind === STUDENT_UPDATE_IMPORT;
  }, { timeout: 120_000 }));
  if (r) return r;
  await flash({ message: changes ? `Import undone. ${putBack} ${putBack === 1 ? "student is" : "students are"} back to the values before it; any value changed since was kept.` : "Import undone. The students it added are archived, and the import stays in the history." });
  revalidatePath(BASE);
}
