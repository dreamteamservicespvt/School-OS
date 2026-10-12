import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlarmClock, Armchair, Building2, CalendarX2, FilePlus2, Filter, SquareKanban } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/format";
import { admissionPage, BASE } from "@/lib/admission/page";
import { zonedToInstant, UUID_RE } from "@/lib/admission/act";
import { followUps, type Filters } from "@/lib/admission/reports";
import { headline, pipeline, whereNow } from "@/lib/admission/dashboard";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { seatsFor } from "@/lib/admission/seats";
import { openYears } from "@/lib/admission/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Band } from "@/components/ui/stats";
import { Col, Row, Split } from "@/components/ui/rows";
import { UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { periodFromSearch, momentWhere } from "@/lib/periods";
import { PeriodFilter } from "@/components/list/period-filter";
import { AdmissionHead } from "./_components/head";
import { Pipeline } from "./_components/pipeline";
import { AddEnquiryButton } from "./enquiries/enquiry-forms";
import { moveCard } from "./actions";

export const metadata: Metadata = { title: "Admission Dashboard" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const idOr = (v: string) => (UUID_RE.test(v) ? v : null);

export default async function AdmissionDashboard({ searchParams }: Search) {
  const { current, viewer, settings, year, tz, today } = await admissionPage();
  if (viewer.see !== "all") redirect(`${BASE}/enquiries`);
  const raw = await searchParams;
  const now = new Date();
  const dayStart = zonedToInstant(`${today}T00:00`, tz);
  const range = periodFromSearch(raw, { timeZone: tz });

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await openYears(tx);
    const active = years.find((y) => y.status === "ACTIVE") ?? null;
    const yearId = idOr(one(raw.year)) ?? year?.id ?? null;
    const choices = await enquiryChoices(tx, current.ctx, current, settings, tz);
    const campuses = await tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    if (!yearId) return { years, active, choices, campuses, yearId: null } as const;
    const n = await names(tx);
    const source = one(raw.source);
    const f: Filters = {
      yearId,
      classId: idOr(one(raw.class)),
      source: settings.sourceList.some((s) => s.key === source) ? source : null,
      ownerStaffId: idOr(one(raw.owner)),
      campusId: idOr(one(raw.campus)),
      created: range ? momentWhere(range, tz) : null,
    };
    const [band, stages, cols, fu, seats] = await Promise.all([
      headline(tx, viewer, f, dayStart, now),
      whereNow(tx, settings, viewer, f, now),
      pipeline(tx, settings, viewer, f, n),
      followUps(tx, viewer, f, dayStart, now),
      seatsFor(tx, yearId),
    ]);
    const group = campuses.length > 1
      ? await Promise.all(campuses.map(async (c) => ({
        name: c.name,
        enq: await tx.enquiry.count({ where: { archivedAt: null, academicYearId: yearId, campusId: c.id } }),
        app: await tx.application.count({ where: { archivedAt: null, academicYearId: yearId, campusId: c.id } }),
        adm: await tx.application.count({ where: { archivedAt: null, academicYearId: yearId, campusId: c.id, stage: "ADMITTED", studentId: { not: null } } }),
      })))
      : [];
    return { years, active, choices, campuses, yearId, f, n, band, stages, cols, fu, seats: [...seats.values()], group } as const;
  });

  const thisYear = data.years.find((y) => y.id === data.yearId);
  const yl = (y: { id: string; name: string; status: string } | undefined) => (y ? (y.status === "ACTIVE" && year && year.id !== y.id ? `${y.name} mid-year` : y.name) : "");
  const midYear = year && data.active && data.active.id !== year.id ? data.active : null;
  const sub = !year ? "No academic year is set up yet." : midYear ? `Admissions are open for ${year.name}. Mid-year joining for ${midYear.name} runs alongside.` : `Admissions are open for ${year.name}.`;
  const canChange = viewer.change === "all";

  const actions = (
    <>
      {data.yearId && <AddEnquiryButton c={data.choices} variant="secondary" />}
      {data.yearId && <ButtonLink href={`${BASE}/applications/new`} variant="primary" icon={FilePlus2}>New application</ButtonLink>}
    </>
  );

  if (!data.yearId) {
    return (
      <>
        <AdmissionHead href={BASE} sub={sub} />
        <Card><EmptyState bare Icon={CalendarX2} title="No academic year yet" action={<ButtonLink href="/academic-management" variant="primary">Open Academic Management</ButtonLink>}>Add the academic year and its classes and sections in Academic Management. Admissions open for it straight away.</EmptyState></Card>
      </>
    );
  }

  const { band, stages, cols, fu, seats, f, n } = data;
  const max = Math.max(1, ...stages.map((s) => s.count));
  const className = f.classId ? n.classes.get(f.classId) : undefined;
  const groups = [
    { key: "overdue", label: "Overdue", tone: "text-bad", rows: fu.overdue },
    { key: "today", label: "Due today", tone: "text-warn", rows: fu.today },
    { key: "tomorrow", label: "Due tomorrow", tone: "text-ink3", rows: fu.tomorrow },
  ];
  const yearOptions = [year, midYear].filter((y): y is NonNullable<typeof y> => Boolean(y)).map((y) => ({ value: y.id, label: y.id === year?.id ? `Admission year ${y.name}` : `${y.name} mid-year` }));
  const totalFollow = fu.overdueCount + band.today;

  return (
    <>
      <AdmissionHead href={BASE} sub={sub} actions={actions} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
          {yearOptions.length > 1 ? <UrlSegmented param="year" label="Admission year" options={yearOptions} value={data.yearId} /> : <p className="text-[14px] font-semibold text-ink2">Admission year {thisYear?.name}</p>}
          <div className="grid grid-cols-2 lg:flex gap-2 lg:ml-auto">
            <PeriodFilter timeZone={tz} allLabel="Any date" className="col-span-2 lg:col-span-1" />
            <UrlSelect param="class" label="Class" allLabel="All classes" options={data.choices.classes} className="lg:w-40" />
            <UrlSelect param="source" label="Source" allLabel="All sources" options={data.choices.sources} className="lg:w-40" />
            <UrlSelect param="owner" label="Owner" allLabel="All owners" options={data.choices.owners.map((o) => ({ value: o.value, label: o.label.replace(/ \(.*\)$/, "") }))} className={cx("lg:w-44", data.campuses.length <= 1 && "col-span-2 lg:col-span-1")} />
            {data.campuses.length > 1 && <UrlSelect param="campus" label="Campus" allLabel="All campuses" options={data.campuses.map((c) => ({ value: c.id, label: c.name }))} className="lg:w-40" />}
          </div>
        </div>

        <Band items={[
          { label: "Enquiries", big: band.enquiries, foot: `+${band.enqWeek} since last week · ${band.enqOpen} open`, href: `${BASE}/enquiries?year=${data.yearId}` },
          { label: "Applications", big: band.applications, foot: `${band.waiting} waiting for a decision`, href: `${BASE}/applications?year=${data.yearId}` },
          { label: "Admitted", big: band.admitted, foot: `of ${band.seats} seats for new joiners`, href: `${BASE}/applications?year=${data.yearId}&stage=ADMITTED` },
          { label: "Follow-ups due", big: totalFollow, foot: `${fu.overdueCount} overdue · ${band.today} today`, href: `${BASE}/enquiries?quick=${fu.overdueCount ? "overdue" : "today"}` },
        ]} />

        <Split>
          <Col>
            <Card>
              <CardHeader title="Where everyone is now" description={`${yl(thisYear)} · tap a stage to open the list behind it`} icon={Filter} />
              <ul className="px-2 pb-3">
                {stages.map((s) => (
                  <li key={s.key}>
                    <a href={s.href} className="w-full grid grid-cols-[96px_1fr_64px] md:grid-cols-[130px_1fr_150px] items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left transition">
                      <span className="min-w-0">
                        <span className="block font-semibold text-[14px] truncate">{s.label}</span>
                        <span className="block text-[12px] text-ink3 truncate">{s.key === "done" ? "This year" : s.oldest ? `Oldest ${formatDate(s.oldest, tz)}` : "Nobody waiting"}</span>
                      </span>
                      <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
                        <span className={cx("absolute inset-y-0 left-0 rounded-full", s.key === "done" ? "bg-ok" : "bg-brand")} style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }} />
                      </span>
                      <span className="text-right">
                        <span className="font-display font-semibold text-[18px] tnum">{s.count}</span>
                        <span className={cx("block md:inline md:ml-2 text-[12px] font-semibold tnum", s.week ? "text-ok" : "text-ink3")}>{s.week ? `+${s.week}` : "0"}<span className="hidden md:inline font-normal text-ink3"> this week</span></span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Pipeline" description={canChange ? "Drag a card to the next column, or use its arrow. The same checks as the buttons apply." : "Cards in each step. View only."} icon={SquareKanban} />
              <Pipeline columns={cols} move={canChange ? moveCard : undefined} filtered={className} />
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHeader title="Today’s follow-ups" description="Owners got a reminder at the set time" icon={AlarmClock} action={fu.overdueCount ? <Pill tone="bad">{fu.overdueCount} overdue</Pill> : undefined} />
              <div className="px-2 pb-3">
                {groups.map((g) => g.rows.length > 0 && (
                  <div key={g.key} className="mb-1">
                    <p className={cx("eyebrow px-3 pt-2 pb-1", g.tone)}>{g.label} · {g.key === "overdue" ? fu.overdueCount : g.rows.length}</p>
                    {g.rows.map((r) => {
                      const cls = r.classId ? n.classes.get(r.classId) : null;
                      return (
                        <Row key={r.id} href={`${BASE}/enquiries?id=${r.id}`} avatar={r.childName} title={`${r.childName}${cls ? ` · ${cls}` : ""}`}
                          sub={[r.nextAction, r.ownerStaffId ? n.staff.get(r.ownerStaffId) : null].filter(Boolean).join(" · ") || r.parentName}
                          right={<span className={cx("text-[12.5px] font-semibold tnum whitespace-nowrap", g.tone === "text-ink3" ? "text-ink2" : g.tone)}>{r.nextFollowUpAt ? (g.key === "overdue" ? formatDate(r.nextFollowUpAt, tz) : formatTime(r.nextFollowUpAt, tz)) : ""}</span>} />
                      );
                    })}
                  </div>
                ))}
                {!fu.overdue.length && !fu.today.length && !fu.tomorrow.length && <p className="text-[13.5px] text-ink3 px-3 py-6 text-center">No follow-ups due for these filters.</p>}
              </div>
            </Card>

            <Card>
              <CardHeader title="Seats left for new joiners" description={yl(thisYear)} icon={Armchair} />
              {seats.length === 0 ? (
                <p className="px-5 pb-5 text-[13.5px] text-ink3">No sections for {thisYear?.name} yet. Add them in Academic Management, Classes & Sections.</p>
              ) : (
                <ul className="px-5 pb-4 flex flex-col gap-2.5">
                  {seats.map((c) => (
                    <li key={c.classId} className="flex items-center gap-3 text-[13.5px]">
                      <span className="w-16 font-medium text-ink2 shrink-0">{c.className}</span>
                      <span className="flex-1 text-ink3 text-[12.5px] truncate tnum">{c.sections.map((s) => `${s.name} ${s.free}`).join(" · ")}</span>
                      {c.free === 0 ? <Pill tone="bad" className="!h-5 !text-[11px]">Full</Pill> : <span className={cx("font-semibold tnum", c.free <= 3 && "text-warn")}>{c.free} left</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {data.group.length > 1 && (
              <Card>
                <CardHeader title="Group view" description={`Admissions across campuses, ${thisYear?.name}`} icon={Building2} />
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-[1fr_repeat(3,56px)] gap-y-2 text-[13.5px]">
                    <span className="text-[12px] text-ink3 font-semibold">Campus</span>
                    {["Enq.", "Appl.", "Adm."].map((h) => <span key={h} className="text-[12px] text-ink3 font-semibold text-right">{h}</span>)}
                    {[...data.group, { name: "Total", enq: data.group.reduce((p, g) => p + g.enq, 0), app: data.group.reduce((p, g) => p + g.app, 0), adm: data.group.reduce((p, g) => p + g.adm, 0) }].map((g) => (
                      <div key={g.name} className="contents">
                        <span className={cx(g.name === "Total" ? "font-semibold border-t border-line pt-2" : "text-ink2")}>{g.name}</span>
                        {[g.enq, g.app, g.adm].map((v, i) => <span key={i} className={cx("text-right tnum", g.name === "Total" && "font-semibold border-t border-line pt-2")}>{v}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </Col>
        </Split>
      </div>
    </>
  );
}
