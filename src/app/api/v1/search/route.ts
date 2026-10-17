import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { abilities, studentScope } from "@/lib/students/access";
import { feeViewer, studentScope as feeStudentScope } from "@/lib/fees/access";
import { formatDate, formatRupees } from "@/lib/format";
import { staffScope, viewerFor } from "@/lib/staff/access";
import { currentYear } from "@/lib/academic/years";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The one Search box's record results (00-global.md §1.1): students by name,
 * admission number or parent phone, parents by name or phone, staff by name,
 * code or phone, and fee receipts by number (including an old software's
 * receipt number). Only records this person may open are returned.
 */
export async function GET(req: Request) {
  const current = await getCurrent();
  if (!current) return Response.json({ problem: "Sign in first." }, { status: 401 });
  if (!(await hitLimit(`search:${current.user.id}`, 120, 60)).ok) return Response.json({ problem: "Too many searches. Wait a moment." }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ students: [], staff: [], parents: [], receipts: [] });
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? digits : null;

  const result = await withSchool(current.ctx, async (tx) => {
    const canStudents = current.permissions["student-management"].see !== "none";
    const canStaff = current.permissions["staff-hr-management"].see !== "none";
    const year = await currentYear(tx, current.ctx);

    const students = canStudents
      ? await tx.student.findMany({
          where: {
            AND: [
              await studentScope(tx, current, year?.id),
              { archivedAt: null },
              {
                OR: [
                  { fullName: { contains: q, mode: "insensitive" } },
                  { admissionNo: { contains: q, mode: "insensitive" } },
                  ...(phone ? [{ guardians: { some: { archivedAt: null, guardian: { phone: { contains: phone } } } } }] : []),
                ],
              },
            ],
          },
          select: { id: true, fullName: true, admissionNo: true, status: true, enrolments: { where: { academicYearId: year?.id ?? "", archivedAt: null }, select: { sectionId: true, rollNo: true }, take: 1 } },
          orderBy: { fullName: "asc" },
          take: 6,
        })
      : [];
    const sectionIds = students.flatMap((s) => s.enrolments.map((e) => e.sectionId));
    const sections = sectionIds.length ? await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } }) : [];
    const label = new Map(sections.map((s) => [s.id, `${s.schoolClass.name} ${s.name}`]));

    const viewer = canStaff ? await viewerFor(tx, current.ctx, current) : null;
    const staff = viewer
      ? await tx.staff.findMany({
          where: {
            AND: [
              staffScope(viewer),
              { archivedAt: null },
              { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { contains: q, mode: "insensitive" } }, ...(phone ? [{ phone: { contains: phone } }] : [])] },
            ],
          },
          select: { id: true, fullName: true, staffCode: true, designation: true },
          orderBy: { fullName: "asc" },
          take: 4,
        })
      : [];

    // Parents: only those of students this person may see, and only for people who see parents.
    const seeParents = canStudents && abilities(current).seeParents;
    const parents = seeParents
      ? await tx.guardian.findMany({
          where: {
            archivedAt: null,
            OR: [{ name: { contains: q, mode: "insensitive" } }, ...(phone ? [{ phone: { contains: phone } }] : [])],
            students: { some: { archivedAt: null, student: { AND: [await studentScope(tx, current, year?.id), { archivedAt: null }] } } },
          },
          select: { id: true, name: true, relationship: true, phone: true, students: { where: { archivedAt: null, student: { archivedAt: null } }, select: { student: { select: { fullName: true } } }, take: 3 } },
          orderBy: { name: "asc" },
          take: 4,
        })
      : [];

    // Receipts: typed like a receipt number (has a digit), for people who see fees.
    const fees = /\d/.test(q) && current.permissions["fee-management"].see !== "none" ? await feeViewer(tx, current.ctx, current) : null;
    const receipts = fees
      ? await (async () => {
          const byNumber = await tx.receipt.findMany({ where: { number: { contains: q, mode: "insensitive" } }, select: { paymentId: true, number: true }, take: 8 });
          const found = await tx.payment.findMany({
            where: { OR: [{ id: { in: byNumber.map((r) => r.paymentId) } }, { oldReceiptNo: { contains: q, mode: "insensitive" } }] },
            select: { id: true, studentId: true, amountPaise: true, paymentDate: true, status: true, oldReceiptNo: true },
            orderBy: { paymentDate: "desc" },
            take: 12,
          });
          const allowed = new Map((await tx.student.findMany({ where: { AND: [{ id: { in: found.map((p) => p.studentId) } }, feeStudentScope(fees)] }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
          const pays = found.filter((p) => allowed.has(p.studentId)).slice(0, 4);
          const numbers = new Map(byNumber.map((r) => [r.paymentId, r.number]));
          return pays.map((p) => ({
            id: p.id,
            name: numbers.get(p.id) ?? `Old receipt ${p.oldReceiptNo}`,
            sub: [allowed.get(p.studentId), formatRupees(p.amountPaise), formatDate(p.paymentDate), p.status === "CANCELLED" ? "Cancelled" : null].filter(Boolean).join(" · "),
            href: `/fee-management/payments/${p.id}`,
          }));
        })()
      : [];

    return {
      parents: parents.map((g) => ({ id: g.id, name: g.name, sub: [g.relationship, g.phone, g.students.map((s) => s.student.fullName).join(", ")].filter(Boolean).join(" · "), href: `/student-management/guardians/${g.id}` })),
      receipts,
      students: students.map((s) => {
        const e = s.enrolments[0];
        const cls = e ? label.get(e.sectionId) : null;
        return { id: s.id, name: s.fullName, sub: [cls, e?.rollNo ? `Roll ${e.rollNo}` : null, s.admissionNo].filter(Boolean).join(" · "), href: `/student-management/students/${s.id}` };
      }),
      staff: staff.map((s) => ({ id: s.id, name: s.fullName, sub: `${s.designation} · ${s.staffCode}`, href: `/staff-hr-management/${s.id}` })),
    };
  });
  return Response.json(result);
}
