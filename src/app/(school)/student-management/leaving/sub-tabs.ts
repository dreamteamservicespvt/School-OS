// The tabs inside Leaving & Alumni, with counts: Leaving, Left and Alumni (when switched on).
import { withSchool } from "@/lib/db";
import type { Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "../_lib/page";

export async function leavingTabs(): Promise<Tab[]> {
  const { current, settings } = await studentPage();
  const L = `${BASE}/leaving`;
  const counts = await withSchool(current.ctx, async (tx) => {
    const [leaving, left, alumni] = await Promise.all([
      tx.leavingRequest.count({ where: { status: "IN_PROGRESS" } }),
      tx.leavingRequest.count({ where: { status: "LEFT" } }),
      settings.alumniOn ? tx.alumniRecord.count({ where: { archivedAt: null } }) : 0,
    ]);
    return { leaving, left, alumni };
  });
  return [
    { href: L, label: "Leaving", exact: true, also: [`${L}/new`], count: counts.leaving },
    { href: `${L}/left`, label: "Left", count: counts.left },
    ...(settings.alumniOn ? [{ href: `${L}/alumni`, label: "Alumni", count: counts.alumni }] : []),
  ];
}
