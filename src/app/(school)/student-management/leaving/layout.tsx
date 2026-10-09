import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";
import { SubTabs } from "../_lib/sub-tabs";

/** Leaving & Alumni (03 §2): tabs Leaving, Left, Alumni (Alumni when switched on). */
export default async function LeavingLayout({ children }: { children: React.ReactNode }) {
  const { can, settings } = await studentPage();
  if (can.reach !== "all") redirect(BASE);
  const L = `${BASE}/leaving`;
  const tabs = [
    { href: L, label: "Leaving", exact: true, also: [`${L}/new`] },
    { href: `${L}/left`, label: "Left" },
    ...(settings.alumniOn ? [{ href: `${L}/alumni`, label: "Alumni" }] : []),
  ];
  return (
    <>
      <SubTabs tabs={tabs} label="Leaving & Alumni" />
      {children}
    </>
  );
}
