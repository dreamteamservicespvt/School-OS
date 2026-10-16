import { ModuleHead } from "@/components/shell/module-head";
import { evPage, evTabs } from "../_lib/page";

/** The header and page tabs on every Events & Calendar page. */
export async function EvHead({ pageName, href, sub, actions }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const p = await evPage();
  const tabs = await evTabs();
  const reach = p.v.level === "full" ? "all" : p.v.level === "own" ? "own" : "view";
  return <ModuleHead title="Events & Calendar" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Events & Calendar pages" reach={reach} />;
}
