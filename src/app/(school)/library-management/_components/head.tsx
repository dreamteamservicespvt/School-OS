import { ModuleHead } from "@/components/shell/module-head";
import type { PageMode } from "@/lib/duty";
import { libPage, libTabs } from "../_lib/page";

/** The header and page tabs on every Library page; "View only" where the person reads the page. */
export async function LibHead({ pageName, href, sub, actions, mode }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; mode: PageMode }) {
  const p = await libPage();
  const tabs = await libTabs();
  return <ModuleHead title="Library Management" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Library pages" reach={mode === "full" ? "all" : "view"} />;
}
