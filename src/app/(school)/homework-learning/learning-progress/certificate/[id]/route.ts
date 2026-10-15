// A course certificate as a PDF, in the school's "Course certificate" design
// (Settings, Document Designs). Staff who may read the course, or the student
// it was issued to.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { renderDocument } from "@/lib/documents";
import { formatDate } from "@/lib/format";
import { logExport } from "@/lib/exports";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope, mayRead, shortSection } from "@/lib/homework/scope";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current } = await requireAction("homework-learning", "print");
  if (!UUID.test(id)) return text("This certificate was not found.", 404);
  return withSchool(current.ctx, async (tx) => {
    const s = await homeworkScope(tx, current, todayIn(current.school.timeZone));
    const cert = await tx.courseCertificate.findFirst({ where: { id }, include: { course: true } });
    const allowed = cert && (s.level === "student" ? s.student?.id === cert.studentId : mayRead(s, cert.course));
    if (!cert || !allowed) return text("This certificate was not found.", 404);
    const [student, section, subject, teacher, enrolment, lessons] = await Promise.all([
      tx.student.findUnique({ where: { id: cert.studentId }, select: { fullName: true, admissionNo: true } }),
      tx.section.findUnique({ where: { id: cert.course.sectionId }, include: { schoolClass: { select: { name: true } } } }),
      tx.subject.findUnique({ where: { id: cert.course.subjectId }, select: { name: true } }),
      cert.course.teacherId ? tx.staff.findUnique({ where: { id: cert.course.teacherId }, select: { fullName: true } }) : null,
      tx.enrolment.findFirst({ where: { studentId: cert.studentId, sectionId: cert.course.sectionId, archivedAt: null }, select: { rollNo: true } }),
      tx.lesson.count({ where: { courseId: cert.courseId, archivedAt: null, visible: true } }),
    ]);
    const label = section ? shortSection(section.schoolClass.name, section.name) : "";
    const doc = await renderDocument(tx, current.ctx, "course-certificate", {
      fields: {
        certificate_no: cert.number, student_name: student?.fullName ?? "", admission_no: student?.admissionNo ?? "", class_section: label ? `Class ${label}` : "",
        roll_no: enrolment?.rollNo ? String(enrolment.rollNo) : "", course_name: `${subject?.name ?? ""}, Class ${label}`, lessons: String(lessons),
        teacher_name: teacher?.fullName ?? "", completed_on: formatDate(cert.issuedAt, current.school.timeZone),
      },
    });
    await logExport(tx, current.ctx, { title: `Course certificate ${cert.number}`, format: "pdf", filters: student?.admissionNo ?? "", rows: 1 });
    const pdf = await doc.pdf();
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="certificate-${cert.number.replace(/\//g, "-")}.pdf"`, "Cache-Control": "no-store" } });
  }, { timeout: 60_000 });
}
