import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarX2, ChevronRight, Eye, User } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/kit";
import { YearPicker } from "../../academic-management/_components/year-bar";
import { withYear, type ExamPage } from "../_lib/page";
import { ExamTabs, type ExamTab } from "./exam-tabs";

const BASE = "/examination-results";

/** The pages this person may open, in the blueprint's order and names. */
export function examTabs(page: ExamPage): ExamTab[] {
  const s = page.scope;
  const teaches = s.teaches === null || s.teaches.length > 0;
  const list: [string, string, boolean][] = [
    ["datesheet", "Datesheet", true],
    ["admit-cards", "Admit Cards", s.datesheets || s.manage],
    ["marks", "Marks Entry", teaches && !s.office],
    ["results", "Results", s.results],
    ["report-cards", "Report Cards", s.manage || s.classTeacherOf.length > 0],
    ["question-papers", "Question Papers", page.current.features.has("exam-question-papers") && (s.manage || teaches) && !s.office],
    ["analysis", "Exam Analysis", s.analysis],
    ["settings", "Exam Settings", s.manage],
  ];
  return list.filter(([, , ok]) => ok).map(([path, label]) => ({ path: `${BASE}/${path}`, href: withYear(`${BASE}/${path}`, page), label }));
}

/**
 * The module's header on every page (design ModuleHead): the module name with
 * the person's reach, one line of context, actions, the year being viewed,
 * the closed-year strip and the page tabs.
 */
export function PageTop({ page, href, sub, children, title, back, showYear = true, tabs = !title }: {
  page: ExamPage; href: string; sub?: React.ReactNode; children?: React.ReactNode; tabs?: boolean;
  /** A page inside a tab (a datesheet's seating, one marks sheet): its own title under the module name. */
  title?: string; back?: { href: string; label: string }; showYear?: boolean;
}) {
  const own = page.scope.see === "own" && !page.scope.office;
  const crumbs = title ? (
    <>
      <Link href={withYear(`${BASE}/datesheet`, page)} className="hover:text-ink hover:underline">Examination &amp; Results</Link>
      {back && <><ChevronRight size={13} aria-hidden="true" /><Link href={withYear(back.href, page)} className="hover:text-ink hover:underline">{back.label}</Link></>}
    </>
  ) : undefined;
  return (
    <>
      <PageHeader title={title ?? "Examination & Results"} href={href} userId={page.current.user.id} sub={sub} crumbs={crumbs}>
        {own && <Pill tone="brand"><User size={13} aria-hidden="true" />Only yours</Pill>}
        {!page.writable && page.year && <Pill tone="neutral"><Eye size={13} aria-hidden="true" />View only</Pill>}
        {showYear && page.years.length > 1 && (
          <Suspense>
            <YearPicker years={page.years.map((y) => ({ id: y.id, name: y.name, status: y.status }))} current={page.year?.id ?? null} defaultId={page.defaultYearId} />
          </Suspense>
        )}
        {page.writable && children}
      </PageHeader>
      {page.year && page.closed && (
        <Banner tone="warn" className="mb-5" title={`You are viewing ${page.year.name}.`}>
          This year is closed, so exams, marks and results can be seen and printed but not changed.
        </Banner>
      )}
      {tabs && <ExamTabs tabs={examTabs(page)} />}
    </>
  );
}

/** The small way back above a page opened from a list (design BackLink): "← Marks Entry / Half Yearly · Maths · 5 A". */
export function BackLink({ page, href, label, sub }: { page: Pick<ExamPage, "yearQuery">; href: string; label: string; sub?: React.ReactNode }) {
  return (
    <Link href={withYear(href, page)} className="inline-flex max-w-full items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 min-h-8 px-1 rounded-lg">
      <ArrowLeft size={17} aria-hidden="true" className="shrink-0" /><span className="shrink-0">{label}</span>{sub && <span className="text-ink3 font-normal truncate">/ {sub}</span>}
    </Link>
  );
}

/** When the school has no academic year yet. */
export function NoYear() {
  return (
    <EmptyState title="No academic year yet" Icon={CalendarX2} action={<ButtonLink href="/academic-management/settings" variant="primary">Open Academic Settings</ButtonLink>}>
      <p>Exams belong to an academic year and its terms. Create the current year first in Academic Management.</p>
    </EmptyState>
  );
}
