import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, ClipboardCheck, ClipboardList, SearchX, ThumbsUp, Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { OPEN_STAGES } from "@/lib/admission/applications";
import { admissionStaff, openYears, stageOn } from "@/lib/admission/settings";
import { outcomeLabel } from "@/lib/admission/tests";
import { names } from "@/lib/admission/choices";
import { whenWords } from "@/lib/admission/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { LinkTabs } from "@/components/ui/chips";
import { Stats } from "@/components/ui/stats";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/rows";
import { DataList } from "@/components/ui/data-list";
import { rowList, type ListRow } from "../_components/list-rows";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { AdmissionHead } from "../_components/head";
import { OutcomeDialog, ScheduleInterviewButton, ScheduleTestButton, ScoreDialog, type Applicant } from "./test-forms";

export const metadata: Metadata = { title: "Test & Interview" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PATH = `${BASE}/tests`;
const NONE = "00000000-0000-0000-0000-000000000000";
const OUT_TONE: Record<string, "ok" | "bad" | "warn"> = { RECOMMENDED: "ok", NOT_RECOMMENDED: "bad", HOLD: "warn" };

export default async function TestsPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz, today } = await workPage();
  const testsOn = stageOn(settings, "test");
  const interviewsOn = stageOn(settings, "interview");
  if (!testsOn && !interviewsOn) redirect(BASE);
  const raw = await searchParams;
  const tab = (one(raw.tab) === "interviews" && interviewsOn) || !testsOn ? "interviews" : "tests";
  const range = periodFromSearch(raw, { timeZone: tz });
  const canChange = viewer.change === "all";
  const scoreId = UUID_RE.test(one(raw.score)) ? one(raw.score) : null;
  const outcomeId = UUID_RE.test(one(raw.outcome)) ? one(raw.outcome) : null;
  const scheduleFor = UUID_RE.test(one(raw.schedule)) ? one(raw.schedule) : null;
  const preselect = one(raw.apps).split(",").filter((x) => UUID_RE.test(x));
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await openYears(tx);
    const yearIds = years.length ? years.map((y) => y.id) : [NONE];
    const n = await names(tx);
    const open = await tx.application.findMany({ where: { archivedAt: null, academicYearId: { in: yearIds }, stage: { in: OPEN_STAGES } }, orderBy: [{ stage: "desc" }, { fullName: "asc" }], select: { id: true, fullName: true, applicationNo: true, classId: true, stage: true } });
    const applicants: Applicant[] = open.map((a) => ({ id: a.id, name: a.fullName, meta: n.classes.get(a.classId) ?? "" }));
    const when = range ? { startsAt: momentWhere(range, tz) } : {};
    const testWhere: Prisma.AdmissionTestWhereInput = { archivedAt: null, academicYearId: { in: yearIds }, ...when };
    const slotWhere: Prisma.InterviewSlotWhereInput = { application: { academicYearId: { in: yearIds }, archivedAt: null }, ...when };
    const [tests, slots, staff, nextTest, toScore, weekInterviews, recommended] = await Promise.all([
      tx.admissionTest.findMany({ where: testWhere, orderBy: { startsAt: "desc" }, take: 100, include: { bookings: { where: { archivedAt: null }, select: { marks: true, absent: true } } } }),
      tx.interviewSlot.findMany({ where: slotWhere, orderBy: { startsAt: "desc" }, take: 150, include: { application: { select: { id: true, fullName: true, applicationNo: true, classId: true, academicYearId: true } } } }),
      admissionStaff(tx, current.ctx, { allStaff: true }),
      tx.admissionTest.findFirst({ where: { archivedAt: null, academicYearId: { in: yearIds }, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, include: { _count: { select: { bookings: { where: { archivedAt: null } } } } } }),
      tx.admissionTestBooking.count({ where: { archivedAt: null, marks: null, absent: false, test: { archivedAt: null, academicYearId: { in: yearIds } } } }),
      tx.interviewSlot.findMany({ where: { cancelledAt: null, outcome: null, startsAt: { gte: now, lt: weekEnd }, application: { academicYearId: { in: yearIds }, archivedAt: null } }, orderBy: { startsAt: "asc" }, select: { startsAt: true } }),
      tx.interviewSlot.count({ where: { cancelledAt: null, outcome: "RECOMMENDED", application: { academicYearId: { in: yearIds }, archivedAt: null } } }),
    ]);
    let score = null;
    if (scoreId) {
      const t = await tx.admissionTest.findFirst({ where: { id: scoreId, archivedAt: null }, include: { bookings: { where: { archivedAt: null }, orderBy: { createdAt: "asc" }, include: { application: { select: { fullName: true, classId: true, applicationNo: true } } } } } });
      if (t) {
        const booked = new Set(t.bookings.map((b) => b.applicationId));
        score = { t, more: applicants.filter((a) => !booked.has(a.id) && (!t.classId || open.find((o) => o.id === a.id)?.classId === t.classId)) };
      }
    }
    const outcome = outcomeId ? await tx.interviewSlot.findFirst({ where: { id: outcomeId }, include: { application: { select: { fullName: true, classId: true } } } }) : null;
    return { years, n, applicants, tests, slots, staff, nextTest, toScore, weekInterviews, recommended, score, outcome };
  });

  const { n } = data;
  const staffName = new Map(data.staff.map((s) => [s.id, s.fullName]));
  const principal = data.staff.find((s) => /principal/i.test(s.designation ?? "")) ?? data.staff[0];
  const yl = (id: string) => { const y = data.years.find((x) => x.id === id); return y ? (y.status === "ACTIVE" && year && year.id !== y.id ? `${y.name} mid-year` : y.name) : ""; };
  const tabHref = (t: string) => (t === "tests" ? PATH : `${PATH}?tab=interviews`);
  const back = tab === "tests" ? PATH : `${PATH}?tab=interviews`;
  const filtered = Boolean(range);
  const classes = [...n.classes.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const nt = data.nextTest;
  const wk = data.weekInterviews;

  const testRows: ListRow[] = data.tests.map((t) => {
    const scored = t.bookings.filter((b) => b.marks !== null || b.absent).length;
    const all = t.bookings.length;
    const done = all > 0 && scored === all;
    return {
      key: t.id, href: `${PATH}?score=${t.id}`, active: t.id === scoreId,
      cells: [
        <div key="d"><p className="font-semibold">{formatDate(t.startsAt, tz)}</p><p className="text-[12.5px] text-ink3">{formatTime(t.startsAt, tz)} · {t.title}</p></div>,
        <span key="v" className="text-[13.5px]">{t.venue ?? "Venue not set"}</span>,
        <div key="c"><p className="font-medium">{t.classId ? n.classes.get(t.classId) ?? "" : "Mixed classes"}</p><p className="text-[12px] text-ink3">{yl(t.academicYearId)} · out of {t.maxMarks}</p></div>,
        <span key="b" className="font-semibold tnum">{all}</span>,
        <span key="s" className="flex items-center gap-2 w-36"><Progress value={all ? (scored / all) * 100 : 0} tone={done ? "ok" : "brand"} className="flex-1" /><span className="text-[12.5px] font-semibold tnum">{scored} of {all}</span></span>,
      ],
      mobile: {
        title: `${formatDate(t.startsAt, tz)} · ${formatTime(t.startsAt, tz)}`, sub: `${t.classId ? n.classes.get(t.classId) ?? "" : "Mixed classes"} · ${t.venue ?? t.title}`,
        pills: [<Pill key="b" tone="neutral" className="!h-[22px] !text-[11.5px]">{all} booked</Pill>, <Pill key="s" tone={done ? "ok" : "warn"} className="!h-[22px] !text-[11.5px]">{scored} scored</Pill>],
      },
    };
  });

  const slotRows: ListRow[] = data.slots.map((s) => {
    const cls = n.classes.get(s.application.classId) ?? "";
    const pill = s.cancelledAt ? <Pill tone="neutral">Cancelled</Pill> : s.outcome ? <Pill tone={OUT_TONE[s.outcome]}>{outcomeLabel(s.outcome)}</Pill> : <Pill tone="neutral">Not yet</Pill>;
    return {
      key: s.id, href: canChange && !s.cancelledAt ? `${PATH}?tab=interviews&outcome=${s.id}` : `${BASE}/applications/${s.application.id}`, active: s.id === outcomeId,
      cells: [
        <span key="s" className="font-semibold tnum whitespace-nowrap">{whenWords(s.startsAt, tz, now)}</span>,
        <div key="a" className="flex items-center gap-3"><Avatar name={s.application.fullName} size={32} /><div><p className="font-semibold leading-tight">{s.application.fullName}</p><p className="text-[12px] text-ink3">{cls} · {yl(s.application.academicYearId)}</p></div></div>,
        <span key="w" className="text-[13.5px]">{staffName.get(s.interviewerStaffId) ?? ""}</span>,
        <div key="o">{pill}{s.notes && <p className="text-[12px] text-ink3 mt-1 max-w-[260px] truncate">{s.notes}</p>}</div>,
      ],
      mobile: { title: s.application.fullName, sub: `${whenWords(s.startsAt, tz, now)} · ${staffName.get(s.interviewerStaffId) ?? ""}`, avatar: s.application.fullName, pills: [<span key="p">{pill}</span>] },
    };
  });

  const actions = canChange ? (tab === "tests"
    ? <ScheduleTestButton applicants={data.applicants} classes={classes} chosen={preselect} open={preselect.length > 0} minDay={today} />
    : <ScheduleInterviewButton applicants={data.applicants} staff={data.staff.map((s) => ({ value: s.id, label: s.designation ? `${s.fullName}, ${s.designation}` : s.fullName }))} defaultInterviewer={principal?.id ?? ""} today={today} startFor={scheduleFor} open={Boolean(scheduleFor)} />) : null;

  return (
    <>
      <AdmissionHead href={PATH} sub="Entrance test and interview dates, scores and remarks. Switched on in Admission Settings." actions={actions} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          ...(testsOn ? [{ label: "Next test", value: nt ? formatDate(nt.startsAt, tz) : "None", sub: nt ? `${nt._count.bookings} booked · ${formatTime(nt.startsAt, tz)}` : "Schedule one when ready", icon: CalendarDays, tone: "brand" as const, href: nt ? `${PATH}?score=${nt.id}` : undefined }] : []),
          ...(testsOn ? [{ label: "Booked for tests", value: data.toScore, sub: "Scores still to enter", icon: ClipboardList }] : []),
          ...(interviewsOn ? [{ label: "Interviews this week", value: wk.length, sub: wk.length ? `${formatDate(wk[0].startsAt, tz)} onwards` : "None booked", icon: Users, href: `${PATH}?tab=interviews` }] : []),
          { label: "Recommended", value: data.recommended, sub: "By interview, this admission year", icon: ThumbsUp, tone: "ok" as const },
        ]} />
        <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
          {testsOn && interviewsOn ? (
            <LinkTabs value={tab} label="Tests or interviews" className="flex-1" tabs={[{ id: "tests", label: "Tests", count: tab === "tests" ? data.tests.length : undefined, href: tabHref("tests") }, { id: "interviews", label: "Interviews", count: tab === "interviews" ? data.slots.length : undefined, href: tabHref("interviews") }]} />
          ) : <span />}
          <PeriodFilter timeZone={tz} allLabel="Any date" className="md:w-56" />
        </div>
        {tab === "tests" ? (
          <Card className="overflow-hidden">
            <CardHeader title="Entrance tests" description="Tap a test to enter scores and remarks" icon={ClipboardCheck} />
            <DataList caption="Entrance tests" rows={testRows} minWidth={720}
              {...rowList([{ key: "d", label: "Date and time" }, { key: "v", label: "Venue" }, { key: "c", label: "Class" }, { key: "b", label: "Booked", align: "right" }, { key: "s", label: "Scores entered" }])}
              empty={filtered
                ? <EmptyState bare Icon={SearchX} title="No tests in these dates">Try another date range.</EmptyState>
                : <EmptyState bare Icon={ClipboardCheck} title="No tests scheduled">Schedule an entrance test for one or many applicants. Parents get the date, time and venue.</EmptyState>}
              footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3">{data.tests.length} {data.tests.length === 1 ? "test" : "tests"} · parents get the date, time and venue by WhatsApp or SMS</p>} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader title="Interviews" description="15-minute slots. An interviewer is never booked twice for the same time." icon={Users} />
            <DataList caption="Interviews" rows={slotRows} minWidth={720}
              {...rowList([{ key: "s", label: "Slot", nowrap: true }, { key: "a", label: "Applicant" }, { key: "w", label: "Interviewer" }, { key: "o", label: "Outcome" }])}
              footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3">{slotRows.length} {slotRows.length === 1 ? "interview" : "interviews"}</p>}
              empty={filtered
                ? <EmptyState bare Icon={SearchX} title="No interviews in these dates">Try another date range.</EmptyState>
                : <EmptyState bare Icon={Users} title="No interviews booked">Book a 15-minute slot with an interviewer for each applicant.</EmptyState>} />
          </Card>
        )}
      </div>
      {data.score && (
        <ScoreDialog key={data.score.t.id} testId={data.score.t.id} title={`Scores · ${formatDate(data.score.t.startsAt, tz)}`}
          sub={`${data.score.t.title} · ${data.score.t.venue ?? "Venue not set"} · ${formatDateTime(data.score.t.startsAt, tz)} · out of ${data.score.t.maxMarks}`}
          maxMarks={data.score.t.maxMarks} canChange={canChange} closeHref={back} more={data.score.more}
          lines={data.score.t.bookings.map((b) => ({ applicationId: b.applicationId, name: b.application.fullName, meta: `${n.classes.get(b.application.classId) ?? ""} · ${b.application.applicationNo}`, marks: b.marks?.toString() ?? "", absent: b.absent, remarks: b.remarks ?? "" }))} />
      )}
      {data.outcome && canChange && !data.outcome.cancelledAt && (
        <OutcomeDialog key={data.outcome.id} slotId={data.outcome.id} title={`Interview: ${data.outcome.application.fullName}`}
          sub={`${n.classes.get(data.outcome.application.classId) ?? ""} · ${formatDateTime(data.outcome.startsAt, tz)} · ${staffName.get(data.outcome.interviewerStaffId) ?? ""}`}
          outcome={data.outcome.outcome} notes={data.outcome.notes} closeHref={back} canCancel={!data.outcome.outcome} />
      )}
    </>
  );
}
