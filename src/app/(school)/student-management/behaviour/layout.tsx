import { redirect } from "next/navigation";
import { BASE, studentPage, NO_ACCESS } from "../_lib/page";

/** Behaviour & Counselling: Incidents & rewards, Counselling (optional), Career guidance (optional). Each page draws its tabs (sub-tabs.ts). */
export default async function BehaviourLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  if (!can.seeBehaviour && !can.seeCounselling) redirect(NO_ACCESS);
  return <>{children}</>;
}
