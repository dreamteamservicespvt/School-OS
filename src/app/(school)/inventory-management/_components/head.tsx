import { ModuleHead } from "@/components/shell/module-head";
import type { PageMode } from "@/lib/duty";
import { invPage, invTabs } from "../_lib/page";

/** The header and page tabs on every Inventory page; "View only" where the person reads the page. */
export async function InvHead({ pageName, href, sub, actions, mode }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode; mode: PageMode }) {
  const p = await invPage();
  const tabs = await invTabs();
  return <ModuleHead title="Inventory Management" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Inventory pages" reach={mode === "full" ? "all" : "view"} />;
}
