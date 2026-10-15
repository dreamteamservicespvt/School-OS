import { ModuleHead } from "@/components/shell/module-head";
import type { PageMode } from "@/lib/duty";
import { hostelPage, hostelTabs } from "../_lib/page";

/** The header and page tabs on every Hostel page; "View only" where the person reads the page. */
export async function HostelHead({ pageName, href, sub, actions, mode }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; mode: PageMode }) {
  const p = await hostelPage();
  const tabs = await hostelTabs();
  return <ModuleHead title="Hostel Management" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Hostel pages" reach={mode === "full" ? "all" : "view"} />;
}
