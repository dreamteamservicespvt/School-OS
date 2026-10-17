// The student imports offered on Student Management, Import: new students
// (our template or UDISE+), and changes to students already on record.
import "server-only";

import type { ImportKind } from "../importer";
import { STUDENT_IMPORT, UDISE_IMPORT, studentImport, type ImportOptions } from "./import";
import { STUDENT_UPDATE_IMPORT, studentUpdateImport } from "./update-import";

export { STUDENT_IMPORT, UDISE_IMPORT, STUDENT_UPDATE_IMPORT };
export const STUDENT_IMPORT_KINDS: string[] = [STUDENT_IMPORT, UDISE_IMPORT, STUDENT_UPDATE_IMPORT];

/** The import for a key; an unknown key is the plain student import. */
export function studentImportFor(key: string | null | undefined, opts: ImportOptions): ImportKind<unknown> {
  if (key === STUDENT_UPDATE_IMPORT) return studentUpdateImport as ImportKind<unknown>;
  return studentImport(key === UDISE_IMPORT ? UDISE_IMPORT : STUDENT_IMPORT, opts) as ImportKind<unknown>;
}

export const importKindLabel = (key: string) => (key === UDISE_IMPORT ? "UDISE+" : key === STUDENT_UPDATE_IMPORT ? "Changes" : "Students");
