import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";

/** Behaviour & Counselling: Incidents & rewards, Counselling (optional), Career guidance (optional). Each page draws its tabs (sub-tabs.ts). */
export default async function BehaviourLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  if (!can.seeBehaviour && !can.seeCounselling) redirect(BASE);
  return <>{children}</>;
}
