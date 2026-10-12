import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { canDecide } from "@/lib/approvals";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { CORRECTION_WORDS, type CorrectionEntry } from "@/lib/attendance/corrections";
import { statusList } from "@/lib/attendance/settings";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatusChip, type StatusView } from "../../../_components/status";
import { DecisionButtons } from "../../../_components/decision";
import { CORRECTION_STATUS } from "../../../_components/words";
import { approveCorrectionAction, rejectCorrectionAction, withdrawCorrectionAction } from "../../actions";

export const metadata: Metadata = { title: "Attendance correction" };

type Version = { id: string; name: string; status: string };

export default async function CorrectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, access, tz } = await attendancePage();

  const data = await withSchool(current.ctx, async (tx) => {
    const c = await tx.attendanceCorrection.findFirst({ where: { id, archivedAt: null } });
    if (!c) return null;
    const sections = await registerChoices(tx, access);
    const mine = c.requestedById === current.user.id;
    const allowed = mine || (c.forWhom === "staff" ? access.staff === "all" : access.students === "all" || sections.some((s) => s.id === c.sectionId));
    const approval = c.approvalId ? await tx.approval.findUnique({ where: { id: c.approvalId } }) : null;
    const decider = approval ? await canDecide(tx, current.ctx, approval) : false;
    if (!allowed && !decider) return null;
    const section = c.sectionId ? await tx.section.findUnique({ where: { id: c.sectionId }, include: { schoolClass: { select: { name: true } } } }) : null;
    const users = await tx.userLogin.findMany({ where: { id: { in: [c.requestedById, c.decidedById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const entries = c.entries as CorrectionEntry[];
    const marks = await tx.attendanceMark.findMany({
      where: { date: c.date, periodNo: c.periodNo, archivedAt: null, ...(c.forWhom === "staff" ? { staffId: { in: entries.map((e) => e.id) } } : { studentId: { in: entries.map((e) => e.id) } }) },
      select: { studentId: true, staffId: true, statusKey: true },
    });
    const nowMap = new Map(marks.map((m) => [(m.studentId ?? m.staffId)!, m.statusKey]));
    return {
      c, approval, decider, mine, entries, nowMap,
      sectionName: section ? `${section.schoolClass.name} ${section.name}` : null,
      names: new Map(users.map((u) => [u.id, u.displayName])),
      statuses: await statusList(tx, current.ctx, { includeArchived: true }),
    };
  });
  if (!data) notFound();
  const { c } = data;
  const views: StatusView[] = data.statuses.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone }));
  const st = (k: string | null) => (k ? views.find((v) => v.key === k) : undefined);
  const versions = c.versions as { saved?: Version[]; second?: Version[]; takenAt?: string | null } | null;
  const title = `${c.forWhom === "staff" ? "Staff attendance" : data.sectionName ?? "Class"}, ${formatDate(c.date, "UTC")}${c.periodNo ? `, period ${c.periodNo}` : ""}`;
  const waiting = c.status === "WAITING";
  const hidden = { correctionId: c.id };

  return (
    <>
      <PageHeader title="Attendance correction" href={`${BASE}/register/corrections/${c.id}`} userId={current.user.id}>
        <Link href={`${BASE}/register/corrections`} className="font-medium text-brand-text hover:underline">All corrections</Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title={title} description={CORRECTION_WORDS[c.kind] ?? c.kind}
              action={<Badge tone={CORRECTION_STATUS[c.status]?.tone ?? "neutral"}>{CORRECTION_STATUS[c.status]?.label ?? c.status}</Badge>} />
            <CardBody className="space-y-4">
              <p className="rounded-lg bg-surface-2 px-3 py-2"><span className="font-medium">Reason: </span>{c.reason}</p>
              {waiting && (
                <DecisionButtons hidden={hidden} canDecide={data.decider} canWithdraw={data.mine} what="correction"
                  approve={approveCorrectionAction} reject={rejectCorrectionAction} withdraw={withdrawCorrectionAction} />
              )}
              {waiting && !data.decider && !data.mine && <Alert tone="info">This correction is waiting for the approver in Approvals.</Alert>}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[15px]">
                  <caption className="sr-only">Changes asked for</caption>
                  <thead className="border-b border-line text-sm text-ink-2">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">{c.forWhom === "staff" ? "Staff member" : "Student"}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{waiting ? "Saved now" : "Was"}</th>
                      <th scope="col" className="py-2 pr-3 font-medium">{waiting ? "Asked for" : "Changed to"}</th>
                      <th scope="col" className="py-2 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-3 font-medium">{e.name}</td>
                        <td className="py-2 pr-3"><StatusChip status={st(waiting ? data.nowMap.get(e.id) ?? null : e.from)} size="sm" /></td>
                        <td className="py-2 pr-3"><StatusChip status={st(e.to)} size="sm" /></td>
                        <td className="py-2 text-sm text-ink-2">{e.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {versions?.saved && versions.second && (
            <Card>
              <CardHeader title="Both versions" description={`Two people marked this class offline. The first to reach the school was saved. ${versions.takenAt ? `The second was taken at ${formatDateTime(new Date(versions.takenAt), tz)}.` : ""}`} />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[15px]">
                    <caption className="sr-only">The saved version and the second version side by side</caption>
                    <thead className="border-b border-line text-sm text-ink-2">
                      <tr><th scope="col" className="py-2 pr-3 font-medium">Student</th><th scope="col" className="py-2 pr-3 font-medium">Saved first</th><th scope="col" className="py-2 font-medium">Second version</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {versions.second.map((v) => {
                        const first = versions.saved!.find((x) => x.id === v.id);
                        const differs = first?.status !== v.status;
                        return (
                          <tr key={v.id} className={differs ? "bg-warn-bg/60" : ""}>
                            <td className="py-2 pr-3">{v.name}{differs && <span className="sr-only"> (different)</span>}</td>
                            <td className="py-2 pr-3"><StatusChip status={st(first?.status ?? null)} size="sm" /></td>
                            <td className="py-2"><StatusChip status={st(v.status)} size="sm" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-3">
            <Detail label="Asked by">{data.names.get(c.requestedById ?? "") ?? "The phone's offline queue"}</Detail>
            <Detail label="Asked on">{formatDateTime(c.createdAt, tz)}</Detail>
            {c.decidedAt && <Detail label={c.status === "WITHDRAWN" ? "Withdrawn on" : "Decided"}>{formatDateTime(c.decidedAt, tz)}{c.decidedById ? ` by ${data.names.get(c.decidedById) ?? "the approver"}` : ""}</Detail>}
            {c.decisionNote && <Detail label="Decision note">{c.decisionNote}</Detail>}
            {c.status === "APPROVED" && <p className="text-sm text-ink-2">The marks as they were before are kept in the audit log.</p>}
            {data.approval && <Link href={`/approvals/${data.approval.id}`} className="inline-block font-medium text-brand-text hover:underline">Open in Approvals</Link>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
