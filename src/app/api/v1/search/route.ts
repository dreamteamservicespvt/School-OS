import { getCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { studentScope } from "@/lib/students/access";
import { staffScope, viewerFor } from "@/lib/staff/access";
import { currentYear } from "@/lib/academic/years";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The one Search box's people results (00-global.md §1.1): students by name,
 * admission number or parent phone, and staff by name, code or phone. Only
 * records this person may open are returned.
 */
export async function GET(req: Request) {
  const current = await getCurrent();
  if (!current) return Response.json({ problem: "Sign in first." }, { status: 401 });
  if (await hitLimit(`search:${current.user.id}`, 120, 60)) return Response.json({ problem: "Too many searches. Wait a moment." }, { status: 429 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ students: [], staff: [] });
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

    return {
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
