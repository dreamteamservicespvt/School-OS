import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import type { AcademicPage } from "../_lib/page";
import { ClosedYearStrip, YearPicker } from "./year-bar";
import { Words } from "@/lib/i18n/client";

/** Title, pin, year picker and the closed-year strip, the same on every page of the module. */
export function PageTop({ page, title, href, children, showYear = true }: { page: AcademicPage; title: string; href: string; children?: React.ReactNode; showYear?: boolean }) {
  return (
    <>
      <PageHeader title={title} href={href} userId={page.current.user.id}>
        <div className="no-print flex flex-wrap items-center gap-2">
          {showYear && (
            <Suspense>
              <YearPicker years={page.years.map((y) => ({ id: y.id, name: y.name, status: y.status }))} current={page.year?.id ?? null} defaultId={page.defaultYearId} />
            </Suspense>
          )}
          {children}
        </div>
      </PageHeader>
      {page.year && page.closed && (
        <div className="no-print">
          <ClosedYearStrip yearId={page.year.id} yearName={page.year.name} canCorrect={page.scope.canCorrect} correction={page.correction} />
        </div>
      )}
    </>
  );
}

/** When the school has no academic year yet. */
export function NoYear({ page }: { page: AcademicPage }) {
  return (
    <EmptyState title="No academic year yet">
      <p><Words k="Classes, sections and the Time Table belong to an academic year. Create the current year first, with its dates and terms." /></p>
      {page.scope.manage ? (
        <div className="mt-4"><ButtonLink href="/academic-management/settings" variant="primary"><Words k="Open Academic Settings" /></ButtonLink></div>
      ) : <p className="mt-2 text-sm"><Words k="Ask your Principal or School Admin to create it." /></p>}
    </EmptyState>
  );
}
