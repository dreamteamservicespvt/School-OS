// The header of every Student Management page (design/ui-prototype/src/kit.jsx ModuleHead):
// "Students", one line about the page, its actions, and the module's pages as tabs, each
// shown only to people who may use it (03 §2).
import { ModuleHead } from "@/components/ui/module-head";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { BASE, studentPage } from "./page";

export async function studentTabs() {
  const { can } = await studentPage();
  return [
    { href: BASE, label: "Student List", exact: true, also: ["students", "new", "import", "bulk-update", "bulk-photos", "logins"].map((p) => `${BASE}/${p}`), show: true },
    { href: `${BASE}/guardians`, label: "Parents & Guardians", show: true },
    { href: `${BASE}/behaviour`, label: "Behaviour & Counselling", show: can.seeBehaviour || can.seeCounselling },
    { href: `${BASE}/promotion`, label: "Promotion", show: can.manage },
    { href: `${BASE}/leaving`, label: "Leaving & Alumni", show: can.reach === "all" },
    { href: `${BASE}/certificates`, label: "Certificates & ID Cards", show: can.reach === "all" && !can.lookupOnly },
    { href: `${BASE}/settings`, label: "Student Settings", show: can.manage },
  ].filter((t) => t.show).map((t) => ({ href: t.href, label: t.label, exact: t.exact, also: t.also }));
}

export async function StudentsHead({ page, href, sub, actions, subTabs, subLabel }: { page: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; subTabs?: Tab[]; subLabel?: string }) {
  const { current, can } = await studentPage();
  const scope = can.reach === "own" ? "own" : !can.contribute ? "view" : null;
  return (
    <>
      <ModuleHead title="Students" page={page} href={href} userId={current.user.id} sub={sub} scope={scope} actions={actions} tabs={await studentTabs()} tabsLabel="Student Management pages" />
      {subTabs && subTabs.length > 1 && <Tabs label={subLabel ?? page} tabs={subTabs} className="-mt-1" />}
    </>
  );
}

