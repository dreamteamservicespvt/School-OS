import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, History, ListChecks, Undo2, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Pill } from "@/components/ui/badge";
import { Banner, Empty, Row } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { promotionPreview, type Preview } from "@/lib/students/promotion";
import { seesStudentFees } from "@/lib/fees/access";
import { seesResults } from "@/lib/exams/scope";
import { RESULT_LABEL } from "@/lib/students/labels";
import { StudentProblem } from "@/lib/students/students";
import { BASE, studentPage } from "../_lib/page";
import { campusPrefixes, classOptions, sectionOptions } from "../_lib/queries";
import { campusAllows, sectionCampusId } from "@/lib/campus";
import { StudentsHead } from "../_lib/head";
import { PromotionReview, type ReviewRow } from "./review";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Promotion") };
}

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));

/** Promotion (03 §2): choose, review the batch, confirm. Past batches below with who confirmed them. */
export default async function PromotionPage({ searchParams }: { searchParams: Promise<{ fromYear?: string; from?: string; toYear?: string; toClass?: string }> }) {
  const { current, year, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;
  // Fee amounts only for people allowed to see fees; the "no fee dues" rule applies either way.
  const seeFees = seesStudentFees(current);
  // Marks and results only for people who see results (not Office Staff, who have datesheets and admit cards only); the pass rule applies either way.
  const seeResults = seesResults(current);

  const data = await withSchool(current.ctx, async (tx) => {
    // One campus: that campus's years and classes only. Two campuses: each year is named with its campus.
    const rawYears = await tx.academicYear.findMany({ where: { archivedAt: null, ...(current.campusId ? { campusId: current.campusId } : {}) }, orderBy: { startDate: "asc" } });
    const prefix = await campusPrefixes(tx, rawYears.map((y) => y.campusId));
    const years = rawYears.map((y) => ({ ...y, name: `${prefix.get(y.campusId) ?? ""}${y.name}` }));
    const fromYear = years.find((y) => y.id === sp.fromYear && y.status !== "CLOSED") ?? (year && year.status !== "CLOSED" ? year : years.find((y) => y.status !== "CLOSED")) ?? null;
    const sections = await sectionOptions(tx, current, fromYear?.id);
    const classes = await classOptions(tx, current);
    let preview: Preview | null = null;
    let error: { message: string; field?: string } | null = null;
    if (isId(sp.from) && !campusAllows(current, await sectionCampusId(tx, sp.from!))) error = { message: "Choose the class and section to promote.", field: "fromSectionId" };
    else if (isId(sp.from)) {
      try {
        preview = await promotionPreview(tx, current.ctx, { fromSectionId: sp.from!, toYearId: isId(sp.toYear) ? sp.toYear : null, toClassId: isId(sp.toClass) ? sp.toClass : null }, { feeAmounts: seeFees });
      } catch (e) {
        if (e instanceof StudentProblem) error = { message: e.message, field: e.field };
        else throw e;
      }
    }
    const batches = await tx.promotionBatch.findMany({ where: current.campusId ? { fromYearId: { in: rawYears.map((y) => y.id) } } : {}, orderBy: { confirmedAt: "desc" }, take: 30 });
    const sectionIds = batches.map((b) => b.fromSectionId);
    const batchSections = await tx.section.findMany({ where: { id: { in: sectionIds } }, include: { schoolClass: true, academicYear: true } });
    const people = await tx.userLogin.findMany({ where: { id: { in: batches.map((b) => b.confirmedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { years, fromYear, sections, classes, preview, error, batches, batchSections, people };
  });

  const p = data.preview;
  const laterYears = data.years.filter((y) => y.status !== "CLOSED" && data.fromYear && y.startDate > data.fromYear.startDate);
  const rows: ReviewRow[] = (p?.rows ?? []).map((r) => ({
    studentId: r.studentId, fullName: r.fullName, admissionNo: r.admissionNo, rollNo: r.rollNo, suggested: r.suggested, why: r.why,
    result: !seeResults ? null : r.facts.resultText ?? (r.facts.result ? RESULT_LABEL[r.facts.result] : null),
    attendance: r.facts.attendancePct != null ? `${Math.round(r.facts.attendancePct)}%` : null,
    feeDue: seeFees && r.facts.feeDuePaise ? formatRupees(r.facts.feeDuePaise) : null,
    alreadyIn: r.alreadyIn,
  }));

  const step = p ? 2 : 1;
  const nextYear = laterYears[0] ?? null;
  const steps = [
    { n: 1, title: "Choose", sub: "Class and target" },
    { n: 2, title: "Review the batch", sub: p ? `${rows.length} students` : "Check each student" },
    { n: 3, title: "Confirm", sub: "Save the batch" },
  ];

  return (
    <>
      <StudentsHead page="Promotion" href={`${BASE}/promotion`} sub="Move a whole class to the next class at year end, after checking results and the list." />
      <div className="flex flex-col gap-5">
        {nextYear && (
          <Banner tone="info" icon={CalendarDays} title={`${nextYear.name} is being prepared.`}>
            <Words k="The list uses the published final results, and the attendance and fees recorded so far, and updates by itself. Saved batches move students into" /> {nextYear.name}.
          </Banner>
        )}
        <Card className="p-2.5 md:p-3">
          <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
            {steps.map((x) => (
              <li key={x.n} aria-current={x.n === step ? "step" : undefined} className={cx("flex items-center gap-3 rounded-xl px-2.5 md:px-3.5 py-2.5 min-w-0", x.n === step && "bg-brand/10")}>
                <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold tnum", x.n < step ? "bg-ok text-white" : x.n === step ? "bg-brand text-brandink" : "bg-sunken text-ink2")}>{x.n < step ? <Check size={15} aria-hidden="true" /> : x.n}</span>
                <span className="min-w-0 hidden sm:block"><b className="block text-[14px] font-semibold truncate">{x.title}</b><span className="block text-[12.5px] text-ink3 truncate">{x.sub}</span></span>
                <span className="sm:hidden text-[13px] font-semibold truncate">{x.title}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Choose the class" description="Default target: the next class, same section name, next year" icon={ListChecks} />
          {!data.fromYear ? (
            <Empty icon={CalendarDays} title="No open academic year" body="Open an academic year in Academic Management, then return." action={<ButtonLink href="/academic-management"><Words k="Open Academic Management" /></ButtonLink>} />
          ) : (
            <form method="get">
              <div className="grid gap-4 px-5 pb-5 md:grid-cols-[1fr_auto_1fr] md:items-start">
                <fieldset className="rounded-xl border border-line p-4 grid gap-3">
                  <legend className="eyebrow text-ink3 px-1"><Words k="From" /></legend>
                  <SelectField name="fromYear" label="Year" required defaultValue={data.fromYear.id}
                    options={data.years.filter((y) => y.status !== "CLOSED").map((y) => ({ value: y.id, label: y.name }))} />
                  <SelectField name="from" label="Class and section" required defaultValue={p?.from.id ?? sp.from ?? ""} placeholder="Choose…"
                    error={data.error?.field === "fromSectionId" ? data.error.message : undefined}
                    options={data.sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled} students)` }))} />
                </fieldset>
                <span className="hidden md:grid size-10 place-items-center rounded-full bg-sunken text-ink3 self-center" aria-hidden="true"><ArrowRight size={18} /></span>
                <fieldset className="rounded-xl border border-line p-4 grid gap-3">
                  <legend className="eyebrow text-ink3 px-1"><Words k="To" /></legend>
                  <SelectField name="toYear" label="Year" defaultValue={p?.toYear.id ?? sp.toYear ?? ""} placeholder="Next year"
                    error={data.error?.field === "toYearId" ? data.error.message : undefined}
                    options={laterYears.map((y) => ({ value: y.id, label: y.name }))} />
                  <SelectField name="toClass" label="Class" defaultValue={sp.toClass ?? ""} placeholder="Next class" options={data.classes} />
                  <p className="text-[12.5px] text-ink3 -mt-1"><Words k="Students can be split across sections in the next step" /></p>
                </fieldset>
              </div>
              {data.error && !data.error.field && <div className="px-5 pb-4"><Alert tone="danger">{data.error.message}</Alert></div>}
              {data.error?.field === "toYearId" && (
                <div className="px-5 pb-4"><Alert tone="warning" action={<Link className="font-medium underline" href="/academic-management"><Words k="Open Academic Management" /></Link>}>{data.error.message}</Alert></div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
                <p className="text-[14px] text-ink2">{p ? <><b className="font-semibold text-ink">{rows.length} <Words k="students" /></b> <Words k="in" /> {p.from.label} <Words k="· moving to" /> {p.finalClass ? "the next step (final class)" : `${p.toClass?.name ?? ""} (${p.toYear.name})`}</> : "Pick the class to promote"}</p>
                <Button type="submit" variant={p ? "secondary" : "primary"}>{p ? "Show again" : "Show the students"}<ArrowRight size={17} aria-hidden="true" /></Button>
              </div>
            </form>
          )}
        </Card>

        {p && (
          <Card>
            <CardHeader title={`Review ${p.from.label} (${p.from.year.name})`} icon={Users}
              description={p.finalClass
                ? `${p.from.className} is the final class. Students can be detained or marked Leaving (graduating).`
                : `Moving to ${p.toClass?.name ?? ""} in ${p.toYear.name}. Rules: ${p.rules.passRequired ? "pass required" : "pass not required"}${p.rules.minAttendancePct != null ? `, at least ${p.rules.minAttendancePct}% attendance` : ""}${p.rules.feeDuesAllowed ? ", fee dues shown as a warning only" : ", no fee dues allowed"}${p.policyVersion ? ` (promotion policy version ${p.policyVersion})` : ""}.`} />
            <div className="px-5 pb-5">
              {rows.length > 0 && !p.finalClass && p.resultsPublished < rows.length && (
                <Alert tone="warning" className="mb-4" action={<Link className="font-medium underline" href="/examination-results/results"><Words k="Open Results" /></Link>}>
                  {p.resultsPublished === 0
                    ? `Final results for ${p.from.className} are not published yet. Until they are, the suggestions use only attendance and fees. Publish the final results first.`
                    : `Final results are published for ${p.resultsPublished} of ${rows.length} students in ${p.from.label}. The others show "final result not published".`}
                </Alert>
              )}
              {rows.length === 0 ? (
                <Empty icon={Users} title="No students in this section" body={`Students who are studying in ${p.from.label} show here.`} />
              ) : (
                <PromotionReview key={`${p.from.id}-${p.toYear.id}-${p.toClass?.id ?? ""}`} rows={rows} fromSectionId={p.from.id} fromLabel={p.from.label} fromYear={p.from.year.name}
                  toYearId={p.toYear.id} toYearName={p.toYear.name} toClassId={p.toClass?.id ?? null} toClassName={p.toClass?.name ?? null}
                  targetSections={p.targetSections.map((s) => ({ id: s.id, name: s.name }))} detainSections={p.detainSections.map((s) => ({ id: s.id, name: s.name }))}
                  defaultSectionName={p.defaultSectionName} finalClass={p.finalClass} />
              )}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Promotion history" description="Past batches and who confirmed them" icon={History} />
          {data.batches.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No promotions yet. Batches you confirm show here with who confirmed them." /></p> : (
            <ul className="px-3 pb-3">
              {data.batches.map((b) => {
                const s = data.batchSections.find((x) => x.id === b.fromSectionId);
                return (
                  <Row key={b.id} href={`${BASE}/promotion/${b.id}`} icon={b.undoneAt ? Undo2 : ArrowUpRight} iconTone={b.undoneAt ? "neutral" : "ok"}
                    title={s ? `${s.schoolClass.name} ${s.name} (${s.academicYear.name})` : "Class"}
                    sub={`${b.summary} · confirmed by ${data.people.find((x) => x.id === b.confirmedById)?.displayName ?? "someone"}`}
                    right={<span className="flex flex-col items-end gap-1"><span className="text-[13px] text-ink3 tnum whitespace-nowrap">{formatDateTime(b.confirmedAt, tz)}</span>{b.undoneAt && <Pill tone="neutral"><Words k="Undone" /></Pill>}</span>} />
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
