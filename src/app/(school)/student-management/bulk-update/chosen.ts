// The students a bulk page works on: chosen on the Student List (?ids=) or a whole section (?section=).
import "server-only";

import type { Tx } from "@/lib/db";
import type { Who } from "@/lib/students/access";
import { studentScope } from "@/lib/students/access";
import { yearList, type YearIds } from "../_lib/queries";
import { STUDYING } from "@/lib/students/labels";

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function chosenStudents(tx: Tx, who: Who, yearId: YearIds, q: { ids?: string; section?: string }) {
  const ids = (q.ids ?? "").split(",").filter(isId).slice(0, 500);
  const section = q.section && isId(q.section) ? q.section : null;
  if (!ids.length && !section) return [];
  const years = yearList(yearId);
  const scope = await studentScope(tx, who, years);
  const students = await tx.student.findMany({
    where: {
      AND: [scope, { archivedAt: null }, ids.length ? { id: { in: ids } } : { status: { in: [...STUDYING] }, enrolments: { some: { sectionId: section!, archivedAt: null } } }],
    },
    include: { enrolments: { where: { archivedAt: null, ...(years.length ? { academicYearId: { in: years } } : {}) }, take: 1 } },
    orderBy: { fullName: "asc" },
  });
  const secs = await tx.section.findMany({ where: { id: { in: students.flatMap((s) => s.enrolments.map((e) => e.sectionId)) } }, include: { schoolClass: true } });
  return students.map((s) => {
    const e = s.enrolments[0];
    const sec = secs.find((x) => x.id === e?.sectionId);
    return { id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: sec ? `${sec.schoolClass.name} ${sec.name}` : "", classId: sec?.classId ?? null, rollNo: e?.rollNo ?? null };
  });
}
