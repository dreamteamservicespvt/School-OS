import Link from "next/link";
import { ChartColumn, ChevronRight, FileText, type LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Split } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";

export type ReportLink = { key: string; group: string; name: string; sub: string; icon?: LucideIcon; href: string };

/**
 * A module's reports (mod-fees.jsx ReportsFrame): the chosen report on the
 * left, every report grouped on the right. On phones the list comes after
 * the report. Each choice is a link, so the address keeps the report (P2).
 */
export function ReportsFrame({ reports, active, children }: { reports: ReportLink[]; active: string; children: React.ReactNode }) {
  const groups = [...new Set(reports.map((r) => r.group))];
  return (
    <Split side={340}>
      <div id="report" className="min-w-0 scroll-mt-4 flex flex-col gap-5 lg:gap-6">{children}</div>
      <Card>
        <CardHeader title="All reports" description="Each has filters, export and print" icon={ChartColumn} />
        <nav aria-label="All reports" className="pb-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="eyebrow text-ink3 px-5 pt-2 pb-1">{g}</p>
              <ul className="px-2">
                {reports.filter((r) => r.group === g).map((r) => {
                  const on = r.key === active;
                  const Ic = r.icon ?? FileText;
                  return (
                    <li key={r.key}>
                      <Link href={`${r.href}#report`} scroll={false} aria-current={on ? "page" : undefined}
                        className={cx("w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition", on ? "bg-brand/8 text-brand" : "hover:bg-sunken/70")}>
                        <span className={cx("w-9 h-9 rounded-lg grid place-items-center shrink-0", on ? "bg-brand/12 text-brand" : "bg-sunken text-ink2")}><Ic size={17} aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-[14px] leading-tight truncate">{r.name}</span>
                          <span className="block text-[12px] text-ink3 truncate">{r.sub}</span>
                        </span>
                        {on && <ChevronRight size={16} aria-hidden="true" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Card>
    </Split>
  );
}
