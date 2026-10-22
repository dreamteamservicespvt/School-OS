import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageHidden } from "@/lib/duty";
import type { Prisma } from "@prisma/client";
import { Award, Briefcase, CalendarClock, ClipboardCheck, FileSignature, GraduationCap, Inbox, Megaphone, Star, TrendingUp, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { staffPage, BASE } from "@/lib/staff/page";
import { campusStaffWhere, staffIdOnCampus } from "@/lib/staff/list";
import { APPLICATION_STATUSES, INTERVIEW_OUTCOMES, label, OFFER_STATUSES, VACANCY_STATUSES } from "@/lib/staff/talent";
import { addDays, isoDay } from "@/lib/staff/dates";
import { StaffHead } from "../_components/head";
import { Avatar, SubNav } from "../_components/bits";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Col, Empty, Split, Stats } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { cx } from "@/components/ui/cx";
import {
  ApplicationForm, CloseCycleButton, CycleForm, InterviewForm, OfferForm, OutcomeForm, PromotionForm, ReviewForm, StatusSelectForm, TrainingForm, VacancyForm,
} from "./talent-forms";
import {
  applicationAction, applicationStatusAction, closeCycleAction, cycleAction, interviewAction, offerAction, offerStatusAction, outcomeAction, promotionAction, reviewAction, trainingAction, vacancyAction, vacancyStatusAction,
} from "./actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Recruitment & Appraisal") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const APP_TONE: Record<string, BadgeTone> = { NEW: "neutral", SHORTLISTED: "info", INTERVIEW: "brand", OFFERED: "warn", HIRED: "ok", REJECTED: "neutral", WITHDRAWN: "neutral" };
const VACANCY_TONE: Record<string, BadgeTone> = { OPEN: "info", ON_HOLD: "warn", FILLED: "ok", CLOSED: "neutral" };
const OFFER_TONE: Record<string, BadgeTone> = { MADE: "warn", ACCEPTED: "ok", DECLINED: "neutral", WITHDRAWN: "neutral" };
type VacancyWithApplications = Prisma.VacancyGetPayload<{ include: { applications: { include: { offers: true; interviews: true } } } }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RecruitmentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, features, tz, today } = await staffPage();
  const hr = viewer.see === "all";
  const canHr = viewer.change === "all";
  // Adding the hired person is office work (src/lib/duty.ts): the Principal sees the offer but not "Add as staff".
  const canAdd = canHr && !pageHidden(current, "staff-hr-management", "add");
  const views = [
    ...(hr && features.has("hr-recruitment") ? [{ key: "recruitment", label: "Recruitment" }] : []),
    ...(features.has("hr-appraisal") ? [{ key: "appraisal", label: "Appraisal" }] : []),
    ...(hr && features.has("hr-training") ? [{ key: "training", label: "Training" }] : []),
    ...(hr && features.has("hr-promotions") ? [{ key: "promotions", label: "Promotions" }] : []),
  ].map((v) => ({ ...v, href: `${BASE}/recruitment?view=${v.key}` }));
  if (views.length === 0) redirect(hr ? `${BASE}/settings` : viewer.staffId ? `${BASE}/${viewer.staffId}` : `${BASE}/leave`);
  // Older links (?view=vacancies, interviews, offers) open Recruitment.
  const asked = ["vacancies", "interviews", "offers"].includes(one(sp.view)) ? "recruitment" : one(sp.view);
  const view = views.find((v) => v.key === asked)?.key ?? views[0].key;

  const lists = await withSchool(current.ctx, async (tx) => {
    const [designations, departments, staff, years] = await Promise.all([
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      // One campus: the staff to choose (interviewers, training, promotions) and the years are their campus's.
      hr ? tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, AND: [campusStaffWhere(viewer)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true, photoFileId: true } }) : [],
      canHr ? tx.academicYear.findMany({ where: { archivedAt: null, ...(viewer.campusId ? { campusId: viewer.campusId } : {}) }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }) : [],
    ]);
    return { years: years.map((y) => ({ value: y.id, label: y.name })), designations: designations.map((d) => ({ value: d.name, label: d.name })), departments: departments.map((d) => ({ value: d.id, label: d.name })), staff };
  });
  const staffOptions = lists.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.designation})` }));
  const nameOf = (id: string | null) => lists.staff.find((s) => s.id === id)?.fullName ?? "";
  const photoOf = (id: string | null) => lists.staff.find((s) => s.id === id)?.photoFileId ?? null;

  const subs: Record<string, string> = {
    recruitment: "Vacancies, applications, interviews and offers",
    appraisal: hr ? "The yearly appraisal: self review, reviewer rating, done" : "Your appraisal and the reviews waiting for you",
    training: "Courses and workshops staff attend, with hours and certificates",
    promotions: "Designation changes, kept in each staff member's history",
  };
  const action = canHr ? (
    view === "recruitment" ? <VacancyForm action={vacancyAction} designations={lists.designations} departments={lists.departments} />
      : view === "appraisal" ? <CycleForm action={cycleAction} years={lists.years} today={isoDay(today)} />
      : view === "training" ? <TrainingForm action={trainingAction} staff={staffOptions} today={isoDay(today)} />
        : view === "promotions" ? <PromotionForm action={promotionAction} staff={staffOptions} designations={lists.designations} departments={lists.departments} today={isoDay(today)} />
          : null
  ) : null;

  return (
    <>
      <StaffHead page="Recruitment & Appraisal" href={`${BASE}/recruitment`} sub={`${subs[view]}. Each part can be switched off in HR Settings.`} actions={action ?? undefined} />
      {views.length > 1 && <SubNav current={view} items={views} />}
      {view === "recruitment" && <Recruitment />}
      {view === "appraisal" && <Appraisal />}
      {view === "training" && <Training />}
      {view === "promotions" && <Promotions />}
    </>
  );

  async function Recruitment() {
    const weekEnd = addDays(today, 7);
    const data = await withSchool(current.ctx, async (tx) => {
      const [vacancies, interviews, offers] = await Promise.all([
        tx.vacancy.findMany({
          where: { archivedAt: null }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50,
          include: { applications: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, include: { offers: { orderBy: { createdAt: "desc" }, take: 1 }, interviews: { orderBy: { startsAt: "desc" }, take: 1 } } } },
        }),
        tx.interview.findMany({ orderBy: { startsAt: "desc" }, take: 100, include: { application: { include: { vacancy: true } } } }),
        tx.offer.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { application: true } }),
      ]);
      return { vacancies, interviews, offers };
    });
    const open = data.vacancies.filter((v) => v.status === "OPEN");
    const applications = data.vacancies.reduce((n, v) => n + v.applications.length, 0);
    const weekAgo = addDays(today, -7);
    const newThisWeek = data.vacancies.reduce((n, v) => n + v.applications.filter((a) => a.createdAt >= weekAgo).length, 0);
    const upcoming = data.interviews.filter((i) => i.outcome === "PENDING").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const thisWeek = upcoming.filter((i) => i.startsAt >= today && i.startsAt < weekEnd);
    const offersOut = data.offers.filter((o) => o.status === "MADE");
    const chosen = data.vacancies.find((v) => v.id === one(sp.vacancy)) ?? open[0] ?? data.vacancies[0];

    return (
      <>
        <Stats label="Recruitment" className="mb-5" items={[
          { label: "Open vacancies", icon: Megaphone, value: open.length, sub: ((n) => `${n} post${n === 1 ? "" : "s"}`)(open.reduce((n, v) => n + v.openings, 0)) },
          { label: "Applications", icon: Inbox, value: applications, sub: `${newThisWeek} this week` },
          { label: "Interviews this week", icon: CalendarClock, value: thisWeek.length, sub: thisWeek.length ? [...new Set(thisWeek.map((i) => formatDate(i.startsAt, tz)))].slice(0, 2).join(" and ") : "None scheduled" },
          { label: "Offers out", icon: FileSignature, value: offersOut.length, sub: offersOut[0] ? `${offersOut[0].designation}${offersOut[0].respondBy ? ` · reply by ${formatDate(offersOut[0].respondBy, tz)}` : ""}` : "Waiting for nobody", tone: offersOut.length ? "warn" : undefined },
        ]} />
        <Split>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader title="Vacancies" icon={Briefcase} divided />
              {data.vacancies.length === 0 ? <Empty icon={Briefcase} title="No vacancies" body="Open a vacancy for a post, then add the applications you get." /> : (
                <ul className="space-y-1 p-2">
                  {data.vacancies.map((v) => {
                    const on = chosen?.id === v.id;
                    return (
                      <li key={v.id}>
                        <Link href={`${BASE}/recruitment?view=recruitment&vacancy=${v.id}`} scroll={false} aria-current={on ? "true" : undefined}
                          className={cx("flex items-center gap-3 rounded-xl border px-3 py-3 transition", on ? "border-brand/30 bg-brand/5" : "border-transparent hover:bg-sunken/60")}>
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Briefcase size={19} aria-hidden="true" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{v.designation} · {v.openings} <Words k="post" />{v.openings === 1 ? "" : "s"}</span>
                            <span className="block truncate text-[13px] text-ink3">{[v.details, v.closingDate ? `closes ${formatDate(v.closingDate, tz)}` : null].filter(Boolean).join(" · ") || "No closing date"}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <Pill tone={VACANCY_TONE[v.status]}>{label(VACANCY_STATUSES, v.status)}</Pill>
                            <span className="text-[12.5px] text-ink3 tnum">{v.applications.length} <Words k="applied" /></span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {chosen && <Applications v={chosen} />}
          </Col>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader title="Interview schedule" icon={CalendarClock} description="Interviewers are never double-booked" />
              {upcoming.length === 0 && offersOut.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No interviews scheduled and no offers waiting." /></p> : (
                <ol className="space-y-4 px-5 pb-5">
                  {upcoming.slice(0, 8).map((i) => (
                    <li key={i.id} className="flex gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok/10 text-ok"><Users size={17} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-snug">{i.application.name} · {i.application.vacancy.designation}</p>
                        <p className="text-[12.5px] text-ink3">{formatDateTime(i.startsAt, tz)} · {i.interviewerIds.map(nameOf).filter(Boolean).join(", ") || "Interviewers"}{i.place ? ` · ${i.place}` : ""}</p>
                        {canHr && <div className="mt-1.5"><OutcomeForm action={outcomeAction} interviewId={i.id} options={INTERVIEW_OUTCOMES.filter((o) => o.value !== "PENDING")} /></div>}
                      </div>
                    </li>
                  ))}
                  {offersOut.map((o) => (
                    <li key={o.id} className="flex gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warn/12 text-warn"><FileSignature size={17} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold leading-snug"><Words k="Offer to" /> {o.application.name} · {o.designation}{o.monthlyPaise !== null ? ` · ${formatRupees(o.monthlyPaise)} a month` : ""}</p>
                        <p className="text-[12.5px] text-ink3">{o.offerNo} <Words k="· joining" /> {formatDate(o.joiningDate, tz)}{o.respondBy ? ` · reply by ${formatDate(o.respondBy, tz)}` : ""}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <a className={buttonClass("secondary", "sm")} href={`${BASE}/recruitment/offers/${o.id}`} target="_blank" rel="noopener"><Words k="Offer letter" /></a>
                          {canHr && <StatusSelectForm trigger="Reply" title={`Offer ${o.offerNo}`} hidden={{ offerId: o.id }} options={OFFER_STATUSES.filter((s) => s.value !== "MADE")} current="ACCEPTED" action={offerStatusAction} />}
                          {canAdd && o.application.status !== "HIRED" && <ButtonLink size="sm" variant="primary" href={`${BASE}/add?application=${o.applicationId}`}><Words k="Add as staff" /></ButtonLink>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            {data.offers.some((o) => o.status !== "MADE") && (
              <Card className="overflow-hidden">
                <CardHeader title="Earlier offers" icon={FileSignature} />
                <ul className="divide-y divide-line">
                  {data.offers.filter((o) => o.status !== "MADE").slice(0, 10).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0"><span className="block truncate font-semibold">{o.application.name}</span><span className="block text-[12.5px] text-ink3">{o.designation} · {o.offerNo}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Pill tone={OFFER_TONE[o.status]}>{label(OFFER_STATUSES, o.status)}</Pill>
                        {canAdd && o.status === "ACCEPTED" && o.application.status !== "HIRED" && <ButtonLink size="sm" variant="primary" href={`${BASE}/add?application=${o.applicationId}`}><Words k="Add as staff" /></ButtonLink>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Col>
        </Split>
      </>
    );
  }

  function Applications({ v }: { v: VacancyWithApplications }) {
    return (
      <Card className="overflow-hidden">
        <CardHeader title={`Applications · ${v.designation}`} description={`${v.applications.length} received · ${label(VACANCY_STATUSES, v.status)}`} divided
          action={canHr ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {v.status === "OPEN" && <ApplicationForm action={applicationAction} vacancyId={v.id} vacancy={v.designation} />}
              <StatusSelectForm trigger="Vacancy status" title={`${v.designation} vacancy`} hidden={{ vacancyId: v.id }} options={VACANCY_STATUSES} current={v.status} action={vacancyStatusAction} />
            </div>
          ) : undefined} />
        {v.applications.length === 0 ? <p className="px-5 py-4 text-[14px] text-ink3"><Words k="No applications yet." /></p> : (
          <ul className="divide-y divide-line">
            {v.applications.map((a) => {
              const offer = a.offers[0];
              const closed = ["HIRED", "REJECTED", "WITHDRAWN"].includes(a.status);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Avatar name={a.name} photoFileId={null} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.name}</p>
                    <p className="truncate text-[12.5px] text-ink3">
                      {[a.experienceYears !== null ? (a.experienceYears === 0 ? "Fresher" : `${a.experienceYears} year${a.experienceYears === 1 ? "" : "s"}`) : null, a.qualification, a.interviews[0] ? `interview ${formatDateTime(a.interviews[0].startsAt, tz)}` : null, offer ? `offer ${offer.offerNo}: ${label(OFFER_STATUSES, offer.status).toLowerCase()}` : null].filter(Boolean).join(" · ") || <a href={`tel:+91${a.phone}`} className="hover:underline">{a.phone}</a>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Pill tone={APP_TONE[a.status]}>{label(APPLICATION_STATUSES, a.status)}</Pill>
                    {a.resumeFileId && <a href={`${BASE}/files/${a.resumeFileId}`} target="_blank" rel="noopener" className={buttonClass("ghost", "sm")}><Words k="Resume" /></a>}
                    {a.status === "HIRED" && a.hiredStaffId && <ButtonLink size="sm" href={`${BASE}/${a.hiredStaffId}`}><Words k="Profile" /></ButtonLink>}
                    {canHr && !closed && (
                      <>
                        <InterviewForm action={interviewAction} applicationId={a.id} name={a.name} staff={staffOptions} />
                        {(!offer || offer.status !== "MADE") && a.status !== "OFFERED" && <OfferForm action={offerAction} applicationId={a.id} name={a.name} designation={v.designation} designations={lists.designations} departments={lists.departments} />}
                        {canAdd && offer && (offer.status === "MADE" || offer.status === "ACCEPTED") && <ButtonLink size="sm" variant="primary" href={`${BASE}/add?application=${a.id}`}><Words k="Add as staff" /></ButtonLink>}
                        <StatusSelectForm trigger="Status" title={a.name} hidden={{ applicationId: a.id }} options={APPLICATION_STATUSES.filter((s) => s.value !== "HIRED")} current={a.status} action={applicationStatusAction} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  }

  async function Appraisal() {
    const data = await withSchool(current.ctx, async (tx) => {
      const cycles = await tx.appraisalCycle.findMany({ orderBy: { startDate: "desc" }, take: 10 });
      const cycle = cycles.find((c) => c.id === sp.cycle) ?? cycles[0];
      // One campus: the appraisals of their campus's staff, and the ones they review.
      const where = hr ? (viewer.campusId ? { OR: [staffIdOnCampus(viewer), { reviewerId: viewer.staffId ?? "00000000-0000-0000-0000-000000000000" }] } : {}) : { OR: [{ staffId: viewer.staffId ?? "" }, { reviewerId: viewer.staffId ?? "" }] };
      const appraisals = cycle ? await tx.appraisal.findMany({ where: { cycleId: cycle.id, ...where }, orderBy: { createdAt: "asc" } }) : [];
      const people = await tx.staff.findMany({ where: { id: { in: appraisals.flatMap((a) => [a.staffId, a.reviewerId].filter((x): x is string => Boolean(x))) } }, select: { id: true, fullName: true, designation: true, photoFileId: true } });
      return { cycles, cycle, appraisals, people };
    });
    type Row = (typeof data.appraisals)[number];
    const who = (id: string | null) => data.people.find((p) => p.id === id);
    const mine = data.appraisals.find((a) => a.staffId === viewer.staffId);
    const toReview = data.appraisals.filter((a) => a.staffId !== viewer.staffId && (a.reviewerId === viewer.staffId || (canHr && !a.reviewerId)) && a.status === "MANAGER_REVIEW");
    const count = (s: string) => data.appraisals.filter((a) => a.status === s).length;
    const done = count("DONE");
    const rated = data.appraisals.filter((a) => a.finalRating !== null);
    const avg = rated.length ? rated.reduce((n, a) => n + Number(a.finalRating), 0) / rated.length : null;
    const stage = (s: string, cls = "") => <Pill tone={s === "DONE" ? "ok" : s === "MANAGER_REVIEW" ? "info" : "warn"} className={cls}>{s === "SELF_REVIEW" ? "Self review" : s === "MANAGER_REVIEW" ? "Reviewer" : "Done"}</Pill>;
    const columns: DataColumn<Row>[] = [
      { key: "who", label: "Staff member", render: (a) => (
        <div className="flex items-center gap-3"><Avatar name={who(a.staffId)?.fullName ?? "Staff"} photoFileId={who(a.staffId)?.photoFileId ?? null} size={34} />
          <div className="min-w-0"><p className="font-semibold leading-tight">{who(a.staffId)?.fullName ?? "Staff"}</p><p className="text-[12.5px] text-ink3">{who(a.staffId)?.designation}</p></div></div>
      ) },
      { key: "reviewer", label: "Reviewer", render: (a) => who(a.reviewerId)?.fullName ?? "HR" },
      { key: "stage", label: "Stage", render: (a) => stage(a.status) },
      { key: "rating", label: "Rating", align: "right", render: (a) => a.finalRating !== null ? <span className="font-semibold tnum">{Number(a.finalRating).toFixed(1)}<span className="font-normal text-ink3"> <Words k="of 5" /></span></span> : <span className="text-ink3">–</span> },
    ];

    return (
      <div className="space-y-5">
        {!data.cycle ? (
          <Card><Empty icon={ClipboardCheck} title="No appraisal yet" body={canHr ? "Start an appraisal cycle: every staff member fills a self review, then their reviewer rates them." : "HR has not started an appraisal yet."} /></Card>
        ) : (
          <>
            {data.cycles.length > 1 && <SubNav current={data.cycle.id} items={data.cycles.map((c) => ({ key: c.id, label: c.name, href: `${BASE}/recruitment?view=appraisal&cycle=${c.id}` }))} />}
            {hr && (
              <Stats label="Appraisal" items={[
                { label: "In this cycle", icon: Users, value: data.appraisals.length, sub: `${formatDate(data.cycle.startDate, tz)} to ${formatDate(data.cycle.endDate, tz)}` },
                { label: "Self review", icon: ClipboardCheck, value: count("SELF_REVIEW"), sub: "waiting for the staff member", tone: count("SELF_REVIEW") ? "warn" : undefined },
                { label: "With the reviewer", icon: Star, value: count("MANAGER_REVIEW"), sub: "waiting for a rating" },
                { label: "Done", icon: Award, value: `${done} of ${data.appraisals.length}`, sub: avg !== null ? `average ${avg.toFixed(1)} of 5` : "No ratings yet", tone: done && done === data.appraisals.length ? "ok" : undefined },
              ]} />
            )}
            <Split>
              <Col>
                {(mine || toReview.length > 0) && (
                  <Card className="overflow-hidden">
                    <CardHeader title={data.cycle.name} icon={ClipboardCheck} description={`${data.cycle.status === "OPEN" ? "Open" : "Closed"} · ${formatDate(data.cycle.startDate, tz)} to ${formatDate(data.cycle.endDate, tz)}`} divided />
                    <ul className="divide-y divide-line">
                      {mine && (
                        <li className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold"><Words k="My appraisal" /></p>
                            <p className="text-[13px] text-ink3">{mine.status === "SELF_REVIEW" ? "Your self review is next." : mine.status === "MANAGER_REVIEW" ? `Waiting for ${who(mine.reviewerId)?.fullName ?? "HR"} to review.` : `Final rating ${Number(mine.finalRating).toFixed(1)} of 5.`}</p>
                            {mine.status === "DONE" && mine.managerComment && <p className="mt-1 text-[13.5px] text-ink2">“{mine.managerComment}”</p>}
                          </div>
                          {stage(mine.status)}
                          {mine.status === "SELF_REVIEW" && data.cycle.status === "OPEN" && <ReviewForm action={reviewAction} appraisalId={mine.id} by="self" name="" criteria={data.cycle.criteria} />}
                        </li>
                      )}
                      {toReview.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <Avatar name={who(a.staffId)?.fullName ?? "Staff"} photoFileId={who(a.staffId)?.photoFileId ?? null} size={38} />
                          <div className="min-w-0 flex-1"><p className="font-semibold">{who(a.staffId)?.fullName}</p><p className="text-[13px] text-ink3">{who(a.staffId)?.designation} <Words k="· waiting for your review" /></p></div>
                          {data.cycle!.status === "OPEN" && <ReviewForm action={reviewAction} appraisalId={a.id} by="manager" name={who(a.staffId)?.fullName ?? ""} criteria={data.cycle!.criteria} earlier={a.selfRatings as Record<string, number>} />}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {hr && (
                  <Card className="overflow-hidden">
                    <CardHeader title="Every staff member" description={`${done} of ${data.appraisals.length} done`} divided
                      action={canHr && data.cycle.status === "OPEN" ? <CloseCycleButton action={closeCycleAction} cycleId={data.cycle.id} /> : undefined} />
                    <DataList caption="Every staff member's appraisal" rows={data.appraisals} columns={columns} rowKey={(a) => a.id} minWidth={640}
                      rowHref={(a) => `${BASE}/${a.staffId}?tab=performance`} rowLabel={(a) => `Open ${who(a.staffId)?.fullName ?? "staff member"}`}
                      mobile={(a) => ({ title: who(a.staffId)?.fullName ?? "Staff", avatar: who(a.staffId)?.fullName ?? "Staff", sub: `Reviewer: ${who(a.reviewerId)?.fullName ?? "HR"}${a.finalRating !== null ? ` · ${Number(a.finalRating).toFixed(1)} of 5` : ""}`, pills: [<span key="s" className="contents">{stage(a.status, cardPill)}</span>] })}
                      empty={<Empty icon={Users} title="Nobody in this cycle" />} />
                  </Card>
                )}
                {!hr && !mine && toReview.length === 0 && <Card><Empty icon={ClipboardCheck} title="Nothing for you in this cycle" body="Your appraisal and the reviews you give show here." /></Card>}
              </Col>
              <Col>
                <Card>
                  <CardHeader title="What is rated" icon={Star} description="Each point from 1 to 5, by the staff member and then the reviewer" />
                  <ul className="space-y-2 px-5 pb-5">
                    {data.cycle.criteria.map((c) => <li key={c} className="flex items-center gap-2 text-[14px]"><Star size={15} className="text-ink3" aria-hidden="true" />{c}</li>)}
                  </ul>
                </Card>
              </Col>
            </Split>
          </>
        )}
      </div>
    );
  }

  async function Training() {
    const rows = await withSchool(current.ctx, (tx) => tx.trainingRecord.findMany({ where: { archivedAt: null, ...staffIdOnCampus(viewer) }, orderBy: { fromDate: "desc" }, take: 200 }));
    type Row = (typeof rows)[number];
    const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
    const people = new Set(rows.map((r) => r.staffId)).size;
    const yearAgo = addDays(today, -365);
    const lastYear = rows.filter((r) => r.fromDate >= yearAgo);
    const columns: DataColumn<Row>[] = [
      { key: "who", label: "Staff member", render: (t) => <div className="flex items-center gap-3"><Avatar name={nameOf(t.staffId) || "Staff"} photoFileId={photoOf(t.staffId)} size={34} /><span className="font-semibold">{nameOf(t.staffId) || "Staff"}</span></div> },
      { key: "course", label: "Course", render: (t) => <><p className="leading-tight">{t.course}</p>{t.provider && <p className="text-[12.5px] text-ink3">{t.provider}</p>}</> },
      { key: "dates", label: "Dates", nowrap: true, render: (t) => <span className="tnum">{formatDate(t.fromDate, tz)}</span> },
      { key: "hours", label: "Hours", align: "right", render: (t) => <span className="font-semibold tnum">{Number(t.hours)}</span> },
      { key: "cert", label: <span className="sr-only"><Words k="Certificate" /></span>, align: "right", render: (t) => t.certificateFileId ? <a href={`${BASE}/files/${t.certificateFileId}`} target="_blank" rel="noopener" className={cx(buttonClass("ghost", "sm"), "relative z-[1]")}><Words k="Certificate" /></a> : null },
    ];
    return (
      <>
        <Stats label="Training" className="mb-5" items={[
          { label: "Courses", icon: GraduationCap, value: rows.length, sub: `${lastYear.length} in the last year` },
          { label: "Hours", icon: CalendarClock, value: totalHours, sub: people ? `${(totalHours / people).toFixed(1)} a person` : "None yet" },
          { label: "Staff trained", icon: Users, value: people, sub: `of ${lists.staff.length} on roll` },
        ]} />
        <Card className="overflow-hidden">
          <CardHeader title="Training records" icon={GraduationCap} divided />
          <DataList caption="Training records" rows={rows} columns={columns} rowKey={(t) => t.id} minWidth={720}
            rowHref={(t) => `${BASE}/${t.staffId}?tab=performance`} rowLabel={(t) => `Open ${nameOf(t.staffId) || "staff member"}`}
            mobile={(t) => ({ title: nameOf(t.staffId) || "Staff", avatar: nameOf(t.staffId) || "Staff", sub: `${t.course} · ${formatDate(t.fromDate, tz)}`, right: <span className="font-semibold tnum">{Number(t.hours)} h</span> })}
            empty={<Empty icon={GraduationCap} title="No training yet" body="Record courses and workshops staff attend, with hours and certificates." />} />
        </Card>
      </>
    );
  }

  async function Promotions() {
    const rows = await withSchool(current.ctx, (tx) => tx.promotionRecord.findMany({ where: staffIdOnCampus(viewer), orderBy: { effectiveFrom: "desc" }, take: 200 }));
    return (
      <Card className="overflow-hidden">
        <CardHeader title="Promotions" icon={TrendingUp} description="A promotion changes the designation from a date; salary changes go to Salary Structures" divided />
        {rows.length === 0 ? <Empty icon={TrendingUp} title="No promotions yet" body="A promotion changes the designation from a date and is kept in the staff member's history." /> : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={nameOf(p.staffId) || "Staff"} photoFileId={photoOf(p.staffId)} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold"><Link href={`${BASE}/${p.staffId}`} className="hover:underline">{nameOf(p.staffId) || "Staff"}</Link></p>
                  <p className="text-[13px] text-ink3">{p.fromDesignation} → <span className="font-semibold text-ink">{p.toDesignation}</span> · {p.reason}</p>
                </div>
                <span className="shrink-0 text-[13px] text-ink3 tnum"><Words k="from" /> {formatDate(p.effectiveFrom, tz)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
}
