import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { staffPage, BASE } from "@/lib/staff/page";
import { APPLICATION_STATUSES, INTERVIEW_OUTCOMES, label, OFFER_STATUSES, VACANCY_STATUSES } from "@/lib/staff/talent";
import { isoDay } from "@/lib/staff/dates";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SubNav } from "../_components/bits";
import {
  ApplicationForm, CloseCycleButton, CycleForm, InterviewForm, OfferForm, OutcomeForm, PromotionForm, ReviewForm, StatusSelectForm, TrainingForm, VacancyForm,
} from "./talent-forms";
import {
  applicationAction, applicationStatusAction, closeCycleAction, cycleAction, interviewAction, offerAction, offerStatusAction, outcomeAction, promotionAction, reviewAction, trainingAction, vacancyAction, vacancyStatusAction,
} from "./actions";

export const metadata: Metadata = { title: "Recruitment & Appraisal" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const APP_TONE: Record<string, BadgeTone> = { NEW: "brand", SHORTLISTED: "brand", INTERVIEW: "warning", OFFERED: "warning", HIRED: "success", REJECTED: "neutral", WITHDRAWN: "neutral" };

export default async function RecruitmentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, features, tz, today } = await staffPage();
  const hr = viewer.see === "all";
  const canHr = viewer.change === "all";
  const views = [
    ...(hr && features.has("hr-recruitment") ? [{ key: "vacancies", label: "Vacancies" }, { key: "interviews", label: "Interviews" }, { key: "offers", label: "Offers" }] : []),
    ...(features.has("hr-appraisal") ? [{ key: "appraisal", label: "Appraisal" }] : []),
    ...(hr && features.has("hr-training") ? [{ key: "training", label: "Training" }] : []),
    ...(hr && features.has("hr-promotions") ? [{ key: "promotions", label: "Promotions" }] : []),
  ].map((v) => ({ ...v, href: `${BASE}/recruitment?view=${v.key}` }));
  if (views.length === 0) redirect(hr ? `${BASE}/settings?view=features` : viewer.staffId ? `${BASE}/${viewer.staffId}` : `${BASE}/leave`);
  const view = views.find((v) => v.key === sp.view)?.key ?? views[0].key;

  const lists = await withSchool(current.ctx, async (tx) => {
    const [designations, departments, staff] = await Promise.all([
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      hr ? tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }) : [],
    ]);
    return { designations: designations.map((d) => ({ value: d.name, label: d.name })), departments: departments.map((d) => ({ value: d.id, label: d.name })), staff };
  });
  const staffOptions = lists.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.designation})` }));
  const nameOf = (id: string | null) => lists.staff.find((s) => s.id === id)?.fullName ?? "";

  return (
    <>
      <PageHeader title="Recruitment & Appraisal" href={`${BASE}/recruitment`} userId={current.user.id} />
      {views.length > 1 && <SubNav current={view} items={views} />}
      {view === "vacancies" && <Vacancies />}
      {view === "interviews" && <Interviews />}
      {view === "offers" && <Offers />}
      {view === "appraisal" && <Appraisal />}
      {view === "training" && <Training />}
      {view === "promotions" && <Promotions />}
    </>
  );

  async function Vacancies() {
    const vacancies = await withSchool(current.ctx, (tx) => tx.vacancy.findMany({
      where: { archivedAt: null }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50,
      include: { applications: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, include: { offers: { orderBy: { createdAt: "desc" }, take: 1 }, interviews: { orderBy: { startsAt: "desc" }, take: 1 } } } },
    }));
    return (
      <div className="space-y-4">
        {canHr && <div className="flex justify-end"><VacancyForm action={vacancyAction} designations={lists.designations} departments={lists.departments} /></div>}
        {vacancies.length === 0 ? <EmptyState title="No vacancies">Open a vacancy for a post, then add the applications you get.</EmptyState> : vacancies.map((v) => (
          <Card key={v.id}>
            <CardHeader title={`${v.designation}${v.openings > 1 ? ` (${v.openings} posts)` : ""}`}
              description={`${label(VACANCY_STATUSES, v.status)} · ${v.applications.length} application${v.applications.length === 1 ? "" : "s"}${v.closingDate ? ` · apply by ${formatDate(v.closingDate, tz)}` : ""}`}
              action={canHr ? (
                <div className="flex flex-wrap gap-2">
                  {v.status === "OPEN" && <ApplicationForm action={applicationAction} vacancyId={v.id} vacancy={v.designation} />}
                  <StatusSelectForm trigger="Status" title={`${v.designation} vacancy`} hidden={{ vacancyId: v.id }} options={VACANCY_STATUSES} current={v.status} action={vacancyStatusAction} />
                </div>
              ) : undefined} />
            <CardBody>
              {v.details && <p className="mb-3 text-sm text-ink-2">{v.details}</p>}
              {v.applications.length === 0 ? <p className="text-ink-2">No applications yet.</p> : (
                <ul className="divide-y divide-line">
                  {v.applications.map((a) => {
                    const offer = a.offers[0];
                    const closed = ["HIRED", "REJECTED", "WITHDRAWN"].includes(a.status);
                    return (
                      <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-medium">{a.name} <span className="font-normal text-ink-2">· <a href={`tel:+91${a.phone}`} className="hover:underline">{a.phone}</a></span></p>
                          <p className="text-sm text-ink-2">{[a.qualification, a.experienceYears !== null ? `${a.experienceYears} years` : null].filter(Boolean).join(" · ")}</p>
                          {a.interviews[0] && <p className="text-sm text-ink-2">Interview {formatDateTime(a.interviews[0].startsAt, tz)}: {label(INTERVIEW_OUTCOMES, a.interviews[0].outcome)}</p>}
                          {offer && <p className="text-sm text-ink-2">Offer {offer.offerNo}: {label(OFFER_STATUSES, offer.status)}</p>}
                          {a.resumeFileId && <a href={`${BASE}/files/${a.resumeFileId}`} target="_blank" rel="noopener" className="text-sm text-brand-text underline">Resume</a>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={APP_TONE[a.status]}>{label(APPLICATION_STATUSES, a.status)}</Badge>
                          {a.status === "HIRED" && a.hiredStaffId && <Link href={`${BASE}/${a.hiredStaffId}`} className="text-brand-text underline">Profile</Link>}
                          {canHr && !closed && (
                            <>
                              <InterviewForm action={interviewAction} applicationId={a.id} name={a.name} staff={staffOptions} />
                              {(!offer || offer.status !== "MADE") && a.status !== "OFFERED" && <OfferForm action={offerAction} applicationId={a.id} name={a.name} designation={v.designation} designations={lists.designations} departments={lists.departments} />}
                              {offer && (offer.status === "MADE" || offer.status === "ACCEPTED") && <ButtonLink size="sm" variant="primary" href={`${BASE}/add?application=${a.id}`}>Add as staff</ButtonLink>}
                              <StatusSelectForm trigger="Status" title={a.name} hidden={{ applicationId: a.id }} options={APPLICATION_STATUSES.filter((s) => s.value !== "HIRED")} current={a.status} action={applicationStatusAction} />
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  async function Interviews() {
    const rows = await withSchool(current.ctx, (tx) => tx.interview.findMany({ orderBy: { startsAt: "desc" }, take: 100, include: { application: { include: { vacancy: true } } } }));
    if (rows.length === 0) return <EmptyState title="No interviews">Schedule interviews from an application under Vacancies.</EmptyState>;
    return (
      <Card>
        <CardHeader title="Interviews" />
        <CardBody>
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{i.application.name} <span className="font-normal text-ink-2">· {i.application.vacancy.designation}</span></p>
                  <p className="text-sm text-ink-2">{formatDateTime(i.startsAt, tz)} · {i.minutes} minutes{i.place ? ` · ${i.place}` : ""}</p>
                  <p className="text-sm text-ink-2">With {i.interviewerIds.map(nameOf).filter(Boolean).join(", ")}</p>
                  {i.notes && <p className="text-sm">{i.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={i.outcome === "PASSED" ? "success" : i.outcome === "PENDING" ? "warning" : "neutral"}>{label(INTERVIEW_OUTCOMES, i.outcome)}</Badge>
                  {canHr && i.outcome === "PENDING" && <OutcomeForm action={outcomeAction} interviewId={i.id} options={INTERVIEW_OUTCOMES.filter((o) => o.value !== "PENDING")} />}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    );
  }

  async function Offers() {
    const rows = await withSchool(current.ctx, (tx) => tx.offer.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { application: true } }));
    if (rows.length === 0) return <EmptyState title="No offers">Make an offer from an application under Vacancies.</EmptyState>;
    return (
      <Card>
        <CardHeader title="Offers" />
        <CardBody>
          <ul className="divide-y divide-line">
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{o.application.name} <span className="font-normal text-ink-2">· {o.designation}</span></p>
                  <p className="text-sm text-ink-2">{o.offerNo} · joining {formatDate(o.joiningDate, tz)}{o.monthlyPaise !== null ? ` · ${formatRupees(o.monthlyPaise)} a month` : ""}{o.respondBy ? ` · reply by ${formatDate(o.respondBy, tz)}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={o.status === "ACCEPTED" ? "success" : o.status === "MADE" ? "warning" : "neutral"}>{label(OFFER_STATUSES, o.status)}</Badge>
                  <a className={buttonClass("secondary", "sm")} href={`${BASE}/recruitment/offers/${o.id}`} target="_blank" rel="noopener">Offer letter</a>
                  {canHr && o.status === "MADE" && <StatusSelectForm trigger="Reply" title={`Offer ${o.offerNo}`} hidden={{ offerId: o.id }} options={OFFER_STATUSES.filter((s) => s.value !== "MADE")} current="ACCEPTED" action={offerStatusAction} />}
                  {canHr && (o.status === "ACCEPTED" || o.status === "MADE") && o.application.status !== "HIRED" && <ButtonLink size="sm" variant="primary" href={`${BASE}/add?application=${o.applicationId}`}>Add as staff</ButtonLink>}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    );
  }

  async function Appraisal() {
    const data = await withSchool(current.ctx, async (tx) => {
      const cycles = await tx.appraisalCycle.findMany({ orderBy: { startDate: "desc" }, take: 10 });
      const cycle = cycles.find((c) => c.id === sp.cycle) ?? cycles[0];
      const where = hr ? {} : { OR: [{ staffId: viewer.staffId ?? "" }, { reviewerId: viewer.staffId ?? "" }] };
      const appraisals = cycle ? await tx.appraisal.findMany({ where: { cycleId: cycle.id, ...where }, orderBy: { createdAt: "asc" } }) : [];
      const people = await tx.staff.findMany({ where: { id: { in: appraisals.flatMap((a) => [a.staffId, a.reviewerId].filter((x): x is string => Boolean(x))) } }, select: { id: true, fullName: true, designation: true } });
      const years = canHr ? await tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" } }) : [];
      return { cycles, cycle, appraisals, people, years };
    });
    const who = (id: string | null) => data.people.find((p) => p.id === id);
    const mine = data.appraisals.find((a) => a.staffId === viewer.staffId);
    const toReview = data.appraisals.filter((a) => a.staffId !== viewer.staffId && (a.reviewerId === viewer.staffId || (canHr && !a.reviewerId)) && a.status === "MANAGER_REVIEW");
    const done = data.appraisals.filter((a) => a.status === "DONE").length;
    return (
      <div className="space-y-5">
        {canHr && <div className="flex justify-end"><CycleForm action={cycleAction} years={data.years.map((y) => ({ value: y.id, label: y.name }))} today={isoDay(today)} /></div>}
        {!data.cycle ? <EmptyState title="No appraisal yet">{canHr ? "Start an appraisal cycle: every staff member fills a self review, then their reviewer rates them." : "HR has not started an appraisal yet."}</EmptyState> : (
          <>
            {data.cycles.length > 1 && (
              <nav aria-label="Cycles" className="flex flex-wrap gap-2">
                {data.cycles.map((c) => <Link key={c.id} href={`${BASE}/recruitment?view=appraisal&cycle=${c.id}`} aria-current={c.id === data.cycle!.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 ${c.id === data.cycle!.id ? "border-brand bg-brand-soft text-brand-text" : "border-line text-ink-2"}`}>{c.name}</Link>)}
              </nav>
            )}
            <Card>
              <CardHeader title={data.cycle.name} description={`${formatDate(data.cycle.startDate, tz)} to ${formatDate(data.cycle.endDate, tz)} · ${data.cycle.status === "OPEN" ? "Open" : "Closed"}${hr ? ` · ${done} of ${data.appraisals.length} done` : ""}`}
                action={canHr && data.cycle.status === "OPEN" ? <CloseCycleButton action={closeCycleAction} cycleId={data.cycle.id} /> : undefined} />
              <CardBody className="space-y-4">
                {mine && (
                  <div className="rounded-xl border border-line p-3">
                    <p className="font-medium">My appraisal</p>
                    <p className="text-sm text-ink-2">{mine.status === "SELF_REVIEW" ? "Your self review is next." : mine.status === "MANAGER_REVIEW" ? `Waiting for ${who(mine.reviewerId)?.fullName ?? "HR"} to review.` : `Final rating ${Number(mine.finalRating).toFixed(1)} of 5.`}</p>
                    {mine.status === "SELF_REVIEW" && data.cycle.status === "OPEN" && <div className="mt-2"><ReviewForm action={reviewAction} appraisalId={mine.id} by="self" name="" criteria={data.cycle.criteria} /></div>}
                    {mine.status === "DONE" && mine.managerComment && <p className="mt-1 text-sm">{mine.managerComment}</p>}
                  </div>
                )}
                {toReview.length > 0 && (
                  <div>
                    <p className="mb-2 font-medium">Waiting for your review</p>
                    <ul className="divide-y divide-line">
                      {toReview.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span>{who(a.staffId)?.fullName} <span className="text-ink-2">· {who(a.staffId)?.designation}</span></span>
                          {data.cycle!.status === "OPEN" && <ReviewForm action={reviewAction} appraisalId={a.id} by="manager" name={who(a.staffId)?.fullName ?? ""} criteria={data.cycle!.criteria} earlier={a.selfRatings as Record<string, number>} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hr && (
                  <div className="relative overflow-x-auto [contain:inline-size]">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <caption className="sr-only">Every staff member&apos;s appraisal</caption>
                      <thead><tr className="border-b border-line"><th scope="col" className="p-2">Staff</th><th scope="col" className="p-2">Reviewer</th><th scope="col" className="p-2">Status</th><th scope="col" className="p-2">Rating</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {data.appraisals.map((a) => (
                          <tr key={a.id}>
                            <th scope="row" className="p-2 font-medium">{who(a.staffId)?.fullName}</th>
                            <td className="p-2">{who(a.reviewerId)?.fullName ?? "HR"}</td>
                            <td className="p-2">{a.status === "SELF_REVIEW" ? "Self review" : a.status === "MANAGER_REVIEW" ? "Reviewer" : "Done"}</td>
                            <td className="p-2">{a.finalRating !== null ? Number(a.finalRating).toFixed(1) : "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    );
  }

  async function Training() {
    const rows = await withSchool(current.ctx, (tx) => tx.trainingRecord.findMany({ where: { archivedAt: null }, orderBy: { fromDate: "desc" }, take: 200 }));
    const totalHours = rows.reduce((s, r) => s + Number(r.hours), 0);
    return (
      <div className="space-y-4">
        {canHr && <div className="flex justify-end"><TrainingForm action={trainingAction} staff={staffOptions} today={isoDay(today)} /></div>}
        {rows.length === 0 ? <EmptyState title="No training yet">Record courses and workshops staff attend, with hours and certificates.</EmptyState> : (
          <Card>
            <CardHeader title="Training" description={`${rows.length} courses · ${totalHours} hours`} />
            <CardBody>
              <ul className="divide-y divide-line">
                {rows.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{nameOf(t.staffId) || "Staff"}</span> · {t.course}{t.provider ? ` (${t.provider})` : ""}</span>
                    <span className="text-sm text-ink-2">{formatDate(t.fromDate, tz)} · {Number(t.hours)} hours {t.certificateFileId && <a href={`${BASE}/files/${t.certificateFileId}`} target="_blank" rel="noopener" className="text-brand-text underline">Certificate</a>}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  async function Promotions() {
    const rows = await withSchool(current.ctx, (tx) => tx.promotionRecord.findMany({ orderBy: { effectiveFrom: "desc" }, take: 200 }));
    return (
      <div className="space-y-4">
        {canHr && <div className="flex justify-end"><PromotionForm action={promotionAction} staff={staffOptions} designations={lists.designations} departments={lists.departments} today={isoDay(today)} /></div>}
        {rows.length === 0 ? <EmptyState title="No promotions yet">A promotion changes the designation from a date and is kept in the staff member&apos;s history.</EmptyState> : (
          <Card>
            <CardHeader title="Promotions" />
            <CardBody>
              <ul className="divide-y divide-line">
                {rows.map((p) => (
                  <li key={p.id} className="py-2">
                    <span className="font-medium">{nameOf(p.staffId) || "Staff"}</span>: {p.fromDesignation} → {p.toDesignation} <span className="text-sm text-ink-2">from {formatDate(p.effectiveFrom, tz)} · {p.reason}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }
}
