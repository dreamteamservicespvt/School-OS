// What a page's date filter needs from the server: the school's zone, the
// day its week starts, and its own terms and academic years, so "This term"
// and "This academic year" mean the dates the school set (lib/periods.ts).
import "server-only";

import { withSchool } from "./db";
import type { Current } from "./current";
import { todayFor, type SchoolCalendar, type Span } from "./periods";

export type PeriodSetup = { timeZone: string; weekStart: "monday" | "sunday"; calendar: SchoolCalendar };

const day = (d: Date) => d.toISOString().slice(0, 10);
const span = (r: { name: string; startDate: Date; endDate: Date }): Span => ({ name: r.name, from: day(r.startDate), to: day(r.endDate) });

export async function periodSetup(current: Current): Promise<PeriodSetup> {
  const timeZone = current.school.timeZone;
  const today = todayFor(timeZone);
  const calendar = await withSchool(current.ctx, async (tx) => {
    const years = await tx.academicYear.findMany({
      where: { schoolId: current.ctx.schoolId, archivedAt: null },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, startDate: true, endDate: true },
      take: 12,
    });
    // The year today falls in, else the latest one that has started.
    const year = years.find((y) => y.startDate <= today && y.endDate >= today) ?? years.find((y) => y.startDate <= today) ?? null;
    const lastYear = year ? years.find((y) => y.endDate < year.startDate) ?? null : null;
    const terms = year
      ? await tx.term.findMany({
        where: { schoolId: current.ctx.schoolId, academicYearId: year.id, archivedAt: null },
        orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
        select: { name: true, startDate: true, endDate: true },
      })
      : [];
    const term = terms.find((t) => t.startDate <= today && t.endDate >= today) ?? null;
    const nextTerm = terms.find((t) => t.startDate > today) ?? null;
    return {
      year: year ? span(year) : null,
      lastYear: lastYear ? span(lastYear) : null,
      term: term ? span(term) : null,
      nextTerm: nextTerm ? span(nextTerm) : null,
    } satisfies SchoolCalendar;
  });
  return { timeZone, weekStart: current.school.weekStart, calendar };
}
