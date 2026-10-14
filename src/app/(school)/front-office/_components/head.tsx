import { ModuleHead } from "@/components/shell/module-head";
import { foPage, foTabs } from "../_lib/page";

/** The header and page tabs on every Front Office page. */
export async function FoHead({ pageName, href, sub, actions }: { pageName: string; href: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const p = await foPage();
  const tabs = await foTabs();
  const reach = p.v.level === "full" ? "all" : p.v.level === "gate" ? "own" : "view";
  return <ModuleHead title="Front Office" pageName={pageName} href={href} userId={p.current.user.id} sub={sub} actions={actions} tabs={tabs} tabsLabel="Front Office pages" reach={reach} />;
}
