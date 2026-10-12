import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";

/** Leaving & Alumni (03 §2): tabs Leaving, Left, Alumni (Alumni when switched on). Each page draws its tabs (sub-tabs.ts). */
export default async function LeavingLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  if (can.reach !== "all") redirect(BASE);
  return <>{children}</>;
}
