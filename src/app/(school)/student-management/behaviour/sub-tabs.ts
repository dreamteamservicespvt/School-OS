// The tabs inside Behaviour & Counselling, with how many records each holds (counted
// within the person's reach): Incidents & rewards, Counselling and Career guidance.
import { withSchool } from "@/lib/db";
import { studentScope } from "@/lib/students/access";
import type { Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "../_lib/page";

export async function behaviourTabs(): Promise<Tab[]> {
  const { current, can, settings, year } = await studentPage();
  const showCounselling = settings.counsellingOn && (can.seeCounselling || can.contribute);
  const showCareer = settings.careerOn && can.seeBehaviour;
  const counts = await withSchool(current.ctx, async (tx) => {
    const ids = can.reach === "all" ? null : (await tx.student.findMany({ where: await studentScope(tx, current, year?.id), select: { id: true } })).map((s) => s.id);
    const [incidents, cases, career] = await Promise.all([
      can.seeBehaviour ? tx.behaviourIncident.count({ where: { archivedAt: null, ...(year ? { academicYearId: year.id } : {}), ...(ids ? { students: { some: { studentId: { in: ids } } } } : {}) } }) : 0,
      showCounselling ? tx.counsellingCase.count({ where: { archivedAt: null, status: "OPEN", ...(can.seeCounselling ? {} : { counsellorId: current.ctx.userId ?? "" }) } }) : 0,
      showCareer ? tx.careerRecord.count({ where: { archivedAt: null, ...(ids ? { studentId: { in: ids } } : {}) } }) : 0,
    ]);
    return { incidents, cases, career };
  });
  return [
    ...(can.seeBehaviour ? [{ href: `${BASE}/behaviour`, label: "Incidents & rewards", exact: true, also: [`${BASE}/behaviour/new`], count: counts.incidents }] : []),
    ...(showCounselling ? [{ href: `${BASE}/behaviour/counselling`, label: "Counselling", count: counts.cases }] : []),
    ...(showCareer ? [{ href: `${BASE}/behaviour/career`, label: "Career guidance", count: counts.career }] : []),
  ];
}
