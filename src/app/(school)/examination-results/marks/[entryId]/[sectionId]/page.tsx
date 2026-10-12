import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadPaper } from "@/lib/exams/marks";
import { PAPER_STATUS_TONE, PAPER_STATUS_WORDS, timeRange } from "@/lib/exams/common";
import { teachesPaper } from "@/lib/exams/scope";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { examPage, withYear, type SearchParams } from "../../../_lib/page";
import { PageTop } from "../../../_components/page-top";
import { MarksGrid, type GridStudent } from "../../marks-grid";
import { LockPaperButton, ReopenButton } from "../../marks-ui";

export const metadata: Metadata = { title: "Marks Entry" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PaperPage({ params, searchParams }: { params: Promise<{ entryId: string; sectionId: string }>; searchParams: SearchParams }) {
  const { entryId, sectionId } = await params;
  if (!UUID.test(entryId) || !UUID.test(sectionId)) notFound();
  const page = await examPage(await searchParams);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const p = await loadPaper(tx, page.current.ctx, entryId, sectionId);
    if (!p) return null;
    const people = await tx.userLogin.findMany({ where: { id: { in: [p.paper.submittedById, p.paper.lockedById, ...p.marks.flatMap((m) => ((m.history as { by?: string; approvedBy?: string }[]) ?? []).flatMap((h) => [h.by, h.approvedBy]))].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { p, people };
  });
  if (!data) notFound();
  const { p, people } = data;
  const teaches = teachesPaper(page.scope, sectionId, p.subject.id);
  if (!teaches && !page.scope.manage) notFound();
  const tz = page.current.school.timeZone;
  const open = p.paper.status === "NOT_STARTED" || p.paper.status === "IN_PROGRESS";
  const name = (id: string | null | undefined) => people.find((x) => x.id === id)?.displayName ?? "";
  const students: GridStudent[] = p.students.map((s) => {
    const m = p.marks.find((x) => x.studentId === s.studentId);
    const history = ((m?.history as { at: string; by?: string; approvedBy?: string; before: { total?: number | null; absent?: boolean; grade?: string | null }; after: { total?: number | null; absent?: boolean; grade?: string | null }; reason: string }[]) ?? []);
    return {
      id: s.studentId, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo,
      parts: (m?.parts ?? {}) as Record<string, number>, absent: m?.absent ?? false, grade: m?.grade ?? null, remark: m?.remark ?? null,
      waiting: p.waiting.some((w) => w.studentId === s.studentId),
      history: history.map((h) => ({ at: formatDateTime(new Date(h.at), tz), by: name(h.by), approvedBy: name(h.approvedBy), reason: h.reason, before: h.before.absent ? "Absent" : p.subject.gradeOnly ? h.before.grade ?? "" : String(h.before.total ?? ""), after: h.after.absent ? "Absent" : p.subject.gradeOnly ? h.after.grade ?? "" : String(h.after.total ?? "") })),
    };
  });
  const title = `${p.subject.name}, ${p.section.label}`;

  return (
    <>
      <PageTop page={page} title={title} href={`/examination-results/marks/${entryId}/${sectionId}`} showYear={false} back={{ href: "/examination-results/marks", label: "Marks Entry" }}>
        <Link href={withYear("/examination-results/marks", page)} className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">All papers</Link>
        {page.scope.manage && page.writable && p.paper.status === "SUBMITTED" && <ReopenButton entryId={entryId} sectionId={sectionId} label={title} />}
        {page.scope.manage && page.writable && p.paper.status === "SUBMITTED" && <LockPaperButton entryId={entryId} sectionId={sectionId} label={title} />}
      </PageTop>
      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-2">
        <Badge tone={PAPER_STATUS_TONE[p.paper.status]}>{PAPER_STATUS_WORDS[p.paper.status]}</Badge>
        <span>{p.exam.title}</span>
        <span>{formatDate(p.entry.date, tz)}, {timeRange(p.entry.startTime, p.entry.durationMin)}</span>
        <span>{p.subject.gradeOnly ? "Graded" : `Out of ${p.entry.maxMarks}${p.categories.length > 1 ? ` (${p.categories.map((c) => `${c.name} ${c.max}`).join(", ")})` : ""}`}</span>
        {p.entry.marksDueDate && open && <span>Marks due {formatDate(p.entry.marksDueDate, tz)}</span>}
      </div>
      {p.exam.status === "DRAFT" && <Alert tone="warning" className="mb-4">Marks can be entered once the datesheet is published.</Alert>}
      {!page.writable && <Alert tone="warning" className="mb-4">This year is closed. Marks can be seen but not changed.</Alert>}
      {p.paper.status === "SUBMITTED" && <Alert className="mb-4" title="Submitted">{p.paper.submittedAt ? `Submitted by ${name(p.paper.submittedById) || "the teacher"} on ${formatDateTime(p.paper.submittedAt, tz)}. ` : ""}Marks are submitted. To change a mark, use Request a change on that student.</Alert>}
      {p.paper.status === "LOCKED" && <Alert className="mb-4" title="Locked">{p.paper.lockedAt ? `Locked on ${formatDateTime(p.paper.lockedAt, tz)}. ` : ""}A change needs a reason and an approval; the old mark stays in the history.</Alert>}
      {!teaches && page.scope.manage && open && <Alert className="mb-4">You are entering marks for this paper as the Exam In-charge or Principal. Each change is logged with your name.</Alert>}
      <MarksGrid
        entryId={entryId} sectionId={sectionId} paperLabel={title}
        students={students} categories={p.categories} gradeOnly={p.subject.gradeOnly} gradeList={p.gradeList} bands={p.bands}
        status={p.paper.status}
        canEdit={open && page.writable && p.exam.status !== "DRAFT" && (teaches || page.scope.manage)}
        canRequest={!open && page.writable && teaches}
      />
    </>
  );
}
