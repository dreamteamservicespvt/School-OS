import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { isDone, loadPaper } from "@/lib/exams/marks";
import { PAPER_STATUS_TONE, PAPER_STATUS_WORDS, timeRange } from "@/lib/exams/common";
import { teachesPaper } from "@/lib/exams/scope";
import { pageMode } from "@/lib/duty";
import { Banner } from "@/components/ui/kit";
import { Lock, Send } from "lucide-react";
import { examPage, type SearchParams } from "../../../_lib/page";
import { BackLink } from "../../../_components/page-top";
import { MarksGrid, type GridStudent } from "../../marks-grid";
import { LockPaperButton, ReopenButton } from "../../marks-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Marks Entry") };
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PaperPage({ params, searchParams }: { params: Promise<{ entryId: string; sectionId: string }>; searchParams: SearchParams }) {
  const { entryId, sectionId } = await params;
  if (!UUID.test(entryId) || !UUID.test(sectionId)) notFound();
  const page = await examPage(await searchParams);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const p = await loadPaper(tx, page.current.ctx, entryId, sectionId, page.scope);
    if (!p) return null;
    const people = await tx.userLogin.findMany({ where: { id: { in: [p.paper.submittedById, p.paper.lockedById, ...p.marks.flatMap((m) => ((m.history as { by?: string; approvedBy?: string }[]) ?? []).flatMap((h) => [h.by, h.approvedBy]))].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const allocs = await tx.teacherAllocation.findMany({ where: { sectionId, subjectId: p.subject.id, archivedAt: null }, select: { staffId: true } });
    const teachers = await tx.staff.findMany({ where: { id: { in: allocs.map((a) => a.staffId) } }, select: { fullName: true } });
    return { p, people, teachers: teachers.map((t) => t.fullName), teacherIds: allocs.map((a) => a.staffId) };
  });
  if (!data) notFound();
  const { p, people, teachers, teacherIds } = data;
  const teaches = teachesPaper(page.scope, sectionId, p.subject.id);
  if (!teaches && !page.scope.manage) notFound();
  const tz = page.current.school.timeZone;
  const open = p.paper.status === "NOT_STARTED" || p.paper.status === "IN_PROGRESS";
  const name = (id: string | null | undefined) => people.find((x) => x.id === id)?.displayName ?? "";
  const students: GridStudent[] = p.students.map((s) => {
    const m = p.marks.find((x) => x.studentId === s.studentId);
    type Value = { total?: number | null; absent?: boolean; medical?: boolean; grade?: string | null } | null;
    const history = ((m?.history as { at: string; by?: string; approvedBy?: string; before: Value; after: Value; reason: string }[]) ?? []);
    // Late marks have no "before": the student had no marks.
    const words = (v: Value) => (!v ? "" : v.medical ? "ML" : v.absent ? "AB" : p.subject.gradeOnly ? v.grade ?? "" : String(v.total ?? ""));
    return {
      id: s.studentId, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo,
      parts: (m?.parts ?? {}) as Record<string, number>, absent: m?.absent ?? false, medical: m?.medical ?? false, grade: m?.grade ?? null, remark: m?.remark ?? null,
      waiting: p.waiting.some((w) => w.studentId === s.studentId),
      late: !open && !isDone(m, p.subject.gradeOnly),
      history: history.map((h) => ({ at: formatDateTime(new Date(h.at), tz), by: name(h.by), approvedBy: name(h.approvedBy), reason: h.reason, before: words(h.before), after: words(h.after) })),
    };
  });
  const label = `${p.subject.name}, ${p.section.label}`;
  const due = p.entry.marksDueDate;
  const overdue = Boolean(due && open && due < page.today);
  // The Principal, School Admin, Vice Principal, Academic Head and Exam In-charge check marks; the subject teacher
  // enters them (src/lib/duty.ts, owner's changes of 13 Oct 2026). 05-roles still lets them, so this is the screen only.
  const checksOnly = !teaches && pageMode(page.current, "examination-results", "marks") === "view";
  const canEdit = open && page.writable && p.exam.status !== "DRAFT" && (teaches || page.scope.manage) && !checksOnly;

  const notes = (
    <>
      {p.exam.status === "DRAFT" && <Banner tone="warn" title="Marks open once the datesheet is published."><Words k="Publish the datesheet of" /> {p.exam.title} <Words k="first." /></Banner>}
      {!page.writable && <Banner tone="warn" title="This year is closed."><Words k="Marks can be seen but not changed." /></Banner>}
      {page.writable && open && checksOnly && <Banner tone="info" title={`${teachers.join(", ") || "The subject teacher"} enters these marks.`}><Words k="You can see them here. To hurry them up, use Remind on Marks Entry." /></Banner>}
      {overdue && canEdit && <Banner tone="bad" title={`Marks were due on ${formatDate(due!, tz)}.`}><Words k="Enter the rest and submit as soon as you can." /></Banner>}
      {p.paper.status === "SUBMITTED" && <Banner tone="brand" icon={Send} title={p.paper.submittedAt ? `Submitted ${formatDateTime(p.paper.submittedAt, tz)}${name(p.paper.submittedById) ? ` by ${name(p.paper.submittedById)}` : ""}.` : "Submitted."}><Words k="A change needs a reason and an approval, and the old mark stays in the history." />{page.scope.manage ? " Lock the marks once you have checked them." : ""}</Banner>}
      {p.paper.status === "LOCKED" && <Banner tone="ok" icon={Lock} title={p.paper.lockedAt ? `Locked ${formatDateTime(p.paper.lockedAt, tz)}.` : "Locked."}><Words k="A change needs a reason and an approval, and the old mark stays in the history." /></Banner>}
    </>
  );

  return (
    <>
      <BackLink page={page} href="/examination-results/marks" label="Marks Entry" sub={`${p.exam.title} · ${p.subject.name} · ${p.section.label}`} />
      <MarksGrid
        entryId={entryId} sectionId={sectionId} paperLabel={label}
        students={students} categories={p.categories} gradeOnly={p.subject.gradeOnly} gradeList={p.gradeList} bands={p.bands}
        status={p.paper.status}
        canEdit={canEdit}
        canRequest={!open && page.writable && teaches}
        lateMarks={p.lateMarks}
        head={{
          title: `${p.subject.name} · ${p.section.label}`, sectionShort: p.section.label.replace(/^Class /, ""), examTitle: p.exam.title,
          paperOn: `${formatDate(p.entry.date, tz)}, ${timeRange(p.entry.startTime, p.entry.durationMin)}`,
          teachers: teachers.join(", ") || "No teacher given", dueText: due && open ? `marks due ${formatDate(due, tz)}` : null,
          statusWords: PAPER_STATUS_WORDS[p.paper.status], statusTone: PAPER_STATUS_TONE[p.paper.status],
          onBehalf: page.scope.manage && !(page.scope.staffId && teacherIds.includes(page.scope.staffId)), approver: "the Principal (or the approver your school set for marks changes)",
        }}
        notes={notes}
        actions={page.scope.manage && page.writable && p.paper.status === "SUBMITTED" ? <><ReopenButton entryId={entryId} sectionId={sectionId} label={label} /><LockPaperButton entryId={entryId} sectionId={sectionId} label={label} /></> : null}
      />
    </>
  );
}
