// The header of every Staff & HR Management list page (design/ui-prototype kit.jsx
// ModuleHead): "Staff & HR", one line about the page, its actions, and the module's
// pages as tabs. Each tab shows only to people who may use it (09 §2, 05-roles).
import { ModuleHead } from "@/components/ui/module-head";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { staffPage, BASE } from "@/lib/staff/page";

export async function staffTabs(): Promise<Tab[]> {
  const { viewer, features } = await staffPage();
  const talent = features.size > 0;
  return viewer.see === "all"
    ? [
        { href: BASE, label: "Staff List", exact: true, also: [`${BASE}/add`, `${BASE}/import`] },
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
}

export async function StaffHead({ page, href, sub, actions, subTabs, subLabel }: { page: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; subTabs?: Tab[]; subLabel?: string }) {
  const { current, viewer } = await staffPage();
  const scope = viewer.see === "own" ? "own" : viewer.change === "none" ? "view" : null;
  return (
    <>
      <ModuleHead title="Staff & HR" page={page} href={href} userId={current.user.id} sub={sub} scope={scope} actions={actions} tabs={await staffTabs()} tabsLabel="Staff & HR Management pages" />
      {subTabs && subTabs.length > 1 && <Tabs label={subLabel ?? page} tabs={subTabs} className="-mt-1" />}
    </>
  );
}
