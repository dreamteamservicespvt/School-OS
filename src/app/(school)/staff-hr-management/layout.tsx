import { Tabs, type Tab } from "@/components/ui/tabs";
import { staffPage, BASE } from "@/lib/staff/page";

/** The pages of Staff & HR Management as tabs (09 §2). People with "own" reach see their own profile and leave. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { viewer, features } = await staffPage();
  const talent = features.size > 0;
  const tabs: Tab[] = viewer.see === "all"
    ? [
        { href: BASE, label: "Staff List", exact: true },
        { href: `${BASE}/leave`, label: "Staff Leave" },
        { href: `${BASE}/documents`, label: "Documents & ID Cards" },
        ...(talent ? [{ href: `${BASE}/recruitment`, label: "Recruitment & Appraisal" }] : []),
        { href: `${BASE}/exit`, label: "Staff Exit" },
        ...(viewer.change === "all" ? [{ href: `${BASE}/settings`, label: "HR Settings" }] : []),
      ]
    : [
        ...(viewer.staffId ? [{ href: `${BASE}/${viewer.staffId}`, label: "My profile" }] : []),
        { href: `${BASE}/leave`, label: "Staff Leave" },
        ...(features.has("hr-appraisal") ? [{ href: `${BASE}/recruitment`, label: "Recruitment & Appraisal" }] : []),
      ];
  return (
    <>
      <Tabs label="Staff & HR Management pages" tabs={tabs} />
      {children}
    </>
  );
}
