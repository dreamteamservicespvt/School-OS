// The top of every Admission page: the module's title, one line about the
// page, its actions, and the module's pages as tabs (design: kit.jsx ModuleHead).
import { Eye, User } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, type Tab } from "@/components/ui/tabs";
import { Pill } from "@/components/ui/badge";
import { admissionPage, BASE } from "@/lib/admission/page";
import { stageOn, type Settings } from "@/lib/admission/settings";
import type { Viewer } from "@/lib/admission/access";
import { Words } from "@/lib/i18n/client";

export function admissionTabs(viewer: Pick<Viewer, "see" | "change">, settings: Settings): Tab[] {
  const tests = stageOn(settings, "test") || stageOn(settings, "interview");
  if (viewer.see !== "all") return [{ href: `${BASE}/enquiries`, label: "Enquiries" }];
  if (viewer.change === "none") {
    return [
      { href: BASE, label: "Admission Dashboard", exact: true },
      { href: `${BASE}/enquiries`, label: "Enquiries" },
      { href: `${BASE}/applications`, label: "Applications" },
      { href: `${BASE}/reports`, label: "Admission Reports" },
    ];
  }
  return [
    { href: BASE, label: "Admission Dashboard", exact: true },
    { href: `${BASE}/enquiries`, label: "Enquiries" },
    { href: `${BASE}/applications`, label: "Applications" },
    { href: `${BASE}/documents`, label: "Documents & Verification" },
    ...(tests ? [{ href: `${BASE}/tests`, label: "Test & Interview" }] : []),
    { href: `${BASE}/decision`, label: "Admission Decision" },
    { href: `${BASE}/reports`, label: "Admission Reports" },
    { href: `${BASE}/settings`, label: "Admission Settings" },
  ];
}

export async function AdmissionHead({ sub, actions, href, title = "Admissions" }: { sub?: React.ReactNode; actions?: React.ReactNode; href: string; title?: string }) {
  const { current, viewer, settings } = await admissionPage();
  const tabs = admissionTabs(viewer, settings);
  const scope = viewer.see !== "all"
    ? <Pill tone="brand" className="!h-6"><User size={13} aria-hidden="true" /><Words k="Only yours" /></Pill>
    : viewer.change === "none" ? <Pill tone="neutral" className="!h-6"><Eye size={13} aria-hidden="true" /><Words k="View only" /></Pill> : null;
  return (
    <>
      <PageHeader title={title} href={href} userId={current.user.id} sub={<>{scope && <span className="mr-2 align-middle">{scope}</span>}{sub}</>}>
        {viewer.change !== "none" ? actions : null}
      </PageHeader>
      {tabs.length > 1 && <Tabs label="Admission Management pages" tabs={tabs} />}
    </>
  );
}
