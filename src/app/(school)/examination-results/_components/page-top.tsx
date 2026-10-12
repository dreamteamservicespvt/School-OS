import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { YearPicker } from "../../academic-management/_components/year-bar";
import type { ExamPage } from "../_lib/page";

/** Title, pin, year picker and the closed-year note, the same on every page of the module. */
export function PageTop({ page, title, href, children, showYear = true }: { page: ExamPage; title: string; href: string; children?: React.ReactNode; showYear?: boolean }) {
  return (
    <>
      <PageHeader title={title} href={href} userId={page.current.user.id}>
        <div className="no-print flex flex-wrap items-center gap-2">
          {showYear && (
            <Suspense>
              <YearPicker years={page.years.map((y) => ({ id: y.id, name: y.name, status: y.status }))} current={page.year?.id ?? null} />
            </Suspense>
          )}
          {children}
        </div>
      </PageHeader>
      {page.year && page.closed && (
        <p role="status" className="no-print mb-4 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn-text">
          You are viewing {page.year.name}. This year is closed, so exams, marks and results can be seen and printed but not changed.
        </p>
      )}
    </>
  );
}

/** When the school has no academic year yet. */
export function NoYear() {
  return (
    <EmptyState title="No academic year yet">
      <p>Exams belong to an academic year and its terms. Create the current year first in Academic Management.</p>
      <div className="mt-4"><ButtonLink href="/academic-management/settings" variant="primary">Open Academic Settings</ButtonLink></div>
    </EmptyState>
  );
}
