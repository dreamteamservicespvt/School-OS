// The tabs inside Leaving & Alumni, with counts: Leaving, Left and Alumni (when switched on).
import { withSchool } from "@/lib/db";
import { campusFilter } from "@/lib/campus-scope";
import type { Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "../_lib/page";

export async function leavingTabs(): Promise<Tab[]> {
  const { current, settings } = await studentPage();
  const L = `${BASE}/leaving`;
  const counts = await withSchool(current.ctx, async (tx) => {
    // A person kept to one campus counts that campus's students only, as the lists show them.
    const mine = await campusFilter(tx, "LeavingRequest", current);
    const alums = await campusFilter(tx, "AlumniRecord", current);
    const [leaving, left, alumni] = await Promise.all([
      tx.leavingRequest.count({ where: { AND: [mine, { status: "IN_PROGRESS" }] } }),
      tx.leavingRequest.count({ where: { AND: [mine, { status: "LEFT" }] } }),
      settings.alumniOn ? tx.alumniRecord.count({ where: { AND: [alums, { archivedAt: null }] } }) : 0,
    ]);
    return { leaving, left, alumni };
  });
  return [
    { href: L, label: "Leaving", exact: true, also: [`${L}/new`], count: counts.leaving },
    { href: `${L}/left`, label: "Left", count: counts.left },
    ...(settings.alumniOn ? [{ href: `${L}/alumni`, label: "Alumni", count: counts.alumni }] : []),
  ];
}
