import Link from "next/link";
import { redirect } from "next/navigation";
import { BASE, studentPage } from "../_lib/page";
import { SubTabs } from "../_lib/sub-tabs";

/** Behaviour & Counselling: Incidents & rewards, Counselling (optional), Career guidance (optional). */
export default async function BehaviourLayout({ children }: { children: React.ReactNode }) {
  const { can, settings } = await studentPage();
  if (!can.seeBehaviour && !can.seeCounselling) redirect(BASE);
  const tabs = [
    ...(can.seeBehaviour ? [{ href: `${BASE}/behaviour`, label: "Incidents & rewards", exact: true, also: [`${BASE}/behaviour/new`] }] : []),
    ...(settings.counsellingOn && (can.seeCounselling || can.contribute) ? [{ href: `${BASE}/behaviour/counselling`, label: "Counselling" }] : []),
    ...(settings.careerOn && can.seeBehaviour ? [{ href: `${BASE}/behaviour/career`, label: "Career guidance" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <SubTabs tabs={tabs} label="Behaviour & Counselling" />}
      {children}
      {!settings.counsellingOn && can.manage && (
        <p className="mt-6 text-sm text-ink-2">Counselling and career guidance are optional. Switch them on in <Link className="font-medium text-brand-text underline" href={`${BASE}/settings?tab=behaviour`}>Student Settings</Link>.</p>
      )}
    </>
  );
}
