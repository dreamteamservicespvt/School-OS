import { Tabs, type Tab } from "@/components/ui/tabs";
import { admissionPage, BASE } from "@/lib/admission/page";
import { stageOn } from "@/lib/admission/settings";

/** The pages of Admission Management as tabs (02 §2). People with "own" reach add and work on their own enquiries. */
export default async function AdmissionLayout({ children }: { children: React.ReactNode }) {
  const { viewer, settings } = await admissionPage();
  const tests = stageOn(settings, "test") || stageOn(settings, "interview");
  const tabs: Tab[] = viewer.see === "all"
    ? [
        { href: BASE, label: "Admission Dashboard", exact: true },
        { href: `${BASE}/enquiries`, label: "Enquiries" },
        { href: `${BASE}/applications`, label: "Applications" },
        { href: `${BASE}/documents`, label: "Documents & Verification" },
        ...(tests ? [{ href: `${BASE}/tests`, label: "Test & Interview" }] : []),
        { href: `${BASE}/decision`, label: "Admission Decision" },
        { href: `${BASE}/reports`, label: "Admission Reports" },
        ...(viewer.change === "all" ? [{ href: `${BASE}/settings`, label: "Admission Settings" }] : []),
      ]
    : [
        { href: BASE, label: "Admission Dashboard", exact: true },
        { href: `${BASE}/enquiries`, label: "Enquiries" },
      ];
  return (
    <>
      <Tabs label="Admission Management pages" tabs={tabs} />
      {children}
    </>
  );
}
