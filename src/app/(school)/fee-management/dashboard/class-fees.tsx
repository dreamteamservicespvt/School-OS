// Fees by class on the Fee Dashboard (owner's prototype changes of 13 Oct 2026,
// fees-classwise.jsx ClassFees): every section with what has fallen due so far,
// what came in, what is pending and overdue, and its class teacher. A tile opens
// the class page with its students. The numbers are the same rows as the band
// above (src/lib/fees/by-class.ts), so they add up.
import Link from "next/link";
import { FileText, Hourglass, IndianRupee, LayoutGrid, TriangleAlert } from "lucide-react";
import { formatDate, formatRupees, formatRupeesShort } from "@/lib/format";
import { feeTone, sortFees, type FeeSort, type FeesByClass } from "@/lib/fees/by-class";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats, Progress, Toolbar } from "@/components/money/kit";
import { UrlSelect } from "@/components/money/url-filters";
import { Chips } from "@/components/ui/chips";
import { cx } from "@/components/ui/cx";
import { Words } from "@/lib/i18n/client";

const TXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;
const BG = { ok: "bg-ok/12 text-ok", warn: "bg-warn/12 text-warn", bad: "bg-bad/10 text-bad" } as const;
const money = (v: bigint) => (v >= BigInt(10_000_000) ? formatRupeesShort(v) : formatRupees(v));
const short = (name: string) => name.replace(/^Class\s+/i, "").replace(/^Nursery/i, "Nur").replace(/^Not in a class this year$/, "—");
export const FEE_SORTS: { value: FeeSort; label: string }[] = [
  { value: "overdue", label: "Most overdue first" }, { value: "pending", label: "Most pending first" },
  { value: "pct", label: "Lowest collected first" }, { value: "class", label: "Class order" },
];

export function ClassFees({ data, sort, group, href, classHref, today }: {
  data: FeesByClass; sort: FeeSort; group: string;
  href: (change: Record<string, string | null>) => string;
  classHref: (sectionId: string) => string;
  today: Date;
}) {
  const shown = data.sections.filter((s) => group === "all" || s.group?.key === group);
  const list = sortFees(shown, sort);
  const t = group === "all" ? data.totals : shown.reduce((a, s) => ({
    students: a.students + s.students, due: a.due + s.due, paid: a.paid + s.paid, notLate: a.notLate + s.notLate, overdue: a.overdue + s.overdue,
    overdueStudents: a.overdueStudents + s.overdueStudents, over30: a.over30 + s.over30,
  }), { students: 0, due: BigInt(0), paid: BigInt(0), notLate: BigInt(0), overdue: BigInt(0), overdueStudents: 0, over30: 0 });
  const pct = t.due > BigInt(0) ? Math.round((Number(t.paid) / Number(t.due)) * 1000) / 10 : 100;
  const asOf = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(today);

  return (
    <div id="by-class" className="flex flex-col gap-4 scroll-mt-4">
      <Stats items={[
        { label: "Due so far", value: money(t.due), sub: `This year's fees due up to ${formatDate(new Date(today.getTime() + 30 * 86_400_000))} · ${t.students.toLocaleString("en-IN")} students`, icon: FileText },
        { label: "Collected", value: money(t.paid), sub: t.due > BigInt(0) ? `${pct}% of what is due` : "Nothing is due yet", icon: IndianRupee, tone: t.due > BigInt(0) ? "ok" : undefined },
        { label: "Pending, not late", value: money(t.notLate), sub: data.nextDue ? `Next due ${formatDate(data.nextDue)}` : "Nothing falls due in the next 30 days", icon: Hourglass, tone: t.notLate > BigInt(0) ? "warn" : undefined },
        { label: "Overdue", value: money(t.overdue), sub: `${t.overdueStudents} ${t.overdueStudents === 1 ? "student" : "students"} · ${t.over30} over 30 days`, icon: TriangleAlert, tone: t.overdue > BigInt(0) ? "bad" : undefined },
      ]} />
      <Card className="overflow-hidden">
        <CardHeader title="Fees by class" description={`This year, as of today, ${asOf} · tap a class for its students`} icon={LayoutGrid} />
        <Toolbar>
          <UrlSelect id="fee-class-sort" param="fsort" label="Order" className="w-full md:w-56" options={FEE_SORTS} />
          {data.groups.length > 1 && (
            <Chips label="Class groups" className="md:basis-full" value={group} options={[
              { value: "all", label: "All classes", href: href({ fgroup: null }) },
              ...data.groups.map((g) => ({ value: g.key, label: g.label, href: href({ fgroup: g.key }) })),
            ]} />
          )}
        </Toolbar>
        {list.length === 0 ? (
          <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No students with fees yet. Classes show here once fee plans are assigned." /></p>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5 p-3">
            {list.map((s) => {
              const tone = feeTone(s.percent);
              return (
                <li key={s.sectionId} className="min-w-0">
                  <Link href={classHref(s.sectionId)} className="flex flex-col gap-2.5 h-full rounded-xl border border-line bg-surface p-3.5 hover:bg-sunken/60 hover:border-ink3/40 transition min-w-0">
                    <span className="flex items-center gap-3 min-w-0">
                      <span className={cx("w-11 h-11 rounded-xl grid place-items-center shrink-0 text-[12.5px] font-bold", BG[tone])} aria-hidden="true">{short(s.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[14.5px] leading-snug truncate">{s.name}</span>
                        <span className="block text-[12.5px] text-ink3 truncate">{s.teacher ? `Class teacher ${s.teacher.name}` : s.classId ? "No class teacher" : "Left or not placed yet"}</span>
                      </span>
                      <span className={cx("font-display text-[20px] font-semibold tnum shrink-0", TXT[tone])}>{Math.round(s.percent)}%</span>
                    </span>
                    <Progress value={s.percent} tone={tone} />
                    <span className="grid grid-cols-2 gap-x-3 text-[12.5px]">
                      <span className="min-w-0"><span className="block text-ink3"><Words k="Collected" /></span><span className="block font-semibold tnum truncate">{money(s.paid)}</span></span>
                      <span className="min-w-0 text-right"><span className="block text-ink3"><Words k="Pending" /></span><span className={cx("block font-semibold tnum truncate", s.pending > BigInt(0) ? "text-bad" : "text-ok")}>{s.pending > BigInt(0) ? money(s.pending) : "Nil"}</span></span>
                    </span>
                    <span className="text-[12.5px] text-ink2 truncate">
                      {s.owe ? `${s.owe} of ${s.students} owe${s.overdueStudents ? ` · ${s.overdueStudents} overdue (${money(s.overdue)})` : " · none overdue"}` : `All ${s.students} students paid`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="px-5 pb-4 text-[12.5px] text-ink3"><Words k="Green is 90% or more collected, amber 80% to 90%, red below 80%. Due so far counts fees falling due in the next 30 days, the same as Pending above." /></p>
      </Card>
    </div>
  );
}
