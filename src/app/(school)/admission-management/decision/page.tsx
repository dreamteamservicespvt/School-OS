import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { progressOf } from "@/lib/admission/documents";
import { classRules, stageOn } from "@/lib/admission/settings";
import { seatsFor, fullWords } from "@/lib/admission/seats";
import { bestTestPct, outcomeLabel } from "@/lib/admission/tests";
import { blockers } from "@/lib/admission/convert";
import { names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocProgress, SubNav, linkClass } from "../_components/bits";
import { DecideButtons, OfferButtons, Rerank, WaitingActions } from "./decision-forms";

export const metadata: Metadata = { title: "Admission Decision" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DecisionPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz } = await workPage();
  const raw = await searchParams;
  const tabs = ["ready", "approved", ...(settings.waitingListOn ? ["waiting"] : [])];
  const tab = tabs.includes(one(raw.tab)) ? one(raw.tab) : "ready";
  const classFilter = UUID_RE.test(one(raw.class)) ? one(raw.class) : null;
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
  const canChange = viewer.change === "all";

  const data = await withSchool(current.ctx, async (tx) => {
    const n = await names(tx);
    const base = { archivedAt: null, academicYearId: yearId, ...(classFilter ? { classId: classFilter } : {}) };
    const [readyCount, approvedCount, waitingCount] = await Promise.all([
      tx.application.count({ where: { ...base, stage: "DECISION" } }),
      tx.application.count({ where: { ...base, stage: "APPROVED" } }),
      tx.application.count({ where: { ...base, stage: "WAITING_LIST" } }),
    ]);
    const stage = tab === "ready" ? "DECISION" : tab === "approved" ? "APPROVED" : "WAITING_LIST";
    const apps = await tx.application.findMany({
      where: { ...base, stage },
      orderBy: tab === "waiting" ? [{ classId: "asc" }, { waitingRank: "asc" }] : [{ updatedAt: "asc" }],
      take: 200,
      include: {
        documents: { select: { docType: true, status: true } },
        tests: { where: { archivedAt: null }, include: { test: { select: { maxMarks: true } } } },
        interviews: { where: { cancelledAt: null, outcome: { not: null } }, orderBy: { startsAt: "desc" }, take: 1 },
      },
    });
    const seats = await seatsFor(tx, yearId, [...new Set(apps.map((a) => a.classId))]);
    const rules = await classRules(tx);
    const approvals = await tx.approval.findMany({ where: { id: { in: apps.map((a) => a.approvalId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true } });
    const block = new Map<string, string[]>();
    if (tab === "approved") for (const a of apps) block.set(a.id, await blockers(tx, current.ctx, a));
    const siblings = await tx.student.findMany({ where: { id: { in: apps.map((a) => a.siblingStudentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
    return { n, apps, seats, rules, approvals, block, siblings, readyCount, approvedCount, waitingCount };
  });

  const tabHref = (t: string) => `${BASE}/decision?${new URLSearchParams({ ...(t !== "ready" ? { tab: t } : {}), ...(classFilter ? { class: classFilter } : {}) })}`;
  const sibling = new Map(data.siblings.map((s) => [s.id, s.fullName]));
  const seatText = (classId: string) => {
    const c = data.seats.get(classId);
    if (!c || c.seats === 0) return "No sections set up for this class yet.";
    return c.free > 0 ? `${c.free} of ${c.seats} seats free in ${c.className}.` : fullWords(c);
  };
  const classOptions = [...data.n.classes.entries()];

  return (
    <>
      <PageHeader title="Admission Decision" href={`${BASE}/decision`} userId={current.user.id} />
      <SubNav current={tab} items={[
        { key: "ready", label: "Ready for decision", href: tabHref("ready"), count: data.readyCount },
        { key: "approved", label: "Approved, to admit", href: tabHref("approved"), count: data.approvedCount },
        ...(settings.waitingListOn ? [{ key: "waiting", label: "Waiting list", href: tabHref("waiting"), count: data.waitingCount }] : []),
      ]} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        {tab !== "ready" && <input type="hidden" name="tab" value={tab} />}
        <label className="text-sm"><span className="sr-only">Class</span>
          <select name="class" defaultValue={classFilter ?? ""} className="h-11 rounded-lg border border-line-strong bg-surface px-3 text-[15px]">
            <option value="">All classes</option>
            {classOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">Show</button>
      </form>

      {data.apps.length === 0 ? (
        <EmptyState title={tab === "ready" ? "Nothing waits for a decision" : tab === "approved" ? "No approved applicant waits to be admitted" : "The waiting list is empty"}>
          <p>{tab === "ready" ? "Applications appear here when they are sent for a decision." : tab === "approved" ? "Approved applications appear here until the admission is confirmed." : "Applicants put on the waiting list appear here in priority order."}</p>
        </EmptyState>
      ) : tab === "waiting" ? (
        <div className="space-y-6">
          {[...new Set(data.apps.map((a) => a.classId))].map((classId) => {
            const rows = data.apps.filter((a) => a.classId === classId);
            const cls = data.n.classes.get(classId) ?? "";
            return (
              <section key={classId} aria-labelledby={`w-${classId}`} className="rounded-2xl border border-line bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`w-${classId}`} className="text-lg font-semibold">{cls} <span className="text-sm font-normal text-ink-2">· {seatText(classId)}</span></h2>
                  {canChange && rows.length > 1 && <Rerank yearId={yearId} classId={classId} className={cls} />}
                </div>
                <ol className="divide-y divide-line">
                  {rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                      <span className="flex gap-3">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold" aria-label={`Position ${a.waitingRank}`}>{a.waitingRank}</span>
                        <span>
                          <Link href={`${BASE}/applications/${a.id}`} className="font-medium text-brand-text hover:underline">{a.fullName}</Link>
                          <span className="block text-sm text-ink-2">{a.applicationNo} · {a.waitingReason ?? ""}</span>
                          {a.waitingSince && <span className="block text-sm text-ink-2">Waiting since {formatDate(a.waitingSince, tz)}</span>}
                        </span>
                      </span>
                      {canChange && <WaitingActions id={a.id} name={a.fullName} rank={a.waitingRank ?? 0} count={rows.length} />}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.apps.map((a) => {
            const p = progressOf(a.documents, data.rules.get(a.classId)?.documents ?? []);
            const pct = bestTestPct(a.tests);
            const interview = a.interviews[0];
            const approval = data.approvals.find((x) => x.id === a.approvalId);
            const blocks = data.block.get(a.id) ?? [];
            return (
              <li key={a.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`${BASE}/applications/${a.id}`} className="text-lg font-medium text-brand-text hover:underline">{a.fullName}</Link>
                    <p className="text-sm text-ink-2">{data.n.classes.get(a.classId) ?? ""} · {a.applicationNo} · applied {formatDate(a.createdAt, tz)}</p>
                  </div>
                  {approval && ["WAITING", "ESCALATED"].includes(approval.status) && <Badge tone="warning">In Approvals</Badge>}
                  {tab === "approved" && <Badge tone="success">Approved {a.decidedAt ? formatDate(a.decidedAt, tz) : ""}</Badge>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-ink-2">Documents</dt><dd><DocProgress verified={p.requiredVerified} required={p.required} /></dd></div>
                  {(stageOn(settings, "test") || a.tests.length > 0) && <div><dt className="text-ink-2">Test score</dt><dd>{pct === null ? (a.tests.some((t) => t.absent) ? "Absent" : "Not taken") : `${Math.round(pct)}%`}</dd></div>}
                  {(stageOn(settings, "interview") || interview) && <div><dt className="text-ink-2">Interview</dt><dd>{interview ? outcomeLabel(interview.outcome) : "Not recorded"}</dd></div>}
                  <div><dt className="text-ink-2">Sibling in school</dt><dd>{a.siblingStudentId ? sibling.get(a.siblingStudentId) ?? "Yes" : "No"}</dd></div>
                  <div><dt className="text-ink-2">Category</dt><dd>{a.category ?? "Not given"}</dd></div>
                  <div><dt className="text-ink-2">Seats</dt><dd>{seatText(a.classId)}</dd></div>
                </dl>
                {a.decisionRemarks && <p className="mt-2 text-sm"><span className="text-ink-2">Remarks:</span> {a.decisionRemarks}</p>}
                {tab === "ready" && canChange && <div className="mt-3"><DecideButtons id={a.id} name={a.fullName} waitingList={settings.waitingListOn} seatsNote={seatText(a.classId)} /></div>}
                {tab === "approved" && (
                  <div className="mt-3 space-y-3">
                    {settings.offerLettersOn && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span>Offer letter: {a.offerLetterNo ? `${a.offerLetterNo}, sent ${a.offerSentAt ? formatDate(a.offerSentAt, tz) : ""}${a.offerAcceptedAt ? `, accepted ${formatDate(a.offerAcceptedAt, tz)}` : ", not accepted yet"}` : "not sent"}</span>
                        {a.offerLetterNo && <a href={`${BASE}/decision/${a.id}/offer-letter`} className={linkClass} target="_blank" rel="noopener">Print</a>}
                        {canChange && <OfferButtons id={a.id} sent={Boolean(a.offerSentAt)} accepted={Boolean(a.offerAcceptedAt)} hasEmail={Boolean(a.email)} />}
                      </div>
                    )}
                    {blocks.length > 0 ? (
                      <div className="rounded-xl border border-warn/40 bg-warn-bg p-3 text-sm text-warn-text">
                        <p className="font-medium">Before confirming:</p>
                        <ul className="ml-5 list-disc">{blocks.map((b) => <li key={b}>{b}</li>)}</ul>
                        <Link href={`${BASE}/applications/${a.id}`} className="mt-1 inline-block font-medium underline">Open application</Link>
                      </div>
                    ) : canChange && <ButtonLink href={`${BASE}/decision/${a.id}/confirm`} variant="primary" size="sm">Confirm admission</ButtonLink>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
