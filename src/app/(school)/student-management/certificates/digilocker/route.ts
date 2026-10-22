import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { logExport } from "@/lib/exports";
import { PermissionDeniedError, reachFor } from "@/lib/permissions";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { getStudentSettings } from "@/lib/students/settings";
import { abilities, visibleStudentIds } from "@/lib/students/access";
import { CERTIFICATE_LABEL } from "@/lib/students/labels";
import { digiLockerCsv } from "@/lib/students/digilocker";
import { sectionNames } from "../../_lib/queries";
import { currentEnrolments } from "@/lib/academic/years";

export const dynamic = "force-dynamic";

/** DigiLocker-ready file (03 §2): issued certificates, with the date filter on screen. Switched on in Student Settings. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("student-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export certificates.", { status: 403 });
    throw e;
  }
  if (reachFor(current.permissions, "student-management", "export") !== "all") return new Response("You do not have permission to export certificates.", { status: 403 });
  const tz = current.school.timeZone;
  const url = new URL(req.url);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { timeZone: tz });

  const out = await withSchool(current.ctx, async (tx) => {
    const settings = await getStudentSettings(tx, current.ctx);
    const can = abilities(current, settings);
    if (!settings.digiLockerOn) return { error: "The DigiLocker file is switched off in Student Settings.", status: 404 } as const;
    if (!can.manage) return { error: "You do not have permission to export certificates.", status: 403 } as const;
    const mine = await visibleStudentIds(tx, current);
    const certs = await tx.certificate.findMany({
      where: { status: "ISSUED", number: { not: null }, ...(range ? { issueDate: dateWhere(range) } : {}), ...(mine ? { studentId: { in: mine } } : {}) },
      orderBy: [{ issueDate: "asc" }, { number: "asc" }], take: 20000,
    });
    const students = await tx.student.findMany({
      where: { id: { in: certs.map((c) => c.studentId) } },
      select: { id: true, fullName: true, admissionNo: true, dateOfBirth: true, gender: true, apaarId: true },
    });
    // Each student's class this year, in their own campus's current year.
    const thisYear = await currentEnrolments(tx, students.map((s) => s.id));
    const names = await sectionNames(tx, [...thisYear.values()].map((e) => e.sectionId));
    const byId = new Map(students.map((s) => [s.id, s]));
    const csv = digiLockerCsv(certs.map((c) => {
      const s = byId.get(c.studentId);
      const e = thisYear.get(c.studentId);
      const sec = e ? names.get(e.sectionId) : null;
      return {
        number: c.number, type: CERTIFICATE_LABEL[c.type], issueDate: c.issueDate, studentName: s?.fullName ?? "", admissionNo: s?.admissionNo ?? "",
        dateOfBirth: s?.dateOfBirth ?? null, gender: s?.gender ?? null, apaarId: can.seeRestricted ? s?.apaarId ?? null : null, className: sec?.label ?? "", purpose: c.purpose,
      };
    }), tz);
    await logExport(tx, current.ctx, { title: "DigiLocker file of certificates", format: "csv", filters: range ? `dates: ${range.label}` : "", rows: certs.length });
    return { csv };
  });
  if ("error" in out) return new Response(out.error, { status: out.status });
  return new Response(out.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="digilocker-certificates.csv"`, "Cache-Control": "no-store" } });
}
