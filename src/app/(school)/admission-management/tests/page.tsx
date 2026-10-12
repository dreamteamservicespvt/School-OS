import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { OPEN_STAGES } from "@/lib/admission/applications";
import { admissionStaff, stageOn } from "@/lib/admission/settings";
import { freeSlots, OUTCOMES, outcomeLabel } from "@/lib/admission/tests";
import { names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SubNav, linkClass } from "../_components/bits";
import { BookInterview, CancelInterview, OutcomeForm, ScheduleTest, type Applicant } from "./test-forms";

export const metadata: Metadata = { title: "Test & Interview" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function TestsPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz, today } = await fullPage();
  const testsOn = stageOn(settings, "test") && settings.testsOn;
  const interviewsOn = stageOn(settings, "interview") && settings.interviewsOn;
  if (!testsOn && !interviewsOn) redirect(BASE);
  const raw = await searchParams;
  const tab = (raw.tab === "interviews" && interviewsOn) || !testsOn ? "interviews" : "tests";
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
  const canChange = viewer.change === "all";
  const scheduleFor = UUID_RE.test(one(raw.schedule)) ? one(raw.schedule) : null;
  const showSchedule = one(raw.schedule) !== "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(one(raw.day)) && one(raw.day) >= today ? one(raw.day) : today;
  const now = new Date();

  const data = await withSchool(current.ctx, async (tx) => {
    const n = await names(tx);
    const open = await tx.application.findMany({ where: { archivedAt: null, academicYearId: yearId, stage: { in: OPEN_STAGES } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, applicationNo: true, classId: true } });
    const applicants: Applicant[] = open.map((a) => ({ id: a.id, name: a.fullName, meta: `${n.classes.get(a.classId) ?? ""} · ${a.applicationNo}` }));
    if (tab === "tests") {
      const tests = await tx.admissionTest.findMany({ where: { archivedAt: null, academicYearId: yearId }, orderBy: { startsAt: "desc" }, take: 100, include: { bookings: { where: { archivedAt: null }, select: { marks: true, absent: true } } } });
      return { n, applicants, tests, slots: [], staff: [], free: [], app: null };
    }
    const slots = await tx.interviewSlot.findMany({ where: { application: { academicYearId: yearId, archivedAt: null } }, orderBy: { startsAt: "desc" }, take: 150, include: { application: { select: { id: true, fullName: true, applicationNo: true, classId: true } } } });
    const staff = await admissionStaff(tx, current.ctx, { allStaff: true });
    let free: { value: string; label: string }[] = [];
    let app: { id: string; fullName: string } | null = null;
    if (scheduleFor) {
      app = await tx.application.findFirst({ where: { id: scheduleFor, archivedAt: null, stage: { in: OPEN_STAGES } }, select: { id: true, fullName: true } });
      const principal = staff.find((s) => /principal/i.test(s.designation ?? "")) ?? staff[0];
      const interviewer = staff.find((s) => s.id === one(raw.interviewer)) ?? principal;
      if (app && interviewer) free = await freeSlots(tx, interviewer.id, day, tz, now);
    }
    return { n, applicants, tests: [], slots, staff, free, app };
  });

  const staffName = new Map(data.staff.map((s) => [s.id, s.fullName]));
  const principal = data.staff.find((s) => /principal/i.test(s.designation ?? "")) ?? data.staff[0];
  const interviewerId = data.staff.some((s) => s.id === one(raw.interviewer)) ? one(raw.interviewer) : principal?.id ?? "";
  const tabHref = (t: string) => `${BASE}/tests${t === "tests" ? "" : "?tab=interviews"}`;
  const preselect = one(raw.apps).split(",").filter((x) => UUID_RE.test(x));
  const selectCls = "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px]";

  return (
    <>
      <PageHeader title="Test & Interview" href={`${BASE}/tests`} userId={current.user.id}>
        {canChange && tab === "tests" && <ScheduleTest applicants={data.applicants} classes={[...data.n.classes.entries()].map(([value, label]) => ({ value, label }))} chosen={preselect} open={preselect.length > 0} />}
        {canChange && tab === "interviews" && !showSchedule && <ButtonLink href={`${BASE}/tests?tab=interviews&schedule=pick`} variant="primary">Schedule interview</ButtonLink>}
      </PageHeader>
      {testsOn && interviewsOn && <SubNav current={tab} items={[{ key: "tests", label: "Tests", href: tabHref("tests") }, { key: "interviews", label: "Interviews", href: tabHref("interviews") }]} />}

      {tab === "tests" ? (
        data.tests.length === 0 ? (
          <EmptyState title="No tests scheduled">
            <p>Schedule an entrance test for one or many applicants. Parents get the date, time and venue.</p>
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.tests.map((t) => {
              const scored = t.bookings.filter((b) => b.marks !== null || b.absent).length;
              return (
                <li key={t.id}>
                  <Link href={`${BASE}/tests/${t.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-1 text-sm text-ink-2">{formatDateTime(t.startsAt, tz)}{t.venue ? ` · ${t.venue}` : ""}{t.classId ? ` · ${data.n.classes.get(t.classId) ?? ""}` : ""}</p>
                    <p className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="neutral">{t.bookings.length} booked</Badge>
                      <Badge tone={scored === t.bookings.length && scored > 0 ? "success" : t.startsAt < now ? "warning" : "neutral"}>{scored} of {t.bookings.length} scores entered</Badge>
                      <Badge tone="neutral">Out of {t.maxMarks}</Badge>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          {canChange && showSchedule && (
            <Card className="mb-6">
              <CardHeader title="Schedule an interview" description="Pick the applicant, the interviewer and the day, then a free 15-minute slot." />
              <CardBody>
                <form method="get" className="grid gap-3 md:grid-cols-4 md:items-end">
                  <input type="hidden" name="tab" value="interviews" />
                  <label className="text-sm"><span className="mb-1 block font-medium">Applicant</span>
                    <select name="schedule" defaultValue={data.app?.id ?? ""} required className={selectCls}>
                      <option value="">Choose…</option>
                      {data.applicants.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.meta})</option>)}
                    </select>
                  </label>
                  <label className="text-sm"><span className="mb-1 block font-medium">Interviewer</span>
                    <select name="interviewer" defaultValue={interviewerId} className={selectCls}>
                      {data.staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.designation ? `, ${s.designation}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="text-sm"><span className="mb-1 block font-medium">Day</span>
                    <input type="date" name="day" min={today} defaultValue={day} className={selectCls} />
                  </label>
                  <Button type="submit" variant="secondary">Show free slots</Button>
                </form>
                {data.app && (
                  <div className="mt-4 max-w-md">
                    {data.free.length === 0 ? (
                      <p className="text-ink-2">{staffName.get(interviewerId) ?? "This interviewer"} has no free slot on {formatDate(new Date(`${day}T12:00:00Z`), "UTC")}. Choose another day or interviewer.</p>
                    ) : (
                      <>
                        <p className="mb-2">Interview for <strong>{data.app.fullName}</strong> with {staffName.get(interviewerId)} on {formatDate(new Date(`${day}T12:00:00Z`), "UTC")}.</p>
                        <BookInterview key={`${data.app.id}-${interviewerId}-${day}`} applicationId={data.app.id} interviewerStaffId={interviewerId} slots={data.free} done={`${BASE}/tests?tab=interviews`} />
                      </>
                    )}
                  </div>
                )}
                <Link href={`${BASE}/tests?tab=interviews`} className={`${linkClass} mt-2`}>Close</Link>
              </CardBody>
            </Card>
          )}
          {data.slots.length === 0 ? (
            <EmptyState title="No interviews booked"><p>Book a 15-minute slot with an interviewer for each applicant.</p></EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left">
                <caption className="sr-only">Interviews</caption>
                <thead className="bg-surface-2 text-sm text-ink-2">
                  <tr><th scope="col" className="px-4 py-2 font-medium">Slot</th><th scope="col" className="px-4 py-2 font-medium">Interviewer</th><th scope="col" className="px-4 py-2 font-medium">Applicant</th><th scope="col" className="px-4 py-2 font-medium">Outcome</th><th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {data.slots.map((s) => (
                    <tr key={s.id} className="border-t border-line align-top">
                      <td className="px-4 py-3">{formatDateTime(s.startsAt, tz)}<span className="block text-sm text-ink-2">{s.minutes} minutes</span></td>
                      <td className="px-4 py-3">{staffName.get(s.interviewerStaffId) ?? ""}</td>
                      <td className="px-4 py-3"><Link href={`${BASE}/applications/${s.application.id}`} className="font-medium text-brand-text hover:underline">{s.application.fullName}</Link><span className="block text-sm text-ink-2">{data.n.classes.get(s.application.classId) ?? ""} · {s.application.applicationNo}</span></td>
                      <td className="px-4 py-3">
                        {s.cancelledAt ? <Badge tone="neutral">Cancelled</Badge> : <Badge tone={s.outcome === "RECOMMENDED" ? "success" : s.outcome === "NOT_RECOMMENDED" ? "danger" : s.outcome === "HOLD" ? "warning" : "neutral"}>{outcomeLabel(s.outcome)}</Badge>}
                        {s.notes && <span className="mt-1 block max-w-xs text-sm text-ink-2">{s.notes}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {canChange && !s.cancelledAt && (
                          <span className="flex flex-wrap justify-end gap-1">
                            <OutcomeForm slotId={s.id} outcomes={OUTCOMES} outcome={s.outcome} notes={s.notes} />
                            {!s.outcome && <CancelInterview slotId={s.id} />}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
