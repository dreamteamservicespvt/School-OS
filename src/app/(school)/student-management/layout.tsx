import { Tabs } from "@/components/ui/tabs";
import { BASE, studentPage } from "./_lib/page";

/** The pages of Student Management (03 §2), as tabs. Each shows only to people who may use it. */
export default async function StudentManagementLayout({ children }: { children: React.ReactNode }) {
  const { can } = await studentPage();
  const tabs = [
    { href: BASE, label: "Student List", exact: true, also: ["students", "new", "import", "bulk-update", "bulk-photos", "logins"].map((p) => `${BASE}/${p}`), show: true },
    { href: `${BASE}/guardians`, label: "Parents & Guardians", show: true },
    { href: `${BASE}/behaviour`, label: "Behaviour & Counselling", show: can.seeBehaviour || can.seeCounselling },
    { href: `${BASE}/promotion`, label: "Promotion", show: can.manage },
    { href: `${BASE}/leaving`, label: "Leaving & Alumni", show: can.reach === "all" },
    { href: `${BASE}/certificates`, label: "Certificates & ID Cards", show: can.reach === "all" && !can.lookupOnly },
    { href: `${BASE}/settings`, label: "Student Settings", show: can.manage },
  ].filter((t) => t.show);
  return (
    <>
      <Tabs label="Student Management pages" tabs={tabs.map(({ show: _show, ...t }) => t)} />
      {children}
    </>
  );
}
