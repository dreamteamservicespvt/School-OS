// The imports a file brought in (workflow 15; QA IMPORT-01). A file is
// brought in a part at a time: the ready rows first, then the rows fixed
// after, each part its own Import Batch with its own Undo. The file keeps
// which rows each import brought in, so the rows still waiting stay with it,
// counted, to fix and bring in.
import type { Tx } from "../db";

/** Row number → the Import Batch that brought it in (or, while it is being brought in, the cleaned file's id). */
export type BroughtIn = Record<string, string>;

export const broughtInOf = (f: { broughtIn: unknown }): BroughtIn => {
  const v = f.broughtIn;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as BroughtIn) : {};
};

/** The imports of a file not undone, oldest first (a file imported before files were brought in a part at a time has only batchId). */
export const fileBatchIds = (f: { batchIds: string[]; batchId: string | null }) =>
  f.batchIds.length ? f.batchIds : f.batchId ? [f.batchId] : [];

/**
 * After one import is undone, wherever Undo was pressed: the rows it brought
 * in go back to the file it came from, and the file opens again so they can be
 * fixed and brought in again. The file's other imports stay as they are.
 */
export async function reopenAfterUndo(tx: Tx, batchId: string) {
  const files = await tx.moveInFile.findMany({ where: { archivedAt: null, OR: [{ batchId }, { batchIds: { has: batchId } }] } });
  for (const f of files) {
    const brought = broughtInOf(f);
    const kept = Object.fromEntries(Object.entries(brought).filter(([, b]) => b !== batchId));
    const back = Object.keys(brought).length - Object.keys(kept).length;
    const batchIds = fileBatchIds(f).filter((b) => b !== batchId);
    await tx.moveInFile.update({
      where: { id: f.id },
      data: {
        broughtIn: kept, batchIds, batchId: batchIds.at(-1) ?? null, waiting: f.waiting + back,
        // A further import of the file still running carries on.
        ...(f.status === "importing" ? {} : { status: "open", importFileId: null }),
      },
    });
  }
}
