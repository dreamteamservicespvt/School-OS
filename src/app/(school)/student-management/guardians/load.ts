// A parent the person may open: linked to at least one of their students
// (everyone, for people who see all students).
import "server-only";

import type { Tx } from "@/lib/db";
import { abilities, studentScope, type Who } from "@/lib/students/access";

export async function visibleGuardianFor(tx: Tx, who: Who, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const all = abilities(who).reach === "all";
  const scope = await studentScope(tx, who);
  return tx.guardian.findFirst({ where: { id, ...(all ? {} : { students: { some: { archivedAt: null, student: scope } } }) } });
}
