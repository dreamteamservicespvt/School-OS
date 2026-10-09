import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormArea, FormSelect, FormText } from "@/components/students/action-form";
import { ActionSelect } from "@/components/students/confirm-action";
import { StudentPicker } from "@/components/students/student-picker";
import { studentScope } from "@/lib/students/access";
import { APPLICATION_STATUSES, CAREER_KINDS } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { careerAction, careerStatusAction } from "../../_actions/behaviour";

export const metadata: Metadata = { title: "Career guidance" };

/** Career guidance (optional, secondary schools): notes, entrance exams, college applications, scholarships, interests, alumni mentors. */
export default async function CareerPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!settings.careerOn || !can.seeBehaviour) redirect(`${BASE}/behaviour`);
  const { kind } = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, year?.id);
    const ids = can.reach === "all" ? null : (await tx.student.findMany({ where: scope, select: { id: true } })).map((s) => s.id);
    const records = await tx.careerRecord.findMany({
      where: { archivedAt: null, ...(ids ? { studentId: { in: ids } } : {}), ...(kind && CAREER_KINDS.some((k) => k.key === kind) ? { kind } : {}) },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }], take: 200,
    });
    const students = await tx.student.findMany({ where: { id: { in: records.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    const mentorships = await tx.alumniMentorship.findMany({ where: { archivedAt: null, ...(ids ? { studentId: { in: ids } } : {}) }, include: { alumni: true }, take: 50 });
    const mentorStudents = await tx.student.findMany({ where: { id: { in: [...mentorships.map((m) => m.studentId), ...mentorships.map((m) => m.alumni.studentId)] } }, select: { id: true, fullName: true } });
    const sections = await sectionOptions(tx, current, year?.id, { own: can.reach === "own" });
    return { records, students, mentorships, mentorStudents, sections };
  });
  const name = (id: string) => data.students.find((s) => s.id === id)?.fullName ?? data.mentorStudents.find((s) => s.id === id)?.fullName ?? "";
  const kindLabel = (k: string) => CAREER_KINDS.find((x) => x.key === k)?.label ?? k;

  return (
    <>
      <PageHeader title="Career guidance" href={`${BASE}/behaviour/career`} userId={current.user.id} />
      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <nav aria-label="Kind" className="flex flex-wrap gap-2">
            <Link href={`${BASE}/behaviour/career`} className={`min-h-11 rounded-full px-4 py-2.5 text-[15px] ${!kind ? "bg-brand-soft font-semibold text-brand-text" : "bg-surface-2"}`}>All</Link>
            {CAREER_KINDS.map((k) => <Link key={k.key} href={`?kind=${k.key}`} className={`min-h-11 rounded-full px-4 py-2.5 text-[15px] ${kind === k.key ? "bg-brand-soft font-semibold text-brand-text" : "bg-surface-2"}`}>{k.label}</Link>)}
          </nav>
          {data.records.length === 0 ? <EmptyState title="No career records yet">Career notes, entrance exams, college applications, scholarships and interests show here.</EmptyState> : (
            <ul className="space-y-2">
              {data.records.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-sm text-ink-2"><Link className="hover:underline" href={`${BASE}/students/${r.studentId}`}>{name(r.studentId)}</Link> · <Badge>{kindLabel(r.kind)}</Badge>{r.college ? ` · ${r.college}` : ""}{r.course ? `, ${r.course}` : ""}{r.deadline ? ` · deadline ${formatDate(r.deadline, tz)}` : ""}</p>
                      {r.details && <p className="mt-1 text-[15px]">{r.details}</p>}
                    </div>
                    {r.kind === "college-application" && (can.contribute
                      ? <ActionSelect action={careerStatusAction} fields={{ id: r.id }} name="status" label={`Status of ${r.title}`} value={r.status ?? "Planned"} options={APPLICATION_STATUSES} />
                      : <Badge>{r.status ?? "Planned"}</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.mentorships.length > 0 && (
            <Card>
              <CardHeader title="Alumni mentors" />
              <CardBody><ul className="space-y-1">{data.mentorships.map((m) => <li key={m.id}>{name(m.studentId)} is mentored by <strong>{name(m.alumni.studentId)}</strong>{m.note ? ` · ${m.note}` : ""}</li>)}</ul></CardBody>
            </Card>
          )}
        </div>
        {can.contribute && (
          <Card className="self-start">
            <CardHeader title="Add a record" />
            <CardBody>
              <ActionForm action={careerAction} submitLabel="Add" pendingText="Adding…" resetOnSuccess>
                <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} />
                <FormSelect name="kind" label="Kind" required options={CAREER_KINDS.map((k) => ({ value: k.key, label: k.label }))} defaultValue={kind ?? "note"} />
                <FormText name="title" label="Title" required help="For example: JEE Main 2027, or B.Sc. Nursing at Osmania University." />
                <FormArea name="details" label="Details" rows={2} />
                <FormText name="college" label="College" help="For applications and scholarships." />
                <FormText name="course" label="Course" />
                <FormSelect name="status" label="Application status" options={APPLICATION_STATUSES.map((s) => ({ value: s, label: s }))} defaultValue="Planned" help="For college applications." />
                <FormText name="deadline" label="Deadline" type="date" />
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
