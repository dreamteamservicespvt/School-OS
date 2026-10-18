import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Chips, Empty, Split, Col } from "@/components/ui/blocks";
import { GraduationCap, Plus, School, Users } from "lucide-react";
import { ActionForm, FormArea, FormSelect, FormText } from "@/components/students/action-form";
import { ActionSelect } from "@/components/students/confirm-action";
import { StudentPicker } from "@/components/students/student-picker";
import { visibleStudentIds } from "@/lib/students/access";
import { APPLICATION_STATUSES, CAREER_KINDS } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { StudentsHead } from "../../_lib/head";
import { behaviourTabs } from "../sub-tabs";
import { careerAction, careerStatusAction } from "../../_actions/behaviour";

export const metadata: Metadata = { title: "Career guidance" };

/** Career guidance (optional, secondary schools): notes, entrance exams, college applications, scholarships, interests, alumni mentors. */
export default async function CareerPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { current, settings, yearIds, can, tz } = await studentPage();
  if (!settings.careerOn || !can.seeBehaviour) redirect(`${BASE}/behaviour`);
  const { kind } = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const ids = await visibleStudentIds(tx, current, yearIds);
    const records = await tx.careerRecord.findMany({
      where: { archivedAt: null, ...(ids ? { studentId: { in: ids } } : {}), ...(kind && CAREER_KINDS.some((k) => k.key === kind) ? { kind } : {}) },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }], take: 200,
    });
    const students = await tx.student.findMany({ where: { id: { in: records.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    const mentorships = await tx.alumniMentorship.findMany({ where: { archivedAt: null, ...(ids ? { studentId: { in: ids } } : {}) }, include: { alumni: true }, take: 50 });
    const mentorStudents = await tx.student.findMany({ where: { id: { in: [...mentorships.map((m) => m.studentId), ...mentorships.map((m) => m.alumni.studentId)] } }, select: { id: true, fullName: true } });
    const sections = await sectionOptions(tx, current, yearIds, { own: can.reach === "own" });
    return { records, students, mentorships, mentorStudents, sections };
  });
  const name = (id: string) => data.students.find((s) => s.id === id)?.fullName ?? data.mentorStudents.find((s) => s.id === id)?.fullName ?? "";
  const kindLabel = (k: string) => CAREER_KINDS.find((x) => x.key === k)?.label ?? k;

  return (
    <>
      <StudentsHead page="Behaviour & Counselling" href={`${BASE}/behaviour/career`} sub="Career notes, entrance exams, college applications, scholarships and alumni mentors."
        subTabs={await behaviourTabs()} subLabel="Behaviour & Counselling" />
      <Split side={380}>
        <Col>
          <Chips label="Kind" value={kind ?? "all"} options={[{ value: "all", label: "All", href: `${BASE}/behaviour/career` }, ...CAREER_KINDS.map((k) => ({ value: k.key, label: k.label, href: `${BASE}/behaviour/career?kind=${k.key}` }))]} />
          {data.records.length === 0 ? <Card><Empty icon={GraduationCap} title="No career records yet" body="Career notes, entrance exams, college applications, scholarships and interests show here." /></Card> : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line/70">
                {data.records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 md:px-5 py-3.5">
                    <Avatar name={name(r.studentId)} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] leading-tight flex items-center gap-1.5 flex-wrap">{r.kind === "college-application" && <School size={15} className="text-ink3" aria-hidden="true" />}{r.title}</p>
                      <p className="text-[12.5px] text-ink3 mt-0.5"><Link className="font-semibold text-ink2 hover:underline" href={`${BASE}/students/${r.studentId}`}>{name(r.studentId)}</Link> · {kindLabel(r.kind)}{r.college ? ` · ${r.college}` : ""}{r.course ? `, ${r.course}` : ""}{r.deadline ? ` · deadline ${formatDate(r.deadline, tz)}` : ""}</p>
                      {r.details && <p className="mt-1 text-[13.5px] text-ink2">{r.details}</p>}
                    </div>
                    {r.kind === "college-application" && (can.contribute
                      ? <ActionSelect action={careerStatusAction} fields={{ id: r.id }} name="status" label={`Status of ${r.title}`} value={r.status ?? "Planned"} options={APPLICATION_STATUSES} />
                      : <Badge tone={r.status === "Offer received" ? "ok" : r.status === "Applied" ? "info" : "neutral"}>{r.status ?? "Planned"}</Badge>)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {data.mentorships.length > 0 && (
            <Card>
              <CardHeader title="Alumni mentors" icon={Users} />
              <ul className="px-5 pb-4 flex flex-col gap-2 text-[14px]">{data.mentorships.map((m) => <li key={m.id}>{name(m.studentId)} is mentored by <b className="font-semibold">{name(m.alumni.studentId)}</b>{m.note ? <span className="text-ink3"> · {m.note}</span> : null}</li>)}</ul>
            </Card>
          )}
        </Col>
        {can.contribute && (
          <Card className="self-start">
            <CardHeader title="Add a record" icon={Plus} />
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
      </Split>
    </>
  );
}
